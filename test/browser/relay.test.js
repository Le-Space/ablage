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

const RELAY = '/dns4/improve-empty-grass-tent.2n6.me/tcp/443/tls/ws/p2p/12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh'

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
})
