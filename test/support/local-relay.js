/**
 * The address of the relay the browser tests use.
 *
 * **Why a relay of our own.** These tests used to reach a relay on the public
 * internet, and that was deliberate: a mock would have passed while nothing
 * worked. What it also did was hand a machine nobody here administers a veto
 * over every deploy. On 2026-08-28 it used that veto - a build carrying a
 * correct fix could not publish, because a relay elsewhere had stopped
 * advertising its own protocols. Twenty minutes of CI, twelve red tests, and
 * not one of them about this code.
 *
 * So the relaying tests run against a relay started next to them, and one
 * separate smoke test still calls the public one - it reports, it does not
 * gate. That way "our code is broken" and "the machine out there is broken"
 * stop looking the same.
 *
 * The key is fixed so the address is known before the process starts. It is a
 * test fixture on loopback, not a secret.
 */

export const RELAY_KEY = 'CAESQBcds5Sf28MC+tb/5IqsTgWGj09gSvlE2xtITZ4UlsikO9QxoQ4zVoW/dOc2Z3PY0pfv3mQgN/I/2Z7XyBEbnvo='

export const RELAY_ID = '12D3KooWDqutUX2R1nGsEpwpHVBCyV9VqJJXHV9CoJn3V3gpt9Jy'

export const RELAY_PORT = Number(process.env.E2E_RELAY_PORT ?? 5182)

/** Where the relay answers a plain HTTP GET, so a runner can wait for it. */
export const RELAY_HEALTH_PORT = RELAY_PORT + 1

/**
 * Plaintext `ws`, which the app's own gate allows because the test pages are
 * served over `http`. On an `https` page it would be denied as mixed content,
 * which is `denyDial`'s doing and correct.
 */
export const LOCAL_RELAY = `/ip4/127.0.0.1/tcp/${RELAY_PORT}/ws/p2p/${RELAY_ID}`
