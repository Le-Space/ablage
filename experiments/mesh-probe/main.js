/**
 * One question: does gossipsub form a mesh over exactly one direct QR
 * connection, with no relay and no bootstrap?
 *
 * The Yjs provider from the hackathon example syncs over pubsub. It ran inside
 * Universal Connectivity, which has relays and a discovery topic. Here there is
 * one connection and nothing else - and if a mesh does not form, the whole
 * "Yjs over pubsub" plan needs a different transport underneath it.
 *
 * Deliberately nothing about files, OPFS or the app. Mixing those in would blur
 * the answer.
 */
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { QRSession, webRTCQR } from '@le-space/libp2p-webrtc-qr'
import { createLibp2p } from 'libp2p'
import * as Y from 'yjs'

import { Libp2pProvider } from './yjs-libp2p-provider.js'
import { StreamProvider } from './yjs-stream-provider.js'

const logEl = document.getElementById('log')
const lines = []
const log = text => {
  lines.push(text)
  logEl.textContent = lines.join('\n')
}

// Mirrors the demo's working configuration exactly, with gossipsub added. My
// first attempt invented `connectionEncrypters: []`, `streamMuxers: []` and an
// `addresses` block, and the upgrader died on a connection it could not finish.
// The lesson is older than this file: copy the configuration that works.
const node = await createLibp2p({
  transports: [
    webRTCQR({ getOutboundSession: remotePeerId => session?.getOutboundSession(remotePeerId) ?? null })
  ],
  services: {
    identify: identify(),
    // Defaults, deliberately. The first run carried a hand-tuned D/Dlo/Dhi set
    // I invented on the theory that a two-peer mesh needs smaller numbers -
    // which is exactly the kind of guess that turns into the bug being hunted.
    pubsub: gossipsub({ allowPublishToZeroTopicPeers: true })
  }
})

const session = new QRSession(node, { rtcConfiguration: { iceServers: [] } })

const PROBE_PROTOCOL = '/ablage/probe/1.0.0'
const YJS_PROTOCOL = '/ablage/yjs/1.0.0'

let streamProvider = null

// The inbound half: whoever did not dial answers here.
await node.handle(YJS_PROTOCOL, async (stream, connection) => {
  const send = async message => stream.send(new TextEncoder().encode(JSON.stringify(message)))

  streamProvider = new StreamProvider(doc, send)
  log(`stream sync: inbound from ${connection.remotePeer.toString().slice(-8)}`)

  for await (const data of stream) {
    const bytes = data.subarray?.() ?? data
    streamProvider.receive(JSON.parse(new TextDecoder().decode(bytes)))
  }
})

// Positional, like the demo. Destructuring `{ stream }` here gave "stream was
// reset right after opening", which reads like a transport fault and was a
// wrong signature.
await node.handle(PROBE_PROTOCOL, async (stream, connection) => {
  for await (const chunk of stream) {
    const text = new TextDecoder().decode(chunk.subarray?.() ?? chunk)
    log(`Stream empfangen: ${text}`)
    window.__heard = text
  }
})

const doc = new Y.Doc()
let provider = null

log(`peer ${node.peerId.toString().slice(-8)}`)

/** Driven from the test: this page is one of the two halves. */
window.__probe = {
  peerId: () => node.peerId.toString(),

  createOffer: async () => session.createOffer(),

  acceptOffer: async offer => session.acceptOffer(offer),

  acceptAnswer: async answer => {
    const { peerId } = await session.acceptAnswer(answer)
    return peerId.toString()
  },

  /** Start syncing after the connection exists, the way an app would. */
  startSync: (topic = 'ablage/probe/1') => {
    provider = new Libp2pProvider(topic, doc, node)
    log(`provider on ${topic}`)
    return true
  },

  connections: () => node.getConnections().length,

  /**
   * The decisive split.
   *
   * `getPeers()` empty means gossipsub does not know the other side at all -
   * its protocol stream was never opened, and no amount of discovery helps.
   * `getPeers()` populated but `getSubscribers(topic)` empty means the stream
   * exists and the subscription exchange is what failed. Two different bugs.
   */
  mesh: (topic = 'ablage/probe/1') => {
    const pubsub = node.services.pubsub
    const connections = node.getConnections()

    return {
      connections: connections.length,
      // Every protocol actually negotiated on this connection.
      streams: connections.flatMap(c => c.streams.map(s => s.protocol)),
      // What identify learned the other side speaks.
      remoteProtocols: connections.flatMap(c => c.remoteAddr?.protoNames?.() ?? []),
      gossipsubPeers: pubsub.getPeers().map(p => p.toString().slice(-8)),
      subscribers: pubsub.getSubscribers(topic).map(p => p.toString().slice(-8)),
      topics: pubsub.getTopics(),
      synced: provider?.synced ?? false
    }
  },

  /** What the peer store knows the other side speaks - identify's product. */
  known: async () => {
    const peers = await node.peerStore.all()
    return peers.map(p => ({ id: p.id.toString().slice(-8), protocols: p.protocols }))
  },

  /** Pubsub on its own, with no Yjs anywhere near it. */
  rawSubscribe: (topic = 'raw/probe') => {
    node.services.pubsub.addEventListener('message', event => {
      if (event.detail.topic === topic) {
        log(`RAW empfangen: ${new TextDecoder().decode(event.detail.data)}`)
        window.__rawReceived = new TextDecoder().decode(event.detail.data)
      }
    })
    node.services.pubsub.subscribe(topic)
    return node.services.pubsub.getTopics()
  },

  rawPublish: async (topic = 'raw/probe', text = 'hallo') => {
    const result = await node.services.pubsub.publish(topic, new TextEncoder().encode(text))
    return { recipients: result.recipients.length }
  },

  rawReceived: () => window.__rawReceived ?? null,

  /**
   * Two ways to open a second stream, side by side.
   *
   * The demo uses `session.dialProtocol` - the session holds the connection.
   * Gossipsub cannot: it dials through libp2p's own machinery, which asks the
   * transport for an outbound session and gets null once the handshake has been
   * consumed. If that is the difference, it explains a mesh that never forms
   * over a connection that plainly exists.
   */
  streamViaSession: async peerId => {
    try {
      const stream = await session.dialProtocol(peerId, PROBE_PROTOCOL)
      await stream.send(new TextEncoder().encode('via session'))
      return 'ok'
    } catch (error) {
      return 'FEHLER: ' + error.message
    }
  },

  streamViaNode: async peerId => {
    try {
      const { peerIdFromString } = await import('@libp2p/peer-id')
      await node.dialProtocol(peerIdFromString(peerId), PROBE_PROTOCOL)
      return 'ok'
    } catch (error) {
      return 'FEHLER: ' + error.message
    }
  },

  heard: () => window.__heard ?? null,

  /**
   * The same sync, over a direct stream. Both sides call this; whoever dials
   * first opens the stream and the other side answers on the inbound one.
   */
  startStreamSync: async peerId => {
    const post = stream => async message =>
      stream.send(new TextEncoder().encode(JSON.stringify(message)))

    const pump = async (stream, prov) => {
      for await (const data of stream) {
        const bytes = data.subarray?.() ?? data
        prov.receive(JSON.parse(new TextDecoder().decode(bytes)))
      }
    }

    if (peerId != null) {
      const stream = await session.dialProtocol(peerId, YJS_PROTOCOL)
      streamProvider = new StreamProvider(doc, post(stream))
      pump(stream, streamProvider).catch(() => {})
      await streamProvider.requestSync()
      log('stream sync: dialled')
      return 'dialled'
    }

    log('stream sync: waiting for inbound')
    return 'listening'
  },

  streamSynced: () => streamProvider?.synced ?? false,

  set: (key, value) => { doc.getMap('cells').set(key, value); return true },
  get: key => doc.getMap('cells').get(key) ?? null
}

log('ready')
