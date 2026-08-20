import { expect, test } from '@playwright/test'

/**
 * Two languages, and an introduction before first use.
 *
 * Asserted on **rendered text**, never on which table was assigned: the second
 * would pass while an element ignored it. The elements' own German comes from
 * the library, so this is also the check that a consumer gets it without
 * retyping three dozen labels.
 */

const open = async (page, { hash = '' } = {}) => {
  const errors = []

  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`/${hash}`)
  await page.waitForFunction(() => document.getElementById('intro') != null)

  return errors
}

const shut = page => page.evaluate(() => document.getElementById('intro').close())

test.describe('language', () => {
  test('starts in English and says so in the document', async ({ page }) => {
    await open(page)
    await shut(page)

    await expect(page.locator('#locale')).toHaveValue('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('German reaches this app and the library elements alike', async ({ page }) => {
    await open(page)
    await shut(page)
    await page.locator('#locale').selectOption('de')

    // This app's own voice.
    await expect(page.locator('#link-state')).toHaveText('Noch nicht verbunden.')
    await expect(page.locator('#invite')).toHaveText('Meinen Code zeigen')

    // And the library's, inside a shadow root - the point of it shipping
    // German rather than every consumer writing it again.
    await page.evaluate(() => document.getElementById('intro').open())
    await expect(page.locator('qr-intro h2')).toHaveText('Bevor Sie anfangen')
  })

  test('text written from JavaScript follows too, not only the markup', async ({ page }) => {
    await open(page)
    await shut(page)

    // The folder line carries its own text and no `data-i18n`, so it is the one
    // a language switch forgets. It was forgotten once.
    await page.locator('#locale').selectOption('de')
    await expect(page.locator('#folder')).toHaveText('Arbeitet im privaten Speicher dieses Browsers')

    await page.locator('#locale').selectOption('en')
    await expect(page.locator('#folder')).toHaveText("Working in this browser's private storage")
  })

  test('the choice survives a reload', async ({ page }) => {
    await open(page)
    await shut(page)
    await page.locator('#locale').selectOption('de')

    await page.reload()
    await page.waitForFunction(() => document.getElementById('locale') != null)

    await expect(page.locator('#locale')).toHaveValue('de')
  })
})

test.describe('the introduction', () => {
  test('greets a first visit with this app\'s own words', async ({ page }) => {
    await open(page)

    expect(await page.evaluate(() => document.getElementById('intro').isOpen)).toBe(true)
    // Light DOM through the slot: the story is the app's half, the caveats the
    // library's.
    await expect(page.locator('qr-intro > [data-i18n="intro.what"]')).toContainText('two of your devices')
  })

  test('says plainly that both devices have to be open', async ({ page }) => {
    await open(page)

    // The decision from the README, on screen: a stage described as a stage,
    // rather than a limitation left for somebody to discover.
    //
    // Addressed by its key, not by position: Playwright locators pierce an open
    // shadow root, so `qr-intro p` also matches the element's own paragraphs
    // and `.last()` lands on one of those.
    await expect(page.locator('qr-intro > [data-i18n="intro.who"]')).toContainText('at the same time')
  })

  test('does not stand in front of somebody who arrived by invite', async ({ page }) => {
    // That person came to accept something. They see it on their next plain
    // visit instead - so this must not count as having seen it either.
    await open(page, { hash: '#i=whatever' })
    expect(await page.evaluate(() => document.getElementById('intro').isOpen)).toBe(false)

    await open(page)
    expect(await page.evaluate(() => document.getElementById('intro').isOpen)).toBe(true)
  })
})
