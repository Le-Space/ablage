/**
 * What the Aleph registration currently names, for baking into a build.
 *
 * **The baked list has gone stale three times in two weeks.** A relay is
 * redeployed, gets a new peer id, and the address written into
 * `relay-sources.js` by hand points at a machine that no longer exists. The app
 * recovers - `find-a-relay.js` asks the registration after fifteen seconds -
 * but every start pays those fifteen seconds for a fact that was knowable at
 * build time.
 *
 * So the build asks instead. `VITE_RELAY_ADDRESSES` replaces the baked list,
 * and the hand-written one in `relay-sources.js` stays as the fallback for when
 * this lookup fails - which it may, since it is somebody else's API.
 *
 * Prints nothing on failure and exits 0: a deploy that cannot reach Aleph
 * should still ship, with the addresses the source carries.
 */
import { discoverRelays } from '../src/relay-sources.js'

try {
  const addresses = await discoverRelays({})

  // Browser-dialable only. A `/tls/sni/…/ws` or plain `/ws` entry is in the
  // registration for other kinds of peer and would only be dialled and fail.
  const browserDialable = addresses.filter(address => address.includes('/tls/ws'))

  if (browserDialable.length > 0) {
    process.stdout.write(browserDialable.join(','))
  }
} catch {
  // Somebody else's machine. The build carries on with what is in the source.
}
