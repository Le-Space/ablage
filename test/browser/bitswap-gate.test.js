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

      // **Sampled, not asked once.**
      //
      // The guard closes the connection when `connection:open` fires, which is
      // a beat after the connection exists - so a single look can catch the
      // moment in between and report `limited: false` for a connection that is
      // already being torn down. That made this spec fail about one run in ten
      // on Firefox while passing alone, which is the worst way for a security
      // test to behave: it gets waved through.
      //
      // What is asserted is that no unlimited connection *stands*, so the
      // question is asked repeatedly over a few seconds and the answers are
      // kept.
      const samples = []

      for (let i = 0; i < 8; i++) {
        samples.push((await pair.connect()).limited)
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      return { heard: pair.heardEachOther(), connection: dialled, samples, ...read }
    } finally {
      await pair.stop()
    }
  })

  expect(out.heard, JSON.stringify(out)).toBe(true)
  expect(out.connection, JSON.stringify(out)).toMatchObject({ ok: true })

  // The guard's whole job: no unlimited connection to somebody with no
  // relationship stands, however hard DCUtR tries. Every sample, not the last -
  // one that flickers open and shut is still a window somebody could have used.
  expect(out.samples, JSON.stringify(out)).not.toContain(false)

  expect(out.got, JSON.stringify(out)).toBe(null)
  expect(out.error, JSON.stringify(out)).toMatch(/timed out/i)
})

/**
 * The option lifts it — with the patch in `patches/`, until helia#1124 lands.
 *
 * `@helia/bitswap` documents `runOnLimitedConnections`. Unpatched, setting it
 * does nothing, because two call sites drop the flag: the registrar topology
 * never sets `notifyOnLimitedConnection`, so bitswap is never told the peer
 * exists, and `sendMessage()` dials without merging the flag into its options.
 * **Each alone is enough to break it.** Checked across every published version
 * from 0.0.0 to 4.0.14: the option has existed in all of them and been wired to
 * neither site in any — it was never a regression, it was never finished.
 *
 * `patches/@helia+bitswap+4.0.11.patch` fixes both, and this spec measures the
 * result: with the option on, a block crosses a circuit-only connection.
 * `bitswap-gate:116` beside it measures the other half — with the option *off*,
 * the default, nothing crosses. The patch lifts the restriction only for a node
 * that asked, which is what makes it safe to carry: the default is the app's
 * claim, and it is unchanged.
 *
 * **This spec used to assert the broken behaviour on purpose** and said to
 * invert it when the fix landed. It landed as our patch rather than upstream,
 * and it is inverted. It is still a tripwire, now the other way: if the patch
 * stops applying — a bitswap version bump `patch-package` cannot match — this
 * goes red, and the thing to do is re-fit the patch or confirm upstream fixed
 * it, not to look for a regression in this repository.
 *
 * It also changes what guards a stranger. While the option was inert, a
 * stranger on the relay was refused twice over — by bitswap's own inability and
 * by the guard in `peer.js`. Now a share that turns the option on is refusing
 * them only once. That is the design (#72's per-share choice, off by default),
 * and `bitswap-gate:168` is the spec that keeps the remaining refusal honest.
 */
test('and the documented option lifts it, with the patch that helia#1124 still needs', async ({ page }) => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)

  const out = await page.evaluate(async () => {
    const pair = await window.__ablage.bitswapAcrossTheRelay({
      holePunch: false,
      admitAll: true,
      // The whole point: asking for it, and now being served.
      overCircuits: true
    })

    try {
      const cid = await pair.hold('only one side put this in its folder')
      const until = Date.now() + 150_000

      while (!pair.heardEachOther() && Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const dialled = await pair.connect()

      // Still measured, because it is what once pointed at the two call sites:
      // libp2p never refused the protocol over the circuit. The stream opened
      // when dialled by hand while a read timed out, so the fault was bitswap
      // never asking, not the transport saying no.
      const stream = await pair.canOpenBitswap()

      return { connection: dialled, stream, ...await pair.readWithoutAsking(cid, 25000) }
    } finally {
      await pair.stop()
    }
  })

  expect(out.connection, JSON.stringify(out)).toMatchObject({ ok: true, limited: true })
  expect(out.stream, JSON.stringify(out)).toMatchObject({ ok: true })

  // Inverted from the tripwire this used to be. If these go red, see the
  // comment above before looking anywhere in this repository.
  expect(out.error, JSON.stringify(out)).toBe(null)
  expect(out.got, JSON.stringify(out)).toBe('only one side put this in its folder')
})
