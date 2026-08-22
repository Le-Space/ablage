import assert from 'node:assert/strict'
import test from 'node:test'

import { admission, arrivedByQr, decide } from '../src/sync/admission.js'

/**
 * Who may write into this folder.
 *
 * The interesting part is the address, because that is what distinguishes a
 * consent that already happened - somebody in the room, a camera pointed at a
 * code - from one that never did.
 */

const QR = '/webrtc/p2p/12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTA'
const RELAYED = '/ip4/1.2.3.4/tcp/443/wss/p2p/12D3KooWRelay/p2p-circuit/webrtc/p2p/12D3KooWStranger'

let n = 0
const fresh = () => admission({ key: `test.admitted.${n++}` })

test('a scanned peer arrived by QR', async () => {
  assert.equal(arrivedByQr(QR), true)
})

test('a relayed one did not, even though it is also WebRTC', async () => {
  // The half that is easy to miss. A relayed connection carries `/webrtc/p2p/`
  // too, behind the circuit that got there - so the WebRTC part says nothing on
  // its own, and checking only for it would admit exactly the peers this exists
  // to ask about.
  assert.equal(arrivedByQr(RELAYED), false)
})

test('and neither did a plain one, or a missing address', async () => {
  assert.equal(arrivedByQr('/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWX'), false)
  assert.equal(arrivedByQr(''), false)
  assert.equal(arrivedByQr(undefined), false)
})

test('a scanned peer is admitted without a question', async () => {
  // Today's behaviour, unchanged. The scan is the question, already answered.
  assert.equal(decide({ address: QR, peerId: 'a', admitted: fresh() }), 'admit')
})

test('a relayed stranger is asked about', async () => {
  assert.equal(decide({ address: RELAYED, peerId: 'stranger', admitted: fresh() }), 'ask')
})

test('and is not asked about again once remembered', async () => {
  const admitted = fresh()

  admitted.remember('stranger')

  assert.equal(decide({ address: RELAYED, peerId: 'stranger', admitted }), 'admit')
})

test('remembering one peer does not admit another', async () => {
  const admitted = fresh()

  admitted.remember('known')

  assert.equal(decide({ address: RELAYED, peerId: 'somebody-else', admitted }), 'ask')
})

test('a remembered peer can be forgotten, and is asked about again', async () => {
  const admitted = fresh()

  admitted.remember('stranger')
  admitted.forget('stranger')

  assert.equal(decide({ address: RELAYED, peerId: 'stranger', admitted }), 'ask')
})

test('nothing is remembered until somebody says so', async () => {
  // The box is unticked, and this is the assertion that says the default is the
  // safe one rather than the convenient one.
  assert.deepEqual(fresh().snapshot(), [])
})
