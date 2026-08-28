import assert from 'node:assert/strict'
import test from 'node:test'

import { findARelay } from '../src/find-a-relay.js'

/**
 * Looking again when the relay we started with turns out to be dead.
 *
 * The failure this exists for cost most of a day: the baked address pointed at
 * a name whose route had been withdrawn, so DNS resolved, TCP answered and TLS
 * never completed. Every start dialled it, every start failed, and nothing ever
 * tried anything else.
 */

const never = async () => { throw new Error('should not have been called') }

test('a node that got a relay address is left alone', async () => {
  // The ordinary path worked. Asking the discovery channel anyway would be an
  // outbound call nobody needed.
  const out = await findARelay({
    relayAddresses: () => 2,
    find: never,
    dial: never,
    wait: async () => {}
  })

  assert.equal(out, 'already')
})

test('and one that got none looks, and dials what it is told', async () => {
  const dialled = []

  const out = await findARelay({
    relayAddresses: () => 0,
    find: async () => ({ addresses: ['/dns4/one.example/tcp/443/tls/ws/p2p/12D3KooWA'] }),
    dial: async address => { dialled.push(address) },
    wait: async () => {}
  })

  assert.equal(out, 'dialled')
  assert.deepEqual(dialled, ['/dns4/one.example/tcp/443/tls/ws/p2p/12D3KooWA'])
})

test('the address that answered is remembered for next time', async () => {
  // So the next start begins with something that worked rather than with the
  // same dead name.
  let kept = null

  await findARelay({
    relayAddresses: () => 0,
    find: async () => ({ addresses: ['/dns4/one.example/tcp/443/tls/ws/p2p/12D3KooWA'] }),
    dial: async () => {},
    remember: addresses => { kept = addresses },
    wait: async () => {}
  })

  assert.deepEqual(kept, ['/dns4/one.example/tcp/443/tls/ws/p2p/12D3KooWA'])
})

test('a candidate that will not answer is not the end of the list', async () => {
  // Addresses from a discovery channel are candidates, not promises.
  const tried = []

  const out = await findARelay({
    relayAddresses: () => 0,
    find: async () => ({ addresses: ['/dns4/dead.example/tcp/443/tls/ws/p2p/12D3KooWA', '/dns4/live.example/tcp/443/tls/ws/p2p/12D3KooWB'] }),
    dial: async address => {
      tried.push(address)
      if (address.includes('dead')) throw new Error('no')
    },
    wait: async () => {}
  })

  assert.equal(out, 'dialled')
  assert.equal(tried.length, 2)
})

test('a channel that cannot be reached does not take the app down', async () => {
  // It is somebody else's machine too.
  const out = await findARelay({
    relayAddresses: () => 0,
    find: async () => { throw new Error('offline') },
    dial: never,
    wait: async () => {}
  })

  assert.equal(out, 'no-answer')
})

test('and neither does a channel that names nobody', async () => {
  const out = await findARelay({
    relayAddresses: () => 0,
    find: async () => ({ addresses: [] }),
    dial: never,
    wait: async () => {}
  })

  assert.equal(out, 'none')
})

test('every candidate failing is reported rather than thrown', async () => {
  const out = await findARelay({
    relayAddresses: () => 0,
    find: async () => ({ addresses: ['/dns4/a.example/tcp/443/tls/ws/p2p/12D3KooWA'] }),
    dial: async () => { throw new Error('no') },
    wait: async () => {}
  })

  assert.equal(out, 'unreachable')
})

test('the wait comes first, because a reservation takes time', async () => {
  // Checked after the wait, not before: a node asked about immediately has no
  // address yet and would send everybody looking for no reason.
  const order = []

  await findARelay({
    relayAddresses: () => { order.push('asked'); return 1 },
    find: never,
    dial: never,
    wait: async () => { order.push('waited') }
  })

  assert.deepEqual(order, ['waited', 'asked'])
})

test('what it is doing is said out loud', async () => {
  const said = []

  await findARelay({
    relayAddresses: () => 0,
    find: async () => ({ addresses: ['/dns4/a.example/tcp/443/tls/ws/p2p/12D3KooWA'] }),
    dial: async () => {},
    report: state => said.push(state),
    wait: async () => {}
  })

  assert.deepEqual(said, ['looking', 'found'])
})
