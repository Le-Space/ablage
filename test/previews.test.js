import assert from 'node:assert/strict'
import test from 'node:test'

import { looksLikeImage, mediaType } from '../src/app/previews.js'

/**
 * Which files get a picture, and what they are called on the way in.
 *
 * The cache itself needs `URL.createObjectURL` and therefore a browser; what is
 * testable here is the part that decides whether to read a file at all, which
 * is the part that keeps a folder of photos from being decoded on every draw.
 */

test('the usual image extensions are recognised, whatever their case', async () => {
  for (const name of ['a.png', 'b.JPG', 'c.jpeg', 'd.gif', 'e.webp', 'f.avif', 'g.svg', 'h.BMP']) {
    assert.equal(looksLikeImage(name), true, name)
  }
})

test('and nothing else is', async () => {
  // The test decides whether to read the bytes, so a false yes costs a file
  // read and a decode for something that will never render.
  for (const name of ['notes.txt', 'archive.zip', 'song.mp3', 'clip.mp4', 'a.png.txt', 'png', '']) {
    assert.equal(looksLikeImage(name), false, name)
  }
})

test('a path with folders in it is judged by the file, not the folder', async () => {
  assert.equal(looksLikeImage('holiday.png/notes.txt'), false)
  assert.equal(looksLikeImage('2026/holiday/beach.jpg'), true)
})

test('nothing is not an image', async () => {
  assert.equal(looksLikeImage(null), false)
  assert.equal(looksLikeImage(undefined), false)
})

test('the media type is what the browser needs to draw it', async () => {
  // A blob without one renders as a download rather than a picture.
  assert.equal(mediaType('a.jpg'), 'image/jpeg')
  assert.equal(mediaType('a.JPEG'), 'image/jpeg')
  assert.equal(mediaType('a.svg'), 'image/svg+xml')
})

test('and something honest for anything else', async () => {
  assert.equal(mediaType('notes.txt'), 'application/octet-stream')
})
