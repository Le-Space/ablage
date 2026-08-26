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

test.setTimeout(360_000)

test('an unadmitted peer can read a file whose address it knows', async ({ page }) => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)

  const out = await page.evaluate(async () => {
    const pair = await window.__ablage.bitswapAcrossTheRelay()

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

  // What kind of connection carried it decides what this proves. Both were
  // measured and both leak: `/p2p-circuit/p2p/…` reporting `limited: true`
  // before the hole punch existed, and `/p2p-circuit/webrtc/p2p/…` reporting
  // `limited: false` after it. So this is older than DCUtR.
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
