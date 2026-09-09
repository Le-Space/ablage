import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchable } from '../src/sync/fetchable.js'

/**
 * A setting whose default is the app's claim.
 *
 * Switching it on lets anybody who reaches this device through a relay fetch
 * any block of this share by address. So every path that is not an explicit
 * "yes" has to come out as off - which is most of what these check.
 */

/** A localStorage that can also be made to fail, the way a private window does. */
const store = ({ throws = false, seed = {} } = {}) => {
  const held = new Map(Object.entries(seed))

  return {
    getItem: k => { if (throws) throw new Error('denied'); return held.get(k) ?? null },
    setItem: (k, v) => { if (throws) throw new Error('denied'); held.set(k, v) },
    removeItem: k => { if (throws) throw new Error('denied'); held.delete(k) },
    held
  }
}

test('a share nobody switched on is off', async () => {
  assert.equal(fetchable({ storage: store() }).get(), false)
})

test('switching it on is remembered', async () => {
  const storage = store()
  const setting = fetchable({ storage })

  setting.set(true)

  assert.equal(setting.get(), true)
  assert.equal(fetchable({ storage }).get(), true, 'and survives a fresh read')
})

test('switching it off removes the key rather than writing a false', async () => {
  // An absent key and an off one mean the same thing; a leftover "false" would
  // outlive the share it belonged to.
  const storage = store()
  const setting = fetchable({ storage })

  setting.set(true)
  setting.set(false)

  assert.equal(setting.get(), false)
  assert.equal(storage.held.has('ablage.fetchable'), false)
})

test('anything that is not exactly "true" is off', async () => {
  for (const value of ['false', 'TRUE', '1', 'yes', '', 'null']) {
    assert.equal(fetchable({ storage: store({ seed: { 'ablage.fetchable': value } }) }).get(), false, value)
  }
})

test('a storage that refuses to be read is off, not on', async () => {
  // A private window is not a decision to publish.
  assert.equal(fetchable({ storage: store({ throws: true }) }).get(), false)
})

test('and a storage that refuses to be written still runs', async () => {
  const setting = fetchable({ storage: store({ throws: true }) })

  assert.doesNotThrow(() => setting.set(true))
  assert.equal(setting.get(), false, 'off for this page, which is the safe half')
})

test('a browser where reaching localStorage throws still constructs, and is off', async () => {
  // The case the app actually meets and `identity.test.js` sets up on purpose:
  // not a storage whose methods throw, but a global whose *getter* throws.
  // A default parameter of `globalThis.localStorage` is evaluated before any
  // try/catch in the function body, so the first version of this module took
  // the whole app down at load. This constructs with no storage argument, so
  // the default has to run.
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get () { throw new Error('blocked') }
  })

  try {
    let setting

    assert.doesNotThrow(() => { setting = fetchable({ key: 'ablage.fetchable' }) })
    assert.equal(setting.get(), false)
    assert.doesNotThrow(() => setting.set(true))
    assert.equal(setting.get(), false, 'nowhere to keep it, so off')
  } finally {
    delete globalThis.localStorage
  }
})

test('no storage at all is off', async () => {
  assert.equal(fetchable({ storage: undefined }).get(), false)
})

test('each share keeps its own answer', async () => {
  // `scoped()` suffixes every key but the first share's, so two shares are two
  // keys in one store - and one being on must not turn the other on.
  const storage = store()

  fetchable({ key: 'ablage.fetchable', storage }).set(true)

  assert.equal(fetchable({ key: 'ablage.fetchable.work', storage }).get(), false)
})
