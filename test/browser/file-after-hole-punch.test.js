import { chromium, expect, test } from '@playwright/test'

/**
 * Two devices that met through the relay, and then left it.
 *
 * The companion to `file-over-circuit.test.js`, and between them they answer
 * "can files be transferred over a relay connection" - which turns out to be
 * two questions wearing one name.
 *
 * **Introduced by the relay, carried directly.** DCUtR uses the circuit to
 * agree on a moment, both sides dial at once, and what follows is an unlimited
 * connection that bitswap is happy to serve on. This is what normally happens,
 * and it is why file sync has always appeared to work "over a relay".
 *
 * The other spec removes that path and shows the list arriving while the bytes
 * never do (#72). Neither is the whole answer on its own.
 */
test.describe.configure({ retries: 0 })

const start = async (browser, name) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n, { overRelay: true, holePunch: true }), name)

  return { page, context, id: await page.evaluate(() => window.__ablage.peerId()) }
}

test('a file crosses once the two have left the relay', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'punch-a')
  const b = await start(browser, 'punch-b')

  try {
    await expect
      .poll(() => a.page.evaluate(id => window.__ablage.heard().includes(id), b.id), { timeout: 120_000 })
      .toBe(true)

    expect(await a.page.evaluate(id => window.__ablage.call(id), b.id)).toMatchObject({ ok: true })

    // The upgrade is a second connection beside the circuit, not a changed one.
    await expect
      .poll(() => a.page.evaluate(id => window.__ablage.carriedBy(id), b.id), { timeout: 90_000 })
      .toEqual(expect.arrayContaining([expect.objectContaining({ limited: false })]))

    expect(await b.page.evaluate(() => window.__ablage.list())).toEqual([])

    await a.page.evaluate(() => window.__ablage.write('notiz.txt', 'über den durchstoß'))

    const arrived = await b.page.evaluate(async () => {
      const until = Date.now() + 60_000

      while (Date.now() < until) {
        const files = await window.__ablage.list()

        if (files.includes('notiz.txt')) return window.__ablage.read('notiz.txt')
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      return null
    })

    expect(arrived).toBe('über den durchstoß')
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
