import { expect, test } from '@playwright/test'

/**
 * Does the second way in actually carry anything?
 *
 * Everything about the relay was wired without a single connection ever having
 * gone through one. Two things were wrong, and they hid each other: the node
 * had no way to negotiate an ordinary connection, and its own gate refused the
 * check that would have said so.
 *
 * This test reaches a relay on the public internet. That is deliberate and it
 * is the point - a mock would have passed all along.
 */

/**
 * **No retries here, and that is a cost decision.**
 *
 * Retries are for flaky tests. This one's failure mode is not flakiness - it is
 * waiting out a discovery timeout, which takes 150 seconds and then fails for
 * the same reason it failed the first time. In CI that turned one red test into
 * 513 seconds, and seven of them ate 1056 of the job's 1200-second budget: the
 * run was cancelled at test 121 of 436, having reported nothing at all.
 *
 * Fast when it passes, cheap when it does not.
 */
test.describe.configure({ retries: 0 })

const RELAY = '/dns4/mosquito-sadness-before-search.2n6.me/tcp/443/tls/ws/p2p/12D3KooWNsf7FvEmh4Z89Ty4mk4xZgUWaqUiqjsznnyn5CwKfaKB'

const harness = async page => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
}

test.describe('reaching a relay', () => {
  test.setTimeout(120_000)

  test('a node that was asked for one connects to it', async ({ page }) => {
    await harness(page)

    const out = await page.evaluate(([addr]) => window.__ablage.probeRelay(addr, true), [RELAY])

    // Before noise and yamux this was "At least one protocol must be
    // specified": the WebSocket opened and the upgrader had nothing to
    // negotiate with, because the QR transport brings its own muxer and skips
    // encryption, so neither had ever been configured.
    expect(out.reason).toBe(null)
    expect(out.answered).toEqual([RELAY])
  })

  test('and one that was not is refused by its own gate', async ({ page }) => {
    await harness(page)

    const out = await page.evaluate(([addr]) => window.__ablage.probeRelay(addr, false), [RELAY])

    // The promise in AGENTS.md: a start nobody asked anything of makes no
    // outbound call. This is that promise being kept, from the inside.
    expect(out.answered).toEqual([])
    expect(out.reason).toMatch(/gater denied/i)
  })
})

test.describe('calling somebody met through a relay', () => {
  test.setTimeout(240_000)

  const meeting = async browser => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/harness.html')
    await page.waitForFunction(() => window.__ablage != null)
    await page.evaluate(async () => { window.__side = await window.__ablage.meetAndDial() })

    return { page, context, id: await page.evaluate(() => window.__side.peerId) }
  }

  test('the sync stream opens, and arrives', async () => {
    // The step between "they see each other" and "they sync", and the one that
    // was never tested. It failed with "Cannot open protocol stream on limited
    // connection": libp2p marks a circuit-relay connection as limited and
    // refuses a protocol stream on one unless the protocol says it may. Both
    // sides have to say so; either alone is still a refusal.
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const a = await meeting(browser)
    const b = await meeting(browser)

    try {
      await expect
        .poll(() => a.page.evaluate(id => window.__side.heard().includes(id), b.id), { timeout: 120_000 })
        .toBe(true)

      const call = await a.page.evaluate(id => window.__side.call(id), b.id)

      expect(call.error).toBe(null)
      expect(call.ok).toBe(true)

      // And it landed where the application listens, rather than only leaving.
      await expect
        .poll(() => b.page.evaluate(() => window.__side.inbound()), { timeout: 30_000 })
        .toContain(a.id)
    } finally {
      await a.context.close()
      await b.context.close()
      await browser.close()
    }
  })

  test('and then the two of them get off the relay', async () => {
    // A circuit is metered - this one allows 10 GiB and twenty minutes - and
    // every byte crosses a stranger's machine. DCUtR uses the relayed
    // connection to agree on a moment, both sides dial at once, and if the
    // routers let it through the two continue directly.
    //
    // The upgrade is a *second* connection, not a changed one, so the question
    // is whether an unlimited connection appears beside the circuit.
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const a = await meeting(browser)
    const b = await meeting(browser)

    try {
      await expect
        .poll(() => a.page.evaluate(id => window.__side.heard().includes(id), b.id), { timeout: 120_000 })
        .toBe(true)

      expect((await a.page.evaluate(id => window.__side.call(id), b.id)).ok).toBe(true)

      // What it started as, so an upgrade cannot be confused with never having
      // needed one.
      const carried = await a.page.evaluate(id => window.__side.connectionsTo(id), b.id)

      expect(carried.some(c => c.address.includes('/p2p-circuit'))).toBe(true)

      await expect
        .poll(() => a.page.evaluate(id => window.__side.connectionsTo(id), b.id), { timeout: 90_000 })
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ limited: false })
        ]))
    } finally {
      await a.context.close()
      await b.context.close()
      await browser.close()
    }
  })
})

/**
 * *How* connected, not only that.
 *
 * The line said "changes travel directly between the two devices" for every
 * connection there was. Over a relay that is not true - the bytes cross
 * somebody else's machine, encrypted and unreadable to it, but through it - and
 * claiming otherwise in the one sentence somebody reads about their connection
 * makes the privacy chapter worth less.
 *
 * Against the real relay, because which of the two it turns out to be is a fact
 * about the network rather than about this code.
 */
test.describe('saying which path the bytes take', () => {
  test.setTimeout(300_000)

  test('a relayed pair says relayed, and a direct one says direct', async () => {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()

    const device = async () => {
      const context = await browser.newContext()
      const page = await context.newPage()

      await page.addInitScript(() => localStorage.setItem('ablage.relay', 'true'))
      await page.goto('/?intro=off')
      await expect(page.locator('#my-peer')).toHaveAttribute('title', /12D3Koo/, { timeout: 60_000 })

      return { page, context, id: await page.locator('#my-peer').getAttribute('title') }
    }

    const a = await device()
    const b = await device()

    try {
      const row = a.page.locator('#peer-list li', { hasText: b.id.slice(-10) })

      await expect(row).toBeVisible({ timeout: 150_000 })
      await row.getByRole('button').click()

      await expect(b.page.locator('#admit-ask')).toBeVisible({ timeout: 90_000 })
      await b.page.locator('#admit-yes').click()

      // One of the two, never the old sentence that claimed the first while
      // possibly meaning the second.
      await expect(a.page.locator('#link-state')).toHaveClass(/is-(connected|relayed)/, { timeout: 60_000 })

      const said = await a.page.locator('#link-state').innerText()
      const green = await a.page.evaluate(() =>
        document.getElementById('link-state').classList.contains('is-connected'))

      // Green is reserved for direct. If it says green it must say "directly",
      // and if it does not it must name the relay - the pairing is the claim.
      expect(said, JSON.stringify({ green, said })).toMatch(
        green ? /directly|Direkt/i : /relay|Relay/i
      )
    } finally {
      await a.context.close()
      await b.context.close()
      await browser.close()
    }
  })
})
