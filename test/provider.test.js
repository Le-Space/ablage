import assert from 'node:assert/strict'
import test from 'node:test'

import * as Y from 'yjs'

import { Provider } from '../src/sync/provider.js'

/**
 * The provider with the channel replaced by a function that hands messages
 * straight to the other side. No libp2p, no browser - the point is the protocol,
 * and the protocol is what has to be right whatever carries it.
 *
 * That the channel is an argument is exactly what makes this testable, and it
 * is the same property that lets gossipsub replace the stream later.
 */
const pair = () => {
  const a = new Y.Doc()
  const b = new Y.Doc()
  const inFlight = []

  const provA = new Provider(a, message => { inFlight.push(['b', message]); return Promise.resolve() })
  const provB = new Provider(b, message => { inFlight.push(['a', message]); return Promise.resolve() })

  /** Deliver everything queued, including what delivery itself queues. */
  const settle = () => {
    let guard = 0
    while (inFlight.length > 0 && guard++ < 100) {
      const [to, message] = inFlight.shift()
      ;(to === 'a' ? provA : provB).receive(message)
    }
  }

  return { a, b, provA, provB, settle }
}

test('an update made on one side arrives on the other', () => {
  const { a, b, settle } = pair()

  a.getMap('files').set('one.txt', { cid: 'bafk1' })
  settle()

  assert.deepEqual(b.getMap('files').get('one.txt'), { cid: 'bafk1' })
})

test('and back the other way', () => {
  const { a, b, settle } = pair()

  b.getMap('files').set('two.txt', { cid: 'bafk2' })
  settle()

  assert.deepEqual(a.getMap('files').get('two.txt'), { cid: 'bafk2' })
})

test('an applied remote update is not echoed back', () => {
  // Without the origin check this is an infinite exchange: each side applies
  // the other's update, which fires `update` again, which sends it back.
  const a = new Y.Doc()
  const sent = []
  const prov = new Provider(a, message => { sent.push(message); return Promise.resolve() })

  const other = new Y.Doc()
  other.getMap('files').set('x.txt', { cid: 'bafk9' })
  prov.receive({ type: 'update', update: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(other))) })

  assert.deepEqual(sent, [], 'applying a remote update sends nothing')
  assert.deepEqual(a.getMap('files').get('x.txt'), { cid: 'bafk9' })
})

test('a state vector brings a late joiner up to date', () => {
  // The two-phase exchange, which is why this is not a broadcast: B asks with
  // what it has, A answers with the difference rather than the whole document.
  const a = new Y.Doc()
  a.getMap('files').set('early.txt', { cid: 'bafk1' })
  a.getMap('files').set('later.txt', { cid: 'bafk2' })

  const b = new Y.Doc()
  const answers = []
  const provA = new Provider(a, message => { answers.push(message); return Promise.resolve() })
  const provB = new Provider(b, message => { provA.receive(message); return Promise.resolve() })

  provB.requestSync()
  for (const message of answers) provB.receive(message)

  assert.deepEqual(b.getMap('files').get('early.txt'), { cid: 'bafk1' })
  assert.deepEqual(b.getMap('files').get('later.txt'), { cid: 'bafk2' })
  assert.equal(provB.synced, true)
})

test('a channel that throws does not take the document down', () => {
  // A stream closing under the provider is the connection going away, which the
  // application already knows about. It must not surface as an exception in the
  // middle of somebody's edit.
  const doc = new Y.Doc()
  new Provider(doc, () => Promise.reject(new Error('stream closed')))

  assert.doesNotThrow(() => doc.getMap('files').set('while-offline.txt', { cid: 'bafk1' }))
  assert.deepEqual(doc.getMap('files').get('while-offline.txt'), { cid: 'bafk1' })
})
