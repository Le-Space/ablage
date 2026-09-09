import { expect, test } from '@playwright/test'

/**
 * The first file somebody adds must land where its thumbnail will be read.
 *
 * `whenVisible` in main.js reads a thumbnail only once its row is within
 * 200px of the viewport - the right call for a folder of two hundred photos,
 * and a trap for anything that grows above the list. On 2026-09-09 a 107px
 * settings block added to the connection card pushed the first row on a 720px
 * Firefox viewport from ~823px to 930px: past the fold *and* past the margin
 * (720 + 200 = 920). Six preview specs went red with "element not found" and
 * no error anywhere, because nothing had failed - nothing had been asked for.
 * Chromium's metrics kept its row inside the window, so it read as a Firefox
 * bug.
 *
 * `previews.test.js` catches this. It does not *say* it. This does: when it
 * fails, the message carries the geometry, and the cause is a number rather
 * than a hunt through six specs that never mention layout.
 */

/** Must match `rootMargin` on `whenVisible` in main.js. */
const LAZY_MARGIN_PX = 200

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwEAIAAAB+uTcLAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCBYSJxoGDO3HAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA4LTIyVDE4OjM5OjI2KzAwOjAwp17ZxAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOC0yMlQxODozOToyNiswMDowMNYDYXgAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDgtMjJUMTg6Mzk6MjYrMDA6MDCBFkCnAAAA30lEQVR42u3awQ3DIBBE0ZhMX6EPl2DJlI8PIOdAEf/AfxWshIYlEx/ve13n+REks5X+/dFj7CvDA0Bl3qXHA8CsBFR6jH25A2DuAFhmcweQMlp5TAAn4/YKIrmEYRmt9FR6jH2ZAFhGOzwAkAmAZdgFofwlDFtXUKXH2JcJgNkFwUwALNMuCGUCYKsL8gAwma08PkM5XkEwuyCYXRDMBMDcATAPALa6oEqPsS8TALMLgpkAmM9QmGUczP+EYe4AmF9HwzJbedwBHL8NhfkMhbmEYZZxMF9BMK8gmEsY9ge7gYDi1g/y2QAAAABJRU5ErkJggg=='

test('the first file a fresh page adds sits inside the thumbnail window', async ({ page }) => {
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled()

  await page.setInputFiles('#pick', { name: 'bild.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await expect(page.locator('.tree')).toContainText('bild.png')

  const geometry = await page.evaluate(() => {
    const row = document.querySelector('.file')?.getBoundingClientRect()

    return {
      rowTop: row == null ? null : Math.round(row.top),
      viewport: window.innerHeight,
      scrolled: window.scrollY
    }
  })

  expect(geometry.rowTop, 'no file row rendered at all').not.toBeNull()
  expect(geometry.scrolled, 'a fresh page should not have scrolled by itself').toBe(0)

  // The assertion, and the sentence somebody needs when it fails.
  const limit = geometry.viewport + LAZY_MARGIN_PX

  expect(
    geometry.rowTop,
    `first file row at ${geometry.rowTop}px, but thumbnails are only read within ` +
      `${geometry.viewport}px viewport + ${LAZY_MARGIN_PX}px margin = ${limit}px. ` +
      'Something above the file list grew - see the comment in this spec.'
  ).toBeLessThanOrEqual(limit)

  // And the consequence, so the two facts are never argued about separately.
  await expect(page.locator('.file .thumb')).toBeVisible()
})
