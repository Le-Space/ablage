import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@libp2p/gossipsub'
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery'
import { bootstrap } from '@libp2p/bootstrap'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { identify } from '@libp2p/identify'
import { webSockets } from '@libp2p/websockets'
import { QRSession, webRTCQR } from '@le-space/libp2p-webrtc-qr'
import { createLibp2p } from 'libp2p'

import { arrivedByQr } from './sync/admission.js'
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
 */
export async function createPeer ({
  onSyncStream,
  rtcConfiguration,
  relayOptIn = false,
  relayBootstrapAddrs = []
} = {}) {
  let session = null

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
    ...(hasRelay ? { addresses: { listen: ['/p2p-circuit'] } } : {}),
    transports: [
      webRTCQR({ getOutboundSession: remotePeerId => session?.getOutboundSession(remotePeerId) ?? null }),
      circuitRelayTransport(),
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
      identify: identify(),

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
      pubsub: gossipsub({ emitSelf: false, allowPublishToZeroTopicPeers: true, runOnLimitedConnection: true })
    }
  })

  session = new QRSession(node, rtcConfiguration != null ? { rtcConfiguration } : {})

  // Positional, like the demo. Destructuring `{ stream }` here reports itself as
  // "stream was reset right after opening", which reads like a transport fault
  // and is a wrong signature.
  await node.handle(SYNC_PROTOCOL, (stream, connection) => {
    // The address says how this peer was reached, and that decides whether it
    // is asked about. A QR peer arrives over `/webrtc/p2p/<id>` - the scan was
    // the consent - while anything through a relay carries `/p2p-circuit`.
    onSyncStream?.(stream, connection.remotePeer.toString(), String(connection.remoteAddr ?? ''))
  })

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
     */
    watchPeers: onChange => {
      const seen = new Map()

      const publish = () => onChange([...seen].map(([peerId, state]) => ({ peerId, state })))

      const remember = (id, how) => {
        if (seen.get(id) === how) return

        seen.set(id, how)
        publish()
      }

      const forget = id => {
        if (!seen.delete(id)) return

        publish()
      }

      node.addEventListener('peer:discovery', event => remember(event.detail.id.toString(), 'heard'))
      node.addEventListener('peer:connect', event => remember(event.detail.toString(), 'connected'))
      node.addEventListener('peer:disconnect', event => forget(event.detail.toString()))

      // Whatever is already there. A list that only fills on the next event
      // looks empty for as long as nothing happens, which is most of the time.
      for (const connection of node.getConnections()) {
        remember(connection.remotePeer.toString(), 'connected')
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

    /** The answering half: read their offer, produce a reply. */
    acceptOffer: offer => session.acceptOffer(offer),

    /** Back on the offering side: read the reply and connect. */
    acceptAnswer: async answer => {
      const { peerId } = await session.acceptAnswer(answer)
      return peerId.toString()
    },

    /** Open the sync stream. Whoever dialled the answer opens it. */
    // By peer id, not through the QR session: `QRSession.dialProtocol` builds
    // `/webrtc/p2p/<id>` itself, which names the QR transport and so reaches
    // only a peer whose answer this device accepted. Receiving was never so
    // limited - `node.handle` above hangs on the bare node - and this makes
    // sending match it. See `sync-dial.js` for the muxer race it still has to
    // survive.
    openSyncStream: peerId => openSyncStream(node, peerId, SYNC_PROTOCOL),

    connections: () => node.getConnections().length,

    /**
     * Is there a way in that does not need a code held up to a camera?
     *
     * Any connection that did not arrive by QR is infrastructure - the relay,
     * or a circuit through it. `arrivedByQr` is the same test the admission
     * gate uses, and using it here rather than a second one means the two
     * cannot come to disagree about what a relay connection is.
     */
    relayUp: () => node.getConnections().some(connection => !arrivedByQr(String(connection.remoteAddr ?? ''))),

    /** Told when that changes, so the interface does not have to poll. */
    watchRelay: onChange => {
      const tell = () => onChange(node.getConnections().some(c => !arrivedByQr(String(c.remoteAddr ?? ''))))

      node.addEventListener('peer:connect', tell)
      node.addEventListener('peer:disconnect', tell)
      tell()
    },

    stop: () => node.stop()
  }
}
