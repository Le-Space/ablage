import assert from 'node:assert/strict'
import test from 'node:test'

import { peerSet } from '../src/sync/peer-set.js'

/**
 * What a folder switch does to the peers, away from a browser.
 *
 * Fake providers, because none of this is about Yjs: what matters is which
 * channels are told, which providers are destroyed, and who is left.
 */

const fake = () => {
  const provider = { destroyed: false, destroy () { provider.destroyed = true } }
  return provider
}

const withPeers = (...ids) => {
  const peers = peerSet()
  const sent = new Map(ids.map(id => [id, []]))
  const providers = new Map()

  for (const id of ids) {
    const provider = fake()

    providers.set(id, provider)
    peers.add(id, provider, message => sent.get(id).push(message))
  }

  return { peers, sent, providers }
}

test('a switch tells only the peers that may hear it', async () => {
  const { peers, sent } = withPeers('a', 'b')

  peers.switchFolder({
    tell: ['a'],
    message: { type: 'folder-switch', id: 'x', name: 'Rechnungen' },
    rebuild: () => fake()
  })

  assert.deepEqual(sent.get('a'), [{ type: 'folder-switch', id: 'x', name: 'Rechnungen' }])
  assert.deepEqual(sent.get('b'), [])
})

test('and keeps only those, with a provider on the new document', async () => {
  const { peers, providers } = withPeers('a', 'b')

  const rebuilt = []
  const kept = peers.switchFolder({ tell: ['a'], message: {}, rebuild: () => { const p = fake(); rebuilt.push(p); return p } })

  assert.deepEqual(kept, ['a'])
  assert.equal(peers.size, 1)

  // Both old providers go: one because it was replaced, one because this device
  // is no longer describing a folder to them. Leaving either would keep a
  // listener on a document nobody reads.
  assert.equal(providers.get('a').destroyed, true)
  assert.equal(providers.get('b').destroyed, true)
  assert.equal(rebuilt.length, 1)
})

test('the message goes before the rebuild, over the channel they are synced on', async () => {
  // A message sent after the swap would arrive describing a document the peer
  // has never seen.
  const order = []
  const peers = peerSet()

  peers.add('a', fake(), () => order.push('sent'))
  peers.switchFolder({ tell: ['a'], message: {}, rebuild: () => { order.push('rebuilt'); return fake() } })

  assert.deepEqual(order, ['sent', 'rebuilt'])
})

test('telling nobody leaves nobody, and sends nothing', async () => {
  const { peers, sent } = withPeers('a', 'b')

  peers.switchFolder({ tell: [], message: {}, rebuild: () => fake() })

  assert.equal(peers.size, 0)
  assert.deepEqual(sent.get('a'), [])
})

test('following somebody keeps the connection and rebuilds on it', async () => {
  const { peers, providers } = withPeers('a')

  const fresh = peers.follow('a', () => fake())

  assert.notEqual(fresh, null)
  assert.equal(providers.get('a').destroyed, true)
  assert.equal(peers.size, 1)
})

test('following a peer that has gone is not an error', async () => {
  const peers = peerSet()

  assert.equal(peers.follow('nobody', () => fake()), null)
})

test('keeping your own folder drops the sync and not the peer', async () => {
  const { peers, providers } = withPeers('a')

  assert.equal(peers.drop('a'), true)
  assert.equal(providers.get('a').destroyed, true)
  assert.equal(peers.size, 0)
})

test('a reconnection replaces that peer rather than piling up', async () => {
  const peers = peerSet()
  const first = fake()

  peers.add('a', first, () => {})
  peers.add('a', fake(), () => {})

  assert.equal(first.destroyed, true)
  assert.equal(peers.size, 1)
})

test('a loop that ends late does not drop the provider that replaced it', async () => {
  const peers = peerSet()
  const first = fake()
  const second = fake()

  peers.add('a', first, () => {})
  peers.add('a', second, () => {})

  // `first`'s read loop finishing now must not take `second` with it.
  assert.equal(peers.dropIfCurrent('a', first), false)
  assert.equal(peers.size, 1)
  assert.equal(second.destroyed, false)
})

test('the new document is made between the message and the rebuild', async () => {
  // Too early and the message describes a document the peer has never seen; too
  // late and the rebuilt providers sit on the old one. There is exactly one
  // moment, which is why the caller does not get to choose it.
  const order = []
  const peers = peerSet()

  peers.add('a', fake(), () => order.push('sent'))
  peers.switchFolder({
    tell: ['a'],
    message: {},
    beforeRebuild: () => order.push('fresh document'),
    rebuild: () => { order.push('rebuilt'); return fake() }
  })

  assert.deepEqual(order, ['sent', 'fresh document', 'rebuilt'])
})

test('and it still runs when nobody is being told', async () => {
  // The folder changed on this device either way. Skipping it because there is
  // nobody to tell would leave the index describing the previous folder.
  const order = []
  const peers = peerSet()

  peers.add('a', fake(), () => order.push('sent'))
  peers.switchFolder({ tell: [], message: {}, beforeRebuild: () => order.push('fresh document'), rebuild: () => fake() })

  assert.deepEqual(order, ['fresh document'])
})
