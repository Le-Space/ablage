import assert from 'node:assert/strict'
import test from 'node:test'

import { peaks } from '../src/app/sound.js'

/**
 * The arithmetic behind the waveform.
 *
 * Drawing it needs a canvas and decoding needs a browser; reducing a recording
 * to one number per column needs neither, and it is the part that decides
 * whether the picture is a waveform or a smudge.
 */

const silence = length => new Float32Array(length)

const tone = (length, height = 1) =>
  Float32Array.from({ length }, (_, i) => Math.sin((i / 8) * 2 * Math.PI) * height)

test('a column holds the loudest point in its slice, not the average', async () => {
  // The whole reason this is a maximum: a tone spends half of every cycle
  // negative, so an average over any whole number of cycles is zero and a drum
  // becomes a flat line. Measured against that mistake, which is what the first
  // draft of this did.
  const out = peaks([tone(800)], 10)

  for (const level of out) assert.ok(level > 0.9, `expected a loud column, got ${level}`)
})

test('silence is zero, and stays a column rather than disappearing', async () => {
  const out = peaks([silence(500)], 5)

  assert.equal(out.length, 5)
  for (const level of out) assert.equal(level, 0)
})

test('the quiet half of a recording reads quieter than the loud half', async () => {
  // What the picture is for: somebody looking at it should see where the quiet
  // part is before playing anything.
  const loud = tone(400, 1)
  const quiet = tone(400, 0.2)
  const both = new Float32Array(800)

  both.set(loud, 0)
  both.set(quiet, 400)

  const out = peaks([both], 8)

  assert.ok(out[0] > 0.9, `start should be loud, got ${out[0]}`)
  assert.ok(out[7] < 0.3, `end should be quiet, got ${out[7]}`)
})

test('two channels are mixed down to one shape', async () => {
  // Otherwise a stereo recording is two pictures drawn over each other, and the
  // louder one is all anybody sees.
  const left = tone(400, 1)
  const right = new Float32Array(400) // silent channel

  const out = peaks([left, right], 4)

  // Mixed, so the peak is about half of the loud channel alone - not the whole
  // of it, and not nothing.
  for (const level of out) assert.ok(level > 0.4 && level < 0.6, `expected a mix, got ${level}`)
})

test('a recording shorter than the picture is wide leaves no gaps', async () => {
  // Fewer samples than columns: every column still takes at least one sample,
  // or the picture is drawn with holes in it.
  const out = peaks([tone(4, 1)], 16)

  assert.equal(out.length, 16)
  assert.ok(out.some(level => level > 0), 'every column was empty')
})

test('nothing to measure is an empty picture, not a crash', async () => {
  assert.equal(peaks([], 10).length, 10)
  assert.equal(peaks([silence(0)], 10).length, 10)
  assert.equal(peaks([tone(100)], 0).length, 0)
  assert.equal(peaks([tone(100)], -5).length, 0)
})
