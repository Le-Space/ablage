/**
 * Who may write into this folder.
 *
 * **The QR scan used to be the authorisation.** To reach somebody you had to be
 * in the room and they had to point a camera at your code. That consent step
 * appears nowhere in the code because it happened in the physical world - and
 * when #11 added a relay as a second way in, it went away without anything
 * taking its place. Anyone who could reach the node could open the sync
 * protocol, and `reconcile` writes into a real folder on disk.
 *
 * So a peer met by QR is still admitted without a question - the scan is the
 * question, already answered - and everything else is asked about. That keeps
 * today's behaviour exactly as it is and gates only what is new.
 */

/**
 * **The address used to answer this, and it cannot any more.**
 *
 * The old rule read consent off the multiaddr: `/webrtc/p2p/…` without a
 * `/p2p-circuit` in front of it meant nobody had been routed here, so a camera
 * must have been pointed at a code in the physical world.
 *
 * DCUtR ended that. A stranger who met this device through a relay punches a
 * hole and continues on a direct WebRTC connection - whose address is
 * `/webrtc/p2p/<id>` with no circuit in it, character for character what a scan
 * produces. Measured, not feared: with the hole punch in, the admission dialog
 * stopped appearing and unknown peers were attached in silence.
 *
 * So consent is recorded where it happens instead. `peer.js` remembers every
 * peer id that completed a QR handshake *on this device*, and that set is what
 * `decide` is given. An address is a description of a route; a scan is an act.
 */

const STORAGE_KEY = 'ablage.admitted'

/**
 * Peers admitted for longer than one connection.
 *
 * Opt-in, and the box is unticked: somebody answering a dialog about a stranger
 * should have to reach for "remember this device", not notice afterwards that
 * they granted something standing. The safe answer is the one you get by not
 * reading carefully.
 *
 * Local, like `sharing.js` and `baseline.js`. Who this device lets write to its
 * disk is not something the other side should be able to read - or change.
 */
export function admission ({ key = STORAGE_KEY } = {}) {
  /** @type {Set<string>} */
  let known = new Set()

  try {
    known = new Set(JSON.parse(localStorage.getItem(key) ?? '[]'))
  } catch {
    // Blocked or half-written: admit nobody from storage. Being asked again is
    // the safe direction to fail in.
  }

  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify([...known]))
    } catch {
      // Holds for this session and no longer.
    }
  }

  return {
    remembered (peerId) {
      return known.has(peerId)
    },

    remember (peerId) {
      if (known.has(peerId)) return

      known.add(peerId)
      save()
    },

    forget (peerId) {
      if (!known.delete(peerId)) return

      save()
    },

    snapshot () {
      return [...known]
    }
  }
}

/**
 * What to do with an arriving sync stream.
 *
 * @param {object} options
 * @param {boolean} options.scanned did somebody on this device scan this peer's
 *   code? The act, not a route that resembles one.
 * @param {string} options.peerId
 * @param {{ remembered(peerId: string): boolean }} options.admitted
 * @returns {'admit' | 'ask'}
 */
export function decide ({ scanned, peerId, admitted }) {
  if (scanned) return 'admit'

  return admitted.remembered(peerId) ? 'admit' : 'ask'
}
