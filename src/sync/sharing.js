/**
 * What each peer was told about a folder switch, remembered per peer.
 *
 * The dialog asks once - "should the new folder go to the connected devices?" -
 * because with two of somebody's own devices that is how the question reads,
 * and a row per peer for a set that is usually one is a lot of screen.
 *
 * **The answer is recorded per peer anyway.** A relay makes it possible for the
 * peers not to be equally trusted, and a global flag would apply one device's
 * answer to another that joined afterwards - which is the one outcome nobody
 * would choose deliberately. Recording it per peer means asking per peer later
 * costs interface and nothing else: no migration, and no answer silently
 * inherited by a stranger.
 *
 * Local on purpose, like `baseline.js`. What this device decided to send to
 * somebody is this device's business, and putting it in the shared document
 * would let the other side read - or change - the decision about itself.
 */

const STORAGE_KEY = 'ablage.sharing'

/** @param {{ key?: string }} [options] */
export function sharing ({ key = STORAGE_KEY } = {}) {
  /** @type {Map<string, boolean>} peer id -> may this device send it our folder */
  let known = new Map()

  try {
    known = new Map(Object.entries(JSON.parse(localStorage.getItem(key) ?? '{}')))
  } catch {
    // Storage blocked or half-written: start from nothing rather than refuse to
    // run. The cost is being asked again, which is the safe direction.
  }

  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(known)))
    } catch {
      // The choice holds for this session and no longer.
    }
  }

  return {
    /**
     * `null` when this peer has never been answered for - which is different
     * from `false`, and the difference is whether to ask.
     *
     * @param {string} peerId
     * @returns {boolean | null}
     */
    get (peerId) {
      return known.has(peerId) ? known.get(peerId) : null
    },

    /** @param {readonly string[]} peerIds @param {boolean} allowed */
    set (peerIds, allowed) {
      for (const peerId of peerIds) known.set(peerId, allowed)
      save()
    },

    /** Which of these peers may be sent the folder. */
    allowed (peerIds) {
      return [...peerIds].filter(peerId => known.get(peerId) === true)
    },

    forget (peerId) {
      if (!known.delete(peerId)) return
      save()
    },

    snapshot () {
      return Object.fromEntries(known)
    }
  }
}
