import { expect, test } from '@playwright/test'

/**
 * The privacy chapter, and the one thing it must not do.
 *
 * Every answer in it was measured. The temptation with a page like this is to
 * describe the design one meant rather than the thing that runs - so the test
 * that matters is the one asserting it still admits the open hole.
 */

const open = async page => {
  await page.goto('/?intro=off')
  await page.locator('#privacy-open').click()
  await expect.poll(() => page.evaluate(() => document.getElementById('privacy').open)).toBe(true)
}

test('it opens from the footer and closes again', async ({ page }) => {
  await open(page)
  await page.locator('#privacy-close').click()

  await expect.poll(() => page.evaluate(() => document.getElementById('privacy').open)).toBe(false)
})

test('every question has an answer, in both languages', async ({ page }) => {
  // A missing key renders as the key itself, so this catches a typo in either
  // catalogue rather than a blank paragraph nobody notices.
  for (const locale of ['en', 'de']) {
    await page.goto(`/?intro=off&lang=${locale}`)
    await page.locator('#privacy-open').click()

    // `textContent`, not `innerText`: a collapsed `<details>` renders nothing,
    // so the rendered text of a closed answer is the empty string and this
    // would have passed for any six answers that happened to be missing.
    const parts = await page.evaluate(() =>
      [...document.querySelectorAll('#privacy summary, #privacy details > div')]
        .map(el => el.textContent.trim()))

    expect(parts).toHaveLength(12)

    for (const text of parts) {
      expect(text.length, locale).toBeGreaterThan(20)
      expect(text, locale).not.toMatch(/^privacy\./)
    }
  }
})

test('it says the relay cannot read the files, and says what it can see', async ({ page }) => {
  await open(page)

  const relay = page.locator('#privacy details').nth(1)

  await relay.locator('summary').click()
  await expect(relay).toContainText(/cannot decrypt|nicht entschlüsseln/i)
  // The half that is easy to leave out, and the half that is actually true of
  // every relay: metadata.
  await expect(relay).toContainText(/public key|öffentlichen Schlüssel/i)
})

test('and it admits the hole rather than describing the design it meant', async ({ page }) => {
  // The assertion this file exists for. `bitswap-gate.test.js` measures the
  // hole; this one keeps the page honest about it. If the gate lands and the
  // wording is not updated, this fails - which is the right way round.
  await open(page)

  const reading = page.locator('#privacy details').nth(2)

  await reading.locator('summary').click()
  await expect(reading).toContainText(/yes, in one narrow case|ja, in einem engen Fall/i)
  await expect(reading.locator('a[href*="issues/43"]')).toHaveCount(1)
})

test('it does not promise encryption at rest, because there is none', async ({ page }) => {
  await open(page)

  const rest = page.locator('#privacy details').nth(4)

  await rest.locator('summary').click()
  await expect(rest).toContainText(/not encrypted at rest|Verschlüsselt sind sie dort nicht/i)
})
