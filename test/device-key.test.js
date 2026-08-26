import assert from 'node:assert/strict'
import test from 'node:test'

import { peerIdFromPrivateKey } from '@libp2p/peer-id'

import { forgetKey, keyFor, KEYS_STORAGE_KEY, recallKey } from '../src/device-key.js'

/**
 * An identity that outlives a reload, and one per share.
 *
 * The second half is the interesting one: two shares by the same person are
 * meant to look like two unrelated strangers on the meeting place. A single
 * device-wide key would undo that quietly, and nothing about the interface
 * would look different.
 */

const store = (initial = {}) => {
  const held = { ...initial }

  return {
    getItem: key => held[key] ?? null,
    setItem: (key, value) => { held[key] = String(value) },
    held
  }
}

const id = key => peerIdFromPrivateKey(key).toString()

test('the same share gets the same identity twice', async () => {
  const kept = store()

  assert.equal(id(await keyFor(kept, 'photos')), id(await keyFor(kept, 'photos')))
})

test('and a different share gets a different one', async () => {
  // The whole point. If this ever passes by accident - one key reused across
  // shares - the linkability the feature is for is gone and nothing on screen
  // says so.
  const kept = store()

  assert.notEqual(id(await keyFor(kept, 'photos')), id(await keyFor(kept, 'invoices')))
})

test('what is stored is an envelope, not a bare key', async () => {
  // So that turning encryption on later is a new `kdf` and not a migration.
  const kept = store()

  await keyFor(kept, 'photos')

  const envelope = JSON.parse(kept.held[KEYS_STORAGE_KEY]).photos

  assert.equal(envelope.v, 1)
  assert.equal(envelope.kdf, 'none')
  assert.equal(typeof envelope.material, 'string')
})

test('a share that was forgotten comes back as a stranger', async () => {
  const kept = store()
  const before = id(await keyFor(kept, 'photos'))

  forgetKey(kept, 'photos')
  assert.equal(await recallKey(kept, 'photos'), null)
  assert.notEqual(id(await keyFor(kept, 'photos')), before)
})

test('forgetting one share leaves the others alone', async () => {
  const kept = store()
  const invoices = id(await keyFor(kept, 'invoices'))

  await keyFor(kept, 'photos')
  forgetKey(kept, 'photos')

  assert.equal(id(await keyFor(kept, 'invoices')), invoices)
})

test('junk in the store is a new identity, not a start that throws', async () => {
  for (const junk of ['not json', '[]', '"a string"', '{"photos":null}', '{"photos":{"kdf":"none"}}', '{"photos":{"kdf":"PBKDF2"}}']) {
    const kept = store({ [KEYS_STORAGE_KEY]: junk })

    assert.equal(await recallKey(kept, 'photos'), null, junk)
    assert.ok(id(await keyFor(kept, 'photos')).startsWith('12D3Koo'), junk)
  }
})

test('a store the browser refuses gives an identity for this session', async () => {
  // Which is exactly what happened before this file existed, so it is a
  // degraded start rather than a broken one.
  const refused = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') }
  }

  const key = await keyFor(refused, 'photos')

  assert.ok(id(key).startsWith('12D3Koo'))
  assert.notEqual(id(key), id(await keyFor(refused, 'photos')))
})

test('material that is not a key is a new identity, not a crash', async () => {
  const kept = store({ [KEYS_STORAGE_KEY]: JSON.stringify({ photos: { v: 1, kdf: 'none', material: 'bm90IGEga2V5' } }) })

  assert.equal(await recallKey(kept, 'photos'), null)
})
