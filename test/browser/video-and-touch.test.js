import { readFileSync } from 'node:fs'

import { chromium, expect, test } from '@playwright/test'

/**
 * Videos in the viewer, and a swipe made by a finger rather than a mouse.
 *
 * **The second half is why this file exists.** `preview-paging.test.js` drives
 * `page.mouse`, and a mouse is not a finger: a real touch goes through the
 * browser's own gesture handling, which claims a horizontal drag unless
 * `touch-action` says otherwise. Without that one CSS line the pointer sequence
 * is cancelled, `pointerup` never arrives, and the swipe does nothing at all -
 * which is how it shipped, with every mouse-driven test green.
 *
 * So the touch here is dispatched as touch, through CDP, in a context that
 * reports itself as having a touchscreen.
 */

const CLIP = readFileSync(new URL('../fixtures/clip.webm', import.meta.url))

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwEAIAAAB+uTcLAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCBgLBxSHGAuuAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA4LTI0VDExOjA3OjIwKzAwOjAwl6HZQAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOC0yNFQxMTowNzoyMCswMDowMOb8YfwAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDgtMjRUMTE6MDc6MjArMDA6MDCx6UAjAAAA30lEQVR42u3awQ3DIBBE0ZhMX6EPl2DJlI8PIOdAEf/AfxWshIYlEx/ve13n+REks5X+/dFj7CvDA0Bl3qXHA8CsBFR6jH25A2DuAFhmcweQMlp5TAAn4/YKIrmEYRmt9FR6jH2ZAFhGOzwAkAmAZdgFofwlDFtXUKXH2JcJgNkFwUwALNMuCGUCYKsL8gAwma08PkM5XkEwuyCYXRDMBMDcATAPALa6oEqPsS8TALMLgpkAmM9QmGUczP+EYe4AmF9HwzJbedwBHL8NhfkMhbmEYZZxMF9BMK8gmEsY9ge7gYDi1g/y2QAAAABJRU5ErkJggg=='

const withMedia = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled({ timeout: 60_000 })

  await page.setInputFiles('#pick', [
    { name: 'a-bild.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') },
    { name: 'b-film.webm', mimeType: 'video/webm', buffer: CLIP },
    { name: 'c-bild.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') }
  ])

  await expect(page.locator('.tree')).toContainText('b-film.webm')
}

/**
 * The row first, then the mark on it.
 *
 * A row reads its picture only once it scrolls into view, so on a phone-sized
 * screen the mark does not exist until the row does - and scrolling to
 * something that is not there yet waits for ever. Cost a test run to find,
 * twice.
 */
const openFromRow = async (page, name, what) => {
  const row = page.locator('.file', { hasText: name })

  await row.scrollIntoViewIfNeeded()

  const mark = row.locator(what)

  await expect(mark).toBeVisible({ timeout: 30_000 })
  await mark.click()
}

test.describe('videos are things you can look at', () => {
  test('a video row has something to open, and it opens a video', async ({ page }) => {
    await withMedia(page)

    await openFromRow(page, 'b-film.webm', '.play-mark')

    await expect(page.locator('#preview-video')).toBeVisible()
    await expect(page.locator('#preview-image')).toBeHidden()
    await expect(page.locator('#preview-name')).toContainText('b-film.webm')
  })

  test('and the browser can actually decode it, not merely display an element', async ({ page }) => {
    // A `<video>` with a broken source is visible too, so element visibility
    // proves nothing about whether anybody can watch this.
    await withMedia(page)
    await openFromRow(page, 'b-film.webm', '.play-mark')

    await expect.poll(
      () => page.evaluate(() => document.getElementById('preview-video').readyState),
      { timeout: 30_000 }
    ).toBeGreaterThan(0)
  })

  test('paging runs through pictures and videos alike', async ({ page }) => {
    await withMedia(page)
    await openFromRow(page, 'a-bild.png', '.thumb')

    await expect(page.locator('#preview-name')).toContainText('1 of 3')

    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#preview-name')).toContainText('b-film.webm')
    await expect(page.locator('#preview-video')).toBeVisible()

    // And back to a picture, with the video element emptied rather than left
    // downloading behind it.
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#preview-image')).toBeVisible()
    expect(await page.locator('#preview-video').getAttribute('src')).toBe(null)
  })
})

test.describe('swiping past a video', () => {
  /**
   * Reported from a phone: swiping works between pictures, and stops dead at a
   * video. The only way on was to close the viewer.
   *
   * The cause was mine - `pointerdown` ignored any press that landed on a
   * `<video>`, to keep a drag on the scrubber from turning the page. A video
   * fills most of the dialog, so that turned off swiping wherever one was.
   */
  /**
   * The box, once the video knows how big it is.
   *
   * `preload="metadata"` means the element is its default size until the file
   * has been read, so measuring straight after opening gives a rectangle that
   * then grows - and a point computed as "12px above the bottom" lands in the
   * middle of the picture. Passed alone and failed three times in a row in
   * sequence, which is what a race looks like from the outside.
   */
  const videoBox = async page => {
    await expect.poll(() => page.evaluate(() => document.getElementById('preview-video').videoWidth))
      .toBeGreaterThan(0)

    return page.locator('#preview-video').boundingBox()
  }

  const swipe = async (page, from, to, y) => {
    await page.mouse.move(from, y)
    await page.mouse.down()

    for (let at = from; Math.abs(at - to) > 4; at += (to - from) / 8) {
      await page.mouse.move(at, y)
    }

    await page.mouse.move(to, y)
    await page.mouse.up()
  }

  test('a swipe across the picture of a video turns the page', async ({ page, browserName }) => {
    // **Chromium only, and the reason is worth writing down.** Firefox's own
    // video controls consume pointer events across the whole element - not
    // only the strip they are drawn in - so nothing reaches the dialog and the
    // swipe cannot be seen at all. Tried in the capture phase too, which
    // changed nothing.
    //
    // Left as a skip rather than a weaker assertion: the arrow keys work
    // everywhere, and a way past a video that does not depend on the video
    // swallowing gestures is a separate piece of interface, not a tweak.
    test.skip(browserName === 'firefox', 'firefox video controls swallow the gesture')

    await withMedia(page)
    await openFromRow(page, 'b-film.webm', '.play-mark')
    await expect(page.locator('#preview-name')).toContainText('b-film.webm')

    const box = await videoBox(page)

    // Well clear of the controls along the bottom.
    await swipe(page, box.x + box.width - 6, box.x + 6, box.y + box.height * 0.3)

    await expect(page.locator('#preview-name')).toContainText('c-bild.png', { timeout: 10_000 })
  })

  test('and a drag along the controls does not', async ({ page }) => {
    // Seeking through a video is a drag, and it is not this one.
    await withMedia(page)
    await openFromRow(page, 'b-film.webm', '.play-mark')

    const box = await videoBox(page)

    await swipe(page, box.x + box.width - 6, box.x + 6, box.y + box.height - 12)

    await expect(page.locator('#preview-name')).toContainText('b-film.webm')
  })
})

test.describe('a swipe made by a finger', () => {
  test('turns the page on a touchscreen', async () => {
    const browser = await chromium.launch()
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 780 } })
    const page = await context.newPage()

    try {
      await withMedia(page)
      await openFromRow(page, 'a-bild.png', '.thumb')
      await expect(page.locator('#preview-name')).toContainText('a-bild.png')

      const box = await page.locator('#preview-image').boundingBox()
      const y = box.y + box.height / 2
      const from = box.x + box.width - 4
      const to = box.x + 4

      // Dispatched as touch rather than as a mouse drag, because the thing
      // being tested is what the browser does with a touch it has not been told
      // to leave alone.
      const cdp = await context.newCDPSession(page)

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: from, y }]
      })

      for (let at = from; at > to; at -= (from - to) / 8) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at, y }] })
      }

      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

      await expect(page.locator('#preview-name')).toContainText('b-film.webm', { timeout: 10_000 })
      expect(await page.evaluate(() => document.getElementById('preview').open)).toBe(true)
    } finally {
      await context.close()
      await browser.close()
    }
  })
})
