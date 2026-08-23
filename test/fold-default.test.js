import assert from 'node:assert/strict'
import test from 'node:test'

import { foldDefault } from '../src/app/fold-default.js'

/**
 * When a panel folds itself, and when it stops.
 *
 * The rule is small and its failure is not: a panel that keeps folding itself
 * closes under somebody's hand every time a relay reconnects, which reads as
 * the interface fighting them.
 */

const watch = () => {
  const opens = []
  return { opens, fold: foldDefault({ onChange: open => opens.push(open) }) }
}

test('open while there is no relay, because a code is then the only way in', async () => {
  const { opens, fold } = watch()

  fold.suggest(false)

  assert.deepEqual(opens, [true])
})

test('and folded once there is a second way', async () => {
  const { opens, fold } = watch()

  fold.suggest(true)

  assert.deepEqual(opens, [false])
})

test('a person who touches it takes it over for good', async () => {
  const { opens, fold } = watch()

  fold.suggest(true)
  fold.decide()
  fold.suggest(false)
  fold.suggest(true)

  // One change, from before they decided. Every relay coming and going after
  // that is ignored.
  assert.deepEqual(opens, [false])
  assert.equal(fold.automatic, false)
})

test('suggesting says whether it acted, so a caller can tell', async () => {
  const { fold } = watch()

  assert.equal(fold.suggest(true), true)

  fold.decide()

  assert.equal(fold.suggest(false), false)
})

test('deciding twice is deciding once', async () => {
  const { opens, fold } = watch()

  fold.decide()
  fold.decide()
  fold.suggest(true)

  assert.deepEqual(opens, [])
})
