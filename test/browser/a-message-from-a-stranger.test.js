import { chromium, expect, test } from '@playwright/test'

/**
 * Somebody who is not syncing with you leaves a message, over a relay.
 *
 * The inbox in #75. A visitor on a website wants something from a folder of
 * ours, and the two halves of that wish travel differently:
 *
 * - **the files** would go by bitswap, which does not set
 *   `runOnLimitedConnection` and cannot be made to (ipfs/helia#1124), so they
 *   do not cross a circuit at all (#72)
 * - **the message** goes on the sync stream, which does set it on both sides
 *
 * A visitor almost never has a direct path to somebody's phone, so the relayed
 * connection is not the awkward case here - it is the normal one. That makes
 * this spec the one that says whether the feature exists, and it holds the pair
 * on a connection that cannot become direct for exactly that reason.
 *
 * It drives `leaveMessage`, which builds through the shipped `inboxMessage`,
 * and reads what arrives through the shipped `received`. A test that sent a
 * hand-written object would prove a literal survives a stream, which was never
 * in doubt.
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

test('a message reaches somebody over a connection that only the relay carries', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const visitor = await start(browser, 'stranger-visitor')
  const owner = await start(browser, 'stranger-owner')

  try {
    await expect
      .poll(() => visitor.page.evaluate(id => window.__ablage.heard().includes(id), owner.id), { timeout: 120_000 })
      .toBe(true)

    expect(await visitor.page.evaluate(id => window.__ablage.call(id), owner.id)).toMatchObject({ ok: true })

    // The premise, and the only reason this spec is worth its minutes. Asked of
    // `limits` rather than of the address: a hole-punched connection still
    // reads `/p2p-circuit/webrtc/…`, so the address would answer the wrong
    // question.
    const carried = await visitor.page.evaluate(id => window.__ablage.carriedBy(id), owner.id)

    expect(carried.length, JSON.stringify(carried)).toBeGreaterThan(0)
    expect(carried.every(c => c.limited), JSON.stringify(carried)).toBe(true)

    // **The message, over that circuit.**
    const left = await visitor.page.evaluate(
      id => window.__ablage.leaveMessage(id, { name: 'Jo', text: 'could I have the March export?' }),
      owner.id
    )

    expect(left, JSON.stringify(left)).toMatchObject({ ok: true })

    await expect
      .poll(() => owner.page.evaluate(() => window.__ablage.inbox().map(m => m.text)), { timeout: 60_000 })
      .toContain('could I have the March export?')

    const [said] = await owner.page.evaluate(() => window.__ablage.inbox())

    expect(said.name).toBe('Jo')
    // Taken from the connection. Noise has already established who this is, so
    // it is not something the message gets a say in.
    expect(said.from).toBe(visitor.id)
    expect(said.arrivedAt).toBeGreaterThan(0)

    // And the connection never stopped being a relayed one - a hole punch
    // partway through would have made the whole measurement meaningless.
    const after = await visitor.page.evaluate(id => window.__ablage.carriedBy(id), owner.id)

    expect(after.every(c => c.limited), JSON.stringify(after)).toBe(true)
  } finally {
    await visitor.context.close()
    await owner.context.close()
    await browser.close()
  }
})

test('a stranger does not get to say who they are', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const liar = await start(browser, 'stranger-liar')
  const owner = await start(browser, 'stranger-target')

  try {
    await expect
      .poll(() => liar.page.evaluate(id => window.__ablage.heard().includes(id), owner.id), { timeout: 120_000 })
      .toBe(true)

    expect(await liar.page.evaluate(id => window.__ablage.call(id), owner.id)).toMatchObject({ ok: true })

    // The message claims a different sender, and carries a clock from 2100.
    // Both are a stranger's input; neither is believed.
    const sent = await liar.page.evaluate(
      id => window.__ablage.sendApp(id, {
        type: 'inbox-message',
        name: 'Jo',
        text: 'trust me',
        from: 'a-peer-that-is-not-me',
        at: 4102444800000
      }),
      owner.id
    )

    expect(sent, JSON.stringify(sent)).toMatchObject({ ok: true })

    await expect
      .poll(() => owner.page.evaluate(() => window.__ablage.inbox().map(m => m.text)), { timeout: 60_000 })
      .toContain('trust me')

    const [said] = await owner.page.evaluate(() => window.__ablage.inbox())

    expect(said.from).toBe(liar.id)
    expect(said.from).not.toBe('a-peer-that-is-not-me')
    // Their clock is kept as theirs and ordered by ours, so a message from the
    // future cannot pin itself to the top of a list.
    expect(said.saidAt).toBe(4102444800000)
    expect(said.arrivedAt).toBeLessThan(4102444800000)
  } finally {
    await liar.context.close()
    await owner.context.close()
    await browser.close()
  }
})

test('a message that crossed the relay is still there after the owner reloads', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const visitor = await start(browser, 'stranger-keeps-visitor')
  const owner = await start(browser, 'stranger-keeps-owner')

  try {
    await expect
      .poll(() => visitor.page.evaluate(id => window.__ablage.heard().includes(id), owner.id), { timeout: 120_000 })
      .toBe(true)

    expect(await visitor.page.evaluate(id => window.__ablage.call(id), owner.id)).toMatchObject({ ok: true })

    expect(
      await visitor.page.evaluate(id => window.__ablage.leaveMessage(id, { name: 'Jo', text: 'read this after you come back' }), owner.id)
    ).toMatchObject({ ok: true })

    await expect
      .poll(() => owner.page.evaluate(() => window.__ablage.inbox().map(m => m.text)), { timeout: 60_000 })
      .toContain('read this after you come back')

    // The owner's page goes away and comes back - a phone that was put down,
    // a tab that was closed. The visitor is gone by then, and cannot resend.
    await visitor.context.close()
    await owner.page.reload()
    await owner.page.waitForFunction(() => window.__ablage != null)
    await owner.page.evaluate(n => window.__ablage.start(n, { overRelay: true }), 'stranger-keeps-owner')

    const after = await owner.page.evaluate(() => window.__ablage.inbox())

    expect(after.map(m => m.text)).toContain('read this after you come back')
    expect(after[0].from, 'and who said it is kept with it').toBe(visitor.id)
  } finally {
    await owner.context.close()
    await browser.close()
  }
})
