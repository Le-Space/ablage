import { chromium, expect, test } from '@playwright/test'

/**
 * Asking a device to share, and hearing the answer.
 *
 * A refusal used to be indistinguishable from a connection dropping: the other
 * side closed the stream and said nothing, so the device that asked was left
 * with "gone" for something it had actually been answered.
 *
 * What is exercised here is the wire half - that a refusal sent immediately
 * before a close still arrives. The state line it produces is one line in
 * `main.js` and is not reachable from the harness, which is said here rather
 * than implied by a green tick.
 */

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const side = async (browser, name) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n), name)

  return { page, context }
}

const pair = async (a, b) => {
  const offer = await a.page.evaluate(() => window.__ablage.createOffer())
  const answer = await b.page.evaluate(o => window.__ablage.acceptOffer(o), offer)

  return a.page.evaluate(ans => window.__ablage.acceptAnswer(ans), answer)
}

test('a refusal arrives before the stream it closes', async () => {
  const browser = await chromium.launch()
  const a = await side(browser, 'ask-a')
  const b = await side(browser, 'ask-b')

  try {
    const bId = await b.page.evaluate(() => window.__ablage.peerId())

    await pair(a, b)
    await expect.poll(() => b.page.evaluate(() => window.__ablage.syncPeers())).toBe(1)

    const aId = await a.page.evaluate(() => window.__ablage.peerId())

    expect(await b.page.evaluate(id => window.__ablage.refuse(id), aId)).toBe(true)

    // The message, not the disconnection. `close()` flushes what was written
    // before it ends the stream, so the refusal beats it - checked by closing
    // with no pause at all, three runs, message present each time. The pause
    // this replaced was guarding against something that does not happen.
    await expect
      .poll(() => a.page.evaluate(() => window.__ablage.appMessages().map(m => m.message.type)))
      .toContain('sync-refused')

    expect(bId).toMatch(/^12D3Koo/)
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
