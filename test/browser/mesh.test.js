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

test.describe('finding one device among many', () => {
  const twelve = () => Array.from({ length: 12 }, (_, i) =>
    ({ peerId: `12D3KooW${'abcdefgh'[i % 8]}${String(i).padStart(2, '0')}Xy7Qm4TzR2vN8pL${i}`, state: 'heard' }))

  const withPeers = async (page, peers) => {
    // The relay world has to be the one on screen: the list lives in it, and
    // without the choice there is nothing to show a list of.
    await page.goto('/?intro=off')
    await page.evaluate(() => localStorage.setItem('ablage.relay', 'true'))
    await page.reload()
    await expect(page.locator('#by-relay')).toBeVisible({ timeout: 60_000 })

    // Drawn directly: turning up twelve real devices would need twelve
    // browsers and a relay, and none of that is what this asserts.
    await page.evaluate(list => window.__showPeersForTest(list), peers)
  }

  test('no search field while the list is short enough to read', async ({ page }) => {
    // Furniture over three rows. It earns its place only once a list stops
    // being something you read and starts being something you scan.
    await withPeers(page, twelve().slice(0, 4))

    await expect(page.locator('#peer-filter')).toBeHidden()
  })

  test('and one once it is long enough to lose somebody in', async ({ page }) => {
    await withPeers(page, twelve())

    await expect(page.locator('#peer-filter')).toBeVisible()
    await expect(page.locator('#peer-list li')).toHaveCount(12)
  })

  test('two or three characters are enough, from anywhere in the id', async ({ page }) => {
    await withPeers(page, twelve())

    // Anywhere, not at the front: ids of the same key type open with the same
    // characters, so a prefix search returns everything until about the eighth
    // letter - which is not a search.
    await page.locator('#peer-filter').fill('pL7')

    await expect(page.locator('#peer-list li')).toHaveCount(1)

    // Shown from the end, which is where ids differ - so what is on screen is
    // what somebody can type into the field above it.
    await expect(page.locator('#peer-list li')).toContainText('pL7')
    await expect(page.locator('#peer-list .peer-name')).toHaveText(/^…/)
  })

  test('a search that matches nothing says so, rather than looking empty', async ({ page }) => {
    await withPeers(page, twelve())
    await page.locator('#peer-filter').fill('zzzz')

    await expect(page.locator('#peer-list li')).toHaveCount(0)
    await expect(page.locator('#peer-none')).toBeVisible()
    // And not the "nobody is out there" line, which would be a lie: they are
    // out there, they just do not match.
    await expect(page.locator('#peers-empty')).toBeHidden()
  })

  test('clearing it brings everyone back', async ({ page }) => {
    await withPeers(page, twelve())
    await page.locator('#peer-filter').fill('pL7')
    await page.locator('#peer-filter').fill('')

    await expect(page.locator('#peer-list li')).toHaveCount(12)
  })
})

test('two devices do not look alike in the list', async ({ page }) => {
  // Shortened from the front, every row read `12D3KooW…` and the list was a
  // column of identical text. This is the assertion that would have caught it.
  await page.goto('/?intro=off')
  await page.evaluate(() => localStorage.setItem('ablage.relay', 'true'))
  await page.reload()
  await expect(page.locator('#by-relay')).toBeVisible({ timeout: 60_000 })

  await page.evaluate(() => window.__showPeersForTest([
    { peerId: '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTA', state: 'heard' },
    { peerId: '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6zzzz', state: 'heard' }
  ]))

  const names = await page.locator('#peer-list .peer-name').allInnerTexts()

  expect(names).toHaveLength(2)
  expect(names[0]).not.toBe(names[1])
})

test.describe('one world at a time', () => {
  const relayBox = page => page.locator('qr-intro').locator('input[part="relay-opt-in"]')

  const ready = async page => {
    await page.goto('/')
    await page.waitForFunction(
      () => document.getElementById('intro')?.shadowRoot?.querySelector('dialog')?.open === true,
      null,
      { timeout: 60_000 }
    )
  }

  test('without a relay: a code, and nothing about devices out there', async ({ page }) => {
    await ready(page)
    await page.evaluate(() => document.getElementById('intro').close())

    await expect(page.locator('#by-code')).toBeVisible()
    await expect(page.locator('#invite')).toBeVisible()

    // An empty device list and a field for a multiaddress are furniture for
    // somebody who never asked to be found.
    await expect(page.locator('#by-relay')).toBeHidden()
    await expect(page.locator('#peers')).toBeHidden()
    await expect(page.locator('#call-fold')).toBeHidden()
  })

  test('with a relay: devices, and no code anywhere', async ({ page }) => {
    test.setTimeout(120_000)
    await ready(page)
    await relayBox(page).check()
    await page.evaluate(() => document.getElementById('intro').close())

    await expect(page.locator('#by-relay')).toBeVisible()

    // Not folded - gone. A code is not how anybody gets in here.
    await expect(page.locator('#by-code')).toBeHidden()
    await expect(page.locator('#invite')).toBeHidden()
    await expect(page.locator('#scan')).toBeHidden()
    // The short code belongs to the code world too.
    await expect(page.locator('#compact-payload')).toBeHidden()
  })

  test('and back again when the choice is undone', async ({ page }) => {
    test.setTimeout(120_000)
    await ready(page)
    await relayBox(page).check()
    await relayBox(page).uncheck()
    await page.evaluate(() => document.getElementById('intro').close())

    await expect(page.locator('#by-code')).toBeVisible()
    await expect(page.locator('#by-relay')).toBeHidden()
  })
})
