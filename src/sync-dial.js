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

  let lastError = new Error(`The remote peer never accepted a ${protocol} stream`)

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const stream = await node.dialProtocol(id, protocol)

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
