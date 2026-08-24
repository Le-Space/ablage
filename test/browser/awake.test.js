import { expect, test } from '@playwright/test'

/**
 * Keeping the screen awake, and being honest about it.
 *
 * A phone left untouched dozes off and takes the connection with it, so a
 * transfer in progress stops with no explanation. This is the remedy, and it is
 * offered where the connection is described rather than in a settings panel.
 *
 * Asserted on `wanted` - our decision - and never on `held`, which is the
 * browser's answer. A headless browser exposes the API and refuses every
 * request, having no screen to keep lit, so a test on `held` would be a test on
 * the platform.
 */

const open = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#awake')).toBeVisible({ timeout: 60_000 })
}

const supported = page => page.evaluate(() => window.__wakeLockForTest.supported)
const wanted = page => page.evaluate(() => window.__wakeLockForTest.wanted)

test('it is off until somebody asks', async ({ page }) => {
  // The opposite default to the waiting music, and on purpose: the music is
  // bounded by a code being on display, this holds for as long as the page is
  // open, and a setting that flattens a phone is not one to make for people.
  await open(page)

  await expect(page.locator('#awake')).not.toBeChecked()
  expect(await wanted(page)).toBe(false)
})

test('and stays on across a reload once it is asked for', async ({ page }) => {
  await open(page)

  if (!await supported(page)) {
    test.skip(true, 'dieser Browser hält den Bildschirm nicht wach')
    return
  }

  await page.locator('#awake').check()
  expect(await wanted(page)).toBe(true)

  await page.reload()
  await expect(page.locator('#awake')).toBeChecked({ timeout: 60_000 })

  // The reload has to re-ask, not merely re-tick the box: the browser drops the
  // lock whenever the page goes away.
  await expect.poll(() => wanted(page)).toBe(true)
})

test('and off again means off, not merely unticked', async ({ page }) => {
  await open(page)

  if (!await supported(page)) {
    test.skip(true, 'dieser Browser hält den Bildschirm nicht wach')
    return
  }

  await page.locator('#awake').check()
  await page.locator('#awake').uncheck()

  expect(await wanted(page)).toBe(false)

  await page.reload()
  await expect(page.locator('#awake')).not.toBeChecked({ timeout: 60_000 })
})

test('a browser that cannot do it says so, rather than offering a dead switch', async ({ page }) => {
  await open(page)

  const can = await supported(page)
  const hint = page.locator('#awake-why')

  if (can) {
    await expect(page.locator('#awake')).toBeEnabled()
  } else {
    await expect(page.locator('#awake')).toBeDisabled()
  }

  await expect(hint).not.toBeEmpty()

  // Two different sentences, and the wrong one would be a promise this page
  // cannot keep.
  expect(await hint.innerText()).toMatch(can ? /battery|Akku/i : /cannot|nicht/i)
})

test('the label says what it costs, not only what it does', async ({ page }) => {
  // Battery is the trade, and somebody deciding needs it in the sentence rather
  // than discovering it at four in the afternoon.
  await open(page)

  await expect(page.locator('#awake-why')).toContainText(/battery|Akku/i)
})
