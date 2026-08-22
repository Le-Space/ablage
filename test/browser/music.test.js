import { expect, test } from '@playwright/test'

/**
 * The waiting music: what it is, why it plays, and how to stop it.
 *
 * Whether audio actually *sounds* is a question about the machine's audio
 * stack, not about this code - it plays on a desktop and not in a CI container.
 * So what is asserted here is the choice and what the screen says about it,
 * never `keepAlive.running`, which would be asserting on the runner.
 */

// Making an invite is a real peer connection gathering real candidates, and in
// a container with nowhere to send them that takes as long as its timeout. The
// default 30s test budget was shorter than this file's own 60s poll, so the
// poll never got to finish and the failure said "test timeout" instead of
// anything about the invite.
test.setTimeout(120_000)

const invite = async page => {
  await page.goto('/?intro=off')

  // Wait for the node before pressing the button that needs it. Nothing in the
  // markup stops a press before then - `#invite` ships enabled - so a test that
  // clicks immediately is racing the node's start, and on Firefox in CI it
  // loses. A person on a slow phone would lose the same race.
  await expect(page.locator('#network')).toBeVisible({ timeout: 60_000 })

  await page.locator('#invite').click()

  try {
    await expect
      .poll(() => page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 })
      .toBe(true)
  } catch (error) {
    // Say what the app said. A bare timeout here is the least informative
    // failure this suite can produce - the page has usually written the reason
    // into the state line, and without this it is thrown away.
    const state = await page.locator('#link-state').innerText().catch(() => '(unlesbar)')
    throw new Error(`the invite never opened. #link-state said: ${state}\n\n${error.message}`)
  }
}

test.describe('the waiting music', () => {
  test('is on unless somebody turned it off', async ({ page }) => {
    await invite(page)

    // The default is the working one: a silent page is suspended seconds after
    // you leave to send the link, and that closes the connection.
    await expect(page.locator('#music')).toBeChecked()
  })

  test('says which piece it is, on the screen playing it', async ({ page }) => {
    await invite(page)

    // A page that starts playing opera owes an explanation on the same screen -
    // otherwise the reasonable reaction is to look for the mute, which is
    // exactly what breaks it.
    //
    // Asserted on the text and not on whether it is *visible*: this line
    // appears only once audio really started, and whether it can is a fact
    // about the machine - it plays on a laptop and not in a CI container. The
    // visible-either-way assertion is the one below.
    await expect(page.locator('[data-i18n="music.piece"]')).toContainText('Zauberflöte')
    await expect(page.locator('[data-i18n="music.piece"]')).toContainText('1903')
    await expect(page.locator('[data-i18n="music.why"]')).toContainText(/suspend/i)
  })

  test('the note is there from the start, not inserted later', async ({ page }) => {
    await invite(page)

    // The reason this matters is not tidiness. A `<dialog>` centres itself, so
    // an element appearing inside it makes the box taller and pushes its top
    // upwards - including the checkbox above. The audio starts a second or two
    // after the code does, which is exactly when somebody is reaching for that
    // checkbox: it moved out from under the pointer between the press and the
    // release, and the click was lost. Playwright found it before a person did.
    await expect(page.locator('#music-now')).toBeVisible()

    const before = await page.locator('#invite-box').boundingBox()
    await page.waitForTimeout(4000)
    const after = await page.locator('#invite-box').boundingBox()

    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  })

  test('a browser that refuses the audio says so, rather than nothing', async ({ page }) => {
    // Forced, because the interesting case cannot be waited for: a keep-alive
    // that silently did not start is discovered as a transfer that died while
    // somebody was in a messenger. That silence is the failure this whole
    // feature exists to prevent.
    await page.addInitScript(() => {
      delete window.AudioContext
      delete window.webkitAudioContext
    })
    await invite(page)

    await expect(page.locator('#music-why')).toContainText(/keeping it awake/i)
    await expect(page.locator('#music-why')).toHaveClass(/blocked/)

    // Still the same paragraph, in the same place - see above.
    await expect(page.locator('#music-now')).toBeVisible()
  })

  test('and says it in German', async ({ page }) => {
    await page.goto('/?intro=off&lang=de')
    await page.locator('#invite').click()
    await expect.poll(() => page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

    await expect(page.locator('[data-i18n="music.toggle"]')).toHaveText('Wartemusik abspielen')
    await expect(page.locator('[data-i18n="music.piece"]')).toContainText('gemeinfrei')
  })

  test('turning it off is remembered', async ({ page }) => {
    await invite(page)
    await page.locator('#music').uncheck()

    expect(await page.evaluate(() => localStorage.getItem('ablage.music'))).toBe('false')

    await page.reload()
    await page.locator('#invite').click()
    await expect.poll(() => page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

    await expect(page.locator('#music')).not.toBeChecked()
  })

  test('turning it back on is remembered too', async ({ page }) => {
    // The other direction, because a preference that only records one of its
    // two values is a preference nobody can undo.
    await invite(page)
    await page.locator('#music').uncheck()
    await page.locator('#music').check()

    expect(await page.evaluate(() => localStorage.getItem('ablage.music'))).toBe('true')
  })

  test('nothing claims to be playing while it is off', async ({ page }) => {
    await invite(page)
    await page.locator('#music').uncheck()

    // The line follows what happened, not what was asked for. Off means the
    // page says nothing rather than naming a piece into silence - and it does
    // not warn about a keep-alive that was never wanted either.
    await expect(page.locator('#music-now')).toBeHidden()
  })

  test('a stored choice survives into a fresh invite', async ({ page }) => {
    await page.goto('/?intro=off')
    await page.evaluate(() => localStorage.setItem('ablage.music', 'false'))
    await page.reload()
    await page.locator('#invite').click()
    await expect.poll(() => page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

    await expect(page.locator('#music')).not.toBeChecked()
    await expect(page.locator('#music-now')).toBeHidden()
  })
})
