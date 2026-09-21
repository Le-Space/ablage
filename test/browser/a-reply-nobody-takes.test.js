import { chromium, expect, test } from '@playwright/test'

/**
 * The answering side of a pairing that does not happen.
 *
 * Bob answers Alice's invite and shows his reply, and Alice never takes it: she
 * closed the page, lost her network, or there is no path between her network
 * and his. Bob has nothing to await - the reply is for her screen - so the only
 * one who can notice is the session, and it says so as an `error` event. This
 * is the test that the app hears it.
 *
 * Same setup as `handover.test.js`: separate contexts, and no camera.
 */

// A real ICE handshake has to start and then run out, on one machine.
test.setTimeout(240_000)

const openSide = async browser => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []

  page.on('pageerror', error => errors.push(error.message))

  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Requested device not found', 'NotFoundError'))
  })

  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled()

  return { page, context, errors }
}

const isOpen = page => page.evaluate(() => document.getElementById('invite-box').open)

test('a reply nobody takes leaves the screen, and says why', async () => {
  const browser = await chromium.launch()
  const alice = await openSide(browser)
  const bob = await openSide(browser)

  try {
    await alice.page.locator('#invite').click()
    await expect.poll(() => isOpen(alice.page), { timeout: 60_000 }).toBe(true)
    const invite = await alice.page.locator('#invite-link').inputValue()

    await bob.page.goto(invite.replace(/#/, '?intro=off#'))
    await expect.poll(() => isOpen(bob.page), { timeout: 60_000 }).toBe(true)
    await expect(bob.page.locator('#invite-link')).toHaveValue(/#r=/)

    // Alice goes before she takes the reply.
    await alice.context.close()

    // Bob's reply stayed up, and the status line kept telling him to show it,
    // long after the device it was for had gone.
    await expect.poll(() => isOpen(bob.page), { timeout: 150_000 }).toBe(false)
    await expect(bob.page.locator('#link-state')).toHaveClass(/is-idle/)
    await expect(bob.page.locator('#link-state')).toContainText('WebRTC connection')
    expect(bob.errors).toEqual([])
  } finally {
    await bob.context.close()
    await browser.close()
  }
})
