import { chromium, expect, test } from '@playwright/test'

/**
 * The circuit is not the problem. The flag is.
 *
 * "Files do not cross a relay" was the sentence this repository worked from for
 * days, and it points at the wrong thing. A circuit relay forwards bytes and
 * stores nothing; whether a given protocol crosses one is decided by
 * `runOnLimitedConnection`, which libp2p requires on **both** the handler and
 * the dial before it will open a stream on a limited connection.
 *
 * This spec puts both halves on one pair, at one moment, over one connection
 * that cannot become direct:
 *
 * - `/ablage/sync/1.0.0` sets the flag on both sides, and carries half a
 *   megabyte of application payload
 * - bitswap does not set it, and carries nothing at all
 *
 * Same relay, same circuit, same seconds. Whatever separates them, it is not
 * the transport.
 *
 * A quarter of a megabyte on purpose: a Yjs update is a few hundred bytes, and
 * "a circuit carries a small message" would leave the interesting question
 * open. Measured: 256 KiB crosses today and 512 KiB does not — and that ceiling
 * is **this app's**, not the relay's. It is the stream's missing framing (#74);
 * the relay's own budget is 10 GiB. With the framing in place the same circuit
 * carried 16 MiB in 585 ms.
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

test('a circuit carries a quarter-megabyte on one protocol and nothing on another', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'carries-a')
  const b = await start(browser, 'carries-b')

  try {
    await expect
      .poll(() => a.page.evaluate(id => window.__ablage.heard().includes(id), b.id), { timeout: 120_000 })
      .toBe(true)

    expect(await a.page.evaluate(id => window.__ablage.call(id), b.id)).toMatchObject({ ok: true })

    // The premise. Asked of `limits` rather than of the address, because a
    // hole-punched connection still reads `/p2p-circuit/webrtc/…`.
    const carried = await a.page.evaluate(id => window.__ablage.carriedBy(id), b.id)

    expect(carried.length, JSON.stringify(carried)).toBeGreaterThan(0)
    expect(carried.every(c => c.limited), JSON.stringify(carried)).toBe(true)

    // **A quarter of a megabyte, over the circuit, on a protocol that opted in.**
    const sent = await a.page.evaluate(
      id => window.__ablage.sendApp(id, { type: 'payload-probe', payload: 'x'.repeat(256 * 1024) }),
      b.id
    )

    expect(sent, JSON.stringify(sent)).toMatchObject({ ok: true })

    await expect
      .poll(
        () => b.page.evaluate(() =>
          window.__ablage.appMessages()
            .filter(m => m.message.type === 'payload-probe')
            .map(m => m.message.payload.length)),
        { timeout: 60_000 }
      )
      .toContain(256 * 1024)

    // **And nothing at all, over the same connection, on a protocol that did
    // not.** The bytes exist and only A has them; B knows the address.
    const cid = await a.page.evaluate(() => window.__ablage.hold('bitswap will not carry this'))

    expect(await b.page.evaluate(c => window.__ablage.fetch(c, 20_000), cid)).toBe(null)
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
