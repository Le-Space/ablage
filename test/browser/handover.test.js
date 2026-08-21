import { chromium, expect, test } from '@playwright/test'

/**
 * What each side's screen does once the two are actually connected.
 *
 * Separate contexts rather than two pages, for the reason `sync.test.js` gives:
 * two devices do not share an origin's storage, and sharing one would make this
 * pass for the wrong reason.
 *
 * The camera is the one part no automation can drive, so the scan is delivered
 * as the `scan` event the element itself emits. That is the element's contract
 * and the same text a real scan would carry - what is skipped is the lens, not
 * the handling.
 */

test.describe.configure({ mode: 'serial' })

// Two nodes, two peer connections and a real ICE handshake, on one machine.
test.setTimeout(180_000)

const openSide = async browser => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []

  page.on('pageerror', error => errors.push(error.message))

  // The machine these tests are written on has a camera; the container they run
  // in does not. Taking it away here means a laptop run and a CI run put the
  // same question, instead of the laptop answering an easier one - which is how
  // the first version of this file passed locally and failed every run on CI.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Requested device not found', 'NotFoundError'))
  })

  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled()

  return { page, context, errors }
}

const isOpen = page => page.evaluate(() => document.getElementById('invite-box').open)

/**
 * Hand a reply over the way somebody without a camera would.
 *
 * Not the camera. `getUserMedia` in a CI container answers "Requested device
 * not found", and the first version of this file pressed the scan button and
 * then asserted the page threw nothing - two conditions that cannot both hold
 * where there is no camera. It passed on a laptop and failed every run on CI.
 *
 * None of these tests is *about* the camera, so none of them opens one. The
 * lens stays the one part nothing here covers, which the README says.
 */
const handReply = async (page, reply) => {
  await page.locator('#paste-fold summary').click()
  await page.locator('#reply-text').fill(reply)
  await page.locator('#use-reply').click()
}

test('both codes leave the screen once the two are connected', async () => {
  const browser = await chromium.launch()
  const alice = await openSide(browser)
  const bob = await openSide(browser)

  try {
    // Alice shows hers.
    await alice.page.locator('#invite').click()
    await expect.poll(() => isOpen(alice.page), { timeout: 60_000 }).toBe(true)
    const invite = await alice.page.locator('#invite-link').inputValue()

    // Bob arrives by that link, answers it, and shows his own code back.
    await bob.page.goto(invite.replace(/#/, '?intro=off#'))
    await expect.poll(() => isOpen(bob.page), { timeout: 60_000 }).toBe(true)
    const reply = await bob.page.locator('#invite-link').inputValue()

    expect(reply).toMatch(/#r=/)

    // Alice takes it in.
    await handReply(alice.page, reply)

    // Alice's box closes when she accepts a reply, and always did.
    await expect.poll(() => isOpen(alice.page), { timeout: 60_000 }).toBe(false)

    // Bob's is the one that used to stay. He has no moment of his own: nobody
    // pressed anything on his device, the other one dialled in. A code still on
    // screen after the two are syncing reads as a handshake that did not
    // finish, and it is the last thing he was told to do.
    await expect.poll(() => isOpen(bob.page), { timeout: 60_000 }).toBe(false)

    // And it closed because they connected, not because something threw.
    await expect(bob.page.locator('#link-state')).toHaveClass(/is-connected/)
    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  } finally {
    await alice.context.close()
    await bob.context.close()
    await browser.close()
  }
})

test('a reply that arrived as text finishes the pairing too', async () => {
  // The reply cannot be a link that opens a page. This device is holding a peer
  // connection waiting for that exact answer, and it lives in memory - loading
  // the page again takes the pending offer with it. So the way in is a field on
  // the page that made the offer, and this is the test that it works.
  const browser = await chromium.launch()
  const alice = await openSide(browser)
  const bob = await openSide(browser)

  try {
    await alice.page.locator('#invite').click()
    await expect.poll(() => isOpen(alice.page), { timeout: 60_000 }).toBe(true)
    const invite = await alice.page.locator('#invite-link').inputValue()

    await bob.page.goto(invite.replace(/#/, '?intro=off#'))
    await expect.poll(() => isOpen(bob.page), { timeout: 60_000 }).toBe(true)
    const reply = await bob.page.locator('#invite-link').inputValue()

    await handReply(alice.page, reply)

    await expect(alice.page.locator('#link-state')).toHaveClass(/is-connected/, { timeout: 60_000 })
    await expect.poll(() => isOpen(alice.page), { timeout: 60_000 }).toBe(false)
    await expect.poll(() => isOpen(bob.page), { timeout: 60_000 }).toBe(false)

    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  } finally {
    await alice.context.close()
    await bob.context.close()
    await browser.close()
  }
})

test('pasting the invite back says which of the two links it wanted', async () => {
  const browser = await chromium.launch()
  const alice = await openSide(browser)

  try {
    await alice.page.locator('#invite').click()
    await expect.poll(() => isOpen(alice.page), { timeout: 60_000 }).toBe(true)
    const invite = await alice.page.locator('#invite-link').inputValue()

    // The easy mistake: two links are on screen during a handover and they look
    // alike. Left to `acceptAnswer`, the error would be about a payload.
    await handReply(alice.page, invite)

    await expect(alice.page.locator('#link-state')).toContainText('#r=')
    // And the invite is still up, because nothing was accepted.
    expect(await isOpen(alice.page)).toBe(true)
  } finally {
    await alice.context.close()
    await browser.close()
  }
})

test('the answering side can invite somebody itself afterwards', async () => {
  const browser = await chromium.launch()
  const alice = await openSide(browser)
  const bob = await openSide(browser)

  try {
    await alice.page.locator('#invite').click()
    await expect.poll(() => isOpen(alice.page), { timeout: 60_000 }).toBe(true)
    const invite = await alice.page.locator('#invite-link').inputValue()

    await bob.page.goto(invite.replace(/#/, '?intro=off#'))
    await expect.poll(() => isOpen(bob.page), { timeout: 60_000 }).toBe(true)

    // Showing a *reply* hides both ways of taking one, which is right - there
    // is nothing to take. They stayed hidden for the rest of the session, so
    // Bob's own first invite had no way to be finished.
    await expect(bob.page.locator('#scan-reply')).toBeHidden()

    await bob.page.evaluate(() => document.getElementById('invite-box').close())
    await bob.page.locator('#invite').click()
    await expect.poll(() => isOpen(bob.page), { timeout: 60_000 }).toBe(true)

    await expect(bob.page.locator('#scan-reply')).toBeVisible()
    await expect(bob.page.locator('#paste-fold')).toBeVisible()
  } finally {
    await alice.context.close()
    await bob.context.close()
    await browser.close()
  }
})
