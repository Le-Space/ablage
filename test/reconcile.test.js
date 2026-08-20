import assert from 'node:assert/strict'
import test from 'node:test'

import * as Y from 'yjs'

import { fileIndex } from '../src/sync/file-index.js'
import { ANNOUNCE, CONFLICT, FETCH, REMOVE, AGREED, decide, keepBoth, reconcile, refuse } from '../src/reconcile.js'
import { baseline } from '../src/sync/baseline.js'

/**
 * The table in PLAN.md, one test per row - and then the same table again with
 * real effects, against a storage and a content store that live in memory.
 *
 * No browser, no network, no filesystem. This is where the logic is, so this is
 * where the tests are.
 */

test.describe = test.describe ?? (() => {})

// ---- the decision, on its own ----------------------------------------------

test('a path the index knows and storage does not is fetched', () => {
  assert.equal(decide({ cid: 'bafk1', deletedAt: null }, undefined), FETCH)
})

test('a path both sides agree on is left alone', () => {
  assert.equal(decide({ cid: 'bafk1', deletedAt: null }, { cid: 'bafk1' }), AGREED)
})

test('a tombstoned path still on disk is removed', () => {
  assert.equal(decide({ cid: 'bafk1', deletedAt: 1 }, { cid: 'bafk1' }), REMOVE)
})

test('a tombstone for something already gone is nothing to do', () => {
  assert.equal(decide({ cid: 'bafk1', deletedAt: 1 }, undefined), AGREED)
})

test('a file storage has and the index has never heard of is announced', () => {
  assert.equal(decide(undefined, { cid: 'bafk9' }), ANNOUNCE)
})

test('two sides holding different content is a conflict, not a winner', () => {
  // Deliberately not resolved here. Last-writer-wins destroys somebody's work
  // silently, and two devices' clocks are not comparable.
  assert.equal(decide({ cid: 'bafk1', deletedAt: null }, { cid: 'bafk2' }), CONFLICT)
})

// ---- and the same table, doing it ------------------------------------------

const fakes = (files = {}) => {
  const disk = new Map(Object.entries(files).map(([p, text]) => [p, new TextEncoder().encode(text)]))
  const blocks = new Map()

  const content = {
    async add (bytes) {
      // Deterministic and address-like: same bytes, same handle. Enough to test
      // the reconciler, which never inspects a CID.
      const cid = 'bafk-' + new TextDecoder().decode(bytes)
      blocks.set(cid, bytes)
      return cid
    },
    async get (cid) {
      if (!blocks.has(cid)) throw new Error(`no block ${cid}`)
      return blocks.get(cid)
    }
  }

  const storage = {
    async list () { return [...disk.keys()] },
    async read (path) { return disk.get(path) },
    async write (path, bytes) { disk.set(path, bytes) },
    async remove (path) { disk.delete(path) }
  }

  const doc = new Y.Doc()

  return {
    doc,
    index: fileIndex(doc),
    storage,
    content,
    base: baseline(),
    disk,
    text: path => (disk.has(path) ? new TextDecoder().decode(disk.get(path)) : null)
  }
}

test('a file on one side ends up on the other', async () => {
  const a = fakes({ 'notes.txt': 'hallo' })
  const b = fakes()

  // A announces what it has.
  assert.deepEqual(await reconcile(a), [{ path: 'notes.txt', action: ANNOUNCE }])

  // B learns the index and fetches the bytes. Its content store is separate, so
  // the block has to be handed over the way bitswap would.
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
  await b.content.add(await a.storage.read('notes.txt'))

  assert.deepEqual(await reconcile(b), [{ path: 'notes.txt', action: FETCH }])
  assert.equal(b.text('notes.txt'), 'hallo')
})

test('a deletion reaches the other side', async () => {
  const a = fakes({ 'gone.txt': 'weg gleich' })
  await reconcile(a)
  const b = fakes()
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
  await b.content.add(await a.storage.read('gone.txt'))
  await reconcile(b)
  assert.equal(b.text('gone.txt'), 'weg gleich')

  a.index.remove('gone.txt')
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))

  assert.deepEqual(await reconcile(b), [{ path: 'gone.txt', action: REMOVE }])
  assert.equal(b.text('gone.txt'), null)
})

test('a second pass over an agreed folder does nothing', async () => {
  // The property that makes this a comparison rather than an event log: running
  // it again is free, so a missed event is a non-event.
  const a = fakes({ 'a.txt': 'eins', 'b.txt': 'zwei' })

  await reconcile(a)

  assert.deepEqual(await reconcile(a), [])
})

test('paths only one side knows are both handled in one pass', async () => {
  const a = fakes({ 'local-only.txt': 'von hier' })
  a.index.put('remote-only.txt', { cid: 'bafk-von dort', size: 8 })
  await a.content.add(new TextEncoder().encode('von dort'))

  const done = await reconcile(a)

  // The union of both sides, not either one alone.
  assert.deepEqual(done.sort((x, y) => x.path.localeCompare(y.path)), [
    { path: 'local-only.txt', action: ANNOUNCE },
    { path: 'remote-only.txt', action: FETCH }
  ])
  assert.equal(a.text('remote-only.txt'), 'von dort')
})

test('with no rule, a conflict is reported and nothing is touched', async () => {
  const a = fakes({ 'both.txt': 'meine fassung' })
  a.index.put('both.txt', { cid: 'bafk-ihre fassung', size: 13 })

  const done = await reconcile({ ...a, resolve: refuse })

  assert.deepEqual(done, [{ path: 'both.txt', action: CONFLICT }])
  assert.equal(a.text('both.txt'), 'meine fassung', 'nothing overwritten')
})

// ---- the third value: what the two sides last agreed on ---------------------

test('an edit here alone is published, not treated as a conflict', () => {
  // Without a baseline this is indistinguishable from "we both changed it":
  // the index says one address and storage says another, either way.
  const base = 'bafk-agreed'

  assert.equal(decide({ cid: base, deletedAt: null }, { cid: 'bafk-mine' }, base), ANNOUNCE)
})

test('an edit over there alone is fetched, not treated as a conflict', () => {
  const base = 'bafk-agreed'

  assert.equal(decide({ cid: 'bafk-theirs', deletedAt: null }, { cid: base }, base), FETCH)
})

test('an edit on both sides is a conflict', () => {
  assert.equal(
    decide({ cid: 'bafk-theirs', deletedAt: null }, { cid: 'bafk-mine' }, 'bafk-agreed'),
    CONFLICT
  )
})

test('with nothing agreed yet, two different versions are still a conflict', () => {
  // A baseline that was never set - a fresh device, or one that reloaded -
  // errs towards keeping bytes rather than picking a winner.
  assert.equal(decide({ cid: 'bafk-theirs', deletedAt: null }, { cid: 'bafk-mine' }, null), CONFLICT)
})

test('deleted over there and edited here is a conflict, not a deletion', () => {
  // Removing now would throw away work the other side never saw.
  assert.equal(
    // Untouched here means the local address still *is* the agreed one.
    decide({ cid: 'bafk-old', deletedAt: 1 }, { cid: 'bafk-old' }, 'bafk-old'),
    REMOVE,
    'untouched since the agreement: the deletion stands'
  )
  assert.equal(
    decide({ cid: 'bafk-old', deletedAt: 1 }, { cid: 'bafk-mine' }, 'bafk-different'),
    CONFLICT,
    'edited since: their deletion must not win silently'
  )
})

// ---- keeping both ----------------------------------------------------------

test('a rescued name is derived from the bytes, not from the device', () => {
  // Two devices that diverged to the *same* content produce the same name and
  // converge on one entry. A device name or a timestamp would produce two.
  const { rescueAs } = keepBoth('notes/todo.md', { localCid: 'bafkreiabc123' })

  assert.equal(rescueAs, 'notes/todo (conflicted copy abc123).md')
  assert.deepEqual(keepBoth('notes/todo.md', { localCid: 'bafkreiabc123' }), { rescueAs })
})

test('a name without an extension keeps its shape', () => {
  assert.equal(keepBoth('LICENSE', { localCid: 'bafkxyz789' }).rescueAs, 'LICENSE (conflicted copy xyz789)')
})

test('keeping both loses no bytes and leaves the shared version in place', async () => {
  const a = fakes({ 'both.txt': 'meine fassung' })
  await a.content.add(new TextEncoder().encode('ihre fassung'))
  a.index.put('both.txt', { cid: 'bafk-ihre fassung', size: 12 })
  a.base.set('both.txt', 'bafk-etwas anderes')

  const done = await reconcile(a)

  // The shared version takes the plain path; mine moves aside under a name of
  // its own. Nothing is chosen, and nothing is lost.
  assert.equal(a.text('both.txt'), 'ihre fassung')

  const rescued = keepBoth('both.txt', { localCid: 'bafk-meine fassung' }).rescueAs
  assert.equal(a.text(rescued), 'meine fassung')
  assert.deepEqual(done.map(d => d.action).sort(), [ANNOUNCE, FETCH])
})

test('the rescued copy is announced, so the other device gets it too', async () => {
  const a = fakes({ 'both.txt': 'meine fassung' })
  await a.content.add(new TextEncoder().encode('ihre fassung'))
  a.index.put('both.txt', { cid: 'bafk-ihre fassung', size: 12 })
  a.base.set('both.txt', 'bafk-etwas anderes')

  await reconcile(a)

  const rescued = keepBoth('both.txt', { localCid: 'bafk-meine fassung' }).rescueAs
  assert.ok(a.index.paths().includes(rescued), 'in the shared index, not only on disk')
})

test('agreement is remembered, so the next edit is an edit and not a conflict', async () => {
  const a = fakes({ 'notes.txt': 'erst' })

  await reconcile(a)
  assert.equal(a.base.get('notes.txt'), 'bafk-erst')

  // Now a local edit, with the index still at the agreed address.
  a.disk.set('notes.txt', new TextEncoder().encode('dann'))

  assert.deepEqual(await reconcile(a), [{ path: 'notes.txt', action: ANNOUNCE }])
  assert.equal(a.index.get('notes.txt').cid, 'bafk-dann')
})
