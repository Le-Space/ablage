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

test('the technical half of the intro carries the relay answer, and the simple half does not', async ({ page }) => {
  // Somebody deciding whether to tick the relay box decides it *in the intro*.
  // An answer they have to go looking for afterwards is one given too late -
  // and in the simple view it raises a question nobody was asking.
  await page.goto('/')

  // The dialog lives in the element's shadow root; the host being present says
  // nothing about whether it is up yet.
  await page.waitForFunction(
    () => document.getElementById('intro')?.shadowRoot?.querySelector('dialog')?.open === true,
    undefined,
    { timeout: 60_000 }
  )

  const tech = page.locator('#intro .intro-tech')

  await expect(tech).toBeHidden()

  await page.locator('#intro-view').click()
  await expect(tech).toBeVisible()

  await expect(tech).toContainText(/Noise/)
  await expect(tech).toContainText(/who talks to whom|wer mit wem/i)
  await expect(tech).toContainText(/skipEncryption/)
  await expect(tech.locator('a[href*="issues/43"]')).toHaveCount(1)
})

test.describe('one world at a time, in the technical half too', () => {
  const intro = async page => {
    await page.goto('/')
    await page.waitForFunction(
      () => document.getElementById('intro')?.shadowRoot?.querySelector('dialog')?.open === true,
      undefined,
      { timeout: 60_000 }
    )
    await page.locator('#intro-view').click()
  }

  const tick = page => page.evaluate(on => {
    localStorage.setItem('ablage.relay', String(on))
    document.getElementById('intro').dispatchEvent(new CustomEvent('relay-opt-in', { detail: { optIn: on } }))
  }, true)

  test('with a relay on, the code explanations go with the code', async ({ page }) => {
    // The simple half got this when the either-or landed; the technical half
    // did not, and went on describing a handshake nobody was about to make.
    await intro(page)

    await expect(page.locator('.how-code').first()).toBeVisible()
    await expect(page.locator('.how-relay').first()).toBeHidden()

    await tick(page)

    await expect(page.locator('.how-code').first()).toBeHidden()
    await expect(page.locator('.how-relay').first()).toBeVisible()
  })

  test('and the first sentence stops claiming there is nothing in between', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#lede-code')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#lede-code')).toContainText(/nothing in the middle|nichts dazwischen/i)

    await page.waitForFunction(
      () => document.getElementById('intro')?.shadowRoot?.querySelector('dialog')?.open === true,
      undefined,
      { timeout: 60_000 }
    )
    await tick(page)

    await expect(page.locator('#lede-code')).toBeHidden()
    await expect(page.locator('#lede-relay')).toBeVisible()
    await expect(page.locator('#lede-relay')).toContainText(/cannot read|nicht mitlesen/i)
  })

  test('the technical half says what each kind of share does to an identity', async ({ page }) => {
    // Three claims, and the caveat is one of them. Running them together is how
    // a limit gets read as a feature - so each is asserted separately rather
    // than as one match somewhere in the block.
    await intro(page)

    const tech = page.locator('#intro .intro-tech')

    // What a named share buys.
    await expect(tech).toContainText(/key pair of its own|eigenes Schlüsselpaar/i)
    // What the one-off share buys instead.
    await expect(tech).toContainText(/new key pair on every start|jedem Start ein neues Schlüsselpaar/i)
    await expect(tech).toContainText(/no relay can tell|kein Relay kann erkennen/i)
    // And what neither of them buys, which is the sentence most easily left out.
    await expect(tech).toContainText(/do not hide a shared IP|verbergen keine gemeinsame IP/i)
  })
})

test('the two links in the footer do not both say privacy', async ({ page }) => {
  // They did: the in-app chapter and the external page were both "Datenschutz".
  // The chapter is in the app since #46, so the outward link is the imprint.
  await page.goto('/?intro=off')

  await expect(page.locator('#privacy-open')).toHaveText(/Privacy|Datenschutz/)
  await expect(page.locator('a[href="https://le-space.de"].foot-link')).toHaveText(/Imprint|Impressum/)
  await expect(page.locator('a[href="https://le-space.de"].foot-link')).not.toHaveText(/Privacy|Datenschutz/)
})

test('and the long form of the wake lock is in the technical half', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(
    () => document.getElementById('intro')?.shadowRoot?.querySelector('dialog')?.open === true,
    undefined, { timeout: 60_000 })
  await page.locator('#intro-view').click()

  await expect(page.locator('#intro .intro-tech')).toContainText(/wake lock|Wake-Lock/i)
})
