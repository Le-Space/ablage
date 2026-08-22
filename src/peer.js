import { bootstrap } from '@libp2p/bootstrap'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { identify } from '@libp2p/identify'
import { webSockets } from '@libp2p/websockets'
import { QRSession, webRTCQR } from '@le-space/libp2p-webrtc-qr'
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

  const relays = relayBootstrapList(relayBootstrapAddrs, relayOptIn)
  const hasRelay = relays.length > 0

  const node = await createLibp2p({
    ...(hasRelay ? { addresses: { listen: ['/p2p-circuit'] } } : {}),
    transports: [
      webRTCQR({ getOutboundSession: remotePeerId => session?.getOutboundSession(remotePeerId) ?? null }),
      circuitRelayTransport(),
      webSockets()
    ],
    connectionGater: {
      denyDialMultiaddr: addr => denyDial(String(addr), relayOptIn)
    },
    peerDiscovery: hasRelay ? [bootstrap({ list: relays })] : [],
    services: { identify: identify() }
  })

  session = new QRSession(node, rtcConfiguration != null ? { rtcConfiguration } : {})

  // Positional, like the demo. Destructuring `{ stream }` here reports itself as
  // "stream was reset right after opening", which reads like a transport fault
  // and is a wrong signature.
  await node.handle(SYNC_PROTOCOL, (stream, connection) => {
    onSyncStream?.(stream, connection.remotePeer.toString())
  })

  return {
    node,
    session,
    peerId: () => node.peerId.toString(),

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

    stop: () => node.stop()
  }
}
