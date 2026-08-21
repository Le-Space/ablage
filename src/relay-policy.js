/**
 * When this node may talk to a relay, and to what.
 *
 * Separate from `peer.js` and free of libp2p, because it is the whole of the
 * promise in AGENTS.md - *a start without the choice makes no outbound network
 * call at all* - and a promise that can only be checked by starting a node is
 * one nobody checks.
 */

/**
 * Is this address one this node may dial?
 *
 * With the relay off, a QR session is the only thing that may be dialed: that
 * is the way in this app was built for, and it needs no server. With it on, the
 * relay itself and the circuits through it are added, and nothing else - being
 * handed a bootstrap list is not permission to dial the whole internet.
 *
 * Plaintext WebSocket stays denied on an https page. The browser refuses it as
 * mixed content anyway, so allowing it here only buys a console full of errors
 * and a relay that looks broken rather than misconfigured.
 *
 * @param {string} address
 * @param {boolean} relayOptIn
 * @param {string} [protocol] The page's protocol; defaults to this page's.
 * @returns {boolean} `true` to deny.
 */
export function denyDial (address, relayOptIn, protocol = globalThis.location?.protocol) {
  const addr = String(address)

  // The QR transport only ever produces /webrtc/p2p/<peer> addresses.
  if (addr.includes('/webrtc/p2p/')) return false
  if (!relayOptIn) return true

  const secureWebSocket = addr.includes('/wss') || addr.includes('/tls/ws')
  const plaintextWebSocket = !secureWebSocket && addr.includes('/ws')
  if (plaintextWebSocket && protocol === 'https:') return true

  return !(addr.includes('/p2p-circuit') || secureWebSocket || plaintextWebSocket)
}

/**
 * Which relay addresses this node may bootstrap from.
 *
 * Both conditions, never either: an address without the choice is a relay
 * nobody asked for, and the choice without an address is nothing to dial.
 *
 * @param {readonly string[]} addresses
 * @param {boolean} relayOptIn
 * @returns {string[]}
 */
export function relayBootstrapList (addresses, relayOptIn) {
  return relayOptIn ? [...addresses].filter(Boolean) : []
}
