import assert from 'node:assert/strict'
import test from 'node:test'

import { FILE_GIVE, FILE_NONE, MAX_TRANSFER_BYTES, answer, ask, asked, take } from '../src/sync/file-transfer.js'

/**
 * Asking a peer for a file, and what may be believed about the answer.
 *
 * The peer answering was admitted to sync, which is not the same as being
 * trusted with what lands in the folder. So most of this is about refusing:
 * the content address is the check, and it is the only reason these bytes can
 * be written to disk at all.
 */

const bytes = text => new TextEncoder().encode(text)

/** Stands in for `fs.addBytes` - same shape, no IPFS stack. */
const hashOf = async b => `cid-${new TextDecoder().decode(b)}`

test('an ask names one content address', async () => {
  assert.deepEqual(ask('cid-hello'), { type: 'file-ask', cid: 'cid-hello' })
  assert.equal(asked(ask('cid-hello')), 'cid-hello')
})

test('and anything else is not an ask', async () => {
  assert.equal(asked(null), null)
  assert.equal(asked({ type: 'update' }), null)
  assert.equal(asked({ type: 'file-ask' }), null)
  assert.equal(asked({ type: 'file-ask', cid: '' }), null)
  assert.equal(asked({ type: 'file-ask', cid: 42 }), null)
})

test('a device that has the file hands it over', async () => {
  const out = await answer(ask('cid-hello'), async () => bytes('hello'))

  assert.equal(out.type, FILE_GIVE)
  assert.equal(out.cid, 'cid-hello')

  const taken = await take(out, 'cid-hello', hashOf)

  assert.deepEqual(taken.bytes, bytes('hello'))
})

test('a device that does not have it says so, rather than saying nothing', async () => {
  // Silence is the state this replaces: #72's symptom is a row for a file whose
  // contents never come, with no error anywhere.
  const out = await answer(ask('cid-missing'), async () => null)

  assert.equal(out.type, FILE_NONE)
  assert.match((await take(out, 'cid-missing', hashOf)).refused, /not here/)
})

test('a device that cannot read its own file answers with the reason', async () => {
  const out = await answer(ask('cid-x'), async () => { throw new Error('disk is gone') })

  assert.equal(out.type, FILE_NONE)
  assert.match(out.why, /disk is gone/)
})

test('something too large to hand out this way is declined, not truncated', async () => {
  const out = await answer(ask('cid-big'), async () => new Uint8Array(MAX_TRANSFER_BYTES + 1))

  assert.equal(out.type, FILE_NONE)
  assert.match(out.why, /too large/)
})

test('bytes that are not what was asked for are refused', async () => {
  // **The check the whole thing rests on.** A peer admitted to sync could
  // otherwise answer any ask with any bytes, and they would be written to the
  // folder under the name that was asked for.
  const lying = await answer(ask('cid-hello'), async () => bytes('something else'))

  lying.cid = 'cid-hello'

  const taken = await take(lying, 'cid-hello', hashOf)

  assert.equal(taken.bytes, undefined)
  assert.match(taken.refused, /not what was asked for/)
})

test('an answer about a different file is refused before it is even hashed', async () => {
  let hashed = false

  const out = await take(
    { type: FILE_GIVE, cid: 'cid-other', bytes: '' },
    'cid-hello',
    async b => { hashed = true; return hashOf(b) }
  )

  assert.match(out.refused, /different file/)
  assert.equal(hashed, false)
})

test('and so is a body that is not readable as bytes', async () => {
  const out = await take({ type: FILE_GIVE, cid: 'cid-hello', bytes: { not: 'a string' } }, 'cid-hello', hashOf)

  assert.match(out.refused, /not readable/)
})

test('anything that is not an answer at all is refused', async () => {
  assert.match((await take(null, 'cid-hello', hashOf)).refused, /not an answer/)
  assert.match((await take({ type: 'update', cid: 'cid-hello' }, 'cid-hello', hashOf)).refused, /not an answer/)
})

test('a file of real size survives the round trip', async () => {
  // Base64 in chunks: `String.fromCharCode(...bytes)` over a megabyte overflows
  // the argument list, and the RangeError lands nowhere near files.
  const big = new Uint8Array(1024 * 1024).map((_, i) => i % 251)
  const hash = async () => 'cid-big'
  const out = await answer(ask('cid-big'), async () => big)

  assert.deepEqual((await take(out, 'cid-big', hash)).bytes, big)
})
