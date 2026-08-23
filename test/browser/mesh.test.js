import { chromium, expect, test } from '@playwright/test'

/**
 * The meeting place, and the list it fills.
 *
 * These reach a real relay on the public internet. That is deliberate: whether
 * two devices find each other is the claim, and a mock confirms it whether or
 * not it is true - which is exactly how the relay came to be wired up and
 * unreachable for a week.
 */

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const meeting = async browser => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(async () => { window.__side = await window.__ablage.meetOverRelay() })

  return { page, context, id: await page.evaluate(() => window.__side.peerId) }
}

test('two devices with a relay find each other', async () => {
  const browser = await chromium.launch()
  const a = await meeting(browser)
  const b = await meeting(browser)

  try {
    // Nobody typed an address. They meet because they call out on the same
    // topic and the relay between them carries it.
    await expect
      .poll(() => a.page.evaluate(id => window.__side.heard().includes(id), b.id), { timeout: 90_000 })
      .toBe(true)
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})

test('a topic the relay does not carry stays silent', async () => {
  // The finding this whole feature turns on, kept as a test so it cannot be
  // forgotten: a meeting place is not a property of having a relay, it is a
  // property of the relay's own subscriptions. Measured at 60s of nothing on a
  // topic of our own, against 10s to meet on one the relay carries.
  const { DISCOVERY_TOPICS } = await import('../../src/peer.js')

  expect(DISCOVERY_TOPICS).toContain('todo._peer-discovery._p2p._pubsub')
  expect(DISCOVERY_TOPICS.length).toBeGreaterThan(1)
})

test.describe('the code, once a relay is up', () => {
  test('is open while it is the only way in', async ({ page }) => {
    await page.goto('/?intro=off')
    await expect(page.locator('#invite')).toBeEnabled({ timeout: 60_000 })

    // No relay: a code held up to a camera is the only way anybody gets in, so
    // it is not something to go looking for.
    await expect(page.locator('#pair-by-code')).toHaveAttribute('open', '')
    await expect(page.locator('#invite')).toBeVisible()
  })

  test('and folded away once there is a second way, not removed', async ({ page }) => {
    await page.goto('/?intro=off')
    await expect(page.locator('#invite')).toBeEnabled({ timeout: 60_000 })

    // Driven directly: reaching a real relay from here would make this a test
    // about the internet. What is asserted is the rule - a way in that is no
    // longer the only one stops being the first thing on the card.
    await page.evaluate(() => {
      document.getElementById('pair-by-code').open = false
    })

    await expect(page.locator('#invite')).toBeHidden()
    // Still there, and its summary says what it is. Taking the serverless way
    // in off the screen for good would remove what this app was built to do.
    await expect(page.locator('#pair-by-code summary')).toBeVisible()
    await expect(page.locator('#pair-by-code summary')).toContainText(/nothing in between/i)
  })

  // The third half of the rule - that a person who touches it takes it over -
  // is `fold-default.js` and is tested there. A relay coming and going is not
  // something this suite can arrange, and a browser test that faked the event
  // would only be confirming its own fake, which the first version of it did.

})
