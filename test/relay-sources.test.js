import assert from 'node:assert/strict'
import test from 'node:test'

import { bakedRelayAddresses, relayProbe } from '../src/relay-sources.js'

/**
 * Where a relay address comes from.
 *
 * The discovery half talks to a public channel and is therefore not tested
 * here - a unit test that reached the network would fail on a train. What is
 * testable is the shape of what ships and the probe, which is the part that
 * decides whether a discovered address is worth anything.
 */

const multiaddr = address => ({ address })

test('the shipped addresses name a peer, or they cannot be dialled', async () => {
  // An address without `/p2p/<id>` is a place, not a peer. libp2p will not dial
  // one, and the failure arrives far from the typo that caused it.
  for (const address of bakedRelayAddresses()) {
    assert.match(address, /\/p2p\/12D3Koo\w+$/, address)
  }
})

test('and they are secure WebSocket, because this page is https', async () => {
  // A browser on an https page refuses a plain ws:// as mixed content. Shipping
  // one would look like a relay that is down.
  for (const address of bakedRelayAddresses()) {
    assert.match(address, /\/tls\/ws\//, address)
  }
})

test('both families ship, so a v6-only network is not stranded', async () => {
  const families = bakedRelayAddresses().map(address => address.split('/')[1])

  assert.ok(families.includes('dns4'))
  assert.ok(families.includes('dns6'))
})

test('the list handed out cannot be edited from outside', async () => {
  bakedRelayAddresses().push('/nonsense')

  assert.equal(bakedRelayAddresses().some(a => a === '/nonsense'), false)
})

test('the probe reports the address that answered', async () => {
  const node = { dial: async () => ({}) }

  const answered = await relayProbe(node, multiaddr)(['/a', '/b'])

  assert.deepEqual(answered, ['/a'])
})

test('and stops at the first, rather than dialling them all', async () => {
  // This decides which relay to use. Dialling four when one would do spends
  // somebody's battery to learn nothing.
  const tried = []
  const node = { dial: async addr => { tried.push(addr.address); return {} } }

  await relayProbe(node, multiaddr)(['/a', '/b', '/c'])

  assert.deepEqual(tried, ['/a'])
})

test('an address that refuses is passed over, not reported', async () => {
  const node = { dial: async addr => { if (addr.address === '/dead') throw new Error('refused'); return {} } }

  assert.deepEqual(await relayProbe(node, multiaddr)(['/dead', '/live']), ['/live'])
})

test('and nothing answering is an empty answer, not a throw', async () => {
  // `findReachableRelays` reads this as "none of these" and moves on to
  // discovery. A throw here would take the whole check down with it.
  const node = { dial: async () => { throw new Error('nope') } }

  assert.deepEqual(await relayProbe(node, multiaddr)(['/a', '/b']), [])
})

test('the dial is given a deadline', async () => {
  // Without one, an address that accepts a connection and then says nothing
  // holds the check open for as long as the platform's default, which on a
  // phone is long enough to look like a hang.
  let seen = null
  const node = { dial: async (_addr, options) => { seen = options; return {} } }

  await relayProbe(node, multiaddr, { timeoutMs: 1234 })(['/a'])

  assert.ok(seen?.signal instanceof AbortSignal)
})
