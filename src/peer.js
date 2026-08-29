import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@libp2p/gossipsub'
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery'
import { bootstrap } from '@libp2p/bootstrap'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { dcutr } from '@libp2p/dcutr'
import { identify, identifyPush } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { webRTC } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import { decodePayload, QRSession, QR_TYPE_OFFER, webRTCQR } from '@le-space/libp2p-webrtc-qr'
import { createLibp2p } from 'libp2p'

import { denyDial, relayBootstrapList } from './relay-policy.js'
import { openSyncStream } from './sync-dial.js'

/**
 * A libp2p node and the QR handshake, and nothing about files.
 *
 * The configuration mirrors the webrtc-qr demo's exactly. That is not laziness:
 * writing one from scratch during the transport experiment - inventing
 * `connectionEncrypters: []`, `streamMuxers: []` and an `addresses` block -
 * produced a connection the upgrader could not finish, and the error named
 * nothing useful. The demo's configuration is the one known to work.
 *
 * No pubsub. Gossipsub knows the peer over a QR connection and never exchanges
 * subscriptions with it (libp2p-webrtc-qr#98), so the sync rides a direct
 * stream. When that is fixed, this is where a `pubsub` service would go and the
 * provider's channel argument is where it would be used.
 *
 * A relay is the second way in - for when the other person is not here to scan
 * anything - and it is added rather than substituted. The transports for it are
 * capability, not usage: without `relayOptIn` there is no bootstrap list, no
 * announced `/p2p-circuit`, and the gater refuses every address that is not a
 * QR session. That is the promise in AGENTS.md, and `relay-policy.js` is where
 * it is written down and tested.
 *
 * The `addresses` block appears **only** when a relay was asked for. Adding one
 * unconditionally is exactly what the paragraph above warns about: inventing an
 * `addresses` block during the transport experiment produced a connection the
 * upgrader could not finish. With no relay, the configuration below is byte for
 * byte the demo's.
 */

export const SYNC_PROTOCOL = '/ablage/sync/1.0.0'

/**
 * Where devices call out to find each other.
 *
 * One topic for the whole app, so any two devices with a relay meet - which is
 * the mesh, and it is deliberate. Meeting is not sharing: what a peer may do
 * with this folder is decided by the dialog in `admission.js`, and being
 * discoverable is not being open.
 */
export const DISCOVERY_TOPICS = [
  // orbitdb-relay's default, and the one the relay this app ships actually
  // carries - measured, see below.
  'todo._peer-discovery._p2p._pubsub',
  // universal-connectivity's. Free to listen on, and inert until this app also
  // reaches a relay deployed with the `uc-go-peer` profile: our own discovery
  // filters for `relay:orbitdb-relay:orbitdb-relay` and would never return one.
  'universal-connectivity-browser-peer-discovery'
]

/**
 * **A topic only works if the node between the peers carries it.**
 *
 * Measured, and it is the whole story of this feature: two browsers whose only
 * common peer is a relay exchange nothing on a topic that relay does not
 * subscribe to. gossipsub forwards for topics a node has joined, and a relay
 * deployed for another app has joined that app's topic and no other.
 *
 *     ablage's own topic   - 60s, neither peer ever heard the other
 *     simple-todo's topic  - both peers found each other in 10s
 *
 * Same code, same relay, same two browsers. So the meeting place is not a
 * property of "having a relay": it is a property of the relay's own
 * `PUBSUB_TOPICS`, and until one carries this topic, discovery here is silent
 * while every connection looks healthy.
 */

/**
 * @param {object} [options]
 * @param {(stream: unknown, peerId: string) => void} [options.onSyncStream]
 *   called for a stream the other side opened
 * @param {boolean} [options.relayOptIn] whether somebody asked for a relay.
 *   `false` is the promise, not a preference: without it this node makes no
 *   outbound call.
 * @param {readonly string[]} [options.relayBootstrapAddrs] relay addresses,
 *   ignored entirely unless `relayOptIn` is true
 * @param {import('@libp2p/interface').PrivateKey} [options.privateKey] the
 *   identity to start as. Omitted, libp2p makes a new one - which is what every
 *   start did until shares arrived, and the reason the other device saw a
 *   stranger each time and asked again.
 */
/**
 * How large an identify response this node will still accept.
 *
 * **The default is 8192, and it fails silently and completely.** libp2p does
 * not truncate an oversized identify response - it drops the whole message, so
 * a peer that crosses the line loses `hop`, `bitswap` and `meshsub` from this
 * node's view all at once, with no error logged on either side. What is left
 * is a relay that answers every dial, reserves for nobody, and appears in the
 * device list because nothing is known about what it speaks.
 *
 * That is not hypothetical. The production relay measured 10538 bytes from 122
 * protocols, 109 of them `/orbitdb/heads/*` - one per open database - and 129
 * protocols an hour later. Filtering its announce list brings it to about 7883
 * bytes, which is 96% of the default: seven more databases and it is over
 * again. See orbitdb-relay#50 and #51.
 *
 * So the ceiling here is raised rather than relied upon being enough. It is
 * still a bound on what a stranger can make this node buffer, and 64 KiB is a
 * small enough buffer to keep while being far enough from a number that has
 * already been crossed once - roughly 700 databases of room.
 *
 * The same number as simple-todo, deliberately. Both apps meet the same relay
 * and fail the same way, and two apps carrying two different ceilings for one
 * cause is a trap for whoever reads them next. simple-todo also measured what
 * this buys: with the default limit a client got no circuit address in 30 s,
 * and 2.0 s after raising it.
 */
export const MAX_IDENTIFY_BYTES = 65_536

export async function createPeer ({
  onSyncStream,
  rtcConfiguration,
  privateKey,
  relayOptIn = false,
  relayBootstrapAddrs = [],

  /**
   * Whether this node may leave the relay for a direct connection.
   *
   * On by default, and it is what everybody wants: a circuit is metered, every
   * byte crosses somebody else's machine, and two devices behind ordinary
   * routers can usually reach each other once DCUtR has told them when to try.
   *
   * Off is not a preference - it is a network. Two phones on mobile data sit
   * behind carrier NAT, no hole punch succeeds, and the circuit is the only
   * path there will ever be. That case is the reason `runOnLimitedConnection`
   * exists on both the handler and the dial, and it is untestable while a
   * direct path is available - which, on one machine, it always is.
   *
   * So this exists to take the direct path away: no DCUtR to arrange one, and
   * no `/webrtc` address to arrange it to.
   */
  holePunch = true
} = {}) {
  let session = null

  /**
   * Peer ids somebody on this device scanned a code for.
   *
   * The admission gate used to read this off the multiaddr - `/webrtc/p2p/…`
   * with no circuit in front of it. DCUtR produces exactly that address for a
   * stranger who hole-punched out of a relay, so the gate opened for anyone.
   *
   * A scan is an act, and this is where the act happens, so this is where it is
   * written down. Both halves of the handshake, because either one is somebody
   * holding a camera up to somebody else's screen.
   *
   * @type {Set<string>}
   */
  const scanned = new Set()

  // Live, not captured. The checkbox in the introduction checks the moment it
  // is ticked - that is the element's promise, and a good one - but the gate
  // was fixed when the node was made, so the probe was refused by this node's
  // own gater and reported as "no relay answered". A dead relay and a closed
  // gate looked identical, and only one of them was true.
  //
  // What still waits for a restart is *using* one: the bootstrap list and the
  // `/p2p-circuit` announcement below are read once. Opening the gate lets the
  // check happen; it does not quietly turn the relay on.
  let relayWanted = relayOptIn

  const relays = relayBootstrapList(relayBootstrapAddrs, relayOptIn)
  const hasRelay = relays.length > 0

  const node = await createLibp2p({
    // Spread rather than handed over as `undefined`: libp2p reads whether the
    // field is there, and an explicit `undefined` is not the same as silence.
    ...(privateKey != null ? { privateKey } : {}),
    //
    // `/webrtc` is what the hole-punch listens on, and it is the address the
    // transport actually claims: `/p2p-circuit/webrtc` reads like the right
    // one and is claimed by no transport at all, so listening on it fails
    // quietly. Measured against both filters rather than copied from a guess.
    ...(hasRelay
      ? { addresses: { listen: holePunch ? ['/p2p-circuit', '/webrtc'] : ['/p2p-circuit'] } }
      : {}),
    transports: [
      // **First, and that is load-bearing.** libp2p returns the first transport
      // whose `dialFilter` claims an address, in the order this array is
      // written. `@libp2p/webrtc` filters with `WebRTC.exactMatch`, and that
      // matches the bare `/webrtc/p2p/<id>` a scan produces - measured, not
      // assumed. Below `webRTC()`, every QR dial would go to a transport that
      // has no session and knows nothing of what the scan agreed.
      webRTCQR({ getOutboundSession: remotePeerId => session?.getOutboundSession(remotePeerId) ?? null }),
      // The way out of the relay. Two devices that met over a circuit try to
      // connect directly here; if they cannot, the circuit carries them and
      // nothing above this line notices the difference.
      webRTC(),
      // Twenty seconds rather than the default. A reservation is a round trip
      // to a machine on the public internet, and a phone on mobile data is
      // slower at it than a laptop on a desk - which is the case this app is
      // for.
      circuitRelayTransport({ reservationCompletionTimeout: 20_000 }),
      webSockets()
    ],
    // Neither is used by the QR transport, and without them nothing else can
    // connect at all.
    //
    // The QR path brings its own: `upgradeOutbound(…, { skipEncryption: true,
    // muxerFactory: session.muxerFactory })`, safe because the signed payload
    // already authenticated the peer. A relay connection is an ordinary libp2p
    // connection over a WebSocket, and it has neither - so the upgrader reached
    // multistream-select with an empty protocol list and threw "At least one
    // protocol must be specified", an error that names the symptom and not the
    // absence.
    //
    // Measured, not guessed: with the gate open, that was the error. The demo's
    // configuration - which this file mirrors on purpose - never needed them,
    // because the demo only ever speaks QR.
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],

    connectionGater: {
      denyDialMultiaddr: addr => denyDial(String(addr), relayWanted)
    },
    /**
     * A meeting place, and only where there is one to meet in.
     *
     * Peers announce themselves on a shared topic every few seconds and hear
     * everyone else doing the same - nobody types an address. Without a relay
     * there is no shared network to announce on, so this is empty and the QR
     * handshake stays the only way in, which is what it was built to be.
     */
    peerDiscovery: hasRelay
      ? [
          bootstrap({ list: relays }),
          pubsubPeerDiscovery({ interval: 5000, topics: DISCOVERY_TOPICS, listenOnly: false })
        ]
      : [],

    services: {
      identify: identify({ maxMessageSize: MAX_IDENTIFY_BYTES }),

      /**
       * **Tell peers when this device's addresses change.**
       *
       * A browser has no addresses at all until the relay reservation
       * completes - and that happens *after* it has already connected to
       * whoever was there. Without this, those peers go on knowing the node
       * only by what identify said at the time: nothing worth dialling.
       *
       * `sync-dial.js` now picks a `/webrtc` address out of what it knows about
       * a peer, and this is what makes such an address arrive at all. The two
       * belong together; either alone does much less.
       *
       * libp2p's own `webrtc-private-to-private` example carries it, and so
       * does simple-todo. This app was the one without it.
       */
      identifyPush: identifyPush({ maxMessageSize: MAX_IDENTIFY_BYTES }),

      /**
       * Liveness, and it is not decoration here.
       *
       * A circuit is metered - twenty minutes on this relay - and a connection
       * that has quietly expired looks exactly like one that is idle. Ping is
       * what tells them apart, and it is what the example and simple-todo both
       * use.
       */
      ping: ping(),

      /**
       * `runOnLimitedConnection` is the line that decides whether any of this
       * works.
       *
       * libp2p marks a circuit-relay connection as *limited*, and gossipsub
       * refuses to run on a limited connection by default - so peers that met
       * through a relay would exchange no subscriptions and the meeting place
       * would stay silent while every connection looked healthy. That is the
       * same silence libp2p-webrtc-qr#98 describes over a QR connection, from
       * the opposite cause.
       *
       * Configured whether or not a relay is: it costs nothing on a node with
       * no pubsub peers, and making the service conditional would mean a
       * different node the moment somebody ticks the box.
       */
      pubsub: gossipsub({ emitSelf: false, allowPublishToZeroTopicPeers: true, runOnLimitedConnection: true }),

      /**
       * Get off the relay when the two ends can reach each other.
       *
       * A circuit is metered - this one allows 10 GiB and twenty minutes - and
       * every byte crosses somebody else's machine. DCUtR uses the relayed
       * connection to agree on a moment and both sides dial at once, which is
       * how two devices behind ordinary routers meet directly.
       *
       * An optimisation, not a requirement. When the hole punch fails the
       * circuit stays and the app keeps working, which is why this is safe to
       * add: nothing above depends on it succeeding.
       *
       * No `autoNAT` alongside it, though the plan called for one. Its own
       * README: it "does not implement NAT hole punching" - it confirms that
       * addresses a node listens on are dialable from outside, and a browser
       * has none to confirm.
       */
      // Spread, so that with the hole punch off the service is *absent* rather
      // than present and idle. A node that still ran DCUtR would keep trying to
      // leave the relay, which is the opposite of what the caller asked for.
      ...(holePunch ? { dcutr: dcutr() } : {})
    }
  })

  session = new QRSession(node, rtcConfiguration != null ? { rtcConfiguration } : {})

  // Positional, like the demo. Destructuring `{ stream }` here reports itself as
  // "stream was reset right after opening", which reads like a transport fault
  // and is a wrong signature.
  // `runOnLimitedConnection`, and without it none of the relay half works.
  //
  // libp2p marks a circuit-relay connection as *limited* and refuses to open a
  // protocol stream on one unless the protocol says it may - so two devices
  // that had found each other through the relay could see each other and do
  // nothing at all. Measured: discovery reported the peer, and the dial came
  // back "Cannot open protocol stream on limited connection".
  //
  // Both halves need it. This is the answering side; `sync-dial.js` carries the
  // same flag on the dial, and either one alone still refuses.
  await node.handle(SYNC_PROTOCOL, (stream, connection) => {
    // The address says how this peer was reached, and that decides whether it
    // is asked about. A QR peer arrives over `/webrtc/p2p/<id>` - the scan was
    // the consent - while anything through a relay carries `/p2p-circuit`.
    onSyncStream?.(stream, connection.remotePeer.toString(), String(connection.remoteAddr ?? ''))
  }, { runOnLimitedConnection: true })

  return {
    node,
    session,
    peerId: () => node.peerId.toString(),

    /**
     * Who is out there, as it changes.
     *
     * Discovery and connection are different events and both matter: a peer
     * heard on the meeting place can be called, and one already connected is
     * further along than that. The caller gets both and decides what to draw.
     *
     * `speaks` is the third thing, and it is the one that stops the list
     * lying. The meeting place is shared - this app listens on orbitdb-relay's
     * topic and universal-connectivity's, so everything on them is heard,
     * including the relay itself and every simple-todo browser. None of them
     * offer `/ablage/sync/1.0.0`, so asking one to share does nothing at all.
     *
     * Which protocols a peer offers is not guessable and not announced on the
     * meeting place: identify exchanges it over a connection, and `peer:identify`
     * is where it arrives. So there are three answers, not two, and the third
     * one matters - a peer merely *heard* has never been connected to, so
     * nothing is known about it either way.
     *
     * `speaks` is therefore `true`, `false`, or `null` for "not yet known", and
     * only `false` is grounds for hiding a row. Measured the hard way: filtering
     * down to `true` emptied the list, because two devices on the meeting place
     * hear each other long before either dials, and asking is what connects
     * them in the first place.
     */
    /**
     * The addresses this device can be reached at through a relay.
     *
     * **Being connected to a relay is not being reachable through one.** The
     * connection is a WebSocket this node opened; the *reservation* is the
     * relay agreeing to accept calls on its behalf, and only that produces a
     * `/p2p-circuit` address. Between the two there is a window - seconds on a
     * desk, longer on mobile data - in which everything looks connected and
     * nobody can call you.
     *
     * That window is what "the dial request has no valid addresses for peer"
     * looks like from the other side, and it is why the interface says which of
     * the two this is rather than only that a relay answered.
     */
    relayAddresses: () => node.getMultiaddrs()
      .map(String)
      .filter(address => address.includes('/p2p-circuit')),

    /**
     * Told when they change, because they arrive late.
     *
     * `self:peer:update` is libp2p's own event for it - the reservation
     * completing is exactly one of these - so nothing here polls.
     */
    watchOwnAddresses: onChange => {
      node.addEventListener('self:peer:update', () => onChange())
      onChange()
    },

    /**
     * Direct, or through the relay.
     *
     * **`limits`, not the address.** After a hole punch the address still reads
     * `/…/p2p-circuit/webrtc/p2p/…` - the circuit carried the signalling and
     * nothing else - so anything looking for `/p2p-circuit` in the string calls
     * a direct connection relayed. Measured, both ways:
     *
     *     /…/p2p-circuit/p2p/…          limited: true    bytes cross the relay
     *     /…/p2p-circuit/webrtc/p2p/…   limited: false   bytes go straight over
     *
     * libp2p marks a circuit connection *limited* because it is metered - 10
     * GiB and twenty minutes on this one - and that flag is exactly the
     * question being asked here.
     *
     * @returns {'direct' | 'relayed' | null} null when there is no connection
     */
    connectionKind (peerId) {
      const held = node.getConnections().filter(c => c.remotePeer.toString() === String(peerId))

      if (held.length === 0) return null

      // Any unlimited connection is the one the bytes will take.
      return held.some(c => c.limits == null) ? 'direct' : 'relayed'
    },

    watchPeers: onChange => {
      const seen = new Map()
      /** @type {Map<string, boolean>} peer id -> does it offer the sync protocol */
      const speaks = new Map()

      const publish = () => onChange([...seen].map(([peerId, state]) => ({
        peerId,
        state,
        speaks: speaks.has(peerId) ? speaks.get(peerId) : null
      })))

      const remember = (id, how) => {
        if (seen.get(id) === how) return

        seen.set(id, how)
        publish()
      }

      const forget = id => {
        speaks.delete(id)

        if (!seen.delete(id)) return

        publish()
      }

      const heardProtocols = (id, protocols) => {
        if (protocols == null) return

        const offers = protocols.includes(SYNC_PROTOCOL)

        if (speaks.get(id) === offers) return

        speaks.set(id, offers)
        publish()
      }

      node.addEventListener('peer:discovery', event => remember(event.detail.id.toString(), 'heard'))
      node.addEventListener('peer:connect', event => remember(event.detail.toString(), 'connected'))
      node.addEventListener('peer:disconnect', event => forget(event.detail.toString()))
      node.addEventListener('peer:identify', event =>
        heardProtocols(event.detail.peerId.toString(), event.detail.protocols))

      // Whatever is already there. A list that only fills on the next event
      // looks empty for as long as nothing happens, which is most of the time.
      //
      // The peer store is asked too: a peer identified before this watcher
      // existed has its protocols on record and would otherwise wait for an
      // identify that already happened.
      for (const connection of node.getConnections()) {
        const id = connection.remotePeer.toString()

        remember(id, 'connected')
        node.peerStore.get(connection.remotePeer)
          .then(known => heardProtocols(id, known?.protocols), () => {})
      }
    },

    /**
     * Let this node try a relay now, without restarting it.
     *
     * For the check the introduction runs when somebody ticks the box. It opens
     * the gate and nothing else - no bootstrap, no announcement - so a start
     * that nobody asked anything of still makes no outbound call.
     */
    allowRelayDials: (on = true) => { relayWanted = on },

    /** The offering half of the handshake. */
    createOffer: options => session.createOffer(options),

    /**
     * The answering half: read their offer, produce a reply.
     *
     * This side is the one the gate protects - whoever accepted the *answer*
     * opens the sync stream, so this device receives it. Decoded a second time
     * because `acceptOffer` hands back the reply and not the peer behind it,
     * and only after it succeeded: an offer that failed to verify is not
     * consent to anything.
     */
    acceptOffer: async offer => {
      const answer = await session.acceptOffer(offer)

      try {
        const { peerId } = await decodePayload(offer, QR_TYPE_OFFER)

        scanned.add(String(peerId))
      } catch {
        // It decoded a moment ago inside `acceptOffer`, so this is close to
        // unreachable. If it ever happens the peer is asked about rather than
        // admitted, which is the direction to fail in.
      }

      return answer
    },

    /** Back on the offering side: read the reply and connect. */
    acceptAnswer: async answer => {
      const { peerId } = await session.acceptAnswer(answer)

      scanned.add(peerId.toString())
      return peerId.toString()
    },

    /**
     * Did somebody here scan this peer's code?
     *
     * What `decide` is given in place of the address. `false` for a peer met
     * over the relay, and it stays `false` after DCUtR moves that peer onto a
     * direct connection - which is the whole point.
     *
     * @param {string} peerId
     */
    arrivedByScan: peerId => scanned.has(String(peerId)),

    /** Open the sync stream. Whoever dialled the answer opens it. */
    // By peer id, not through the QR session: `QRSession.dialProtocol` builds
    // `/webrtc/p2p/<id>` itself, which names the QR transport and so reaches
    // only a peer whose answer this device accepted. Receiving was never so
    // limited - `node.handle` above hangs on the bare node - and this makes
    // sending match it. See `sync-dial.js` for the muxer race it still has to
    // survive.
    openSyncStream: peerId => openSyncStream(node, peerId, SYNC_PROTOCOL),

    connections: () => node.getConnections().length,


    stop: () => node.stop()
  }
}
