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

    await expect(page.locator('#locale-en')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('German reaches this app and the library elements alike', async ({ page }) => {
    await open(page)
    await shut(page)
    await page.locator('#locale-de').click()

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
    await page.locator('#locale-de').click()
    await expect(page.locator('#folder')).toHaveText('Im Browser — kein Ordner auf Ihrer Festplatte')
    await expect(page.locator('#folder-detail')).toContainText('Dateimanager')

    await page.locator('#locale-en').click()
    await expect(page.locator('#folder')).toHaveText('Inside this browser — not a folder on your disk')
    await expect(page.locator('#folder-detail')).toContainText('file manager')
  })

  test('the choice survives a reload', async ({ page }) => {
    await open(page)
    await shut(page)
    await page.locator('#locale-de').click()

    await page.reload()
    await page.waitForFunction(() => document.getElementById('locale-de') != null)

    await expect(page.locator('#locale-de')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('how much detail', () => {
  // While the introduction is open the header is behind its overlay and cannot
  // be clicked - which is the whole reason the dialog carries the same pair.
  // These use the ones a person could actually reach at that moment.
  test('one switch drives this page and the library element alike', async ({ page }) => {
    await open(page)

    // Simple by default: whoever needs the detail goes looking, and whoever
    // does not would never have learnt what DTLS was.
    await expect(page.locator('.intro-tech')).toBeHidden()
    await expect(page.locator('qr-intro .tech')).toBeHidden()

    await page.locator('#intro-view').click()

    // Both halves, from one control. Two switches for "how much detail" would
    // be one too many.
    await expect(page.locator('.intro-tech')).toBeVisible()
    await expect(page.locator('qr-intro .tech')).toBeVisible()
  })

  test('the technical half names the technology rather than gesturing at it', async ({ page }) => {
    await open(page)
    await page.locator('#intro-view').click()

    // "Encrypted" on its own is a claim. These are the things somebody could
    // check: which layer, what binds it, and where the code is.
    await expect(page.locator('[data-i18n="how.dtls"]')).toContainText('DTLS')
    await expect(page.locator('[data-i18n="how.signed"]')).toContainText('fingerprint')
    await expect(page.locator('[data-i18n="how.open"]')).toContainText('libp2p-webrtc-qr')
  })

  test('the choice survives a reload', async ({ page }) => {
    await open(page)
    await page.locator('#intro-view').click()

    await page.reload()
    await page.waitForFunction(() => document.getElementById('view-mode') != null)

    // The button names where it goes, so the technical view offers the simple
    // one. `aria-pressed` is the state, and the state is what survived.
    await expect(page.locator('#view-mode')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the switch speaks the chosen language', async ({ page }) => {
    await open(page)
    await page.locator('#intro-locale-de').click()

    // The header's copy, which is written by the same pass. Read after the
    // dialog is out of the way, because that is where it lives.
    await shut(page)
    await expect(page.locator('#view-mode')).toHaveText('Technisch')
  })
})

test.describe('the introduction', () => {
  test('says the connection is encrypted, in both languages', async ({ page }) => {
    await open(page)

    // The thing a person most wants to know before putting files somewhere, and
    // the thing this app can actually claim.
    await expect(page.locator('qr-intro > [data-i18n="intro.secure"]')).toContainText('encrypted end to end')

    await page.locator('#intro-locale-de').click()
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
    await expect(page.locator('#intro-locale-de')).toBeVisible()
    await expect(page.locator('#intro-locale-en')).toBeVisible()
    await expect(page.locator('#intro-view')).toBeVisible()
  })

  test('changing the language in the dialog changes the dialog', async ({ page }) => {
    await open(page)
    await page.locator('#intro-locale-de').click()

    await expect(page.locator('[data-i18n="intro.secure"]')).toContainText('verschlüsselt')
    // And the page underneath, which is the same switch by another handle.
    await expect(page.locator('#invite')).toHaveText('Meinen Code zeigen')
  })

  test('asking for detail in the dialog reveals it without closing anything', async ({ page }) => {
    await open(page)
    await expect(page.locator('.intro-tech')).toBeHidden()

    await page.locator('#intro-view').click()

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
    await page.locator('#intro-locale-de').click()

    // A `<select>`'s options are not reached by `data-i18n` on the element, so
    // they are written by hand - and the header pair was written by hand first,
    // which is exactly how this one got left in English.
    await expect(page.locator('#intro-view')).toHaveText('Technisch')
  })

  test('the two copies of each switch never disagree', async ({ page }) => {
    await open(page)
    await page.locator('#intro-view').click()
    await page.locator('#intro-locale-de').click()

    // Both are written from `applyLocale`/`applyView` rather than from each
    // other, so this is what would catch a missing line there.
    await expect(page.locator('#view-mode')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#locale-de')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('why there is music', () => {
  test('the technical half says what plays and why', async ({ page }) => {
    await page.goto('/')
    await page.locator('#intro-view').click()

    // The two halves of the answer: which recording, and that it is a
    // keep-alive rather than decoration.
    await expect(page.locator('[data-i18n="how.music"]')).toContainText('1903')
    await expect(page.locator('[data-i18n="how.music"]')).toContainText(/suspend/i)
  })

  test('it says it in German too', async ({ page }) => {
    await page.goto('/?lang=de')
    await page.locator('#intro-view').click()

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

test.describe('the network panel while the language changes under it', () => {
  test('the measuring line follows, instead of staying behind in English', async ({ page }) => {
    await open(page)
    await shut(page)

    // Synchronous and inside one evaluate: a probe is a few STUN round trips
    // and can settle before a locator poll ever runs, and then this asserts
    // nothing at all.
    //
    // This is the consumer side of libp2p-webrtc-qr#100 - the element wrote its
    // caption once when the probe started and never again, so a language change
    // mid-probe left that one line English while the panel around it turned
    // German. It is this app that hits it, because the switch is reachable
    // while the check is running.
    const seen = await page.evaluate(async () => {
      const el = document.getElementById('network')
      const caption = () => el.shadowRoot.querySelector('.probe-caption').textContent

      const done = el.probe()
      const before = caption()

      document.getElementById('locale-de').click()
      const after = caption()

      await done
      return { before, after }
    })

    expect(seen.before).toContain('Checking')
    expect(seen.after).toBe('Prüfe, was dieses Netz zulässt…')
  })
})

test.describe('the switches themselves', () => {
  test('two flags, both visible, the chosen one bright', async ({ page }) => {
    await open(page)
    await shut(page)

    // Both stay on screen. A control that hides the alternative does not read
    // as a choice, and one flag alone is a label rather than a switch.
    await expect(page.locator('#locale-en')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#locale-de')).toHaveAttribute('aria-pressed', 'false')

    await page.locator('#locale-de').click()

    await expect(page.locator('#locale-de')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#locale-en')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the flags say which language they are, for anyone not reading flags', async ({ page }) => {
    await open(page)

    // A flag is a country, not a language, and a screen reader announces
    // neither. The label is what makes it a language switch.
    await expect(page.locator('#locale-de')).toHaveAttribute('aria-label', 'Deutsch')
    await expect(page.locator('#locale-en')).toHaveAttribute('aria-label', 'English')
  })

  test('the view button offers the other view, rather than naming this one', async ({ page }) => {
    await open(page)
    await shut(page)

    // Labelled with its destination. A button that says "Simple" while the
    // view is simple reads as a statement, and pressing it is a guess.
    await expect(page.locator('#view-mode')).toHaveText('Technical')

    await page.locator('#view-mode').click()

    await expect(page.locator('#view-mode')).toHaveText('Simple')
    await expect(page.locator('#view-mode')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('the warning', () => {
  test('says this is experimental, before it says anything else', async ({ page }) => {
    await open(page)

    await expect(page.locator('.warning')).toContainText('Highly experimental')
    await expect(page.locator('.warning')).toContainText(/cannot lose/i)

    // First in the dialog, not somewhere down the page: somebody deciding
    // whether to put real work in here needs it before the description.
    const order = await page.evaluate(() => {
      const warning = document.querySelector('qr-intro > .warning')
      const what = document.querySelector('qr-intro > [data-i18n="intro.what"]')
      return warning.compareDocumentPosition(what) & Node.DOCUMENT_POSITION_FOLLOWING ? 'warning first' : 'warning later'
    })

    expect(order).toBe('warning first')
  })

  test('stays in the simple view, because it is a warning and not a detail', async ({ page }) => {
    await open(page)

    await expect(page.locator('.warning')).toBeVisible()

    await page.locator('#intro-view').click()
    await expect(page.locator('.warning')).toBeVisible()
  })

  test('and says it in German', async ({ page }) => {
    await open(page)
    await page.locator('#intro-locale-de').click()

    await expect(page.locator('.warning')).toContainText('Hochgradig experimentell')
  })
})

test.describe('the network chips', () => {
  test('are not in the simple view', async ({ page }) => {
    await open(page)
    await shut(page)

    // Diagnostics. "IPv6: none" is not something somebody who chose the simple
    // view can act on, and three coloured dots that never change are furniture.
    await expect(page.locator('#network')).toBeHidden()
  })

  test('and are there for whoever asked for detail', async ({ page }) => {
    await open(page)
    await page.locator('#intro-view').click()
    await shut(page)

    await expect(page.locator('#network')).toBeVisible()
  })

  test('the measurement still runs either way', async ({ page }) => {
    await open(page)

    // Hidden is not switched off. The introduction reports the same check in a
    // sentence, which is the form the simple view wants it in - and asserting
    // that keeps somebody from "fixing" the hiding by skipping the probe.
    await expect(page.locator('qr-intro')).toContainText(/Checking|direct connection|network/i)
  })
})

test.describe("this device's own address", () => {
  test('is shown, because otherwise nobody can be told which device is yours', async ({ page }) => {
    await open(page)
    await page.locator('#intro-view').click()
    await shut(page)

    // The admission dialog names the device that is asking. Without this there
    // is no way to tell somebody which of those names is you.
    await expect(page.locator('#my-peer')).toBeVisible()
    await expect(page.locator('#my-peer')).toContainText(/12D3Koo|Qm/)
  })

  test('and not in the simple view, because a peer id is not a name', async ({ page }) => {
    await open(page)
    await shut(page)

    await expect(page.locator('#my-peer')).toBeHidden()
  })

  test('it says whose it is, in German too', async ({ page }) => {
    await open(page)
    await page.locator('#intro-locale-de').click()
    await page.locator('#intro-view').click()
    await shut(page)

    await expect(page.locator('#my-peer')).toContainText('Dieses Gerät:')
  })
})

test.describe('the second way in', () => {
  // By its part name, not by position. The shadow root holds two checkboxes -
  // this one and "do not show again" - and the library's own source warns that
  // reaching for them by order silently picks the wrong one. It did here: the
  // first version of this suite used `.last()`, and the opening test passed
  // while ticking the dismissal box.
  const relayBox = page => page.locator('qr-intro').locator('input[part="relay-opt-in"]')

  test('the introduction offers a relay, unticked', async ({ page }) => {
    await open(page)

    // The element only grows this half when the app hands it a `relay` - which
    // is the seam that was missing: the checkbox existed in the library and
    // nothing here had ever set the property.
    await expect(relayBox(page)).toBeVisible()
    await expect(relayBox(page)).not.toBeChecked()
  })

  test('and says a choice takes effect at the next start, rather than pretending', async ({ page }) => {
    await open(page)

    // `relayOptIn` decides the bootstrap list, the `/p2p-circuit` announcement
    // and what the gater refuses - all fixed when the node is created. A tick
    // that appeared to do something now would be the lie.
    await relayBox(page).check()

    await expect(page.locator('#link-state')).toContainText(/next time this page is opened/i)
  })

  test('unticking it says what that means', async ({ page }) => {
    await open(page)
    await relayBox(page).check()
    await relayBox(page).uncheck()

    await expect(page.locator('#link-state')).toContainText(/scanning its code/i)
  })

  test('the choice is written where the node reads it', async ({ page }) => {
    // The whole seam in one assertion. The element writes under the key we give
    // it; `createPeer` reads that same key at the next start. A different key
    // on either side would leave the box working and the node unaware.
    await open(page)
    await relayBox(page).check()

    await expect.poll(() => page.evaluate(() => localStorage.getItem('ablage.relay'))).toBe('true')
  })
})

test('ticking the relay box finds one, rather than reporting silence', async ({ page }) => {
  // What this looked like from the outside: "Kein Relay hat geantwortet" for a
  // relay that was up. Two causes, hiding each other - no encrypter or muxer to
  // negotiate an ordinary connection, and the node's own gate refusing the very
  // check that would have said so.
  test.setTimeout(120_000)
  await open(page)

  const box = page.locator('qr-intro').locator('input[part="relay-opt-in"]')

  await box.check()

  // The element paints the source it found - `baked`, `aleph` or `none`.
  await expect(page.locator('qr-intro')).not.toContainText(/no relay answered|Kein Relay hat geantwortet/i, { timeout: 60_000 })
})
