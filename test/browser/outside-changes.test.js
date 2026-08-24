import { chromium, expect, test } from '@playwright/test'

/**
 * A change made outside the app, and whether it travels.
 *
 * The claim on the landing page is that picking a real folder means "genau der
 * wird abgeglichen — inklusive Änderungen, die außerhalb der App passieren".
 * The watcher had a test; it watched a folder in isolation. Nothing checked
 * that an edit made by something that is not this app ends up on the other
 * device, which is the whole of what that sentence promises.
 *
 * There are no change events on a directory handle in any engine, so this is
 * polling - `watchFolder` compares each file's size and modification time every
 * two seconds. "Immediately" is therefore the wrong word, and this measures
 * what the right one is.
 */

test.describe.configure({ mode: 'serial' })
test.setTimeout(240_000)

const standInPicker = `
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory()
    return root.getDirectoryHandle('outside-picked', { create: true })
  }
`

const side = async (browser, pick) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []

  page.on('pageerror', error => errors.push(error.message))
  if (pick) await page.addInitScript(standInPicker)
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled({ timeout: 60_000 })

  if (pick) {
    await page.locator('#pick-folder').click()
    await expect(page.locator('#folder')).toHaveAttribute('data-place', 'disk', { timeout: 30_000 })
  }

  return { page, context, errors }
}

/** Paired by link, the way `switch-answers.test.js` does it. */
const pair = async (alice, bob) => {
  await alice.page.locator('#invite').click()
  await expect.poll(() => alice.page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

  const invite = await alice.page.locator('#invite-link').inputValue()

  await bob.page.goto(invite.replace(/#/, '?intro=off#'))
  await expect.poll(() => bob.page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

  const reply = await bob.page.locator('#invite-link').inputValue()

  await alice.page.locator('#paste-fold summary').click()
  await alice.page.locator('#reply-text').fill(reply)
  await alice.page.locator('#use-reply').click()

  await expect(alice.page.locator('#link-state')).toHaveClass(/is-connected/, { timeout: 60_000 })
}

/**
 * Write into the picked folder without going through the app at all - the same
 * handle a text editor would be writing through.
 */
const writeFromOutside = (page, name, text) => page.evaluate(async ([name, text]) => {
  const root = await navigator.storage.getDirectory()
  const folder = await root.getDirectoryHandle('outside-picked', { create: true })
  const file = await folder.getFileHandle(name, { create: true })
  const writable = await file.createWritable()

  await writable.write(text)
  await writable.close()
}, [name, text])

test('a file put in the folder by something else reaches the other device', async () => {
  const browser = await chromium.launch()
  const alice = await side(browser, true)
  const bob = await side(browser, false)

  try {
    await pair(alice, bob)

    const started = Date.now()

    await writeFromOutside(alice.page, 'von-aussen.txt', 'geschrieben ohne die app')

    // On Alice first: the app has to notice before it can tell anybody.
    await expect(alice.page.locator('.tree')).toContainText('von-aussen.txt', { timeout: 30_000 })
    // Then on Bob, which is what the sentence on the landing page promises.
    await expect(bob.page.locator('.tree')).toContainText('von-aussen.txt', { timeout: 30_000 })

    // Polling at two seconds, so a few seconds is the honest answer and
    // "immediately" is not. This bound would catch the watcher being dropped
    // or the interval being raised to something nobody would wait for.
    // Measured at 1.8s three times over, on both devices: the two-second poll
    // dominates and everything after it is noise. The bound is deliberately
    // loose - it exists to catch the watcher being dropped or its interval
    // raised to something nobody would wait for, not to police a machine.
    expect(Date.now() - started).toBeLessThan(20_000)

    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  } finally {
    await alice.context.close()
    await bob.context.close()
    await browser.close()
  }
})

test('and so does a change to a file that was already there', async () => {
  // The harder half. A new file changes the listing; an edit changes only a
  // size and a timestamp, which is all `watchFolder` compares.
  const browser = await chromium.launch()
  const alice = await side(browser, true)
  const bob = await side(browser, false)

  try {
    await pair(alice, bob)

    await writeFromOutside(alice.page, 'bearbeitet.txt', 'erste fassung')
    await expect(bob.page.locator('.tree')).toContainText('bearbeitet.txt', { timeout: 30_000 })

    // What Bob shows for it now, so the change can be told from the arrival.
    const row = bob.page.locator('.file', { hasText: 'bearbeitet.txt' })
    const before = await row.innerText()

    await writeFromOutside(alice.page, 'bearbeitet.txt', 'zweite fassung, deutlich laenger als die erste')

    // The row carries the size, so a different size is the edit having crossed.
    await expect.poll(() => row.innerText(), { timeout: 30_000 }).not.toBe(before)
  } finally {
    await alice.context.close()
    await bob.context.close()
    await browser.close()
  }
})
