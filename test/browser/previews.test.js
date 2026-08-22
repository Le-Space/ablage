import { expect, test } from '@playwright/test'

/**
 * A picture beside the name, and a big one on demand.
 *
 * The image itself is a one-pixel PNG built in the page: what is asserted is
 * that a *picture* is drawn where a generic icon used to be, and that opening
 * it shows the bytes of that file - not that any particular photo renders.
 */

// 64x48, and the size is the point.
//
// It was a 1x1 PNG, which decoded fine and made the *big* view one CSS pixel
// wide. Playwright clicks the centre of an element, and on Firefox that single
// pixel resolved to the dialog behind it - "dialog intercepts pointer events",
// for a click aimed at an image that was genuinely there. Chromium happened to
// hit it, so the difference read as a Firefox bug rather than as a target too
// small to aim at.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwEAIAAAB+uTcLAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCBYSJxoGDO3HAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA4LTIyVDE4OjM5OjI2KzAwOjAwp17ZxAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOC0yMlQxODozOToyNiswMDowMNYDYXgAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDgtMjJUMTg6Mzk6MjYrMDA6MDCBFkCnAAAA30lEQVR42u3awQ3DIBBE0ZhMX6EPl2DJlI8PIOdAEf/AfxWshIYlEx/ve13n+REks5X+/dFj7CvDA0Bl3qXHA8CsBFR6jH25A2DuAFhmcweQMlp5TAAn4/YKIrmEYRmt9FR6jH2ZAFhGOzwAkAmAZdgFofwlDFtXUKXH2JcJgNkFwUwALNMuCGUCYKsL8gAwma08PkM5XkEwuyCYXRDMBMDcATAPALa6oEqPsS8TALMLgpkAmM9QmGUczP+EYe4AmF9HwzJbedwBHL8NhfkMhbmEYZZxMF9BMK8gmEsY9ge7gYDi1g/y2QAAAABJRU5ErkJggg=='

const withImage = async (page, name = 'bild.png') => {
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled()

  await page.setInputFiles('#pick', {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(PNG, 'base64')
  })
  await expect(page.locator('.tree')).toContainText(name)
}

test.describe('pictures in the list', () => {
  test('an image gets its own thumbnail, not the generic icon', async ({ page }) => {
    await withImage(page)

    const thumb = page.locator('.file .thumb')

    await expect(thumb).toBeVisible()
    // A blob, which is the whole point: the bytes came out of storage rather
    // than off a network somewhere.
    expect(await thumb.getAttribute('src')).toMatch(/^blob:/)
  })

  test('and it really decoded, rather than showing a broken image', async ({ page }) => {
    await withImage(page)

    // `naturalWidth` is 0 for an image the browser could not read - which is
    // what a wrong media type on the blob would produce, and it would look like
    // an empty box rather than an error.
    //
    // Polled, because 0 is also what it reads while the decode is still
    // running: the first version of this asserted once and passed alone,
    // failing only in a full run where the machine was busier.
    await expect.poll(() => page.locator('.file .thumb').evaluate(img => img.naturalWidth)).toBe(64)
  })

  test('a file that is not an image keeps the icon', async ({ page }) => {
    await page.goto('/?intro=off')
    await expect(page.locator('#invite')).toBeEnabled()
    await page.setInputFiles('#pick', { name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('kein Bild') })
    await expect(page.locator('.tree')).toContainText('notiz.txt')

    await expect(page.locator('.file .thumb')).toHaveCount(0)
    await expect(page.locator('.file svg')).toBeVisible()
  })

  test('tapping the thumbnail opens it big', async ({ page }) => {
    await withImage(page)
    await page.locator('.file .thumb').click()

    await expect.poll(() => page.evaluate(() => document.getElementById('preview').open)).toBe(true)

    // The same bytes, not a second read: one blob for one content address.
    const [small, large] = await page.evaluate(() => [
      document.querySelector('.file .thumb').src,
      document.getElementById('preview-image').src
    ])

    expect(large).toBe(small)
    await expect(page.locator('#preview-name')).toHaveText('bild.png')

    // Big enough to aim at. This is what the 1x1 fixture got wrong: the picture
    // was there and decoded, and the element was one CSS pixel wide, so a click
    // at its centre landed on the dialog behind it. A test image that small
    // made the *test* wrong in a way that looked like a Firefox bug.
    const box = await page.locator('#preview img').boundingBox()

    expect(box.width).toBeGreaterThan(16)
    expect(box.height).toBeGreaterThan(16)
  })

  test('and clicking it again puts it away', async ({ page }) => {
    await withImage(page)
    await page.locator('.file .thumb').click()
    await expect.poll(() => page.evaluate(() => document.getElementById('preview').open)).toBe(true)

    await page.locator('#preview img').click()

    await expect.poll(() => page.evaluate(() => document.getElementById('preview').open)).toBe(false)
    // The source is dropped so a big picture is not held in memory by a dialog
    // nobody is looking at. Cleared where the dialog is closed rather than in a
    // `close` listener: this Chromium fires no such event, which is the trap
    // `<qr-intro>` hit before.
    expect(await page.locator('#preview-image').getAttribute('src')).toBe(null)
  })

  test('crossing the list does not flash a picture at every row', async ({ page }) => {
    await withImage(page)

    // The hover has to last to be meant. Without the delay, moving the pointer
    // across a folder of photos on the way to something else would open and
    // close a full screen picture per row.
    await page.locator('.file .thumb').hover()
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => document.getElementById('preview').open)).toBe(false)

    await page.waitForTimeout(500)
    expect(await page.evaluate(() => document.getElementById('preview').open)).toBe(true)
  })
})

test('escape puts it away too, and lets go of the picture', async ({ page }) => {
  // A separate path, because the dialog closes itself here - and the event that
  // says so is `cancel`, not `close`, which this Chromium never fires.
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled()
  await page.setInputFiles('#pick', {
    name: 'bild.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG, 'base64')
  })
  await expect(page.locator('.tree')).toContainText('bild.png')

  await page.locator('.file .thumb').click()
  await expect.poll(() => page.evaluate(() => document.getElementById('preview').open)).toBe(true)

  await page.keyboard.press('Escape')

  await expect.poll(() => page.evaluate(() => document.getElementById('preview').open)).toBe(false)
  expect(await page.locator('#preview-image').getAttribute('src')).toBe(null)
})
