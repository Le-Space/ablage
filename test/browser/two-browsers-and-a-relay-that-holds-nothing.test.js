import { chromium, expect, test } from '@playwright/test'

import { RELAY_HEALTH_PORT } from '../support/local-relay.js'

/**
 * Does bitswap move a file between two browsers that each hold only an
 * unlimited connection to the relay?
 *
 * This was argued more than once, with both sides right about different
 * systems. The answer does not depend on the protocol. It depends on whether
 * **the relay has the bytes**:
 *
 * | relay                       | two unlimited relay links | bitswap between the browsers |
 * | --------------------------- | ------------------------- | ---------------------------- |
 * | holds nothing (ablage)      | yes                       | **no** - nobody to ask       |
 * | holds the block (pinning)   | yes                       | **yes** - from the relay     |
 *
 * In the second row the bytes never travel browser to browser. They travel to
 * the relay twice. It feels identical in use and is a different thing, which
 * is why the argument could go on without anybody being wrong. `orbitdb-relay`
 * is the second row; this repository's relay is the first.
 *
 * Both rows, one setup, so the difference is the relay and nothing else. Each
 * side has `holePunch: false` - no DCUtR, no `/webrtc` - and nobody calls
 * `call()`, so no circuit between the browsers is ever asked for. The relay
 * link is the only connection either has, and it is unlimited: the premise is
 * asserted, not assumed. The default flags throughout - no `overCircuits`, no
 * patch in play - so the claim as people make it is what gets measured.
 */
test.describe.configure({ retries: 0 })

const start = async (browser, name) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n, { overRelay: true, holePunch: false }), name)

  return { page, context, id: await page.evaluate(() => window.__ablage.peerId()) }
}

/** Each side: unlimited links to peers other than `other`, and any link to `other`. */
const links = (side, other) => side.page.evaluate(id => {
  const all = window.__ablage.allConnections()

  return {
    relayUnlimited: all.filter(c => c.peer !== id && !c.limited).length,
    toOther: all.filter(c => c.peer === id).map(c => ({ limited: c.limited, mux: c.multiplexer }))
  }
}, other.id)

const bothOnTheRelay = async (a, b) => {
  await expect.poll(async () => (await links(a, b)).relayUnlimited, { timeout: 120_000 }).toBeGreaterThan(0)
  await expect.poll(async () => (await links(b, a)).relayUnlimited, { timeout: 120_000 }).toBeGreaterThan(0)
  // They know of each other - bitswap has somewhere it *could* ask.
  await expect.poll(() => b.page.evaluate(id => window.__ablage.heard().includes(id), a.id), { timeout: 120_000 }).toBe(true)
}

test('a relay that holds nothing: two unlimited relay links carry no file between the browsers', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'holds-nothing-a')
  const b = await start(browser, 'holds-nothing-b')

  try {
    await bothOnTheRelay(a, b)

    const cid = await a.page.evaluate(() => window.__ablage.hold('only A has this'))
    const got = await b.page.evaluate(c => window.__ablage.fetch(c, 45_000), cid)

    console.log('MESSUNG relay holds nothing:', JSON.stringify({ got, b: await links(b, a) }))

    expect(got, 'nothing crossed - the relay has no bytes and forwards no bitswap').toBe(null)

    // And not because a circuit was tried and refused: none was ever opened.
    // bitswap asks the peers it is connected to, and B is connected to the
    // relay, which has nothing.
    expect((await links(b, a)).toOther, 'no connection between the browsers was ever made').toEqual([])
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})

test('a relay that holds the block: the same two links, and the file arrives - from the relay', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'holds-it-a')
  const b = await start(browser, 'holds-it-b')

  try {
    await bothOnTheRelay(a, b)

    // What a pinning relay does by itself, done by hand: the relay holds it.
    const text = 'the relay has this one'
    const reply = await fetch(`http://127.0.0.1:${RELAY_HEALTH_PORT}/hold`, { method: 'POST', body: text })
    const { cid } = await reply.json()

    expect(cid, 'the relay took the bytes').toMatch(/^bafk/)

    const got = await b.page.evaluate(c => window.__ablage.fetch(c, 45_000), cid)
    const after = await links(b, a)

    console.log('MESSUNG relay holds it:', JSON.stringify({ got, b: after }))

    expect(got, 'the file arrived over an unlimited link to a peer that had it').toBe(text)

    // **From the relay, not from A.** B still has no connection to A at all -
    // so this is the second row of the table: two hops to the relay, never
    // browser to browser. Same protocol as the first test; different relay.
    expect(after.toOther, 'still no connection between the browsers').toEqual([])
    expect(after.relayUnlimited).toBeGreaterThan(0)
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
