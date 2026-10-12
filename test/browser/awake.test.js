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
 *
 * The box is a permission and not a state, which is the half these specs are
 * really about: ticking it asks for the screen *when it matters*, and the lock
 * follows a code on display or a device connected rather than the tick.
 */

const open = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#awake')).toBeVisible({ timeout: 60_000 })
}

const supported = page => page.evaluate(() => window.__wakeLockForTest.supported)
const wanted = page => page.evaluate(() => window.__wakeLockForTest.wanted)

test('it is off until somebody asks', async ({ page }) => {
  // The opposite default to the waiting music, and on purpose: both are bounded
  // by something happening, and only one of them costs a battery when somebody
  // forgets about it. A setting like that is not one to make for people.
  await open(page)

  await expect(page.locator('#awake')).not.toBeChecked()
  expect(await wanted(page)).toBe(false)
})

test('a ticked box on a quiet page holds nothing', async ({ page }) => {
  // The complaint this spec is here for: the screen stayed awake on a page with
  // no code on it and nobody connected, which is an afternoon of battery spent
  // on nothing. Ticking the box grants permission; it is not itself a reason.
  await open(page)

  if (!await supported(page)) {
    test.skip(true, 'dieser Browser hält den Bildschirm nicht wach')
    return
  }

  await page.locator('#awake').check()

  expect(await wanted(page)).toBe(false)
})

test('and a device a relay can call holds it, because that is when the question comes', async ({ page }) => {
  // What the spec above does not cover, and it cost an evening on a real phone:
  // the device being *asked* shows no code and is connected to nobody. Under
  // "a code or a connection" it dozed off precisely while it waited, and the
  // invitation arrived at a page that was no longer there.
  //
  // The relay is the one started beside this suite, so "reachable" here is a
  // reservation that really happened rather than a flag somebody set.
  test.setTimeout(180_000)

  await page.addInitScript(() => localStorage.setItem('ablage.relay', 'true'))
  await page.goto('/?intro=off')
  await expect(page.locator('#awake')).toBeVisible({ timeout: 60_000 })

  if (!await supported(page)) {
    test.skip(true, 'dieser Browser hält den Bildschirm nicht wach')
    return
  }

  await expect(page.locator('#reachable')).toHaveClass(/is-reachable/, { timeout: 120_000 })
  await page.locator('#awake').check()

  expect(await wanted(page)).toBe(true)
})

test('and the permission survives a reload, so the next code is covered', async ({ page }) => {
  await open(page)

  if (!await supported(page)) {
    test.skip(true, 'dieser Browser hält den Bildschirm nicht wach')
    return
  }

  await page.locator('#awake').check()
  await page.reload()

  await expect(page.locator('#awake')).toBeChecked({ timeout: 60_000 })
})

test('and a code on display is the reason it waits for', async ({ page }) => {
  await open(page)

  if (!await supported(page)) {
    test.skip(true, 'dieser Browser hält den Bildschirm nicht wach')
    return
  }

  await page.locator('#awake').check()

  // The dialog is opened directly rather than by making an invite: this spec is
  // about what the lock follows, and pairing two contexts to reach it would pay
  // two minutes for an attribute. The app watches the attribute, not the
  // button, which is what makes that legitimate.
  await page.evaluate(() => document.getElementById('invite-box').showModal())
  await expect.poll(() => wanted(page)).toBe(true)

  await page.evaluate(() => document.getElementById('invite-box').close())
  await expect.poll(() => wanted(page)).toBe(false)
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

  // Withdrawing the permission while a code is on display is not tested here on
  // purpose: the invite dialog is modal, so the box behind it cannot be reached
  // while one is up. `awakeNeeded` needs both halves, and the spec above
  // measures the half that broke - a ticked box on a quiet page.
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

  // Short on the card, and it has to stay short. The long form is six lines of
  // body text for a control that is off, above anything somebody has connected
  // - it lives in the technical half of the introduction now, with the rest of
  // the mechanism.
  expect((await hint.innerText()).length).toBeLessThan(140)
})

test('the label says what it costs, not only what it does', async ({ page }) => {
  // Battery is the trade, and somebody deciding needs it in the sentence rather
  // than discovering it at four in the afternoon.
  await open(page)

  await expect(page.locator('#awake-why')).toContainText(/battery|Akku/i)
})
