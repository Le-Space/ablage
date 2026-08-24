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
    ({ peerId: `12D3KooW${'abcdefgh'[i % 8]}${String(i).padStart(2, '0')}Xy7Qm4TzR2vN8pL${i}`, state: 'heard', speaks: true }))

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
    { peerId: '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTA', state: 'heard', speaks: true },
    { peerId: '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6zzzz', state: 'heard', speaks: true }
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

/**
 * The seam nothing covered, and the one that was broken.
 *
 * Everything above tests one half or the other: `meetOverRelay` proves two
 * *nodes* find each other, and the filter tests draw a list from peers handed
 * straight to `showPeers`. Neither carries a peer the app actually discovered
 * into the list the app actually draws - so the app could connect to a relay,
 * hear nobody for ever, and every test would stay green.
 *
 * It did exactly that. `createPeer` was called with `relayOptIn` and no
 * addresses, `relayBootstrapList` turned that into an empty list, and an empty
 * list meant `peerDiscovery: []` - no bootstrap and no pubsub discovery at all.
 * The connection people could see came from the introduction's relay check,
 * which uses the same node and only opens the gate.
 *
 * This reaches the real relay, and that is the point again: the app is the
 * thing being asked, not a stand-in for it.
 */
test.describe('the list the app itself draws', () => {
  test.setTimeout(240_000)

  const device = async browser => {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Before the first line of the app runs: the choice is read once, at start,
    // and setting it afterwards would test a different start than the one people
    // get.
    await page.addInitScript(() => localStorage.setItem('ablage.relay', 'true'))
    await page.goto('/?intro=off')

    await expect(page.locator('#by-relay')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#my-peer')).not.toBeEmpty({ timeout: 60_000 })

    // From the title, not the text: the simple view prints the shortened id and
    // the technical one prints the whole thing, so the text says different
    // things in different views and the title says the same one in both.
    return { page, context, id: await page.locator('#my-peer').getAttribute('title') }
  }

  test('and the relay itself is not one of the devices out there', async () => {
    // What this was reported as: three rows, one of them ending `E1qTW5pkVh` -
    // the last ten characters of this app's own relay, drawn as a device
    // somebody could ask to share a folder with.
    //
    // Against the real relay on purpose. Whether it offers
    // `/ablage/sync/1.0.0` is a fact about that machine, and a fixture would
    // assert my belief about it rather than the thing itself.
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const a = await device(browser)
    const b = await device(browser)

    try {
      // Waited for, not assumed: an empty list contains no relay either, and
      // would pass this while proving nothing.
      await expect(a.page.locator('#peer-list')).toContainText(b.id.slice(-10), { timeout: 150_000 })

      const relay = '12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh'

      await expect(a.page.locator('#peer-list')).not.toContainText(relay.slice(-10))
      expect(await a.page.evaluate(() => document.getElementById('peer-list').textContent))
        .not.toContain(relay.slice(-10))
    } finally {
      await a.context.close()
      await b.context.close()
      await browser.close()
    }
  })

  test('two devices on a relay end up in each other\'s list', async () => {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const a = await device(browser)
    const b = await device(browser)

    try {
      // The ids are shortened from the end, so that is what the rows carry.
      await expect(a.page.locator('#peer-list')).toContainText(b.id.slice(-10), { timeout: 150_000 })
      await expect(b.page.locator('#peer-list')).toContainText(a.id.slice(-10), { timeout: 150_000 })
    } finally {
      await a.context.close()
      await b.context.close()
      await browser.close()
    }
  })
})

/**
 * Pressing the button, and what the other device does about it.
 *
 * The list was the first missing seam; this is the next one along. Every part
 * of the request was tested apart from somebody pressing it: `openSyncStream`
 * has its own tests, `decide` has its own tests, and the dialog has its own
 * tests - and none of them start at the button on one device and end at the
 * question on the other.
 */
test.describe('asking a device in the list to share', () => {
  test.setTimeout(240_000)

  const device = async browser => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []

    page.on('pageerror', error => errors.push(String(error?.message ?? error)))

    await page.addInitScript(() => localStorage.setItem('ablage.relay', 'true'))
    await page.goto('/?intro=off')

    await expect(page.locator('#by-relay')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#my-peer')).not.toBeEmpty({ timeout: 60_000 })

    return { page, context, errors, id: await page.locator('#my-peer').getAttribute('title') }
  }

  test('the other device is asked, rather than nothing happening', async () => {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const a = await device(browser)
    const b = await device(browser)

    try {
      // Alice's own row for Bob, found by the shortened id the row carries -
      // the list holds strangers from the shared topic too, and pressing one of
      // those would prove nothing about this.
      const row = a.page.locator('#peer-list li', { hasText: b.id.slice(-10) })

      await expect(row).toBeVisible({ timeout: 150_000 })
      await row.getByRole('button').click()

      // The whole claim: a question on the other device.
      await expect(b.page.locator('#admit-ask')).toBeVisible({ timeout: 60_000 })
      await expect(b.page.locator('#admit-who')).toHaveText(a.id)

      // And answering it connects them, rather than leaving a dialog that does
      // nothing when pressed.
      await b.page.locator('#admit-yes').click()
      await expect(b.page.locator('#link-state')).toHaveClass(/is-connected/, { timeout: 30_000 })

      expect(a.errors).toEqual([])
      expect(b.errors).toEqual([])
    } finally {
      await a.context.close()
      await b.context.close()
      await browser.close()
    }
  })
})

/**
 * The meeting place is shared, and the list used to say so.
 *
 * This app listens on orbitdb-relay's discovery topic and universal
 * connectivity's, because that is where a relay actually forwards. So it hears
 * every simple-todo browser on them - and the relay itself, which announced
 * its own presence and was drawn as a device out there, named by the last ten
 * characters of its own peer id.
 *
 * None of them offer `/ablage/sync/1.0.0`. Pressing "share" on one is a button
 * that can never be answered.
 */
test.describe('only devices that could answer', () => {
  const withHeard = async (page, peers) => {
    await page.goto('/?intro=off')
    await page.evaluate(() => localStorage.setItem('ablage.relay', 'true'))
    await page.reload()
    await expect(page.locator('#by-relay')).toBeVisible({ timeout: 60_000 })
    await page.evaluate(list => window.__showPeersForTest(list), peers)
  }

  test('something that does not speak the protocol is not a device out there', async ({ page }) => {
    await withHeard(page, [
      { peerId: '12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh', state: 'connected', speaks: false },
      { peerId: '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTA', state: 'connected', speaks: true }
    ])

    const names = await page.locator('#peer-list .peer-name').allInnerTexts()

    // The first of those is this app's own relay. It was in the list.
    expect(names).toHaveLength(1)
    expect(names[0]).toContain('j4kx6nXTA')
  })

  test('and a list of nothing but strangers reads as empty, not as a list', async ({ page }) => {
    // Not "no devices match your search" - there is no search. The panel has to
    // say the same thing it says when genuinely nobody is out there.
    await withHeard(page, [
      { peerId: '12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh', state: 'connected', speaks: false }
    ])

    await expect(page.locator('#peer-list')).toBeEmpty()
    await expect(page.locator('#peers-empty')).toBeVisible()
    await expect(page.locator('#peer-none')).toBeHidden()
  })

  test('but one that has not been connected to yet is still worth showing', async ({ page }) => {
    // The measured mistake, kept as a test. Filtering down to "known to speak
    // it" emptied the list: two devices on the meeting place hear each other
    // long before either dials, and pressing "share" is what connects them.
    // Unknown is not the same answer as no.
    await withHeard(page, [
      { peerId: '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTA', state: 'heard', speaks: null }
    ])

    await expect(page.locator('#peer-list li')).toHaveCount(1)
  })

  test('and the search field counts only the devices it could find', async ({ page }) => {
    // Twelve heard, one of them able to answer: a search box over a single row
    // is furniture, and counting strangers would put it there.
    const strangers = Array.from({ length: 11 }, (_, i) =>
      ({ peerId: `12D3KooWStranger${i}Xy7Qm4TzR2vN8pLq${i}`, state: 'connected', speaks: false }))

    await withHeard(page, [
      ...strangers,
      { peerId: '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTA', state: 'heard', speaks: null }
    ])

    await expect(page.locator('#peer-filter')).toBeHidden()
  })
})
