import assert from 'node:assert/strict'
import test from 'node:test'

import { openSyncStream, rankAddresses } from '../src/sync-dial.js'

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

/**
 * Which address to dial, out of fifty-four.
 *
 * Measured against the real relay: the peer store held 54 addresses for one
 * peer - every address the relay listens on, crossed with `{circuit,
 * circuit/webrtc}`. Dialling the peer id hands that list to libp2p to work
 * through, and the wait is what somebody watching a dialog that does not appear
 * is looking at.
 */

const RELAY = '/dns4/relay.example/tcp/443/tls/ws/p2p/12D3KooWRelay'
const THEM = '/p2p/12D3KooWThem'

test('a webrtc address wins, because it is the one that stops being relayed', async () => {
  const ranked = rankAddresses([
    `${RELAY}/p2p-circuit${THEM}`,
    `${RELAY}/p2p-circuit/webrtc${THEM}`
  ])

  assert.equal(ranked[0], `${RELAY}/p2p-circuit/webrtc${THEM}`)
})

test('loopback and private addresses are not offered at all', async () => {
  // The relay announces its own LAN. A browser cannot reach any of it, and each
  // one is a dial attempt spent on nothing.
  const ranked = rankAddresses([
    `/ip4/127.0.0.1/tcp/9092/tls/ws/p2p/12D3KooWRelay/p2p-circuit/webrtc${THEM}`,
    `/ip4/172.16.14.2/tcp/9092/tls/ws/p2p/12D3KooWRelay/p2p-circuit/webrtc${THEM}`,
    `/ip4/192.168.1.5/tcp/9092/tls/ws/p2p/12D3KooWRelay/p2p-circuit/webrtc${THEM}`,
    `/ip4/10.0.0.7/tcp/9092/tls/ws/p2p/12D3KooWRelay/p2p-circuit/webrtc${THEM}`,
    `${RELAY}/p2p-circuit/webrtc${THEM}`
  ])

  assert.deepEqual(ranked, [`${RELAY}/p2p-circuit/webrtc${THEM}`])
})

test('and neither is a plaintext WebSocket', async () => {
  // An https page cannot open one. It is not a worse choice, it is not a
  // choice - the browser refuses it as mixed content.
  assert.deepEqual(
    rankAddresses([`/dns4/relay.example/tcp/80/ws/p2p/12D3KooWRelay/p2p-circuit/webrtc${THEM}`]),
    []
  )
})

test('a name beats a bare address', async () => {
  const ranked = rankAddresses([
    `/ip4/62.141.40.252/tcp/443/tls/ws/p2p/12D3KooWRelay/p2p-circuit/webrtc${THEM}`,
    `${RELAY}/p2p-circuit/webrtc${THEM}`
  ])

  assert.equal(ranked[0], `${RELAY}/p2p-circuit/webrtc${THEM}`)
})

test('nothing usable is an empty list, not a bad choice', async () => {
  // The caller falls back to the peer id, which is what this did all along.
  assert.deepEqual(rankAddresses([]), [])
  assert.deepEqual(rankAddresses([`/ip4/127.0.0.1/tcp/1/ws${THEM}`]), [])
})

test('a chosen address that never works falls back to the peer id', async () => {
  // The risk this feature brings: an address can be stale - the peer moved
  // relays, the reservation lapsed - and retrying a dead one fifteen times
  // would lose a connection that dialling the peer id would have made.
  const tried = []
  const node = {
    peerStore: {
      get: async () => ({
        addresses: [{ multiaddr: { toString: () => '/dns4/relay.example/tcp/443/tls/ws/p2p/12D3KooWRelay/p2p-circuit/webrtc/p2p/12D3KooWThem' } }]
      })
    },
    dialProtocol: async target => {
      tried.push(typeof target?.toString === 'function' && String(target).startsWith('/') ? 'address' : 'peerId')

      if (tried.length < 8) throw new Error('nope')
      return { status: 'open' }
    }
  }

  const stream = await openSyncStream(node, '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTA', '/x/1', {
    retryDelay: 0, settleDelay: 0
  })

  assert.equal(stream.status, 'open')
  assert.deepEqual(tried.slice(0, 5), Array(5).fill('address'), 'first the address')
  assert.deepEqual(tried.slice(5), Array(tried.length - 5).fill('peerId'), 'then the peer id')
})
