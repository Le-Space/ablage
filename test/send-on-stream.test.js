import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { sendOnStream } from '../src/sync/send-on-stream.js'

/**
 * What `send()`'s return value actually means, and what to do about it.
 *
 * **It does not mean the write failed.** The interface says the internal buffer
 * is now full and the caller should wait *before sending more data* - the bytes
 * just handed over are queued, not lost. An earlier version of these tests
 * asserted that a single write must wait for `drain` before returning, which is
 * a belief rather than the contract, and following it made every large write
 * wait for a `drain` that had no reason to come: the browser suite went from
 * twelve minutes to two hours and twenty.
 *
 * So the rule is about the *gap between* writes. A message larger than one
 * block is sent in several, and each block after a full buffer waits. The last
 * one does not, because nothing follows it.
 */

/** A stream that accepts `capacity` writes, then needs draining. */
const streamThatFills = capacity => {
  const stream = new EventEmitter()
  const written = []
  let room = capacity

  stream.send = data => {
    written.push(data)
    room -= 1
    return room > 0
  }
  stream.written = written
  stream.drain = (more = capacity) => { room = more; stream.emit('drain') }

  return stream
}

const encode = message => new TextEncoder().encode(JSON.stringify(message))

test('a message that fits in one block goes straight out', async () => {
  const stream = streamThatFills(5)
  const send = sendOnStream(stream, encode, { blockSize: 1024 })

  await send({ hello: 'welt' })

  assert.equal(stream.written.length, 1)
})

test('a message larger than a block is sent in several', async () => {
  // The reason framing exists on the other side: one message, several writes.
  const stream = streamThatFills(100)
  const send = sendOnStream(stream, encode, { blockSize: 16 })

  await send({ payload: 'x'.repeat(200) })

  assert.ok(stream.written.length > 5, `sent in ${stream.written.length} pieces`)
})

test('a block after a full buffer waits for drain', async () => {
  // The gap that matters. The buffer fills on the first block and the second
  // must not be pushed on top of it.
  const stream = streamThatFills(1)
  const send = sendOnStream(stream, encode, { blockSize: 16 })

  let settled = false
  const pending = send({ payload: 'x'.repeat(200) }).then(() => { settled = true })

  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(stream.written.length, 1, 'kept writing into a full buffer')
  assert.equal(settled, false)

  stream.drain(100)
  await pending

  assert.equal(settled, true)
})

test('but the last block does not, because nothing follows it', async () => {
  // A full buffer on the final block is not a reason to wait: the bytes are
  // queued and there is no more data to pace. Waiting there is what cost two
  // hours of suite time.
  const stream = streamThatFills(1)
  const send = sendOnStream(stream, encode, { blockSize: 4096 })

  await send({ hello: 'welt' })

  assert.equal(stream.written.length, 1)
})

test('writes are serialised, so two unawaited posts cannot interleave', async () => {
  const stream = streamThatFills(1)
  const send = sendOnStream(stream, encode, { blockSize: 16 })

  send({ payload: 'x'.repeat(200) })
  const second = send({ second: true })

  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(stream.written.length, 1, 'the second message went out mid-first')

  stream.drain(100)
  await second

  assert.ok(stream.written.length > 2)
})

test('a stream that closes while waiting rejects instead of hanging', async () => {
  const stream = streamThatFills(1)
  const send = sendOnStream(stream, encode, { blockSize: 16 })

  const pending = send({ payload: 'x'.repeat(200) })

  await new Promise(resolve => setTimeout(resolve, 10))
  stream.emit('close')

  await assert.rejects(pending)
})

test('and a failed write does not poison the writes after it', async () => {
  const stream = streamThatFills(1)
  const send = sendOnStream(stream, encode, { blockSize: 16 })

  const doomed = send({ payload: 'x'.repeat(200) })

  await new Promise(resolve => setTimeout(resolve, 10))
  stream.emit('close')
  await assert.rejects(doomed)

  stream.drain(100)
  await send({ after: true })

  assert.ok(stream.written.length >= 2)
})
