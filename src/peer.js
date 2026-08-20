import { identify } from '@libp2p/identify'
import { QRSession, webRTCQR } from '@le-space/libp2p-webrtc-qr'
import { createLibp2p } from 'libp2p'

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
 */

export const SYNC_PROTOCOL = '/ablage/sync/1.0.0'

/**
 * @param {object} [options]
 * @param {(stream: unknown, peerId: string) => void} [options.onSyncStream]
 *   called for a stream the other side opened
 */
export async function createPeer ({ onSyncStream, rtcConfiguration } = {}) {
  let session = null

  const node = await createLibp2p({
    transports: [
      webRTCQR({ getOutboundSession: remotePeerId => session?.getOutboundSession(remotePeerId) ?? null })
    ],
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
    openSyncStream: peerId => session.dialProtocol(peerId, SYNC_PROTOCOL),

    connections: () => node.getConnections().length,

    stop: () => node.stop()
  }
}
