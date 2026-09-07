import assert from 'node:assert/strict'
import test from 'node:test'

import { frame, reader } from '../src/sync/framing.js'

/**
 * The property the sync stream was missing: a message survives being split.
 *
 * Measured before this existed: a 4 MiB message arrived as 11 chunks and 9 of
 * them failed to parse, in silence. These are that failure, in miniature.
 */

const encode = text => new TextEncoder().encode(text)
const decode = bytes => new TextDecoder().decode(bytes)

test('a message that arrives whole comes back whole', async () => {
  const read = reader()

  assert.deepEqual(read(frame(encode('hallo'))).map(decode), ['hallo'])
})

test('a message split across chunks is reassembled', async () => {
  // The failure this module exists for. Byte by byte is the cruellest split
  // and the one a parser-per-chunk cannot survive.
  const read = reader()
  const framed = frame(encode('a longer message, split very small'))
  const seen = []

  for (const byte of framed) seen.push(...read(Uint8Array.from([byte])))

  assert.deepEqual(seen.map(decode), ['a longer message, split very small'])
})

test('two messages in one chunk are both returned', async () => {
  const read = reader()
  const a = frame(encode('one'))
  const b = frame(encode('two'))
  const together = new Uint8Array(a.byteLength + b.byteLength)

  together.set(a, 0)
  together.set(b, a.byteLength)

  assert.deepEqual(read(together).map(decode), ['one', 'two'])
})

test('and a message spanning a chunk boundary with another behind it', async () => {
  // The awkward case: one chunk ends mid-message and the next carries the rest
  // plus a whole further message.
  const read = reader()
  const a = frame(encode('first message'))
  const b = frame(encode('second'))
  const all = new Uint8Array(a.byteLength + b.byteLength)

  all.set(a, 0)
  all.set(b, a.byteLength)

  const split = a.byteLength - 4

  assert.deepEqual(read(all.subarray(0, split)).map(decode), [])
  assert.deepEqual(read(all.subarray(split)).map(decode), ['first message', 'second'])
})

test('nothing is returned while a message is still incomplete', async () => {
  const read = reader()
  const framed = frame(encode('not yet all here'))

  assert.deepEqual(read(framed.subarray(0, 5)), [])
})

test('a message larger than the limit is refused rather than buffered', async () => {
  // Otherwise a peer could name any length it liked and this side would hold
  // the bytes waiting for the rest.
  const read = reader({ maxBytes: 16 })

  assert.throws(() => read(frame(encode('this is definitely longer than sixteen bytes'))), /over the 16 limit/)
})

test('a big message survives the round trip', async () => {
  const read = reader()
  const big = 'x'.repeat(4 * 1024 * 1024)
  const framed = frame(encode(big))
  const seen = []

  // In 64 KiB pieces, which is the size yamux frames with.
  for (let at = 0; at < framed.byteLength; at += 65_536) {
    seen.push(...read(framed.subarray(at, at + 65_536)))
  }

  assert.equal(seen.length, 1)
  assert.equal(decode(seen[0]).length, big.length)
})
