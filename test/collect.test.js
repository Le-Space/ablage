import assert from 'node:assert/strict'
import test from 'node:test'

import { collect } from '../src/sync/collect.js'

/**
 * The deadline that turns a stalled device back into a working one.
 *
 * Measured before this existed: a device that learned about a file it could
 * never fetch stopped syncing entirely, its own local writes included, because
 * the fetch never returned and every later reconciliation queued behind it.
 */

const streamOf = async function * (values, gapMs = 0) {
  for (const value of values) {
    if (gapMs > 0) await new Promise(resolve => setTimeout(resolve, gapMs))
    yield value
  }
}

test('a stream that finishes comes back whole', async () => {
  assert.deepEqual(await collect(streamOf([1, 2, 3])), [1, 2, 3])
})

test('a stream that never yields gives up rather than waiting', async () => {
  // The failure this exists for: bitswap asked for a block nobody has.
  const never = { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) }

  await assert.rejects(collect(never, { idleMs: 30, describe: 'a block' }), /nothing arrived from a block in 0s/)
})

test('and one that keeps arriving slowly is left alone', async () => {
  // A large file over a metered circuit is slow and still working. A total
  // deadline could not tell it from a dead one; an idle deadline can.
  const slow = streamOf([1, 2, 3, 4], 25)

  assert.deepEqual(await collect(slow, { idleMs: 80 }), [1, 2, 3, 4])
})

test('a stream that stops halfway is given up on, not hung on', async () => {
  const half = {
    [Symbol.asyncIterator]: () => {
      let sent = 0

      return { next: () => sent++ < 2 ? Promise.resolve({ done: false, value: sent }) : new Promise(() => {}) }
    }
  }

  await assert.rejects(collect(half, { idleMs: 30 }))
})

test('and the source is told to stop when we give up on it', async () => {
  // Otherwise the request behind it keeps running for a caller that has gone.
  let toldToStop = false
  const stuck = {
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise(() => {}),
      return: async () => { toldToStop = true; return { done: true } }
    })
  }

  await assert.rejects(collect(stuck, { idleMs: 20 }))
  assert.equal(toldToStop, true)
})
