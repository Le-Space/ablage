import { chromium, expect, test } from '@playwright/test'

/**
 * More than one peer at a time.
 *
 * It used to be one, by construction rather than by design: `attach` kept a
 * single provider, so a second connection replaced the first with no disconnect
 * and no message - and the first stream's read loop went on calling the
 * *shared* binding, feeding one peer's messages into the channel talking to
 * another.
 *
 * The `Provider` was already built for several: `origin === this` suppresses the
 * echo only back to the peer an update came from, so a change from B reaches C
 * through A and is never returned to B. That forwarding is what the third test
 * here is about, and it is the reason this matters beyond bookkeeping.
 */

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const startSide = async (browser, name) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []

  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n), name)

  return { page, context, errors }
}

/** The handshake, programmatically. Cameras are libp2p-webrtc-qr's problem. */
const pair = async (inviter, joiner) => {
  const offer = await inviter.page.evaluate(() => window.__ablage.createOffer())
  const answer = await joiner.page.evaluate(o => window.__ablage.acceptOffer(o), offer)
  await inviter.page.evaluate(ans => window.__ablage.acceptAnswer(ans), answer)
}

const eventually = async (page, path, timeout = 30_000) => {
  const until = Date.now() + timeout

  while (Date.now() < until) {
    const text = await page.evaluate(p => window.__ablage.read(p), path)
    if (text != null) return text
    await page.waitForTimeout(250)
  }

  return null
}

test('a second peer joins without displacing the first', async () => {
  const browser = await chromium.launch()
  const a = await startSide(browser, 'many-a')
  const b = await startSide(browser, 'many-b')
  const c = await startSide(browser, 'many-c')

  try {
    await pair(a, b)
    expect(await a.page.evaluate(() => window.__ablage.syncPeers())).toBe(1)

    await pair(a, c)

    // Two, not one. This is the assertion the old code could not pass: the
    // second provider overwrote the first and the count stayed at one.
    expect(await a.page.evaluate(() => window.__ablage.syncPeers())).toBe(2)
    expect(await a.page.evaluate(() => window.__ablage.connections())).toBe(2)

    expect(a.errors).toEqual([])
  } finally {
    await a.context.close()
    await b.context.close()
    await c.context.close()
    await browser.close()
  }
})

test('a file from the middle reaches both of the others', async () => {
  const browser = await chromium.launch()
  const a = await startSide(browser, 'mid-a')
  const b = await startSide(browser, 'mid-b')
  const c = await startSide(browser, 'mid-c')

  try {
    await pair(a, b)
    await pair(a, c)

    await a.page.evaluate(() => window.__ablage.write('von-a.txt', 'hallo von A'))

    // Both, not whichever connected last.
    expect(await eventually(b.page, 'von-a.txt')).toBe('hallo von A')
    expect(await eventually(c.page, 'von-a.txt')).toBe('hallo von A')
  } finally {
    await a.context.close()
    await b.context.close()
    await c.context.close()
    await browser.close()
  }
})

test('and a file from one edge crosses to the other, through the middle', async () => {
  const browser = await chromium.launch()
  const a = await startSide(browser, 'edge-a')
  const b = await startSide(browser, 'edge-b')
  const c = await startSide(browser, 'edge-c')

  try {
    await pair(a, b)
    await pair(a, c)

    // B and C never met. Only A is connected to both.
    await b.page.evaluate(() => window.__ablage.write('von-b.txt', 'hallo von B'))

    expect(await eventually(a.page, 'von-b.txt')).toBe('hallo von B')

    // The forwarding: A applies B's update, which makes A's provider for C send
    // it on. Nothing sends it back to B, because that provider is the origin.
    expect(await eventually(c.page, 'von-b.txt')).toBe('hallo von B')

    expect(a.errors).toEqual([])
    expect(b.errors).toEqual([])
    expect(c.errors).toEqual([])
  } finally {
    await a.context.close()
    await b.context.close()
    await c.context.close()
    await browser.close()
  }
})

test('a folder keeps its own id when another folder syncs with it', async () => {
  // The property the exclusion exists for. An id that replicated would land in
  // the other side's folder and overwrite their identity with ours - two
  // folders claiming to be the same one, and neither able to say otherwise.
  const browser = await chromium.launch()
  const a = await startSide(browser, 'id-a')
  const b = await startSide(browser, 'id-b')

  try {
    const idA = await a.page.evaluate(() => window.__ablage.identity())
    const idB = await b.page.evaluate(() => window.__ablage.identity())

    expect(idA).not.toBe(idB)

    await pair(a, b)
    await a.page.evaluate(() => window.__ablage.write('geteilt.txt', 'hallo'))
    expect(await eventually(b.page, 'geteilt.txt')).toBe('hallo')

    // The file crossed. The id did not.
    expect(await b.page.evaluate(() => window.__ablage.identity())).toBe(idB)
    expect(await a.page.evaluate(() => window.__ablage.identity())).toBe(idA)

    // And neither folder lists the other's - nor its own, which is what keeps
    // it out of the index in the first place.
    expect(await a.page.evaluate(() => window.__ablage.list())).toEqual(['geteilt.txt'])
    expect(await b.page.evaluate(() => window.__ablage.list())).toEqual(['geteilt.txt'])
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
