/**
 * Where a relay address comes from, and which of them answer.
 *
 * `findReachableRelays` in the library is the *rule* - baked-in addresses
 * first, discovery only if none of them answers, and everything probed before
 * it is handed back. What it deliberately does not know is where this app's
 * addresses live or how it pings one. That is here.
 *
 * ## Why both, and not one
 *
 * Measured on 2026-08-22, and the measurement is the argument. simple-todo's
 * baked production address - `pill-execute-neither-suspect.2n6.me` - still
 * resolved and still had something listening on 443, and its TLS handshake
 * broke. A baked address goes stale **silently**: nothing about the app changes,
 * the machine behind the name is simply gone.
 *
 * On the same day the Aleph channel named a live one, whose certificate
 * verified and whose port answered. So discovery is what keeps the app working
 * when the shipped address dies - and the shipped address is what keeps it from
 * contacting a third party on every start while it still works.
 *
 * ## What the channel holds
 *
 * Of ten fresh registrations that day, eight were `simple-todo-e2e-*`: test
 * VMs that were deleted without their registration being withdrawn, because
 * guests self-publish with generated keys and nobody holds the key to FORGET
 * them. The `registrationId` filter is what separates the one real relay from
 * its own project's corpses, and dropping it would hand a probe wave eight dead
 * addresses to work through before reaching the live one.
 */

const BAKED = [
  // Read from the relay's own `/multiaddrs` on 2026-08-28 rather than written
  // by hand, and verified: `Verify return code: 0` on the name below, and
  // `/health` reporting this peer id.
  //
  // **What the name it replaced teaches.** `improve-empty-grass-tent.2n6.me`
  // resolved, and TCP 443 answered, and TLS never completed - because that name
  // and this one point at *the same address*, and only one of them still has a
  // certificate there. A dead 2n6 route looks exactly like a live machine until
  // the handshake, which is why "the relay is down" was the wrong diagnosis for
  // most of a day.
  //
  // The lesson is not the address. It is that one baked name is a single point
  // of failure that fails silently - see `discoverRelays` below, and #53.
  '/dns4/mosquito-sadness-before-search.2n6.me/tcp/443/tls/ws/p2p/12D3KooWNsf7FvEmh4Z89Ty4mk4xZgUWaqUiqjsznnyn5CwKfaKB',
  '/dns6/mosquito-sadness-before-search.2n6.me/tcp/443/tls/ws/p2p/12D3KooWNsf7FvEmh4Z89Ty4mk4xZgUWaqUiqjsznnyn5CwKfaKB'
]

/** The production registration, not the test rigs that share its profile. */
const REGISTRATION_ID = 'relay:orbitdb-relay:orbitdb-relay'

/**
 * Live relays republish every six hours, so two cadences is generous and still
 * excludes anything that stopped. An orphan never refreshes, which is the only
 * signal there is that it is one.
 */
const MAX_AGE_MS = 13 * 60 * 60 * 1000

export const bakedRelayAddresses = () => [...BAKED]

/**
 * Ask the public channel, scoped hard before anything is dialled.
 *
 * @param {{ pagination?: number }} [options]
 * @returns {Promise<string[]>}
 */
export async function discoverRelays ({ pagination = 100 } = {}) {
  const { fetchAlephBootstrapPosts, selectCurrentRelayBootstrapPosts, filterRelayBootstrapPostsByProfile } =
    await import('@le-space/aleph-bootstrap')

  const posts = await fetchAlephBootstrapPosts({ pagination })
  const current = selectCurrentRelayBootstrapPosts(posts, { maxAgeMs: MAX_AGE_MS })
  const profiled = filterRelayBootstrapPostsByProfile(current, 'orbitdb-relay')

  const addresses = profiled
    .filter(post => post.content?.registrationId === REGISTRATION_ID)
    .flatMap(post => post.content?.browserMultiaddrs?.length
      ? post.content.browserMultiaddrs
      : (post.content?.multiaddrs ?? []))

  return [...new Set(addresses)]
}

/**
 * Which of these a browser could actually open.
 *
 * A dial, not a fetch: a relay's port speaks libp2p, and asking it for a web
 * page gets a 400 that says nothing about whether it would carry a connection.
 * The node is the one thing only the app has, which is why this takes it.
 *
 * @param {{ dial(address: unknown, options?: object): Promise<unknown> }} node
 * @param {(address: string) => unknown} toMultiaddr
 * @param {{ timeoutMs?: number }} [options]
 */
export function relayProbe (node, toMultiaddr, { timeoutMs = 8000 } = {}) {
  return async addresses => {
    const answered = []

    // In order, and stopping at the first: this decides which relay to use, and
    // dialling four when one would do spends somebody's battery to learn
    // nothing.
    for (const address of addresses) {
      try {
        await node.dial(toMultiaddr(address), { signal: AbortSignal.timeout(timeoutMs) })
        answered.push(address)
        break
      } catch {
        // Unreachable, wrong certificate, gone. All the same answer here.
      }
    }

    return answered
  }
}

/**
 * Which relay to start with, and why the answer has to be remembered.
 *
 * `createPeer` fixes the bootstrap list when the node is made, so the addresses
 * have to exist *before* the first line of networking runs. The introduction's
 * check finds a reachable relay and used to throw the answer away, which left
 * the next start knowing that a relay was wanted and not which one - and an
 * empty list is `peerDiscovery: []`, so the app connected to nothing and heard
 * nobody while looking entirely healthy.
 *
 * Remembered first, baked second. The remembered one answered a probe on this
 * device; the baked ones are only where to look when it stops.
 *
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * @param {string} key
 * @returns {string[]}
 */
export function startupRelays (storage, key) {
  const seen = new Set()

  return [...recallRelays(storage, key), ...bakedRelayAddresses()]
    .filter(address => address && !seen.has(address) && seen.add(address))
}

/**
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * @param {string} key
 * @returns {string[]}
 */
export function recallRelays (storage, key) {
  try {
    const stored = JSON.parse(storage?.getItem(key) ?? '[]')

    return Array.isArray(stored) ? stored.filter(a => typeof a === 'string' && a !== '') : []
  } catch {
    // Absent, unparsable, or a storage the browser refused. All of them mean
    // the same thing here: nothing remembered, fall back to the baked list.
    return []
  }
}

/**
 * @param {Pick<Storage, 'setItem'> | null | undefined} storage
 * @param {string} key
 * @param {readonly string[]} addresses
 */
export function rememberRelays (storage, key, addresses) {
  const keep = [...(addresses ?? [])].filter(a => typeof a === 'string' && a !== '')

  if (keep.length === 0) return

  try {
    storage?.setItem(key, JSON.stringify(keep))
  } catch {
    // A full or blocked store. The app works without the memory - it just
    // starts from the baked list next time.
  }
}
