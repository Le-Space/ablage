import { expect, test } from '@playwright/test'

/**
 * One call to the relay people actually use.
 *
 * Every other relay spec now runs against a relay started next to the test, so
 * that a machine nobody here administers cannot fail this repository's suite.
 * That trade has a cost: a relay can drift from what the app expects and no
 * test would notice. This is the test that notices.
 *
 * **It reports, it does not gate.** Tagged `@public` and excluded from the run
 * that guards the deploy - see `.github/workflows/deploy.yml`. On 2026-08-28 a
 * correct build could not publish because the public relay had stopped
 * advertising its own protocols in identify, and twelve red tests said nothing
 * about this code. The information was worth having; the veto was not.
 *
 * What it checks is the thing that actually broke: `@libp2p/circuit-relay-v2`
 * finds relays in what identify reports, not in what a port answers. A relay
 * that handles `hop` without advertising it reserves for nobody, and every peer
 * is left without a `/p2p-circuit` address - visible over gossipsub, reachable
 * by no one.
 */

test.describe.configure({ retries: 0 })

test.describe('the relay people actually use @public', () => {
  test.setTimeout(120_000)

  test('answers, advertises hop, and hands out a reservation', async ({ page }) => {
    await page.goto('/harness.html')
    await page.waitForFunction(() => window.__ablage != null)

    /**
     * **Asked of the registration, not of a constant.**
     *
     * This spec used to name an address. That address was deleted by a deploy's
     * own retention step, and the spec then failed for weeks against a machine
     * that no longer existed - reported as "the public relay is broken" when
     * the truth was "this file is out of date". It has now happened three times
     * in two weeks that a relay address written down by hand went stale.
     *
     * The registration is what the app itself consults when the baked list
     * fails, so asking it here checks the relay users actually reach.
     */
    const addresses = await page.evaluate(() => window.__ablage.discoverRelays())

    expect(addresses.length, 'the registration named no relay at all').toBeGreaterThan(0)

    await page.evaluate(list => { /** @type {any} */ (window).__relay = list }, addresses)

    const out = await page.evaluate(
      list => window.__ablage.probeRelay(list[0], true),
      addresses
    )

    expect(out.reason).toBe(null)
    expect(out.answered).toEqual([addresses[0]])

    // Connecting is the easy half. A relay that answers and then advertises
    // nothing is the failure this spec exists for, so the reservation is the
    // assertion that matters.
    await page.evaluate(async () => { window.__side = await window.__ablage.meetOverRelay() })

    await expect
      .poll(() => page.evaluate(() => window.__side.relayAddresses().length), { timeout: 60_000 })
      .toBeGreaterThan(0)
  })
})
