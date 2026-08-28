import { expect, test } from '@playwright/test'

/**
 * Which cipher actually carries a connection, asked of the connection itself.
 *
 * Both the privacy chapter and the technical half of the introduction make a
 * claim about this, and a claim in a locale file is not evidence. Two paths,
 * two answers, measured against the real relay:
 *
 *     /p2p-circuit/p2p/…          /noise      /yamux/1.0.0    limited: true
 *     /p2p-circuit/webrtc/p2p/…   native      /webrtc         limited: false
 *
 * `native` is not a gap. `@libp2p/webrtc` upgrades with `skipEncryption: true`
 * because DTLS has already done the work - libp2p takes one layer per
 * connection rather than stacking two, which is the question this answers.
 *
 * The relay is below whichever layer it is. Multiplexing sits *above* the
 * encryption, so a relay cannot read protocol names either, and cannot tell a
 * file transfer from a list update.
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

test('a relayed connection is encrypted between the two devices', async ({ page }) => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)

  const out = await page.evaluate(async () => {
    const pair = await window.__ablage.bitswapAcrossTheRelay()

    try {
      // The same patience `relay.test.js` allows. A shared runner reaching a
      // relay on the public internet is slower than a laptop, and 90s was cut
      // close enough that CI failed on the step *after* it.
      const until = Date.now() + 150_000
      while (!pair.heardEachOther() && Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      return await pair.connect()
    } finally {
      await pair.stop()
    }
  })

  expect(out, JSON.stringify(out)).toMatchObject({ ok: true })
  expect(out.address).toContain('/p2p-circuit')

  // One of the two, and never neither. `none` would mean the relay is reading
  // everything, which is the failure this exists to catch.
  expect(['/noise', 'native']).toContain(out.encryption)

  // Multiplexing above the encryption, whichever path it took.
  expect(['/yamux/1.0.0', '/webrtc']).toContain(out.multiplexer)
})
