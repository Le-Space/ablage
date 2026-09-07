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
 * **Two things were wrong, and only both together fixed it.**
 *
 * `fs.cat` was called with no signal, so bitswap waited for a block that could
 * not come. It takes `AbortOptions`; an earlier attempt raced the iterator from
 * outside instead and changed nothing, which is why the cause looked mysterious
 * for a while.
 *
 * And `reconcile` let the first failure out of its loop, ending the whole pass.
 * A folder is many independent decisions, and one of them going wrong says
 * nothing about the rest. Each path is settled on its own now, with failures
 * reported through `onFailed` rather than thrown.
 *
 * With only the deadline, the device recovered and every pass still died on the
 * unfetchable file before reaching anything else - so B's own write came back
 * *rejected* and its file was never indexed. Measured that way in between.
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

test('a file that cannot be fetched does not stop the rest of the folder', async () => {
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

    // `write` returns `pass()`, so this settles only if the queue moves. It did
    // not before: measured at 240 seconds and still waiting, and it would have
    // been any number, because nothing in the path ever gave up.
    const settled = await Promise.race([
      own.then(() => 'settled', () => 'rejected'),
      new Promise(resolve => setTimeout(() => resolve('still waiting'), 120_000))
    ])

    expect(settled, "B's own write never came back").not.toBe('still waiting')

    // **And the folder around the missing file carries on.** In the index as
    // well as on disk, so it is announced to everybody - this device is still
    // contributing, not only still receiving. That is the difference between
    // "one file is missing" and "this device has stopped syncing".
    await expect
      .poll(() => b.page.evaluate(() => window.__ablage.paths()), { timeout: 60_000 })
      .toContain('mine.txt')

    expect(await b.page.evaluate(() => window.__ablage.list())).toContain('mine.txt')

    // And the one that cannot arrive is still known about and still absent,
    // which is the honest state: a row for a file whose bytes are not here.
    expect(await b.page.evaluate(() => window.__ablage.paths())).toContain('unreachable.txt')
    expect(await b.page.evaluate(() => window.__ablage.list())).not.toContain('unreachable.txt')
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
