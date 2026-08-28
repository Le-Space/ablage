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

      const relay = '12D3KooWNsf7FvEmh4Z89Ty4mk4xZgUWaqUiqjsznnyn5CwKfaKB'

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
      { peerId: '12D3KooWNsf7FvEmh4Z89Ty4mk4xZgUWaqUiqjsznnyn5CwKfaKB', state: 'connected', speaks: false },
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
      { peerId: '12D3KooWNsf7FvEmh4Z89Ty4mk4xZgUWaqUiqjsznnyn5CwKfaKB', state: 'connected', speaks: false }
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

/**
 * Being let in, and then actually getting the folder.
 *
 * The dialog appears and both devices say "connected" - and nothing arrives.
 * Every piece was tested: the button, the question, the answer, the provider.
 * What none of them covers is a folder that already has files in it crossing to
 * a device that has none, which is the only thing anybody presses the button
 * for.
 */
test.describe('what arrives after the answer', () => {
  test.setTimeout(300_000)

  const device = async browser => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.addInitScript(() => localStorage.setItem('ablage.relay', 'true'))
    await page.goto('/?intro=off')

    await expect(page.locator('#by-relay')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#my-peer')).not.toBeEmpty({ timeout: 60_000 })

    return { page, context, id: await page.locator('#my-peer').getAttribute('title') }
  }

  const put = (page, name, text) => page.setInputFiles('#pick', {
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(text)
  })

  test('a folder that was already full reaches the device that was let in', async () => {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const a = await device(browser)
    const b = await device(browser)

    try {
      // Full *before* anybody asks. This is the case people press the button
      // for, and the one a live update can hide: a file written afterwards
      // travels on the document's own change event and proves nothing about
      // what was already there.
      await put(a.page, 'vorher.txt', 'stand schon da')
      await expect(a.page.locator('.tree')).toContainText('vorher.txt')

      const row = a.page.locator('#peer-list li', { hasText: b.id.slice(-10) })

      await expect(row).toBeVisible({ timeout: 150_000 })
      await row.getByRole('button').click()

      await expect(b.page.locator('#admit-ask')).toBeVisible({ timeout: 60_000 })
      await b.page.locator('#admit-yes').click()

      await expect(b.page.locator('.tree')).toContainText('vorher.txt', { timeout: 90_000 })

      // And the contents, not only the name. An index entry without the bytes
      // behind it is a row that cannot be opened.
      await b.page.locator('.file .name', { hasText: 'vorher.txt' }).click({ trial: true })
    } finally {
      await a.context.close()
      await b.context.close()
      await browser.close()
    }
  })

  test('and so does one written afterwards', async () => {
    // The other half, told apart on purpose: if this passes while the one above
    // fails, the channel works and only the catch-up is missing.
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const a = await device(browser)
    const b = await device(browser)

    try {
      const row = a.page.locator('#peer-list li', { hasText: b.id.slice(-10) })

      await expect(row).toBeVisible({ timeout: 150_000 })
      await row.getByRole('button').click()

      await expect(b.page.locator('#admit-ask')).toBeVisible({ timeout: 60_000 })
      await b.page.locator('#admit-yes').click()

      await put(a.page, 'danach.txt', 'kam später')
      await expect(a.page.locator('.tree')).toContainText('danach.txt')

      await expect(b.page.locator('.tree')).toContainText('danach.txt', { timeout: 90_000 })
    } finally {
      await a.context.close()
      await b.context.close()
      await browser.close()
    }
  })
})

/**
 * Empty, and which kind of empty.
 *
 * Hiding everything that cannot answer made this list empty far more often -
 * correctly - and a panel that says "devices appear a few seconds after they
 * reach a relay" reads as *nothing here works* to somebody whose relay is
 * working perfectly and who is simply the only one here.
 *
 * The list already knows the difference: the relay is in it, filtered out of
 * the rows because it does not speak the sync protocol.
 */
test.describe('an empty list says which empty', () => {
  const show = async (page, peers) => {
    // Set *before* the first line runs and then loaded, because the node reads
    // the choice once at start. Ticking it afterwards is a different state, and
    // it has its own test above.
    await page.addInitScript(() => localStorage.setItem('ablage.relay', 'true'))
    await page.goto('/?intro=off')
    await expect(page.locator('#peers')).toBeVisible({ timeout: 60_000 })
    await page.evaluate(list => window.__showPeersForTest(list), peers)
  }

  test('there is no "switch a relay on" case left, because the panel goes with it', async ({ page }) => {
    // Written for a card that folded. It disappears now, so a line telling
    // somebody to switch the relay on could only ever be read by somebody who
    // already had - and the string it used has gone with the branch.
    await page.goto('/?intro=off')
    await expect(page.locator('#by-code')).toBeVisible({ timeout: 60_000 })

    await expect(page.locator('#peers')).toBeHidden()
    await expect(page.locator('#peers-empty')).toBeHidden()
  })

  test('ticked but not running yet, it says to reload and offers the button', async ({ page }) => {
    // The state somebody actually lands in. Ticking the box reveals this list
    // at once and leaves the node running without a relay - so "devices appear
    // a few seconds after they connect to a relay" invited a wait that could
    // not end. This is what a first-time reader sees.
    await page.goto('/?intro=off')
    await expect(page.locator('#by-code')).toBeVisible({ timeout: 60_000 })

    // What ticking the box does: the element stores the choice and announces
    // it, and the app reveals the relay half on the spot. The node it is
    // running is still the one built without a relay.
    await page.evaluate(() => {
      localStorage.setItem('ablage.relay', 'true')
      document.getElementById('intro').dispatchEvent(
        new CustomEvent('relay-opt-in', { detail: { optIn: true } })
      )
    })

    await expect(page.locator('#by-relay')).toBeVisible()
    await expect(page.locator('#peers-empty')).toContainText(/Load the page again|Laden Sie die Seite neu/i)
    await expect(page.locator('#peers-reload')).toBeVisible()
  })

  test('and once it is running, the reload button is gone', async ({ page }) => {
    // A reload button beside "nobody is here yet" is an invitation to throw
    // away a working connection.
    await show(page, [])

    await expect(page.locator('#peers-reload')).toBeHidden()
  })

  test('with a relay but nothing reached, it says it is still looking', async ({ page }) => {
    await show(page, [])

    await expect(page.locator('#peers-empty')).toContainText(/Looking for a relay|Suche ein Relay/i)
  })

  test('and once a relay answered, it says you are simply the only one here', async ({ page }) => {
    // The relay itself, connected and not speaking the sync protocol - exactly
    // what `watchPeers` reports for it. No rows, and a different sentence.
    await show(page, [
      { peerId: '12D3KooWNsf7FvEmh4Z89Ty4mk4xZgUWaqUiqjsznnyn5CwKfaKB', state: 'connected', speaks: false }
    ])

    await expect(page.locator('#peer-list')).toBeEmpty()
    await expect(page.locator('#peers-empty')).toContainText(/nobody else is here|sonst ist noch niemand da/i)
  })
})

test('a device row does not say the same word as the connection line', async ({ page }) => {
  /**
   * They both said "connected", on one card, meaning two different things: the
   * line above is whether a folder is syncing, the row below is whether libp2p
   * has a connection to that peer at all. Somebody who built this read the grey
   * row and asked why it was not green.
   *
   * "Connected" belongs to the line that is green or amber. A row says whether
   * this device could be asked, which is what the button beside it does.
   */
  await page.goto('/?intro=off')
  await page.evaluate(() => localStorage.setItem('ablage.relay', 'true'))
  await page.reload()
  await expect(page.locator('#by-relay')).toBeVisible({ timeout: 60_000 })

  await page.evaluate(() => window.__showPeersForTest([
    { peerId: '12D3KooWaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaXVKSiRV7BA', state: 'connected', speaks: true },
    { peerId: '12D3KooWbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbYhaNGLHJ5A', state: 'heard', speaks: null }
  ]))

  const rows = (await page.locator('#peer-list li').allInnerTexts()).join(' ')

  expect(rows).toMatch(/reachable|erreichbar/i)
  expect(rows).toMatch(/found on the relay|über das Relay gefunden/i)
  // The word the state line owns.
  expect(rows).not.toMatch(/\bconnected\b|\bverbunden\b/i)
})

/**
 * Whether anybody can call this device.
 *
 * Connected to a relay and reachable through one are different things, and
 * between them sits a window in which everything looks connected and nobody can
 * call you. From the other side that window reads *the dial request has no
 * valid addresses for peer …*; from this side it read as nothing at all.
 */
test.describe('saying whether this device can be reached', () => {
  test('without a relay there is nothing to say', async ({ page }) => {
    // A device reached by scanning a code has no address of this kind and does
    // not need one.
    await page.goto('/?intro=off')
    await expect(page.locator('#by-code')).toBeVisible({ timeout: 60_000 })

    await expect(page.locator('#reachable')).toBeHidden()
  })

  test('with a relay it says which of the two it is', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ablage.relay', 'true'))
    await page.goto('/?intro=off')
    await expect(page.locator('#reachable')).toBeVisible({ timeout: 60_000 })

    // One of the two, never blank - "nothing shown" is the state this replaces.
    await expect(page.locator('#reachable')).toHaveClass(/is-(reachable|waiting)/)
    await expect(page.locator('#reachable')).not.toBeEmpty()

    const said = await page.locator('#reachable').innerText()
    const reserved = await page.evaluate(() =>
      document.getElementById('reachable').classList.contains('is-reachable'))

    // The pairing is the claim: green must mean the relay accepts calls, amber
    // must say there is no address yet - and *only* that. The first version of
    // this line said "a relay answered", which is a claim about the relay that
    // was false the very afternoon it was written, with the relay hung.
    expect(said, JSON.stringify({ reserved, said })).toMatch(
      reserved ? /accepts calls|nimmt Anrufe/i : /no address|keine Adresse/i
    )
  })
})
