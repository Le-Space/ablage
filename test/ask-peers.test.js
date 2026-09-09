import assert from 'node:assert/strict'
import test from 'node:test'

import { askEach, askRegistry, withPeerFallback } from '../src/sync/ask-peers.js'
import { FILE_GIVE, FILE_NONE, answer, asked } from '../src/sync/file-transfer.js'

/**
 * Bitswap first, then the peers, and only what verifies.
 */

const bytes = text => new TextEncoder().encode(text)
const hashOf = async b => `cid-${new TextDecoder().decode(b)}`

/** A peer that holds some files, wired straight back into the registry. */
const peer = (id, held, registry, { lie = false } = {}) => ({
  id,
  send: async message => {
    const cid = asked(message)
    const reply = await answer(message, async c => held[c] ?? null)

    if (lie && reply.type === FILE_GIVE) reply.bytes = btoa('something else')
    // Simulate the wire: the answer lands on the registry as it would from a stream.
    setTimeout(() => registry.settle(reply, hashOf), 0)
  }
})

test('a wait settles when the answer arrives, with the bytes', async () => {
  const registry = askRegistry()
  const waiting = registry.waitFor('cid-hello', 1000)

  assert.equal(registry.settle({ type: FILE_GIVE, cid: 'cid-hello', bytes: btoa('hello') }, hashOf), true)
  assert.deepEqual((await waiting).bytes, bytes('hello'))
})

test('a refusal settles it too, with the reason', async () => {
  const registry = askRegistry()
  const waiting = registry.waitFor('cid-x', 1000)

  registry.settle({ type: FILE_NONE, cid: 'cid-x', why: 'not here' }, hashOf)
  assert.match((await waiting).refused, /not here/)
})

test('an answer nobody asked for is not ours, and says so', async () => {
  const registry = askRegistry()

  assert.equal(registry.settle({ type: FILE_GIVE, cid: 'cid-unasked', bytes: '' }, hashOf), false)
  assert.equal(registry.settle({ type: 'update' }, hashOf), false)
})

test('and the clock runs out into "nobody answered"', async () => {
  const registry = askRegistry()

  assert.match((await registry.waitFor('cid-quiet', 20)).refused, /nobody answered/)
  assert.equal(registry.isWaitingFor('cid-quiet'), false, 'and nothing is left waiting')
})

test('asking twice for the same address at once is refused, not raced', async () => {
  const registry = askRegistry()
  const first = registry.waitFor('cid-a', 1000)

  assert.match((await registry.waitFor('cid-a', 1000)).refused, /already asking/)
  registry.settle({ type: FILE_NONE, cid: 'cid-a' }, hashOf)
  await first
})

test('bytes that do not hash to the address settle as a refusal, never as a file', async () => {
  // **The check the whole second door rests on.** A peer admitted to sync
  // is not thereby trusted with what lands in the folder.
  const registry = askRegistry()
  const waiting = registry.waitFor('cid-hello', 1000)

  registry.settle({ type: FILE_GIVE, cid: 'cid-hello', bytes: btoa('something else') }, hashOf)

  const out = await waiting

  assert.equal(out.bytes, undefined)
  assert.match(out.refused, /not what was asked for/)
})

test('askEach stops at the first peer that has it', async () => {
  const registry = askRegistry()
  const asked = []
  const targets = [
    { id: 'p1', send: async m => { asked.push('p1'); setTimeout(() => registry.settle({ type: FILE_NONE, cid: m.cid, why: 'not here' }, hashOf), 0) } },
    peer('p2', { 'cid-hello': bytes('hello') }, registry),
    { id: 'p3', send: async () => { asked.push('p3'); throw new Error('should not be asked') } }
  ]

  const out = await askEach('cid-hello', targets, registry, { timeoutMs: 1000 })

  assert.deepEqual(out.bytes, bytes('hello'))
  assert.deepEqual(asked, ['p1'], 'p3 was never asked')
})

test('and when nobody has it, says who said what', async () => {
  const registry = askRegistry()
  const targets = [
    peer('p1', {}, registry),
    { id: 'p2', send: async () => { throw new Error('stream closed') } },
    { id: 'p3', send: async () => {} } // never answers
  ]

  const out = await askEach('cid-missing', targets, registry, { timeoutMs: 30 })

  assert.equal(out.bytes, undefined)
  assert.match(out.refused[0], /^p1: not here/)
  assert.match(out.refused[1], /^p2: stream closed/)
  assert.match(out.refused[2], /^p3: nobody answered/)
})

test('a peer whose stream throws does not block the peer after it', async () => {
  // Found by "who said what": the wait registered before a failed `send` stayed
  // open, and the next peer was refused as "already asking". In the app that
  // is a dead stream costing the next peer the full timeout.
  const registry = askRegistry()
  const targets = [
    { id: 'dead', send: async () => { throw new Error('stream closed') } },
    peer('alive', { 'cid-hello': bytes('hello') }, registry)
  ]

  const out = await askEach('cid-hello', targets, registry, { timeoutMs: 1000 })

  assert.deepEqual(out.bytes, bytes('hello'))
  assert.equal(registry.isWaitingFor('cid-hello'), false)
})

test('a lying peer is skipped and the honest one after it wins', async () => {
  const registry = askRegistry()
  const targets = [
    peer('liar', { 'cid-hello': bytes('hello') }, registry, { lie: true }),
    peer('honest', { 'cid-hello': bytes('hello') }, registry)
  ]

  const out = await askEach('cid-hello', targets, registry, { timeoutMs: 1000 })

  assert.deepEqual(out.bytes, bytes('hello'))
})

test('the fallback asks bitswap first and nobody else when it answers', async () => {
  let askedPeers = 0
  const content = { add: async () => 'cid', get: async () => bytes('from the network') }
  const wrapped = withPeerFallback(content, { askAll: async () => { askedPeers++; return { bytes: bytes('from a peer') } } })

  assert.deepEqual(await wrapped.get('cid-hello'), bytes('from the network'))
  assert.equal(askedPeers, 0, 'a device on the same Wi-Fi does not route files through the sync stream')
})

test('and only when the network fails does it turn to the peers', async () => {
  const content = { add: async () => 'cid', get: async () => { throw new Error('timed out') } }
  const wrapped = withPeerFallback(content, { askAll: async () => ({ bytes: bytes('from a peer') }) })

  assert.deepEqual(await wrapped.get('cid-hello'), bytes('from a peer'))
})

test('when both doors are closed, the error names both', async () => {
  const content = { add: async () => 'cid', get: async () => { throw new Error('timed out') } }
  const wrapped = withPeerFallback(content, { askAll: async () => ({ refused: ['p1: not here', 'p2: nobody answered'] }) })

  await assert.rejects(wrapped.get('cid-x'), /not on the network \(timed out\) and no peer had it \(p1: not here; p2: nobody answered\)/)
})

test('everything but get passes through untouched', async () => {
  const content = { add: async b => hashOf(b), get: async () => bytes('x'), other: 42 }
  const wrapped = withPeerFallback(content, { askAll: async () => ({ refused: [] }) })

  assert.equal(await wrapped.add(bytes('hello')), 'cid-hello')
  assert.equal(wrapped.other, 42)
})
