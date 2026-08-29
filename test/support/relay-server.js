/**
 * A circuit relay, started next to the browser tests.
 *
 * It offers exactly what the app needs from a relay and nothing else: `hop` so
 * peers can reserve a slot, `identify` so they can discover that it does, and
 * gossipsub so they can find each other on the discovery topics.
 *
 * `identify` is not incidental here. `@libp2p/circuit-relay-v2` looks for
 * relays in what identify reports, not at what a port happens to answer - a
 * relay that handles `hop` without advertising it is invisible, reserves for
 * nobody, and leaves every peer without a `/p2p-circuit` address. That is
 * exactly the failure that made this file necessary.
 */
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { privateKeyFromProtobuf } from '@libp2p/crypto/keys'
import { gossipsub } from '@libp2p/gossipsub'
import { identify, identifyPush } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { webSockets } from '@libp2p/websockets'
import { createServer } from 'node:http'
import { createLibp2p } from 'libp2p'

import { DISCOVERY_TOPICS } from '../../src/peer.js'
import { RELAY_HEALTH_PORT, RELAY_KEY, RELAY_PORT } from './local-relay.js'

const privateKey = privateKeyFromProtobuf(Buffer.from(RELAY_KEY, 'base64'))

const node = await createLibp2p({
  privateKey,
  addresses: { listen: [`/ip4/127.0.0.1/tcp/${RELAY_PORT}/ws`] },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    identify: identify(),
    identifyPush: identifyPush(),
    ping: ping(),
    pubsub: gossipsub({
      allowPublishToZeroTopicPeers: true,
      canRelayMessage: true,

      /**
       * **Peer scoring off, because every test peer shares one IP.**
       *
       * gossipsub penalises many peers arriving from a single address - a sane
       * defence on the open internet, and exactly wrong here, where every
       * browser the suite opens is 127.0.0.1. The penalty accumulates over a
       * run: early specs pass, later ones connect and reserve normally and are
       * then ignored, so two peers on the relay never hear each other and the
       * spec waits out its two minutes.
       *
       * Measured rather than guessed. With the relay reporting on itself, the
       * signature was `connections=2, subscribers=0`: both peers there, neither
       * counted as subscribed to the discovery topic, nothing forwarded between
       * them.
       */
      scoreParams: { IPColocationFactorWeight: 0, IPColocationFactorThreshold: 4096 },
      scoreThresholds: {
        gossipThreshold: -1e9,
        publishThreshold: -1e9,
        graylistThreshold: -1e9,
        acceptPXThreshold: 0,
        opportunisticGraftThreshold: 0
      }
    }),
    relay: circuitRelayServer({
      /**
       * Generous on purpose, and the numbers were earned.
       *
       * These limits exist to stop strangers exhausting a public relay. There
       * are no strangers on loopback, and a test that fails because the fixture
       * ran out of slots is a test about the fixture.
       *
       * The first attempt used 128 slots held for ten minutes. Every relay spec
       * passed on its own and the same specs failed inside the full suite -
       * four hundred tests open peers faster than a ten-minute lease gives them
       * back, and once the slots are gone a reservation is refused, which looks
       * exactly like a relay that cannot relay. Short leases, many slots: a
       * test's peers are gone seconds after it ends.
       */
      reservations: {
        maxReservations: 4096,
        reservationTtl: 2 * 60 * 1000,
        defaultDurationLimit: 10 * 60 * 1000,
        defaultDataLimit: BigInt(1024 * 1024 * 1024)
      }
    })
  },
  connectionGater: { denyDialMultiaddr: () => false },

  // Same reasoning: the default ceiling is sized for a machine on the open
  // internet, not for a suite that opens hundreds of browser contexts against
  // loopback and closes them again.
  connectionManager: { maxConnections: 4096, inboundConnectionThreshold: 1024 }
})

await node.start()

/**
 * Subscribe to the discovery topics the app publishes on.
 *
 * gossipsub forwards a topic to peers, but only for topics it carries itself -
 * a relay that is merely *present* on the mesh relays nothing, and two browsers
 * on it never hear each other. The relay this app ships does carry these, which
 * is why discovery worked in the first place. So must this one, or the fixture
 * would test a quieter network than the real one.
 */
for (const topic of DISCOVERY_TOPICS) node.services.pubsub.subscribe(topic)

for (const address of node.getMultiaddrs()) console.log('relay listening on', address.toString())

// A plain HTTP endpoint, only so a test runner has something to wait for. A
// libp2p listener answers no GET, and a runner that cannot tell "starting" from
// "started" races the first test.
createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  const pubsub = node.services.pubsub

  response.end(JSON.stringify({
    status: 'ok',
    peerId: node.peerId.toString(),
    connections: node.getConnections().length,
    reservations: node.services.relay?.reservations?.size ?? null,
    topics: Object.fromEntries(DISCOVERY_TOPICS.map(topic => [
      topic,
      { subscribers: pubsub.getSubscribers(topic).length, mesh: pubsub.getMeshPeers(topic).length }
    ]))
  }))
}).listen(RELAY_HEALTH_PORT, '127.0.0.1', () => {
  console.log('relay health on http://127.0.0.1:%d', RELAY_HEALTH_PORT)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { node.stop().finally(() => process.exit(0)) })
}
