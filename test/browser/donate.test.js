import { expect, test } from '@playwright/test'

import { waysToGive } from '../../src/app/giving.js'

/**
 * Four ways to support this, reached from the footer.
 *
 * `donate.test.js` checks the addresses against their own checksums; this
 * checks that those same strings reach the screen. Between the two of them
 * there is a dialog built from JavaScript, and a row that renders an empty
 * `<code>` would pass the first test and help nobody.
 */

const open = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#donate-open')).toBeVisible({ timeout: 60_000 })
  await page.locator('#donate-open').click()
  await expect(page.locator('#donate')).toBeVisible()
}

test('the footer offers it, and it holds all four ways', async ({ page }) => {
  await open(page)

  const rows = page.locator('#donate-list li')

  await expect(rows).toHaveCount(4)

  // The addresses themselves, character for character, from the module the
  // checksum tests read. Not a sample: all four, because the one that is wrong
  // is always the one nobody looked at.
  for (const way of waysToGive()) {
    await expect(page.locator('#donate-list code', { hasText: way.value })).toHaveCount(1)
  }
})

test('every address has a button, because nobody selects one of these by hand', async ({ page }) => {
  // A half-selected Monero address is refused by the wallet, which is the good
  // outcome. It still costs somebody their evening.
  await open(page)

  await expect(page.locator('#donate-list .give-copy')).toHaveCount(4)
})

test('and it says so in English too', async ({ page }) => {
  // The language is switched *before* the dialog opens: it is modal, so the
  // flags in the header are behind it and a click never reaches them. The point
  // of the test is `redraw` - the rows are written from JavaScript and
  // `applyLocale` cannot reach text that `data-i18n` never touched.
  await page.goto('/?intro=off')
  await expect(page.locator('#donate-open')).toBeVisible({ timeout: 60_000 })
  await page.locator('#locale-en').click()

  await expect(page.locator('#donate-open')).toHaveText('Support this')

  await page.locator('#donate-open').click()
  await expect(page.locator('#donate')).toBeVisible()
  await expect(page.locator('#donate-list .give-copy').first()).toContainText('Copy')
})

test('closing it puts it away', async ({ page }) => {
  await open(page)

  await page.locator('#donate-close').click()

  await expect(page.locator('#donate')).toBeHidden()
})

test('nothing in it is fetched from anywhere', async ({ page }) => {
  // The promise in AGENTS.md is that a start without the relay choice makes no
  // outbound call at all. A donation dialog that pulled a logo from a CDN while
  // asking for money would break it in the worst possible place - so the marks
  // are drawn inline, and this is what says so.
  const outside = []

  page.on('request', request => {
    const url = new URL(request.url())

    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') outside.push(request.url())
  })

  await open(page)

  expect(outside).toEqual([])
})
