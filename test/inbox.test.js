import assert from 'node:assert/strict'
import test from 'node:test'

import { INBOX_MESSAGE, MAX_KEPT, MAX_NAME, MAX_TEXT, inbox, inboxMessage, received } from '../src/sync/inbox.js'

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

/**
 * What arrived is kept across reloads - and only what arrived.
 */

const store = ({ throws = false, seed = {} } = {}) => {
  const held = new Map(Object.entries(seed))

  return {
    getItem: k => { if (throws) throw new Error('denied'); return held.get(k) ?? null },
    setItem: (k, v) => { if (throws) throw new Error('denied'); held.set(k, v) },
    removeItem: k => { if (throws) throw new Error('denied'); held.delete(k) },
    held
  }
}

const said = (text, at = 1) => ({ from: 'peer-a', name: 'Jo', text, saidAt: null, arrivedAt: at })

test('a message kept once is there after a fresh read', async () => {
  const storage = store()

  inbox({ storage }).add(said('hello'))

  assert.deepEqual(inbox({ storage }).all().map(m => m.text), ['hello'])
})

test('newest first, which is the order the page draws', async () => {
  const storage = store()
  const box = inbox({ storage })

  box.add(said('one', 1))
  box.add(said('two', 2))

  assert.deepEqual(box.all().map(m => m.text), ['two', 'one'])
})

test('and the oldest go once the limit is reached', async () => {
  const storage = store()
  const box = inbox({ storage, limit: 3 })

  for (const n of [1, 2, 3, 4]) box.add(said(`m${n}`, n))

  assert.deepEqual(box.all().map(m => m.text), ['m4', 'm3', 'm2'])
  assert.equal(MAX_KEPT, 200, 'the shipped limit')
})

test('the list handed out is a copy', async () => {
  const box = inbox({ storage: store() })

  box.add(said('hello'))
  box.all()[0].text = 'edited'

  assert.equal(box.all()[0].text, 'hello')
})

test('a browser that blocks storage still has an inbox, for this page', async () => {
  // Reaching `localStorage` throws in some private windows; `identity.test.js`
  // sets exactly that up. Constructed with no storage so the default runs.
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get () { throw new Error('blocked') } })

  try {
    let box

    assert.doesNotThrow(() => { box = inbox({ key: 'ablage.inbox' }) })
    assert.doesNotThrow(() => box.add(said('hello')))
    assert.deepEqual(box.all().map(m => m.text), ['hello'], 'held for this page')
  } finally {
    delete globalThis.localStorage
  }
})

test('a storage that refuses to write keeps the message for this page and no longer', async () => {
  const box = inbox({ storage: store({ throws: true }) })

  assert.doesNotThrow(() => box.add(said('hello')))
  assert.equal(box.all().length, 1)
})

test('a half-written or hand-edited value is not a reason to refuse to start', async () => {
  for (const bad of ['{not json', '"a string"', '{"a":1}', '[{"text":"no from"}]', '[null, 42]']) {
    assert.deepEqual(inbox({ storage: store({ seed: { 'ablage.inbox': bad } }) }).all(), [], bad)
  }
})

test('and only things shaped like a received message are kept', async () => {
  const box = inbox({ storage: store() })

  box.add({ type: 'update' })
  box.add({ from: '', name: '', text: 'x', saidAt: null, arrivedAt: 1 })
  box.add({ from: 'p', name: '', text: '', saidAt: null, arrivedAt: 1 })
  box.add({ from: 'p', name: '', text: 'x', saidAt: 'tuesday', arrivedAt: 1 })

  assert.deepEqual(box.all(), [])
})

test('each share keeps its own inbox', async () => {
  const storage = store()

  inbox({ key: 'ablage.inbox', storage }).add(said('mine'))

  assert.deepEqual(inbox({ key: 'ablage.inbox.work', storage }).all(), [])
})

test('clear empties it, on disk too', async () => {
  const storage = store()
  const box = inbox({ storage })

  box.add(said('hello'))
  box.clear()

  assert.deepEqual(box.all(), [])
  assert.deepEqual(inbox({ storage }).all(), [], 'and a fresh read agrees')
})
