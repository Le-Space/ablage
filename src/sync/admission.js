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
 * Was this peer reached by scanning a code?
 *
 * Both halves matter. `/webrtc/p2p/…` alone is not enough: a relayed WebRTC
 * connection carries it too, behind the circuit that got there. It is the
 * absence of `/p2p-circuit` that says nobody was routed here.
 *
 * @param {string} address the connection's remote multiaddr
 */
export function arrivedByQr (address) {
  const addr = String(address ?? '')

  return addr.includes('/webrtc/p2p/') && !addr.includes('/p2p-circuit')
}

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
 * @returns {'admit' | 'ask'}
 */
export function decide ({ address, peerId, admitted }) {
  if (arrivedByQr(address)) return 'admit'

  return admitted.remembered(peerId) ? 'admit' : 'ask'
}
