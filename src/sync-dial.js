/**
 * Opening a sync stream to a peer, whatever way that peer was met.
 *
 * `QRSession.dialProtocol` cannot do this. It builds the address itself as
 * `/webrtc/p2p/<peerId>` (session.js), which names the QR transport in the
 * string - so it reaches a peer whose answer this device accepted, and nothing
 * else. Since the relay landed there is a second way to meet somebody, and a
 * peer met that way has no WebRTC address to be dialled at.
 *
 * Dialling by **peer id** instead lets libp2p pick the connection it already
 * has. Both ways in end with a connection: the QR handshake dials before it
 * reports one, and a relayed peer is connected through the circuit. Receiving
 * already worked over any transport, because `node.handle` hangs on the bare
 * node - it was only the sending half that was tied to QR.
 *
 * A bare string is the trap here. `dialProtocol` accepts a `PeerId` or a
 * `Multiaddr`, and a string is read as the latter - which fails far away from
 * here with `getComponents is not a function`, an error that says nothing about
 * the mistake. `peerIdFromString` is the whole fix and the reason this module
 * exists rather than a one-liner at the call site.
 */

import { peerIdFromString } from '@libp2p/peer-id'

/**
 * Which of a peer's addresses to dial, when there is a choice.
 *
 * **There is a lot of choice.** Measured against the real relay: the peer store
 * held *54* addresses for a single peer - every address the relay listens on,
 * crossed with `{circuit, circuit/webrtc}`. Among them `127.0.0.1`, the relay's
 * own private `172.16.14.2`, plain `/ws` (mixed content on an https page) and
 * quic, none of which a browser can reach.
 *
 * Dialling the peer id hands that whole list to libp2p to work through, and the
 * wait is what somebody watching a dialog that does not appear is looking at.
 *
 * libp2p's own `webrtc-private-to-private` example does not do that: it dials
 * the other browser's `/webrtc` address, which uses the circuit for signalling
 * and gives a **direct** connection. That example ships no DCUtR at all,
 * because it never takes the relayed path to begin with.
 *
 * Ranked rather than filtered, so a peer with only an odd address still gets
 * dialled - the fallback to the peer id is for having no address at all.
 *
 * @param {readonly string[]} addresses
 * @returns {string[]} best first, and only the ones a browser can use
 */
export function rankAddresses (addresses) {
  const score = address => {
    // Not reachable from a browser, at any price.
    if (/\/ip4\/(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) return null
    if (/\/ip6\/(::1|fe80)/.test(address)) return null

    const secure = /\/tls\/ws|\/wss/.test(address)

    // An https page cannot open a plaintext WebSocket, so this is not a
    // preference - it is the difference between a dial and a console error.
    if (!secure) return null

    let points = 0

    // The whole point: a `/webrtc` address is signalled over the circuit and
    // then carries its own bytes. Without it the connection stays relayed.
    if (address.includes('/p2p-circuit/webrtc/')) points += 100
    // A name outlives an address, and the relay's own certificate is issued
    // for one.
    if (/\/dns[46]?\//.test(address)) points += 10

    return points
  }

  return addresses
    .map(address => ({ address, points: score(address) }))
    .filter(({ points }) => points != null)
    .sort((a, b) => b.points - a.points)
    .map(({ address }) => address)
}

/**
 * A stream that is still open a beat after it was opened.
 *
 * Both peers reach `connected` at the same moment, but a stream opened before
 * the remote muxer exists negotiates and is immediately reset - and the reset
 * arrives just late enough that the first look says `open`. So the check waits
 * a beat, and a failure is retried rather than reported.
 *
 * The same shape `QRSession` uses for its own dials, and for the same reason.
 * It is repeated here rather than reused because its version is bound to the
 * address this one deliberately does not build.
 */
export async function openSyncStream (node, peerId, protocol, options = {}) {
  const { attempts = 15, retryDelay = 300, settleDelay = 200 } = options
  const id = typeof peerId === 'string' ? peerIdFromString(peerId) : peerId

  // The best address this device knows for them, or the peer id if it knows
  // none. Read once: the store does not change usefully inside a retry loop,
  // and re-reading it every attempt would be one more thing to go wrong.
  const best = await (node.peerStore?.get(id) ?? Promise.resolve(null)).then(
    known => rankAddresses(known?.addresses?.map(a => a.multiaddr.toString()) ?? [])[0] ?? null,
    () => null
  )

  const { multiaddr } = best == null ? { multiaddr: null } : await import('@multiformats/multiaddr')

  /**
   * The address first, the peer id after.
   *
   * **Falling back matters more than choosing well.** A chosen address can be
   * stale - the peer moved relays, the reservation lapsed - and retrying the
   * same dead address fifteen times would lose a connection that dialling the
   * peer id would have made. So the address gets a few tries and then libp2p
   * gets the whole list, which is what this did before.
   */
  const byAddress = Math.min(5, attempts)
  const targetFor = attempt =>
    best != null && attempt < byAddress ? multiaddr(best) : id

  let lastError = new Error(`The remote peer never accepted a ${protocol} stream`)

  for (let attempt = 0; attempt < attempts; attempt++) {
    const target = targetFor(attempt)

    try {
      // The dialling half of the same rule. A relayed connection is *limited*,
      // and a protocol stream on one is refused unless both sides say it may -
      // the handler in `peer.js` carries the same flag, and either alone is
      // still a refusal.
      const stream = await node.dialProtocol(target, protocol, { runOnLimitedConnection: true })

      await new Promise(resolve => setTimeout(resolve, settleDelay))

      if (stream.status === 'open') return stream

      lastError = new Error(`the stream was ${stream.status} right after opening`)
    } catch (error) {
      lastError = error
    }

    await new Promise(resolve => setTimeout(resolve, retryDelay))
  }

  throw lastError
}
