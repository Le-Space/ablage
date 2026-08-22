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
