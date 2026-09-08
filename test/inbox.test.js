import assert from 'node:assert/strict'
import test from 'node:test'

import { INBOX_MESSAGE, MAX_NAME, MAX_TEXT, inboxMessage, received } from '../src/sync/inbox.js'

/**
 * A stranger's message, and what may be believed about it.
 *
 * Everything here arrives on a stream anyone who reaches the inbox may open, so
 * the tests are mostly about refusing rather than accepting.
 */

test('a message carries what was said and who said it', async () => {
  const message = inboxMessage({ name: 'Jo', text: 'can you look at the export?' })

  assert.equal(message.type, INBOX_MESSAGE)
  assert.equal(message.name, 'Jo')
  assert.equal(message.text, 'can you look at the export?')
})

test('a name is optional, because somebody without one still has something to say', async () => {
  assert.equal(inboxMessage({ text: 'hello' }).name, '')
})

test('but a message with nothing in it is refused', async () => {
  // Not repaired into an empty message: the sender should learn, not the
  // recipient guess.
  assert.throws(() => inboxMessage({ name: 'Jo', text: '   ' }), /nothing in it/)
})

test('both fields are cut rather than refused when they are too long', async () => {
  // Somebody who pastes half a document has still said something.
  const message = inboxMessage({ name: 'x'.repeat(500), text: 'y'.repeat(10_000) })

  assert.equal(message.name.length, MAX_NAME)
  assert.equal(message.text.length, MAX_TEXT)
})

test('an arriving message is believed only about what it said', async () => {
  const out = received({ type: INBOX_MESSAGE, name: ' Jo ', text: ' hello ', at: 111 }, 'peer-a')

  assert.equal(out.from, 'peer-a')
  assert.equal(out.name, 'Jo')
  assert.equal(out.text, 'hello')
})

test('and the sender is taken from the connection, not from the message', async () => {
  // Noise has already established who this is. A `from` in the body would be a
  // claim; the connection is a fact.
  const out = received({ type: INBOX_MESSAGE, text: 'hi', from: 'somebody-else' }, 'peer-a')

  assert.equal(out.from, 'peer-a')
})

test('their clock is kept as theirs, and ours is what can be ordered by', async () => {
  const out = received({ type: INBOX_MESSAGE, text: 'hi', at: 4102444800000 }, 'peer-a')

  assert.equal(out.saidAt, 4102444800000)
  assert.ok(out.arrivedAt <= Date.now())
})

test('a nonsense clock becomes no clock rather than a wrong one', async () => {
  assert.equal(received({ type: INBOX_MESSAGE, text: 'hi', at: 'tuesday' }, 'p').saidAt, null)
})

test('anything that is not one of these is not one of these', async () => {
  assert.equal(received(null, 'p'), null)
  assert.equal(received('a string', 'p'), null)
  assert.equal(received({ type: 'update' }, 'p'), null)
  assert.equal(received({ type: INBOX_MESSAGE }, 'p'), null)
  assert.equal(received({ type: INBOX_MESSAGE, text: '  ' }, 'p'), null)
  assert.equal(received({ type: INBOX_MESSAGE, text: { not: 'a string' } }, 'p'), null)
})
