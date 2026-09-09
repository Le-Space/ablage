import { chromium, expect, test } from '@playwright/test'

/**
 * The file crosses the circuit after all — by the other door.
 *
 * #72, measured both ways in one run, on one connection that cannot become
 * direct:
 *
 * - **bitswap** does not set `runOnLimitedConnection` and cannot be made to
 *   (ipfs/helia#1124), so the bytes never arrive. `file-over-circuit.test.js`
 *   pins that deliberately.
 * - **the sync stream** sets it on both sides, so the same bytes cross in a
 *   second when they are asked for over it instead.
 *
 * The contrast is the point. A spec that only showed the new path working would
 * leave open whether anything was ever wrong; asking for the same content
 * address both ways, on the same pair, in the same seconds, does not.
 *
 * What makes it safe to write to a folder is not who answered but what they
 * answered: the bytes are hashed the same way they would have been on the way
 * in, and a mismatch is refused. `file-transfer.test.js` covers that in a
 * second; this covers that it survives a real stream.
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

test('bitswap cannot fetch it over a circuit and the sync stream can', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const holder = await start(browser, 'file-holder')
  const asker = await start(browser, 'file-asker')

  try {
    await expect
      .poll(() => asker.page.evaluate(id => window.__ablage.heard().includes(id), holder.id), { timeout: 120_000 })
      .toBe(true)

    expect(await asker.page.evaluate(id => window.__ablage.call(id), holder.id)).toMatchObject({ ok: true })

    // The premise, asked of `limits` rather than of the address: a hole-punched
    // connection still reads `/p2p-circuit/webrtc/…`.
    const carried = await asker.page.evaluate(id => window.__ablage.carriedBy(id), holder.id)

    expect(carried.length, JSON.stringify(carried)).toBeGreaterThan(0)
    expect(carried.every(c => c.limited), JSON.stringify(carried)).toBe(true)

    const text = 'the brief nobody could fetch until now'
    const cid = await holder.page.evaluate(t => window.__ablage.hold(t), text)

    // **The old way, on this connection.** Short deadline on purpose: the
    // failure is a wait that never ends, so a long one only costs minutes.
    const viaBitswap = await asker.page.evaluate(c => window.__ablage.fetch(c, 15_000), cid)

    console.log('MESSUNG bitswap:', JSON.stringify(viaBitswap))

    // `fetch` gives back the text, or null when it could not get it - so null
    // here *is* the refusal. The first version of this line asked for `.got`
    // and read a property of null, which failed loudly for the wrong reason
    // while the measurement underneath was already right.
    expect(viaBitswap, 'bitswap still refuses a limited connection').toBe(null)

    // **The other door, same pair, same seconds.**
    const viaStream = await asker.page.evaluate(
      ([id, c]) => window.__ablage.askPeerForFile(id, c),
      [holder.id, cid]
    )

    console.log('MESSUNG sync stream:', JSON.stringify(viaStream))

    expect(viaStream.refused, JSON.stringify(viaStream)).toBe(null)
    expect(viaStream.got).toBe(text)
  } finally {
    await holder.context.close()
    await asker.context.close()
    await browser.close()
  }
})

test('and a peer that does not have it says so instead of going quiet', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'file-none-a')
  const b = await start(browser, 'file-none-b')

  try {
    await expect
      .poll(() => b.page.evaluate(id => window.__ablage.heard().includes(id), a.id), { timeout: 120_000 })
      .toBe(true)

    expect(await b.page.evaluate(id => window.__ablage.call(id), a.id)).toMatchObject({ ok: true })

    // Silence is the state #72 describes: a row for a file whose contents never
    // come, with no error anywhere. An answer, even a no, is the improvement.
    const out = await b.page.evaluate(
      id => window.__ablage.askPeerForFile(id, 'bafkreiadummyaddressnobodyhas000000000000000000000000000', 20_000),
      a.id
    )

    console.log('MESSUNG missing:', JSON.stringify(out))

    expect(out.got).toBe(null)
    expect(out.refused, JSON.stringify(out)).toMatch(/not here/i)
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
