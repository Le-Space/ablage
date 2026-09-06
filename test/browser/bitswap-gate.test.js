import { expect, test } from '@playwright/test'


/**
 * **What the admission dialog does not cover.**
 *
 * `admission.js` gates one protocol: `/ablage/sync/1.0.0`. Bitswap is a second
 * protocol on the same libp2p node, added by `createContent`, and nothing has
 * ever asked whether it is gated too. It is not - it serves any block it holds
 * to any peer that connects and names the address.
 *
 * Measured over the real relay, because this is a claim about what a stranger
 * on the public meeting place can do:
 *
 *     dialled: true          a plain connection, no sync stream, no dialog
 *     got:     the file
 *
 * **This test asserts today's behaviour, which is a hole.** It is written this
 * way rather than deleted so the gap cannot quietly widen, and so that whoever
 * closes it finds a red test telling them exactly what changed. When the gate
 * lands, invert the two assertions at the bottom.
 *
 * Reaching the bytes needs the address. Addresses are not published here -
 * there is no DHT and `withHTTP` is deliberately left out - so a stranger
 * learns one from a sync stream, which needs admission, or by *guessing*: a CID
 * is a hash of the content, so anyone who suspects you hold a particular known
 * file can compute its address and confirm it.
 */

/**
 * **No retries here, and that is a cost decision.**
 *
 * Retries are for flaky tests. This one's failure mode is not flakiness - it is
 * waiting out a discovery timeout, which takes 150 seconds and then fails for
 * the same reason it failed the first time. In CI that turned one red test into
 * 513 seconds, and seven of them ate 1056 of the job's 1200-second budget: the
 * run was cancelled at test 121 of 436, having reported nothing at all.
 *
 * Fast when it passes, cheap when it does not.
 */
test.describe.configure({ retries: 0 })

test.setTimeout(360_000)

test('an unadmitted peer can read a file whose address it knows', async ({ page }) => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)

  const out = await page.evaluate(async () => {
    const pair = await window.__ablage.bitswapAcrossTheRelay({ admitAll: true })

    try {
      const cid = await pair.hold('only one side put this in its folder')

      // The same patience `relay.test.js` allows. A shared runner reaching a
      // relay on the public internet is slower than a laptop, and 90s was cut
      // close enough that CI failed on the step *after* it.
      const until = Date.now() + 150_000
      while (!pair.heardEachOther() && Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // A connection and nothing else. `onSyncStream` never fires, so `decide`
      // is never asked and no dialog is ever shown.
      const dialled = await pair.connect()

      return { cid, heard: pair.heardEachOther(), connection: dialled, ...await pair.readWithoutAsking(cid) }
    } finally {
      await pair.stop()
    }
  })

  // What kind of connection carried it decides what this proves, and the first
  // reading of that was wrong. It said both paths leak - `limited: true` as
  // well as `limited: false` - and concluded the hole was older than DCUtR.
  // The spec below takes the direct path away entirely rather than reporting
  // on whichever connection `connect()` happened to name, and over a circuit
  // that is the only path there is, nothing arrives. So the earlier
  // `limited: true` reading was a second, unlimited connection standing beside
  // the one being reported.
  // Reported with the whole outcome attached: on a shared runner this is the
  // step that fails, and "expected true, received false" says nothing about
  // whether discovery worked, what addresses were known, or what the dial said.
  // Named in order, so a red run says which step broke rather than only that
  // something did.
  expect(out.heard, JSON.stringify(out)).toBe(true)
  expect(out.connection, JSON.stringify(out)).toMatchObject({ ok: true })
  expect(out.connection.address).toContain('/p2p-circuit')

  // Invert these two when bitswap is gated.
  expect(out.error).toBe(null)
  expect(out.got).toBe('only one side put this in its folder')
})


/**
 * And it cannot, when the circuit is the only path there is.
 *
 * `@helia/bitswap` registers its handler with `runOnLimitedConnection: false`,
 * so in principle a relayed connection should already refuse to serve blocks.
 * Whether it does could not be settled while a direct path was available: two
 * browsers on one machine hole-punch within seconds, and a read that succeeds
 * afterwards says nothing about what the circuit would have done.
 *
 * With `holePunch: false` there is no DCUtR and no `/webrtc` address, so the
 * circuit is the only path these two will ever have. That turns the flag into
 * something measurable.
 *
 * **What this pins down.** The gate that exists works. The hole is the
 * *upgrade*: an unadmitted stranger is refused for as long as they are stuck on
 * the relay, and served the moment DCUtR gets them off it. Which makes "do not
 * upgrade a peer nobody admitted" a smaller fix than gating bitswap by peer or
 * encrypting the blockstore - the two options #43 was weighing before this was
 * known.
 */
test('and it cannot, when the circuit is the only path there is', async ({ page }) => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)

  const out = await page.evaluate(async () => {
    const pair = await window.__ablage.bitswapAcrossTheRelay({ holePunch: false })

    try {
      const cid = await pair.hold('only one side put this in its folder')
      const until = Date.now() + 150_000

      while (!pair.heardEachOther() && Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const dialled = await pair.connect()

      return { heard: pair.heardEachOther(), connection: dialled, ...await pair.readWithoutAsking(cid) }
    } finally {
      await pair.stop()
    }
  })

  expect(out.heard, JSON.stringify(out)).toBe(true)
  expect(out.connection, JSON.stringify(out)).toMatchObject({ ok: true })

  // The premise of the whole spec. Asked of `limits` rather than of the
  // address: a hole-punched connection still reads `/p2p-circuit/webrtc/…`, so
  // the address would not tell these two apart.
  expect(out.connection.limited, JSON.stringify(out)).toBe(true)

  // And so nothing arrives.
  expect(out.got, JSON.stringify(out)).toBe(null)
  expect(out.error, JSON.stringify(out)).toMatch(/timed out/i)
})

/**
 * And a stranger is kept on the relay, where those two facts do the work.
 *
 * The two specs above bracket the problem: bitswap serves an unadmitted peer
 * over a direct connection, and refuses one over a circuit. So the hole was
 * never the circuit - it was DCUtR getting a stranger off it, after which every
 * protocol on the node is reachable at once.
 *
 * `peer.js` now closes a direct connection to a peer that was neither scanned
 * nor admitted. This is the same setup as the first spec - the hole punch is
 * available, nothing is stopping it - with the guard doing its work.
 *
 * **What this deliberately does not claim.** Somebody admitted once is served
 * for as long as they hold what they saw, and taking that back needs the blocks
 * to be useless without a key. That is #70, not this.
 */
test('and a stranger never gets the direct connection that would serve them', async ({ page }) => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)

  const out = await page.evaluate(async () => {
    // No `admitAll`, and the hole punch left available: exactly the shape that
    // leaked before the guard existed.
    const pair = await window.__ablage.bitswapAcrossTheRelay()

    try {
      const cid = await pair.hold('only one side put this in its folder')
      const until = Date.now() + 150_000

      while (!pair.heardEachOther() && Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const dialled = await pair.connect()
      const read = await pair.readWithoutAsking(cid, 20000)

      // Asked after the read rather than before it: DCUtR needs a moment, and
      // the question is whether an unlimited connection ever stands, not
      // whether one had appeared by the time we first looked.
      return { heard: pair.heardEachOther(), connection: dialled, after: await pair.connect(), ...read }
    } finally {
      await pair.stop()
    }
  })

  expect(out.heard, JSON.stringify(out)).toBe(true)
  expect(out.connection, JSON.stringify(out)).toMatchObject({ ok: true })

  // The guard's whole job: no unlimited connection to somebody with no
  // relationship, however hard DCUtR tries.
  expect(out.after.limited, JSON.stringify(out)).toBe(true)

  expect(out.got, JSON.stringify(out)).toBe(null)
  expect(out.error, JSON.stringify(out)).toMatch(/timed out/i)
})
