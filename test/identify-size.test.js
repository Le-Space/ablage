import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_IDENTIFY_BYTES } from '../src/peer.js'

/**
 * The ceiling on identify, and why it is not the default one.
 *
 * libp2p drops an identify response larger than `maxMessageSize` whole - not
 * the entries that made it large, the message. A peer over the line loses
 * `hop`, `bitswap` and `meshsub` from this node's view at once, and nothing is
 * logged on either side. What that looks like from the outside is a relay that
 * answers every dial, hands out no reservation, and shows up in the device list
 * because nothing is known about what it speaks.
 *
 * These are not round numbers picked for comfort. They are what the production
 * relay actually measured, and the point of the test is that the constant stays
 * above them as they grow.
 */

/** `@libp2p/identify`'s own default, which this exists to be larger than. */
const LIBP2P_DEFAULT = 8192

/** orbitdb-relay#50, measured: 122 protocols, 109 of them `/orbitdb/heads/*`. */
const MEASURED_WORST = 10538

/** The same relay once its announce list is filtered - 96% of the default. */
const MEASURED_AFTER_FILTERING = 7883

test('the ceiling is above the one that failed', () => {
  assert.ok(
    MAX_IDENTIFY_BYTES > LIBP2P_DEFAULT,
    `${MAX_IDENTIFY_BYTES} would be no better than the default that dropped the relay's identify`
  )
})

test('and above the largest response actually seen', () => {
  // The failure this is for. A ceiling under this number is a ceiling that has
  // already been crossed once in production.
  assert.ok(
    MAX_IDENTIFY_BYTES > MEASURED_WORST,
    `${MAX_IDENTIFY_BYTES} is below the ${MEASURED_WORST} bytes the relay was measured at`
  )
})

test('with room for the part that grows', () => {
  // One protocol per open database, and the relay went from 122 to 129 of them
  // within an hour. Filtering addresses left 4% of headroom against the
  // default, which is why raising the ceiling and not just filtering was
  // needed: threefold, so growth of that shape has somewhere to go.
  assert.ok(
    MAX_IDENTIFY_BYTES >= MEASURED_AFTER_FILTERING * 3,
    `${MAX_IDENTIFY_BYTES} leaves less than three times the ${MEASURED_AFTER_FILTERING} bytes a filtered relay sends`
  )
})
