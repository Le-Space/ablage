/**
 * Whether this share's blocks may be served to peers we can only relay to.
 *
 * **Off, per share, and the default is the app's claim.** `content.js` composes
 * Helia by hand precisely to leave out the HTTP layer, and says why: trustless
 * gateways and delegated routing would let a file be fetched over the public
 * internet instead of the connection built by scanning a code, and *"for an app
 * whose whole claim is 'nothing in the middle', that would quietly make the
 * claim false"*. The same reasoning applies one step earlier, to bitswap over a
 * circuit: switching it on means anybody who reaches this device through a
 * relay can fetch any block of this share by address, whether or not they were
 * ever admitted to sync.
 *
 * So it is a choice somebody makes, for one share, knowing what it buys.
 *
 * **Per share is not a compromise here, it is exact.** #72 says the flag is
 * node-wide and therefore unsafe to turn on - true about the flag, wrong about
 * the consequence, because in this app the node *is* per share.
 * `blockstore-scope.test.js` measured the reason: each share runs as its own
 * peer with its own key and its own in-memory blockstore, and switching share
 * reloads the page. Another share's blocks are not guarded against this one -
 * they are not in the process at all.
 *
 * What it buys is #72's other half: with it on, a device that can only be
 * reached through a relay can fetch files by bitswap, the way a device on the
 * same Wi-Fi always could. The sync stream carries files either way
 * (`file-transfer.js`) - this is about being fetchable without being asked.
 */

import { safeStore } from './baseline.js'

/** The unsuffixed key belongs to the first share, like every other setting. */
export const FETCHABLE_STORAGE_KEY = 'ablage.fetchable'

/**
 * `storage` defaults through `safeStore`, not `globalThis.localStorage`.
 *
 * A default parameter is evaluated before any `try` inside the function, and
 * in a browser where merely reaching `localStorage` throws - some privacy
 * settings, some private windows, and `identity.test.js` on purpose - the
 * first version of this threw at module load, took `main.js` down with it,
 * and the app never showed a peer id. `baseline.js` had written that lesson
 * down already; it was just not exported.
 *
 * @param {{ key?: string, storage?: Storage | null }} [options]
 */
export function fetchable ({ key = FETCHABLE_STORAGE_KEY, storage = safeStore() } = {}) {
  return {
    /**
     * Off unless this share was explicitly switched on.
     *
     * Anything unreadable is off. A private window, cleared site data, a value
     * somebody edited by hand - none of those are a decision to publish, and
     * treating them as one would be the wrong way round for a setting whose
     * default is the safe answer.
     */
    get () {
      try {
        return storage?.getItem(key) === 'true'
      } catch {
        return false
      }
    },

    /** @param {boolean} on */
    set (on) {
      try {
        if (on === true) storage?.setItem(key, 'true')
        // Removed rather than set to "false": an absent key and an off one mean
        // the same thing, and leaving one behind would outlive the share.
        else storage?.removeItem(key)
      } catch {
        // A browser that will not store it still has to run. The setting is
        // then off for this page, which is the safe half of the mistake.
      }
    }
  }
}
