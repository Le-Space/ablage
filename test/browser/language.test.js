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

test.describe('how much detail', () => {
  test('one switch drives this page and the library element alike', async ({ page }) => {
    await open(page)

    // Simple by default: whoever needs the detail goes looking, and whoever
    // does not would never have learnt what DTLS was.
    await expect(page.locator('.intro-tech')).toBeHidden()
    await expect(page.locator('qr-intro .tech')).toBeHidden()

    await page.locator('#view-mode').selectOption('technical')

    // Both halves, from one control. Two switches for "how much detail" would
    // be one too many.
    await expect(page.locator('.intro-tech')).toBeVisible()
    await expect(page.locator('qr-intro .tech')).toBeVisible()
  })

  test('the technical half names the technology rather than gesturing at it', async ({ page }) => {
    await open(page)
    await page.locator('#view-mode').selectOption('technical')

    // "Encrypted" on its own is a claim. These are the things somebody could
    // check: which layer, what binds it, and where the code is.
    await expect(page.locator('[data-i18n="how.dtls"]')).toContainText('DTLS')
    await expect(page.locator('[data-i18n="how.signed"]')).toContainText('fingerprint')
    await expect(page.locator('[data-i18n="how.open"]')).toContainText('libp2p-webrtc-qr')
  })

  test('the choice survives a reload', async ({ page }) => {
    await open(page)
    await page.locator('#view-mode').selectOption('technical')

    await page.reload()
    await page.waitForFunction(() => document.getElementById('view-mode') != null)

    await expect(page.locator('#view-mode')).toHaveValue('technical')
  })

  test('the switch speaks the chosen language', async ({ page }) => {
    await open(page)
    await page.locator('#locale').selectOption('de')

    await expect(page.locator('#view-mode option').first()).toHaveText('Einfach')
  })
})

test.describe('the introduction', () => {
  test('says the connection is encrypted, in both languages', async ({ page }) => {
    await open(page)

    // The thing a person most wants to know before putting files somewhere, and
    // the thing this app can actually claim.
    await expect(page.locator('qr-intro > [data-i18n="intro.secure"]')).toContainText('encrypted end to end')

    await page.locator('#locale').selectOption('de')
    await expect(page.locator('qr-intro > [data-i18n="intro.secure"]')).toContainText('Ende zu Ende verschlüsselt')
  })

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

test.describe('switching from inside the introduction', () => {
  test('the dialog carries its own switches, because the header is behind it', async ({ page }) => {
    await open(page)

    // The header pair is under the overlay and cannot be clicked. Without these
    // the first thing anybody sees is a dialog they cannot change.
    await expect(page.locator('#intro-locale')).toBeVisible()
    await expect(page.locator('#intro-view')).toBeVisible()
  })

  test('changing the language in the dialog changes the dialog', async ({ page }) => {
    await open(page)
    await page.locator('#intro-locale').selectOption('de')

    await expect(page.locator('[data-i18n="intro.secure"]')).toContainText('verschlüsselt')
    // And the page underneath, which is the same switch by another handle.
    await expect(page.locator('#invite')).toHaveText('Meinen Code zeigen')
  })

  test('asking for detail in the dialog reveals it without closing anything', async ({ page }) => {
    await open(page)
    await expect(page.locator('.intro-tech')).toBeHidden()

    await page.locator('#intro-view').selectOption('technical')

    await expect(page.locator('.intro-tech')).toBeVisible()

    // Asked of the dialog rather than of `<qr-intro>`: the host element has no
    // layout box of its own - everything it draws lives in a `<dialog>` in its
    // shadow root - so the host reads as hidden even while the dialog is up.
    const stillOpen = await page.evaluate(() =>
      document.getElementById('intro').shadowRoot.querySelector('dialog').open)

    expect(stillOpen).toBe(true)
  })

  test('the dialog switch speaks the chosen language too', async ({ page }) => {
    await open(page)
    await page.locator('#intro-locale').selectOption('de')

    // A `<select>`'s options are not reached by `data-i18n` on the element, so
    // they are written by hand - and the header pair was written by hand first,
    // which is exactly how this one got left in English.
    await expect(page.locator('#intro-view option').nth(1)).toHaveText('Technisch')
  })

  test('the two copies of each switch never disagree', async ({ page }) => {
    await open(page)
    await page.locator('#intro-view').selectOption('technical')
    await page.locator('#intro-locale').selectOption('de')

    // Both are written from `applyLocale`/`applyView` rather than from each
    // other, so this is what would catch a missing line there.
    await expect(page.locator('#view-mode')).toHaveValue('technical')
    await expect(page.locator('#locale')).toHaveValue('de')
  })
})

test.describe('why there is music', () => {
  test('the technical half says what plays and why', async ({ page }) => {
    await page.goto('/')
    await page.locator('#intro-view').selectOption('technical')

    // The two halves of the answer: which recording, and that it is a
    // keep-alive rather than decoration.
    await expect(page.locator('[data-i18n="how.music"]')).toContainText('1903')
    await expect(page.locator('[data-i18n="how.music"]')).toContainText(/suspend/i)
  })

  test('it says it in German too', async ({ page }) => {
    await page.goto('/?lang=de')
    await page.locator('#intro-view').selectOption('technical')

    await expect(page.locator('[data-i18n="how.music"]')).toContainText('1903')
    await expect(page.locator('[data-i18n="how.music"]')).toContainText('schlafen')
  })

  test('the recording is actually served', async ({ page }) => {
    // A keep-alive that 404s is a keep-alive that silently does nothing, and
    // nothing in the interface would say so.
    const response = await page.request.get('/audio/zauberfloete-dies-bildnis-cossira-1903.mp3')

    expect(response.status()).toBe(200)
    expect(Number(response.headers()['content-length'])).toBeGreaterThan(1_000_000)
  })
})
