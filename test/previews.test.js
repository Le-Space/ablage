import assert from 'node:assert/strict'
import test from 'node:test'

import { looksLikeAudio, looksLikeImage, looksLikeMedia, mediaType } from '../src/app/previews.js'

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

/**
 * Sound, which the viewer could not open at all until somebody tapped an mp3
 * and nothing happened.
 */

test('the usual recording extensions are recognised, whatever their case', async () => {
  for (const name of ['a.mp3', 'b.M4A', 'c.aac', 'd.wav', 'e.flac', 'f.ogg', 'g.oga', 'h.OPUS', 'i.weba']) {
    assert.equal(looksLikeAudio(name), true, name)
  }
})

test('and a recording is media, so the viewer offers it', async () => {
  assert.equal(looksLikeMedia('talk.mp3'), true)
  assert.equal(looksLikeMedia('notes.txt'), false)
})

test('but it is not an image, so nothing reads it to draw a thumbnail', async () => {
  // The whole point of keeping the two apart: a folder of recordings must not
  // be read on every draw to produce pictures that do not exist.
  assert.equal(looksLikeImage('talk.mp3'), false)
})

test('a recording carries a type a browser will play', async () => {
  // `audio/mp4` for m4a rather than `audio/aac`: Safari refuses the second.
  assert.equal(mediaType('talk.mp3'), 'audio/mpeg')
  assert.equal(mediaType('voice.m4a'), 'audio/mp4')
  assert.equal(mediaType('song.flac'), 'audio/flac')
  assert.equal(mediaType('clip.opus'), 'audio/ogg')
})

test('an .ogg is claimed by sound, and the comment says why', async () => {
  // By extension, which cannot tell an audio .ogg from a video one. The viewer
  // opens it in the player and its audio track plays; reading the file to find
  // out is exactly what this module exists not to do.
  assert.equal(looksLikeAudio('mystery.ogg'), true)
})
