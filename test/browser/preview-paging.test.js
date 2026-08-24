import { expect, test } from '@playwright/test'

/**
 * Looking through the pictures in a folder without closing one first.
 *
 * Three of them, and they are genuinely different images: asserting that the
 * source changed would pass for a viewer that shows the same picture three
 * times, which is the mistake worth guarding against here.
 */

const PICTURES = {
  'eins.png': 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwEAIAAAB+uTcLAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCBgLBxSHGAuuAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA4LTI0VDExOjA3OjIwKzAwOjAwl6HZQAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOC0yNFQxMTowNzoyMCswMDowMOb8YfwAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDgtMjRUMTE6MDc6MjArMDA6MDCx6UAjAAAA30lEQVR42u3awQ3DIBBE0ZhMX6EPl2DJlI8PIOdAEf/AfxWshIYlEx/ve13n+REks5X+/dFj7CvDA0Bl3qXHA8CsBFR6jH25A2DuAFhmcweQMlp5TAAn4/YKIrmEYRmt9FR6jH2ZAFhGOzwAkAmAZdgFofwlDFtXUKXH2JcJgNkFwUwALNMuCGUCYKsL8gAwma08PkM5XkEwuyCYXRDMBMDcATAPALa6oEqPsS8TALMLgpkAmM9QmGUczP+EYe4AmF9HwzJbedwBHL8NhfkMhbmEYZZxMF9BMK8gmEsY9ge7gYDi1g/y2QAAAABJRU5ErkJggg==',
  'zwei.png': 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwEAIAAAB+uTcLAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCBgLBxSHGAuuAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA4LTI0VDExOjA3OjIwKzAwOjAwl6HZQAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOC0yNFQxMTowNzoyMCswMDowMOb8YfwAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDgtMjRUMTE6MDc6MjArMDA6MDCx6UAjAAAA30lEQVR42u3asQ3DMAxE0QS6wt7Qa9ETKZUHcusoKTTEL/TfBAQIitLZ7+O4rvt+CZJWY/9+6DLWldgAVHLaAFJajf3pdBnr8giCuYRhSf1sACitxvbYAIy3IJhLGDaXcKfLWFdSY3cHcLyGwtwBsDRvQSgnAGYYB3MCYDYA5jUUlpw+xEhOAMwdAEursRnGcQzjYB5BMLMgmBMAm1mQDcA4ATC/CcOcAJhZEMwsCOa/oTAnADazoE6XsS4nAObf0bCkxmYDOGZBMF/CMJcwbE5Ap8tYV5pZEModAHMHwP79bqJIRNke0AAAAABJRU5ErkJggg==',
  'drei.png': 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwAQMAAACbhe5cAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURX7nh////36LZiEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6ggYCwcUhxgLrgAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOC0yNFQxMTowNzoyMCswMDowMJeh2UAAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDgtMjRUMTE6MDc6MjArMDA6MDDm/GH8AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA4LTI0VDExOjA3OjIwKzAwOjAwselAIwAAAA5JREFUGNNjYBgFQwkAAAGwAAGHcNqeAAAAAElFTkSuQmCC'
}

const withPictures = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled({ timeout: 60_000 })

  await page.setInputFiles('#pick', Object.entries(PICTURES).map(([name, data]) => ({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64')
  })))

  await expect(page.locator('.tree')).toContainText('drei.png')

  // Each row swaps its own icon for its own picture, whenever that picture
  // finishes decoding, so `.first()` used to click whichever won the race.
  // Naming the row is what fixes that.
  //
  // Waiting for all three was the wrong guard. A row reads its picture only
  // once it scrolls into view, so the count depends on how tall the page
  // happens to be - adding one checkbox to the card above pushed the third row
  // under the fold and took five tests with it.
  const row = page.locator('.file', { hasText: 'drei.png' })

  await row.scrollIntoViewIfNeeded()
  await expect(row.locator('.thumb')).toBeVisible()
  await row.locator('.thumb').click()
  await expect.poll(() => page.evaluate(() => document.getElementById('preview').open)).toBe(true)
}

const shown = page => page.locator('#preview-name').innerText()

test.describe('paging through the pictures', () => {
  test('the arrow keys move on without closing anything', async ({ page }) => {
    await withPictures(page)

    // Alphabetical, so the first is drei.png - the same order the list draws.
    expect(await shown(page)).toContain('drei.png')

    await page.keyboard.press('ArrowRight')
    await expect.poll(() => shown(page)).toContain('eins.png')

    // Still open. Turning a page must not be a way of closing one.
    expect(await page.evaluate(() => document.getElementById('preview').open)).toBe(true)
  })

  test('and back again', async ({ page }) => {
    await withPictures(page)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => shown(page)).toContain('eins.png')

    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => shown(page)).toContain('drei.png')
  })

  test('it is a different picture, not only a different name', async ({ page }) => {
    await withPictures(page)
    const first = await page.locator('#preview-image').getAttribute('src')

    await page.keyboard.press('ArrowRight')
    await expect.poll(() => shown(page)).toContain('eins.png')

    expect(await page.locator('#preview-image').getAttribute('src')).not.toBe(first)
  })

  test('the ends are the ends, rather than wrapping round', async ({ page }) => {
    // Wrapping would leave somebody swiping for ever without knowing they had
    // passed the last one.
    await withPictures(page)

    await page.keyboard.press('ArrowLeft')
    expect(await shown(page)).toContain('drei.png')

    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')

    expect(await shown(page)).toContain('zwei.png')
  })

  test('it says where you are', async ({ page }) => {
    await withPictures(page)

    await expect(page.locator('#preview-name')).toContainText('1 of 3')
  })

  test('a swipe turns the page and does not close it', async ({ page }) => {
    await withPictures(page)
    const box = await page.locator('#preview img').boundingBox()

    // A swipe ends in a click, and a click closes. Told apart by what the
    // pointer did first - without that, every swipe would also shut the picture
    // it had just turned to.
    await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 5, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()

    await expect.poll(() => shown(page)).toContain('eins.png')
    expect(await page.evaluate(() => document.getElementById('preview').open)).toBe(true)
  })

  test('a tap still closes it', async ({ page }) => {
    await withPictures(page)
    await page.locator('#preview img').click()

    await expect.poll(() => page.evaluate(() => document.getElementById('preview').open)).toBe(false)
  })
})
