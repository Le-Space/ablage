import assert from 'node:assert/strict'
import test from 'node:test'

import { sharing } from '../src/sync/sharing.js'

/**
 * What this device decided to send to whom.
 *
 * `localStorage` exists in Node 22 under `--experimental-webstorage`, and this
 * suite does not run with it - so each test uses its own key and the module's
 * own guards do the rest. What matters is the shape, not the persistence.
 */

let n = 0
const fresh = () => sharing({ key: `test.sharing.${n++}` })

test('a peer never answered for is not the same as one that said no', async () => {
  // The difference decides whether to ask, which is the whole reason `get`
  // returns three things rather than two.
  const decided = fresh()

  assert.equal(decided.get('peer-a'), null)

  decided.set(['peer-a'], false)
  assert.equal(decided.get('peer-a'), false)
})

test('one answer covers every peer it was given', async () => {
  const decided = fresh()

  decided.set(['a', 'b', 'c'], true)

  assert.deepEqual(decided.allowed(['a', 'b', 'c']), ['a', 'b', 'c'])
})

test('but it is stored per peer, so a later one inherits nothing', async () => {
  // The half worth insisting on. A global flag would apply this answer to a
  // device that joined afterwards - possibly one met through a relay.
  const decided = fresh()

  decided.set(['a', 'b'], true)

  assert.equal(decided.get('c'), null)
  assert.deepEqual(decided.allowed(['a', 'b', 'c']), ['a', 'b'])
})

test('a no is a no, not an absence', async () => {
  const decided = fresh()

  decided.set(['a'], false)

  assert.deepEqual(decided.allowed(['a']), [])
  assert.equal(decided.get('a'), false)
})

test('a peer can be forgotten, and is then asked about again', async () => {
  const decided = fresh()

  decided.set(['a'], true)
  decided.forget('a')

  assert.equal(decided.get('a'), null)
})

test('forgetting somebody who was never there changes nothing', async () => {
  const decided = fresh()

  decided.forget('nobody')

  assert.deepEqual(decided.snapshot(), {})
})
