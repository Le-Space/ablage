import { chromium, expect, test } from '@playwright/test'

/**
 * Does a file cross when the relay is the whole of the path?
 *
 * Two things are known separately and had never been put together. The sync
 * stream crosses a circuit - `relay.test.js` proves it, and that is what
 * carries the folder's *metadata*, the Yjs document listing paths and content
 * addresses. The **bytes** travel by bitswap, and `bitswap-gate.test.js` proves
 * bitswap refuses a circuit.
 *
 * Put together, those say something nobody had said out loud: on a relay-only
 * connection the list of files would arrive and the files themselves never
 * would. Silently - the row appears, the content does not.
 *
 * That is not a hypothetical network. It is two phones on mobile data behind
 * carrier NAT, which is the case this app was built for and the one that
 * started this week's work.
 *
 * The hole punch is taken away rather than waited out, so the answer cannot
 * depend on how quickly DCUtR happens to succeed on the machine running this.
 */
test.describe.configure({ retries: 0 })

const start = async (browser, name) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []

  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n, { overRelay: true }), name)

  return { page, context, errors, id: await page.evaluate(() => window.__ablage.peerId()) }
}

test('the list crosses a relay-only connection and the file does not', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'circuit-a')
  const b = await start(browser, 'circuit-b')

  try {
    await expect
      .poll(() => a.page.evaluate(id => window.__ablage.heard().includes(id), b.id), { timeout: 120_000 })
      .toBe(true)

    expect(await a.page.evaluate(id => window.__ablage.call(id), b.id)).toMatchObject({ ok: true })

    // The premise. Asked of `limits`, because a hole-punched connection still
    // reads `/p2p-circuit/webrtc/…` and the address would not tell them apart.
    const carried = await a.page.evaluate(id => window.__ablage.carriedBy(id), b.id)

    expect(carried.length, JSON.stringify(carried)).toBeGreaterThan(0)
    expect(carried.every(c => c.limited), JSON.stringify(carried)).toBe(true)

    // B has nothing yet, so an arrival below is an arrival and not shared
    // storage.
    expect(await b.page.evaluate(() => window.__ablage.list())).toEqual([])

    await a.page.evaluate(() => window.__ablage.write('notiz.txt', 'hallo über den circuit'))

    // The list is Yjs over the sync stream, and that is known to cross.
    await expect
      .poll(() => b.page.evaluate(() => window.__ablage.paths()), { timeout: 60_000 })
      .toContain('notiz.txt')

    // The bytes are bitswap, and this is the question.
    const arrived = await b.page.evaluate(async () => {
      const until = Date.now() + 60_000

      while (Date.now() < until) {
        const files = await window.__ablage.list()

        if (files.includes('notiz.txt')) return await window.__ablage.read('notiz.txt')
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      return null
    })

    // **This asserts the broken behaviour, on purpose.**
    //
    // Measured: the list arrives, the file does not - not in sixty seconds, not
    // at all. `@helia/bitswap` refuses a limited connection, and the option
    // that ought to lift that does nothing because of ipfs/helia#1124.
    //
    // Inverting this line is the definition of done for #72. When it turns
    // green on its own, the fix landed somewhere upstream and the spec should
    // be turned around rather than investigated.
    expect(arrived, 'a file crossed a circuit - see #72, and invert this').toBe(null)

    // And the list did arrive, which is what makes the failure quiet: a row
    // appears for a file whose contents will never come.
    expect(await b.page.evaluate(() => window.__ablage.paths())).toContain('notiz.txt')
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
