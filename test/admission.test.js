import assert from 'node:assert/strict'
import test from 'node:test'

import { admission, decide } from '../src/sync/admission.js'

/**
 * Who may write into this folder.
 *
 * This used to test the *address*, on the reasoning that `/webrtc/p2p/…`
 * without a `/p2p-circuit` could only have come from somebody in the room with
 * a camera. DCUtR made that false: a stranger met over a relay punches a hole
 * and continues on a direct WebRTC connection with exactly that address.
 *
 * So the question is no longer "what does the route look like" but "did
 * somebody here scan this peer's code", which is an act this device performed
 * and can simply remember.
 */

let n = 0
const fresh = () => admission({ key: `test.admitted.${n++}` })

test('a scanned peer is admitted without a question', async () => {
  // The scan is the question, already answered.
  assert.equal(decide({ scanned: true, peerId: 'a', admitted: fresh() }), 'admit')
})

test('a stranger is asked about', async () => {
  assert.equal(decide({ scanned: false, peerId: 'stranger', admitted: fresh() }), 'ask')
})

test('and a hole punch is not a scan, however much its address looks like one', async () => {
  // The regression. After DCUtR the connection to a relayed stranger *is* a
  // direct `/webrtc/p2p/<id>` with no circuit in it - so anything reading the
  // address admits them in silence, which is what happened: the dialog stopped
  // appearing and unknown peers were attached without a word.
  //
  // Nothing about the route is passed in any more, so there is nothing left for
  // an upgrade to imitate.
  assert.equal(decide({ scanned: false, peerId: 'punched-through', admitted: fresh() }), 'ask')
})

test('a missing answer is not consent', async () => {
  for (const nothing of [undefined, null, '']) {
    assert.equal(decide({ scanned: nothing, peerId: 'x', admitted: fresh() }), 'ask', String(nothing))
  }
})

test('and is not asked about again once remembered', async () => {
  const admitted = fresh()

  admitted.remember('stranger')

  assert.equal(decide({ scanned: false, peerId: 'stranger', admitted }), 'admit')
})

test('remembering one peer does not admit another', async () => {
  const admitted = fresh()

  admitted.remember('known')

  assert.equal(decide({ scanned: false, peerId: 'somebody-else', admitted }), 'ask')
})

test('a remembered peer can be forgotten, and is asked about again', async () => {
  const admitted = fresh()

  admitted.remember('stranger')
  admitted.forget('stranger')

  assert.equal(decide({ scanned: false, peerId: 'stranger', admitted }), 'ask')
})

test('nothing is remembered until somebody says so', async () => {
  // The box is unticked, and this is the assertion that says the default is the
  // safe one rather than the convenient one.
  assert.deepEqual(fresh().snapshot(), [])
})
