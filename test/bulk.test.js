import assert from 'node:assert/strict'
import test from 'node:test'

import { BLOCK_BYTES, sendBulk } from '../src/sync/bulk.js'

/**
 * The contract these are written against, quoted rather than remembered:
 *
 *   "Write data to the stream. If the method returns false it means the
 *    internal buffer is now full and the caller should wait for the 'drain'
 *    event before sending more data."
 *
 * #74's first attempt had two unit tests that asserted a single write must wait
 * for `drain` before returning. That is a belief, not the contract, and
 * following it made every large write hang. So the decisive test here is the
 * one that would have caught *that*: a stream which never drains must still
 * finish a one-block write.
 */

/** A stream that refuses whenever asked to, and drains only when told to. */
function fakeStream ({ refuseAfter = 0 } = {}) {
  const listeners = new Map()
  const written = []

  return {
    written,
    writableNeedsDrain: false,
    send (block) {
      written.push(block.slice())
      if (written.length > refuseAfter) this.writableNeedsDrain = true

      return !this.writableNeedsDrain
    },
    /** What the far side's window update would cause. */
    drain () {
      this.writableNeedsDrain = false
      for (const fn of listeners.get('drain') ?? []) fn()
    },
    addEventListener (name, fn) {
      listeners.set(name, [...(listeners.get(name) ?? []), fn])
    },
    removeEventListener (name, fn) {
      listeners.set(name, (listeners.get(name) ?? []).filter(f => f !== fn))
    }
  }
}

const bytes = n => new Uint8Array(n).fill(7)

/**
 * Let the sender get all the way to its next wait.
 *
 * One `await Promise.resolve()` is a single microtask, and resuming from a
 * `drain` takes several before the loop registers the *next* listener. Draining
 * too early made three of these tests hang against correct code - a fake that
 * was wrong about timing, not a send path that was.
 */
const settle = () => new Promise(resolve => setImmediate(resolve))

const joined = written => {
  const total = written.reduce((n, b) => n + b.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0

  for (const block of written) {
    out.set(block, at)
    at += block.byteLength
  }

  return out
}

test('a small message goes out in one block and does not wait', async () => {
  // Refuses immediately and never drains. If this waited, the test would time
  // out - which is exactly the failure the first attempt shipped.
  const stream = fakeStream({ refuseAfter: 0 })

  await sendBulk(stream, bytes(100))

  assert.equal(stream.written.length, 1)
})

test('a large message is split, and every byte arrives in order', async () => {
  const stream = fakeStream({ refuseAfter: Infinity })
  const payload = new Uint8Array(BLOCK_BYTES * 3 + 17).map((_, i) => i % 251)

  await sendBulk(stream, payload)

  assert.equal(stream.written.length, 4)
  assert.deepEqual(joined(stream.written), payload)
})

test('it waits between blocks when the stream says the buffer is full', async () => {
  const stream = fakeStream({ refuseAfter: 0 })
  let settled = false

  const sending = sendBulk(stream, bytes(BLOCK_BYTES * 3)).then(() => { settled = true })

  await settle()
  assert.equal(stream.written.length, 1, 'stopped after the first block')
  assert.equal(settled, false)

  stream.drain()
  await settle()
  assert.equal(stream.written.length, 2, 'one drain, one more block')

  stream.drain()
  await sending
  assert.equal(settled, true)
  assert.equal(stream.written.length, 3)
})

test('but it never waits after the last block, exactly on the boundary', async () => {
  // **The one that matters**, and the boundary is the whole point: a payload of
  // exactly one block must see `more === false` and not wait. Off by one here
  // and every exact-multiple transfer hangs.
  //
  // After the final block nothing further is queued by us, so no window update
  // is coming on our account. This stream refuses the write and never drains;
  // finishing at all is the assertion.
  const stream = fakeStream({ refuseAfter: 0 })

  await sendBulk(stream, bytes(BLOCK_BYTES))

  assert.equal(stream.written.length, 1)
})

test('and the wait before the last block is the only one', async () => {
  const stream = fakeStream({ refuseAfter: 0 })
  const sending = sendBulk(stream, bytes(BLOCK_BYTES * 2))

  await settle()
  assert.equal(stream.written.length, 1)

  // One drain releases the second block, and nothing waits after it - so this
  // resolves without the stream ever draining again.
  stream.drain()
  await sending

  assert.equal(stream.written.length, 2)
})

test('an abort stops it between blocks', async () => {
  const stream = fakeStream({ refuseAfter: 0 })
  const control = new AbortController()

  const sending = sendBulk(stream, bytes(BLOCK_BYTES * 4), { signal: control.signal })

  await settle()
  control.abort(new Error('enough'))

  await assert.rejects(sending, /enough/)
  assert.ok(stream.written.length < 4, 'stopped before writing everything')
})

test('nothing is left listening once a send is done', async () => {
  // A listener per block, never removed, is how a long transfer turns into a
  // leak that only shows on the device doing the most work.
  const stream = fakeStream({ refuseAfter: 0 })
  const live = []
  const add = stream.addEventListener.bind(stream)
  const remove = stream.removeEventListener.bind(stream)

  stream.addEventListener = (n, f) => { live.push(f); add(n, f) }
  stream.removeEventListener = (n, f) => { live.splice(live.indexOf(f), 1); remove(n, f) }

  const sending = sendBulk(stream, bytes(BLOCK_BYTES * 3))

  await settle()
  stream.drain()
  await settle()
  stream.drain()
  await sending

  assert.deepEqual(live, [])
})
