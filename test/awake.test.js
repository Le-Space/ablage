import assert from 'node:assert/strict'
import test from 'node:test'

import { applyAwakeChoice, awakeWanted, AWAKE_STORAGE_KEY } from '../src/app/awake.js'

/**
 * Off unless somebody said otherwise.
 *
 * The opposite default to the waiting music, and deliberately: the music is
 * bounded by the code being on display, this holds for as long as the page is
 * open, and a setting that flattens a phone is not one to switch on for people.
 */

const store = (initial = {}) => {
  const held = { ...initial }

  globalThis.localStorage = {
    getItem: key => held[key] ?? null,
    setItem: (key, value) => { held[key] = String(value) }
  }

  return held
}

test('nothing stored is off', async () => {
  store()
  assert.equal(applyAwakeChoice(), false)
  assert.equal(awakeWanted(), false)
})

test('only an explicit true turns it on', async () => {
  for (const junk of ['', 'yes', '1', 'TRUE', 'false', 'null']) {
    store({ [AWAKE_STORAGE_KEY]: junk })
    assert.equal(applyAwakeChoice(), false, junk)
  }

  store({ [AWAKE_STORAGE_KEY]: 'true' })
  assert.equal(applyAwakeChoice(), true)
})

test('a choice is written down', async () => {
  const held = store()

  applyAwakeChoice(true)
  assert.equal(held[AWAKE_STORAGE_KEY], 'true')
  assert.equal(awakeWanted(), true)

  applyAwakeChoice(false)
  assert.equal(held[AWAKE_STORAGE_KEY], 'false')
})

test('a store the browser refuses holds for this session and no longer', async () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') }
  }

  assert.equal(applyAwakeChoice(), false)
  assert.doesNotThrow(() => applyAwakeChoice(true))
  assert.equal(awakeWanted(), true)
})
