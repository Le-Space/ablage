import { chromium, expect, test } from '@playwright/test'

/**
 * One file nobody can serve, and everything behind it stops.
 *
 * #72 says a file does not cross a relay-only connection. What it does not say
 * is what happens *next* on the device waiting for it, and that turns out to be
 * worse than the missing file.
 *
 * `content.get(cid)` has no deadline - bitswap waits for a block for as long as
 * it is asked to - and `pass()` chains every reconciliation onto the last:
 *
 *     pending = pending.then(() => reconcile({ index, storage, content, base }))
 *
 * So a fetch that will never complete is not one missing file. It is a queue
 * that never moves again: every later change on that device, its own included,
 * waits behind a block that is not coming.
 *
 * Inverting this spec is the definition of done. When B's own write comes back
 * - failed or not - the queue is moving again and the report changes from "this
 * device has stopped syncing" to "one file is missing", which are very
 * different things to tell somebody.
 *
 * An idle deadline on `content.get` is the obvious repair and was tried: the
 * deadline itself works, measured in a browser, and wiring it into
 * `content.get` did not change this outcome. Where the wait actually happens is
 * still open - see the issue.
 */
test.describe.configure({ retries: 0 })

const start = async (browser, name) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n, { overRelay: true }), name)

  return { page, context, id: await page.evaluate(() => window.__ablage.peerId()) }
}

test('a file that cannot be fetched stops the device syncing at all', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'stall-a')
  const b = await start(browser, 'stall-b')

  try {
    await expect
      .poll(() => a.page.evaluate(id => window.__ablage.heard().includes(id), b.id), { timeout: 120_000 })
      .toBe(true)

    expect(await a.page.evaluate(id => window.__ablage.call(id), b.id)).toMatchObject({ ok: true })

    // A writes something B will learn about and can never fetch.
    await a.page.evaluate(() => window.__ablage.write('unreachable.txt', 'the bytes stay here'))

    await expect
      .poll(() => b.page.evaluate(() => window.__ablage.paths()), { timeout: 60_000 })
      .toContain('unreachable.txt')

    // Now B does something entirely of its own, touching nobody else.
    const own = b.page.evaluate(() => window.__ablage.write('mine.txt', 'written locally'))

    // `write` returns `pass()`. Before `content.get` had a deadline this never
    // settled - measured at 45 s, and it would have been any number - because
    // the reconciliation before it was waiting for a block that cannot come.
    // **This asserts the broken behaviour on purpose.** Sixty seconds is not the
    // limit - measured at 240 it had still not returned, and it would have been
    // any number, because nothing in the path ever gives up. Sixty is what this
    // spec is willing to spend to show it.
    const settled = await Promise.race([
      own.then(() => 'settled', () => 'rejected'),
      new Promise(resolve => setTimeout(() => resolve('still waiting'), 60_000))
    ])

    expect(settled).toBe('still waiting')

    // On disk, because `write` puts it there before asking for a pass - and
    // never in the index, because the pass that would put it there is behind a
    // fetch that will not return. So the file exists and is announced to
    // nobody: this device has stopped contributing as well as stopped
    // receiving.
    expect(await b.page.evaluate(() => window.__ablage.list())).toContain('mine.txt')
    expect(await b.page.evaluate(() => window.__ablage.paths())).not.toContain('mine.txt')
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
