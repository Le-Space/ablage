import { chromium, expect, test } from '@playwright/test'

/**
 * Sixty-four megabytes, sent two ways, and what the write buffer did.
 *
 * #74 says large messages are lost. They were - and that was the framing, which
 * #83 fixed: 16 MiB now crosses a relay-only connection with the send path
 * untouched. So the remaining question was what ignoring `send()`'s answer
 * actually costs, and it is not loss. Measured on the ordinary path:
 *
 *     { sent: 64, refused: 64, threw: 0, peakBuffer: 66587382 }
 *
 * **Every single write was refused and every single one was accepted anyway.**
 * Nothing was lost at any size tried; sixty-three megabytes simply sat in the
 * browser waiting to go out. On a phone that is a way to lose the tab, and it
 * is exactly the shape a file transfer would have (#72).
 *
 * So this spec is a comparison, not a pass/fail on the old path: the same
 * payload, the same stream, the same run, sent both ways.
 *
 *     ordinary: { refused: 64/64,     peakBuffer: 66587382 }
 *     sendBulk: { refused: 16/1088,   peakBuffer: 0 }
 *
 * Sixty-four megabytes in sixty-four writes queues all of it. The same
 * megabytes in 1088 blocks of 64 KiB queues none: each block is small enough to
 * be handed straight to the transport, and on the sixteen occasions it was not,
 * `sendBulk` waited.
 *
 * **`refused` is asserted, not just printed.** A buffer that stays small
 * because the waiting never engaged would prove nothing, and this spec would
 * pass just as happily.
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

test('the same payload buffers megabytes one way and kilobytes the other', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'push-a')
  const b = await start(browser, 'push-b')

  try {
    await expect
      .poll(() => a.page.evaluate(id => window.__ablage.heard().includes(id), b.id), { timeout: 120_000 })
      .toBe(true)

    expect(await a.page.evaluate(id => window.__ablage.call(id), b.id)).toMatchObject({ ok: true })
    expect(await a.page.evaluate(id => window.__ablage.spokenWith(id), b.id)).toBe('/ablage/sync/1.1.0')

    const raw = await a.page.evaluate(
      id => window.__ablage.pushHard(id, { count: 64, bytes: 1024 * 1024 }),
      b.id
    )

    console.log('MESSUNG ordinary send():', JSON.stringify(raw))

    // Nothing is lost either way. That is the point being recorded: the old
    // path is wasteful, not broken, and a fix sold as stopping loss would be
    // sold on the wrong claim.
    await expect
      .poll(
        () => b.page.evaluate(() =>
          window.__ablage.appMessages().filter(m => m.message.type === 'push-probe').length),
        { timeout: 180_000 }
      )
      .toBe(64)

    expect(raw.refused, 'the stream did ask us to stop').toBeGreaterThan(0)
    expect(raw.threw, 'and it never threw - so this was never a loss').toBe(0)

    const bulk = await a.page.evaluate(
      id => window.__ablage.pushBulk(id, { count: 64, bytes: 1024 * 1024 }),
      b.id
    )

    console.log('MESSUNG sendBulk():', JSON.stringify(bulk))

    expect(bulk.threw, JSON.stringify(bulk)).toBe(0)
    expect(bulk.sent).toBe(64)

    // It really split the payload: 1 MiB in 64 KiB blocks, plus the frame.
    expect(bulk.blocks, JSON.stringify(bulk)).toBeGreaterThan(64 * 16)

    // And the waiting really engaged. Without this, a `sendBulk` that never
    // waited would pass every other assertion here.
    expect(bulk.refused, 'the stream pushed back and we waited').toBeGreaterThan(0)

    await expect
      .poll(
        () => b.page.evaluate(() =>
          window.__ablage.appMessages().filter(m => m.message.type === 'push-probe').length),
        { timeout: 180_000 }
      )
      .toBe(128)

    // **The measurement.** Not a ratio picked to look good: the ordinary path
    // queued the whole payload, and a path that waits should stay near the
    // stream's own high-water mark whatever that turns out to be.
    console.log(`MESSUNG Puffer: ordinary ${raw.peakBuffer} -> bulk ${bulk.peakBuffer}`)

    // A hundredth, not a tenth: the measured difference is 66 MiB against
    // nothing, so a threshold near the old value would pass on a fix that
    // barely worked.
    expect(bulk.peakBuffer, `ordinary ${raw.peakBuffer}, bulk ${bulk.peakBuffer}`)
      .toBeLessThan(raw.peakBuffer / 100)
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
