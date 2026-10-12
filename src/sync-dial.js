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

    // **The plain circuit is the way in. `/webrtc` is the way out of it.**
    //
    // This preference used to be the other way round, and the argument was
    // sound: a `/p2p-circuit/webrtc/` address is signalled over the circuit and
    // then carries its own bytes, so the connection stops being relayed. What
    // was never measured is whether it *opens* on first contact.
    //
    // Measured 2026-10-12, two browsers through the production relay: the plain
    // circuit address connected in **489 ms**. The same peer's
    // `/p2p-circuit/webrtc/` address **timed out after 20 s** - and because it
    // ranked first, it was also what every retry spent its ten seconds on. Forty-
    // five seconds later the app said "no stream after 45s", and the other
    // device had never been asked anything.
    //
    // There is a reason first contact is the case that fails: `strangerHere` in
    // `peer.js` refuses a `/webrtc` connection to a peer that was neither
    // scanned nor admitted, which is exactly what both devices are before the
    // first invitation. The ranking wanted the one address this app's own gate
    // is built to refuse.
    //
    // Staying relayed afterwards is what `dcutr` is in the configuration for:
    // it upgrades a circuit that already carries something. Ranked below rather
    // than dropped, because a peer whose only address is that one is still
    // better dialled than not.
    if (address.includes('/p2p-circuit/webrtc/')) points += 1
    else if (address.includes('/p2p-circuit/')) points += 100
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
 * A way to reach somebody the meeting place named but did not describe.
 *
 * **Reported from two phones:** *The dial request has no valid addresses for
 * peer …* while that same peer sat in the list as *found on the relay*. Being
 * announced and being dialable are different things - a browser announces
 * itself on the meeting place before its relay reservation completes, so what
 * arrives is a name with nothing attached.
 *
 * But we are on that relay too, and our *own* address through it is
 * `<relay>/p2p-circuit/p2p/<us>`. Swapping our peer id for theirs gives the
 * address they would have announced had they got round to it - which is how
 * anybody reaches anybody through a circuit.
 *
 * Built rather than waited for. Waiting is what the report describes.
 *
 * @param {readonly string[]} ours addresses this node announces for itself
 * @param {string} them the peer id to reach
 */
export function throughOurRelay (ours, them) {
  const circuits = ours.filter(address => address.includes('/p2p-circuit'))

  return rankAddresses(circuits.map(address =>
    // Everything up to and including `/p2p-circuit`, then them. The trailing
    // `/webrtc` of an upgraded address goes with it: that half describes a
    // connection this device made, not one anybody else can be reached at.
    `${address.slice(0, address.indexOf('/p2p-circuit'))}/p2p-circuit/p2p/${them}`
  ))
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
  // One name or several, newest first: `dialProtocol` negotiates, and the
  // stream that comes back says which was agreed. Kept as a list so a failure
  // names what was actually offered.
  const offered = [protocol].flat()
  const {
    attempts = 15,
    retryDelay = 300,
    settleDelay = 200,

    /**
     * **A dial with no deadline is a button that never comes back.**
     *
     * `dialProtocol` was called without a signal, so an attempt that never
     * settled hung the whole loop - not for `attempts` tries, but forever. On
     * screen that is "Ask to share" pressed and nothing happening, ever, with
     * no error to show; in the browser tests it is a spec sailing past its own
     * four-minute limit. Both were seen before this was found.
     *
     * Per attempt, and a budget over all of them: fifteen ten-second dials
     * would be a two-and-a-half-minute wait, which is its own kind of hang.
     */
    dialTimeout = 10_000,
    budget = 45_000
  } = options
  const id = typeof peerId === 'string' ? peerIdFromString(peerId) : peerId

  /**
   * A connection this node already has to them, if there is one.
   *
   * **`dialProtocol` will not use a limited one.** Measured in a browser
   * holding two open circuit connections to the peer: `dialProtocol(id, …,
   * { runOnLimitedConnection: true })` timed out after fifteen seconds, while
   * `connection.newStream(…)` on one of those very connections opened the
   * stream in **112 ms** and the dialog appeared on the other device. Handed a
   * peer id and no *unlimited* connection, libp2p goes looking for one - and
   * the looking is the fifty-four addresses again, each with its own deadline.
   *
   * So: the connection where there is one, the peer id only where there is not.
   */
  const openConnection = () => {
    try {
      return node.getConnections?.(id)?.find(connection => connection.status === 'open') ?? null
    } catch {
      return null
    }
  }

  // The best address this device knows for them, or the peer id if it knows
  // none. Read once: the store does not change usefully inside a retry loop,
  // and re-reading it every attempt would be one more thing to go wrong.
  const known = await (node.peerStore?.get(id) ?? Promise.resolve(null)).then(
    held => rankAddresses(held?.addresses?.map(a => a.multiaddr.toString()) ?? []),
    () => []
  )

  // Nothing dialable on record, but we are on a relay and so are they - that is
  // how they were heard at all. Their address through it is ours with their
  // peer id at the end.
  const best = known[0] ??
    throughOurRelay(node.getMultiaddrs?.().map(String) ?? [], id.toString())[0] ??
    null

  const { multiaddr } = best == null ? { multiaddr: null } : await import('@multiformats/multiaddr')

  /**
   * **Connect by address; open the stream by peer id.**
   *
   * The first version of this dialled the protocol *at* the address, and that
   * conflates two things. `dialProtocol(multiaddr)` has to reach that exact
   * address and negotiate on it - so a WebRTC address that is still coming up
   * gives a connection without a usable stream, which on screen is two devices
   * that say "connected" and a dialog that never appears. Reported from a
   * phone, and it is the shape of what was reported.
   *
   * Split, each half does what it is good at: the address is how a *direct*
   * connection gets made rather than a relayed one, and the peer id lets
   * libp2p open the stream on whichever connection is actually up - which,
   * once the dial below has done its work, is the direct one.
   *
   * Best effort on purpose. If the address cannot be reached, the peer id
   * still had a relayed connection to work with, and a slower sync beats none.
   */
  if (best != null) {
    await node.dial(multiaddr(best), { signal: AbortSignal.timeout(20_000) }).catch(() => {})
  }

  let lastError = new Error(`The remote peer never accepted any of ${offered.join(', ')}`)

  const deadline = Date.now() + budget

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (Date.now() >= deadline) {
      lastError = new Error(`no ${offered.join(' or ')} stream after ${Math.round(budget / 1000)}s`)
      break
    }

    try {
      // The dialling half of the same rule. A relayed connection is *limited*,
      // and a protocol stream on one is refused unless both sides say it may -
      // the handler in `peer.js` carries the same flag, and either alone is
      // still a refusal.
      const signal = AbortSignal.timeout(Math.min(dialTimeout, Math.max(0, deadline - Date.now())))
      const connection = openConnection()
      const stream = connection != null
        ? await connection.newStream(offered, { runOnLimitedConnection: true, signal })
        : await node.dialProtocol(id, offered, { runOnLimitedConnection: true, signal })

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
