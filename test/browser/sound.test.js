import { expect, test } from '@playwright/test'

/**
 * Recordings in the viewer.
 *
 * Until this existed an mp3 was a row of text: `looksLikeMedia` did not claim
 * it, so there was no mark to press and the viewer would not have opened it if
 * there had been. Reported from a phone - "MP3-Dateien sind noch nicht
 * abspielbar, sollten aber abspielbar sein, wenn man sie anklickt."
 *
 * **The file is built here rather than kept as a fixture.** A WAV is a header
 * and some samples, so a real, decodable recording is twenty lines - and a
 * fixture that has to be decoded by two browsers is one more binary nobody can
 * read in a diff.
 *
 * Playback itself is deliberately *not* asserted by calling `play()`: a browser
 * may refuse that without a gesture, and a test that works around the autoplay
 * policy is testing the workaround. What is asserted is everything up to the
 * press - the bytes arrived, the browser decoded them, and the player holds
 * them - plus that closing the viewer lets go again.
 */

/** A second of a 440 Hz tone, 8 kHz mono, as a WAV a browser will decode. */
const tone = () => {
  const rate = 8000
  const samples = rate
  const bytes = Buffer.alloc(44 + samples * 2)

  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + samples * 2, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16) // length of this header
  bytes.writeUInt16LE(1, 20) // PCM, uncompressed
  bytes.writeUInt16LE(1, 22) // one channel
  bytes.writeUInt32LE(rate, 24)
  bytes.writeUInt32LE(rate * 2, 28) // bytes per second
  bytes.writeUInt16LE(2, 32) // bytes per frame
  bytes.writeUInt16LE(16, 34) // bits per sample
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)

  for (let i = 0; i < samples; i++) {
    bytes.writeInt16LE(Math.round(Math.sin((i / rate) * 440 * 2 * Math.PI) * 8000), 44 + i * 2)
  }

  return bytes
}

const withRecording = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled({ timeout: 60_000 })

  await page.setInputFiles('#pick', [
    { name: 'aufnahme.wav', mimeType: 'audio/wav', buffer: tone() }
  ])

  await expect(page.locator('.tree')).toContainText('aufnahme.wav')
}

/**
 * A row reads itself only once it has scrolled into view, so the mark does not
 * exist until the row does - the same trap `video-and-touch.test.js` records,
 * and it costs a whole run to rediscover.
 */
const openFromRow = async (page, name) => {
  const row = page.locator('.file', { hasText: name })

  await row.scrollIntoViewIfNeeded()

  const mark = row.locator('.play-mark')

  await expect(mark).toBeVisible({ timeout: 30_000 })
  await mark.click()
}

test('a recording row has something to press', async ({ page }) => {
  // Without it the file is a line of text with no way into the viewer. A
  // recording has no frame to decode, so the mark is all there can be.
  await withRecording(page)

  const mark = page.locator('.file', { hasText: 'aufnahme.wav' }).locator('.play-mark')

  await expect(mark).toBeVisible({ timeout: 30_000 })
  await expect(mark).toHaveText('♪')
})

test('and pressing it opens a player, not a picture', async ({ page }) => {
  await withRecording(page)
  await openFromRow(page, 'aufnahme.wav')

  await expect(page.locator('#preview-sound')).toBeVisible()
  await expect(page.locator('#preview-audio')).toHaveJSProperty('paused', true)

  // The other two are not merely hidden, they are empty: a `src` left on a
  // hidden element goes on downloading, and a playing one goes on talking.
  await expect(page.locator('#preview-image')).toBeHidden()
  await expect(page.locator('#preview-video')).toBeHidden()
  expect(await page.locator('#preview-video').getAttribute('src')).toBe(null)
})

test('the browser can actually decode what it was handed', async ({ page }) => {
  // The half that a hidden element would pass without: the bytes travelled out
  // of storage, through the object URL, and into something that knows how long
  // they last. One second, give or take the encoder.
  await withRecording(page)
  await openFromRow(page, 'aufnahme.wav')

  await page.waitForFunction(() => {
    const audio = document.getElementById('preview-audio')

    return audio != null && audio.readyState >= 1 && Number.isFinite(audio.duration)
  }, undefined, { timeout: 30_000 })

  const seconds = await page.locator('#preview-audio').evaluate(audio => audio.duration)

  expect(seconds).toBeGreaterThan(0.5)
  expect(seconds).toBeLessThan(2)
})

test('and closing it lets go of the sound', async ({ page }) => {
  // Paused and emptied. An element that has only lost its source can still be
  // heard for as long as it takes the browser to notice, which on a phone is
  // a dialog that is gone and a recording that is not.
  await withRecording(page)
  await openFromRow(page, 'aufnahme.wav')

  await expect(page.locator('#preview-sound')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.locator('#preview')).toBeHidden()
  await expect(page.locator('#preview-audio')).toHaveJSProperty('paused', true)
  expect(await page.locator('#preview-audio').getAttribute('src')).toBe(null)
})
