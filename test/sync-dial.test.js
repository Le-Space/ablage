import assert from 'node:assert/strict'
import test from 'node:test'

import { openSyncStream } from '../src/sync-dial.js'

/**
 * The send path, away from a browser.
 *
 * What it has to get right is small and easy to get wrong in a way that fails
 * far from here: a bare string is read as a multiaddr, and the error arrives
 * from deep inside libp2p saying `getComponents is not a function`.
 */

const fastOptions = { retryDelay: 0, settleDelay: 0 }

// A real one. `peerIdFromString` refuses anything else - "pass a multibase
// decoder for strings that do not start with 1 or Q" - which is the same
// refusal that protects the call site, so the tests have to respect it too.
const A_PEER = '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTA'

const nodeThatRecords = (...results) => {
  const seen = []
  let call = 0

  return {
    seen,
    dialProtocol (peerId, protocol) {
      seen.push({ peerId, protocol })

      const result = results[Math.min(call++, results.length - 1)]
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    }
  }
}

test('a peer id given as text arrives as a peer id, never as text', async () => {
  // The whole reason this module exists. `dialProtocol` takes a PeerId or a
  // Multiaddr, so a string is taken for the second - and the failure names
  // neither the string nor the call that passed it.
  const node = nodeThatRecords({ status: 'open' })

  await openSyncStream(node, A_PEER, '/x/1.0.0', fastOptions)

  assert.equal(typeof node.seen[0].peerId, 'object')
  assert.equal(typeof node.seen[0].peerId.toString(), 'string')
  assert.equal(node.seen[0].protocol, '/x/1.0.0')
})

test('a peer id given as an object is passed through untouched', async () => {
  const peerId = { toString: () => 'already-a-peer-id' }
  const node = nodeThatRecords({ status: 'open' })

  await openSyncStream(node, peerId, '/x/1.0.0', fastOptions)

  assert.equal(node.seen[0].peerId, peerId)
})

test('a stream that is reset right after opening is tried again', async () => {
  // Both peers reach `connected` at the same moment, and a stream opened before
  // the remote muxer exists is reset - late enough that the first look says
  // `open`, which is why the check waits a beat before believing it.
  const node = nodeThatRecords({ status: 'reset' }, { status: 'open' })

  const stream = await openSyncStream(node, A_PEER, '/x/1.0.0', fastOptions)

  assert.equal(stream.status, 'open')
  assert.equal(node.seen.length, 2)
})

test('a dial that throws is tried again too', async () => {
  const node = nodeThatRecords(new Error('muxer not ready'), { status: 'open' })

  assert.equal((await openSyncStream(node, A_PEER, '/x/1.0.0', fastOptions)).status, 'open')
  assert.equal(node.seen.length, 2)
})

test('it gives up eventually, and reports what actually went wrong', async () => {
  // Not a generic timeout: the last error is the one worth reading, and a
  // helper that swallowed it would make every failure look the same.
  const node = nodeThatRecords(new Error('muxer not ready'))

  await assert.rejects(
    () => openSyncStream(node, A_PEER, '/x/1.0.0', { ...fastOptions, attempts: 3 }),
    /muxer not ready/
  )
  assert.equal(node.seen.length, 3)
})

test('a stream that stays reset is reported as reset, not as an absence', async () => {
  const node = nodeThatRecords({ status: 'reset' })

  await assert.rejects(
    () => openSyncStream(node, A_PEER, '/x/1.0.0', { ...fastOptions, attempts: 2 }),
    /reset right after opening/
  )
})
