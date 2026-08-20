import assert from 'node:assert/strict'
import test from 'node:test'

import * as Y from 'yjs'

import { fileIndex } from '../src/sync/file-index.js'

const fresh = () => {
  const doc = new Y.Doc()
  return { doc, index: fileIndex(doc) }
}

/** Two devices that have exchanged everything. */
const merge = (a, b) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
}

test('an entry carries an address, never the bytes', () => {
  const { index } = fresh()

  index.put('notes/todo.md', { cid: 'bafk1', size: 42 })
  const entry = index.get('notes/todo.md')

  assert.equal(entry.cid, 'bafk1')
  assert.equal(entry.size, 42)
  assert.equal(entry.deletedAt, null)
  // The one rule. A key called anything like this is the feature going wrong.
  assert.ok(!('bytes' in entry) && !('content' in entry) && !('data' in entry))
})

test('a path is stored whole, even with one flat directory', () => {
  const { index } = fresh()

  index.put('a/b/c.txt', { cid: 'bafk1', size: 1 })

  // What makes trees display work later rather than a migration.
  assert.deepEqual(index.paths(), ['a/b/c.txt'])
})

test('deleting leaves a tombstone rather than removing the key', () => {
  const { index } = fresh()

  index.put('gone.txt', { cid: 'bafk1', size: 1 })
  index.remove('gone.txt', 1000)

  assert.deepEqual(index.paths(), [], 'no longer listed')
  assert.equal(index.get('gone.txt').deletedAt, 1000, 'but still known')
})

test('a deletion is not undone by a device that had not heard', () => {
  // The failure every sync tool ships once: A deletes, B still has the file,
  // they meet, and B re-adds it because the key was simply gone.
  const a = fresh()
  const b = fresh()

  a.index.put('shared.txt', { cid: 'bafk1', size: 1 })
  merge(a.doc, b.doc)
  assert.deepEqual(b.index.paths(), ['shared.txt'])

  a.index.remove('shared.txt', 2000)
  merge(a.doc, b.doc)

  assert.deepEqual(b.index.paths(), [], 'B learns it is gone')
  assert.equal(b.index.get('shared.txt').deletedAt, 2000)
})

test('deleting something never seen is still recorded', () => {
  // The other side may be about to announce it, and a tombstone that does not
  // exist cannot win against an entry that does.
  const { index } = fresh()

  index.remove('never-had-it.txt', 3000)

  assert.equal(index.get('never-had-it.txt').deletedAt, 3000)
  assert.deepEqual(index.paths(), [])
})

test('two devices that both add converge on both files', () => {
  const a = fresh()
  const b = fresh()

  a.index.put('from-a.txt', { cid: 'bafkA', size: 1 })
  b.index.put('from-b.txt', { cid: 'bafkB', size: 2 })
  merge(a.doc, b.doc)

  assert.deepEqual(a.index.paths().sort(), ['from-a.txt', 'from-b.txt'])
  assert.deepEqual(b.index.paths().sort(), ['from-a.txt', 'from-b.txt'])
})

test('the reconciler sees tombstones, a listing does not', () => {
  const { index } = fresh()

  index.put('kept.txt', { cid: 'bafk1', size: 1 })
  index.put('dropped.txt', { cid: 'bafk2', size: 2 })
  index.remove('dropped.txt')

  assert.deepEqual(index.paths(), ['kept.txt'])
  // Two different questions, deliberately two different methods: acting on a
  // deletion needs to know it happened.
  assert.deepEqual(index.entries().map(e => e.path).sort(), ['dropped.txt', 'kept.txt'])
})

test('a change is announced with the path that changed, local or remote', () => {
  const a = fresh()
  const b = fresh()
  const seen = []

  b.index.observe(paths => seen.push(...paths))

  a.index.put('remote.txt', { cid: 'bafk1', size: 1 })
  merge(a.doc, b.doc)
  b.index.put('local.txt', { cid: 'bafk2', size: 2 })

  // The reconciler does not care which side a change came from - it compares
  // index against storage either way.
  assert.deepEqual(seen.sort(), ['local.txt', 'remote.txt'])
})
