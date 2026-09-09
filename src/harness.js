/**
 * What the browser tests drive.
 *
 * Deliberately not the application - there is no application yet, and a test
 * waiting for one would be testing a plan. This assembles the parts that need a
 * browser: storage, a peer, content addressing, and the reconciliation that
 * joins them.
 */
import { codecFor } from './sync/framing.js'
import * as Y from 'yjs'

import { createContent } from './content.js'
import { SYNC_PROTOCOL, SYNC_PROTOCOL_FRAMED, createPeer } from './peer.js'
import { reconcile } from './reconcile.js'
import { baseline } from './sync/baseline.js'
import { sendBulk } from './sync/bulk.js'
import { fileIndex } from './sync/file-index.js'
import { askEach, askRegistry, withPeerFallback } from './sync/ask-peers.js'
import { FILE_GIVE, FILE_NONE, answer, asked } from './sync/file-transfer.js'
import { INBOX_MESSAGE, inbox as keepInbox, inboxMessage, received } from './sync/inbox.js'
import { Provider } from './sync/provider.js'
import { directoryStorage } from './storage/directory.js'
import { watchFolder } from './storage/watch.js'

const decode = bytes => new TextDecoder().decode(bytes)
const encode = text => new TextEncoder().encode(text)

/** A named subdirectory per test, so one run cannot see another's files. */
async function scratch (name) {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(name, { create: true })
}

/**
 * Which relay the harness should use.
 *
 * A spec sets `window.__relay` before the page loads; without one this falls
 * back to what the app ships with. The relaying specs point it at the relay
 * started next to the run, so a machine on the public internet cannot decide
 * whether this repository's tests pass. One smoke spec still names the public
 * address on purpose - see `test/support/local-relay.js` for why the two are
 * separate.
 */
async function relayAddresses () {
  const chosen = /** @type {any} */ (window).__relay

  if (chosen != null) return Array.isArray(chosen) ? [...chosen] : [chosen]

  const { bakedRelayAddresses } = await import('./relay-sources.js')

  return bakedRelayAddresses()
}

window.__ablage = {
  storage: async name => {
    const store = await directoryStorage({ root: await scratch(name) })

    return {
      list: () => store.list(),
      read: async path => decode(await store.read(path)),
      write: (path, text) => store.write(path, encode(text)),
      remove: path => store.remove(path),
      readBytes: async path => [...await store.read(path)]
    }
  },

  /** Handle persistence and the watcher, for the browser tests. */
  handles: async () => {
    const { canPickFolder, rememberFolder, restoreFolder, forgetFolder, storedFolder } =
      await import('./storage/handle.js')
    const root = await navigator.storage.getDirectory()
    const folder = await root.getDirectoryHandle('watched', { create: true })

    return {
      canPick: canPickFolder(),
      roundTrip: async () => {
        await rememberFolder(folder)
        const back = await restoreFolder()
        return { name: back?.handle?.name ?? null, granted: back?.granted ?? null }
      },
      survivesNothingStored: async () => {
        await forgetFolder()
        return (await storedFolder()) ?? null
      }
    }
  },

  watch: async () => {
    const { watchFolder } = await import('./storage/watch.js')
    const { directoryStorage } = await import('./storage/directory.js')

    const root = await navigator.storage.getDirectory()
    await root.removeEntry('watched', { recursive: true }).catch(() => {})
    const folder = await root.getDirectoryHandle('watched', { create: true })
    const store = await directoryStorage({ root: folder })

    const seen = []
    const stop = watchFolder(folder, paths => seen.push(...paths), { every: 150 })

    return {
      write: (path, text) => store.write(path, encode(text)),
      remove: path => store.remove(path),
      seen: () => [...seen],
      stop: () => stop()
    }
  },

  /**
   * What the Aleph registration currently names, browser-dialable.
   *
   * The same lookup `find-a-relay.js` makes when the baked list produces no
   * reservation. Exposed so the public smoke spec can ask it rather than carry
   * an address that goes stale - which it did, three times in two weeks.
   */
  discoverRelays: async () => {
    const { discoverRelays } = await import('./relay-sources.js')

    return discoverRelays({})
  },

  /**
   * Dial a relay the way the app does, with the gate in a chosen state.
   *
   * Here rather than in a test file so the imports are the app's own - vite
   * resolves them, and a probe that reached a different copy of `multiaddr`
   * would be measuring the test rig.
   */
  probeRelay: async (address, relayOptIn) => {
    const { createPeer } = await import('./peer.js')
    const { relayProbe } = await import('./relay-sources.js')
    const { multiaddr } = await import('@multiformats/multiaddr')

    const peer = await createPeer({ relayOptIn })

    try {
      const answered = await relayProbe(peer.node, multiaddr, { timeoutMs: 15000 })([address])

      // The reason, when there is none to report: `relayProbe` returns an empty
      // list for anything that failed, which is right for the caller and
      // useless for finding out why.
      let reason = null

      if (answered.length === 0) {
        try {
          await peer.node.dial(multiaddr(address), { signal: AbortSignal.timeout(15000) })
        } catch (error) {
          reason = String(error?.message ?? error).slice(0, 200)
        }
      }

      return { answered, reason }
    } catch (error) {
      return { answered: [], reason: String(error?.message ?? error).slice(0, 200) }
    } finally {
      await peer.stop().catch(() => {})
    }
  },

  /**
   * A node that joined the meeting place, and what it has heard.
   *
   * The relay is a real one on the public internet, and that is the point: two
   * peers finding each other is the claim, and a mock would confirm it whether
   * or not it were true.
   */
  meetOverRelay: async () => {
    const { createPeer } = await import('./peer.js')

    const peer = await createPeer({ relayOptIn: true, relayBootstrapAddrs: await relayAddresses() })
    const heard = new Set()

    peer.node.addEventListener('peer:discovery', event => heard.add(event.detail.id.toString()))

    return {
      peerId: peer.peerId(),
      heard: () => [...heard],
      connections: () => peer.node.getConnections().length,

      // Connected and reachable are different things, and only the second one
      // produces a `/p2p-circuit` address. The public-relay smoke spec asks
      // for exactly this, because a relay can answer every dial and still
      // reserve for nobody.
      relayAddresses: () => peer.relayAddresses(),
      stop: () => peer.stop().catch(() => {})
    }
  },

  /**
   * A node on the meeting place that can also be asked to call somebody.
   *
   * Discovery was proven; dialling a discovered peer never was. That is the
   * step between "they see each other" and "they sync", and it is where the
   * report of two devices that find each other and do nothing points.
   */
  meetAndDial: async ({ holePunch = true, admitAll = false } = {}) => {
    const { createPeer } = await import('./peer.js')

    const heard = new Set()
    const inbound = []

    // Through `createPeer`'s own hook, not a second `node.handle` - libp2p
    // refuses a duplicate registration, and swallowing that error made an
    // earlier measurement report an arrival that had simply been sent to the
    // handler this one was trying to replace.
    const peer = await createPeer({
      relayOptIn: true,
      relayBootstrapAddrs: await relayAddresses(),
      onSyncStream: (stream, peerId) => inbound.push(peerId),

      // With this off there is no DCUtR and no `/webrtc` address, so the
      // circuit is the only path that will ever exist - which is what two
      // phones on mobile data have.
      holePunch,

      // A spec measuring *transport* - does DCUtR get these two off the relay -
      // has to say so, because a node now closes a direct connection to anyone
      // it has no relationship with. Saying it out loud beats a spec that
      // silently measures the guard instead of the hole punch.
      admitted: () => admitAll
    })

    peer.node.addEventListener('peer:discovery', event => heard.add(event.detail.id.toString()))

    return {
      peerId: peer.peerId(),
      heard: () => [...heard],
      inbound: () => [...inbound],

      /** What `askToShare` does, and what it reports when it cannot. */
      call: async peerId => {
        try {
          await peer.openSyncStream(peerId)
          return { ok: true, error: null }
        } catch (error) {
          return { ok: false, error: String(error?.message ?? error).slice(0, 220) }
        }
      },

      addresses: peerId => peer.node.peerStore.get(peerId).then(
        p => p.addresses.map(a => a.multiaddr.toString()),
        () => []
      ),

      /**
       * Every connection to this peer, and how it is carried.
       *
       * This is what tells a hole punch from a hope. A relayed connection
       * carries `/p2p-circuit` in its address and libp2p marks it limited; a
       * direct one has neither. DCUtR does not replace the connection in
       * place - it opens a second, so the question is whether an unlimited one
       * ever appears beside the circuit, not whether the first one changed.
       */
      connectionsTo: async peerId => {
        const { peerIdFromString } = await import('@libp2p/peer-id')

        return peer.node.getConnections(peerIdFromString(peerId)).map(c => ({
          address: String(c.remoteAddr ?? ''),
          limited: c.limits != null
        }))
      },

      /**
       * Is every connection to this peer a metered one?
       *
       * Asked of `limits`, never of the address. A hole-punched connection
       * still reads `/p2p-circuit/webrtc/p2p/…`, so a spec that greps the
       * address for `/p2p-circuit` passes just as happily over a direct
       * connection - which on one machine is the connection it will get.
       */
      onlyRelayed: async peerId => {
        const { peerIdFromString } = await import('@libp2p/peer-id')
        const held = peer.node.getConnections(peerIdFromString(peerId))

        return held.length > 0 && held.every(c => c.limits != null)
      },

      stop: () => peer.stop().catch(() => {})
    }
  },

  /**
   * Two nodes on the relay, one holding bytes, and no admission between them.
   *
   * The admission dialog gates `/ablage/sync/1.0.0`. Bitswap is a *second*
   * protocol on the same node, and nothing here has ever asked whether it is
   * gated too. This measures it rather than reasoning about it: if the reader
   * comes back with the bytes, an unadmitted peer can read a file whose address
   * it knows.
   */
  bitswapAcrossTheRelay: async ({ holePunch = true, admitAll = false, overCircuits = false } = {}) => {
    const { createPeer } = await import('./peer.js')
    const { createContent } = await import('./content.js')

    const start = async () => {
      // With the hole punch off there is no DCUtR and no `/webrtc` address, so
      // the circuit is the only path the two can ever have. That is what makes
      // "bitswap refuses limited connections" a claim this harness can test
      // rather than hope for: with a direct path available it is never put to
      // the question.
      const peer = await createPeer({
        relayOptIn: true,
        relayBootstrapAddrs: await relayAddresses(),
        holePunch,
        admitted: () => admitAll
      })
      const heard = new Set()

      peer.node.addEventListener('peer:discovery', event => heard.add(event.detail.id.toString()))

      return { peer, content: await createContent(peer.node, { overCircuits }), heard }
    }

    const holder = await start()
    const reader = await start()

    return {
      holderId: holder.peer.peerId(),
      readerId: reader.peer.peerId(),
      heardEachOther: () => reader.heard.has(holder.peer.peerId()),

      /** @returns {Promise<string>} the address of some bytes only the holder has */
      hold: text => holder.content.add(new TextEncoder().encode(text)),

      /**
       * Can the bitswap protocol itself be opened over this connection?
       *
       * Separates two questions a timed-out read cannot: whether libp2p refuses
       * the stream, or whether the stream opens and bitswap's own want/session
       * machinery is what does not deliver.
       */
      canOpenBitswap: async () => {
        const { peerIdFromString } = await import('@libp2p/peer-id')

        for (const protocol of ['/ipfs/bitswap/1.2.0', '/ipfs/bitswap/1.1.0']) {
          try {
            const stream = await reader.peer.node.dialProtocol(
              peerIdFromString(holder.peer.peerId()), protocol,
              { runOnLimitedConnection: true, signal: AbortSignal.timeout(12_000) }
            )

            await stream.close().catch(() => {})
            return { protocol, ok: true, error: null }
          } catch (error) {
            var last = String(error?.message ?? error).slice(0, 140)
          }
        }

        return { protocol: null, ok: false, error: last }
      },

      /**
       * Ask for it from the other node, having agreed to nothing.
       *
       * No sync stream is opened, so `onSyncStream` never fires and no dialog
       * is ever shown. The only thing the reader was given is the address.
       */
      readWithoutAsking: async (cid, timeoutMs = 20000) => {
        try {
          const bytes = await Promise.race([
            reader.content.get(cid),
            new Promise((_, no) => setTimeout(() => no(new Error('timed out')), timeoutMs))
          ])

          return { got: new TextDecoder().decode(bytes), error: null }
        } catch (error) {
          return { got: null, error: String(error?.message ?? error).slice(0, 160) }
        }
      },

      connect: async () => {
        // **By peer id, not by an address picked out of a list.**
        //
        // `getMultiaddrs()[0]` is whichever address happened to be announced
        // first, and on a CI runner that is regularly one nothing can dial -
        // the reservation is not ready, or the interface behind it is not
        // reachable from the other side of the same container. libp2p already
        // knows every address discovery published for this peer, and asking it
        // to choose is what the application itself does.
        const { peerIdFromString } = await import('@libp2p/peer-id')
        const address = peerIdFromString(holder.peer.peerId())

        try {
          const connection = await reader.peer.node.dial(address, { signal: AbortSignal.timeout(45000) })

          // What kind of connection this turned out to be decides whether the
          // read below proves anything: bitswap refuses limited connections by
          // default, so a read over a circuit and a read over a direct link are
          // two different findings.
          return {
            ok: true,
            dialled: String(address),
            address: String(connection.remoteAddr ?? ''),
            limited: connection.limits != null,
            // Who can read what crosses this. The relay forwards the bytes of a
            // relayed connection without being a party to it, so what matters
            // is whether the two ends negotiated an encrypter between
            // themselves - and this is the field that says so.
            encryption: String(connection.encryption ?? 'none'),
            multiplexer: String(connection.multiplexer ?? 'none')
          }
        } catch (error) {
          // What the peer store held, because a dial that found no address and a
          // dial that was refused are different failures and read alike.
          const known = await reader.peer.node.peerStore.get(address).then(
            p => p.addresses.map(a => a.multiaddr.toString()),
            () => []
          )

          return {
            ok: false,
            dialled: String(address),
            known,
            error: String(error?.message ?? error).slice(0, 200)
          }
        }
      },

      stop: async () => {
        await Promise.all([holder.peer.stop(), reader.peer.stop()]).catch(() => {})
      }
    }
  },

  clear: async name => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(name, { recursive: true }).catch(() => {})
  },

  /**
   * One whole side: storage, a peer, content, an index, and the wiring that
   * makes a change on either side end up on the other.
   */
  start: async (name, { overRelay = false, holePunch = false } = {}) => {
    await window.__ablage.clear(name)

    let doc = new Y.Doc()
    let index = fileIndex(doc)
    const base = baseline({ key: `ablage.baseline.${name}` })
    let storage = await directoryStorage({ root: await scratch(name) })

    const peers = new Map()
    const appMessages = []
    // Kept, not held: a reload of this side finds what arrived before it.
    const inbox = keepInbox({ key: `ablage.inbox.${name}` })
    /** Content addresses this side is waiting on - the same registry `main.js` uses. */
    const asks = askRegistry()
    let lastInbound = null
    let pending = Promise.resolve()

    /** Serialised: two passes at once would both see the same disagreement. */
    const pass = () => {
      const ran = pending.then(() => reconcile({ index, storage, content: fetching, base }))

      // **The chain must survive one failure, the way `main.js` does.**
      //
      // `main.js` ends its chain with `.then(render, report)`, and that handler
      // is what lets the next pass run after a failed one. This had no handler,
      // so a single rejection left `pending` rejected for good and every later
      // pass short-circuited without doing anything - which made #78 look worse
      // here than it is in the app.
      //
      // The caller still gets the real outcome; only the *queue* forgets.
      pending = ran.catch(() => {})

      return ran
    }

    // One per peer, and each loop reads its own - the same shape `main.js`
    // has. A shared binding lets a second peer take over the first one's
    // incoming messages, which is the bug `several-peers.test.js` is for.
    const attach = (stream, peerId, protocol = stream.protocol ?? SYNC_PROTOCOL) => {
      const codec = codecFor(protocol, SYNC_PROTOCOL_FRAMED)
      const send = message => stream.send(codec.encode(message))
      const provider = new Provider(doc, send)

      peers.get(peerId)?.provider.destroy()
      peers.set(peerId, { provider, send, stream, codec })

      // Both sides ask, the same as `main.js`. A `sync-request` is answered
      // with what its *sender* lacks, so one request moves a folder one way
      // and the side that was asked never catches up.
      provider.requestSync()

      ;(async () => {
        for await (const data of stream) {
          // Several messages may share one chunk, and one may span several -
          // which is the whole reason 1.1.0 exists.
          for (const message of codec.decode(data.subarray?.() ?? data)) {
          // The application's own messages, kept out of the provider - the same
          // split `main.js` makes. Recorded here so a test can see that one
          // arrived, rather than only that a stream ended.
          // Anything the CRDT has no opinion about, not just the two types this
          // used to name. The provider's switch has no default, so a type it
          // does not know is dropped in silence - which made an early
          // measurement report that half a megabyte never crossed a circuit
          // when in truth it had crossed and been discarded here.
            // Somebody who is not syncing with us said something. Read
            // through the same function the application uses, so that what a
            // test sees is what a person would be shown - including the
            // refusals, which are most of what that function does.
            // Somebody wants a file. Answered over the same stream that
            // carried the ask - the one path measured to cross a circuit.
            if (asked(message) != null) {
              answer(message, async cid => {
                try {
                  return await content.get(cid, { signal: AbortSignal.timeout(10_000) })
                } catch {
                  return null
                }
              })
                .then(reply => reply != null && sendBulk(stream, codec.encode(reply)))
                .catch(() => {})
              continue
            }

            // The answer to one of ours. Believed only if it hashes to what was
            // asked for - `content.add` is the same function that produced the
            // address in the first place, and storing it locally is what we
            // wanted anyway.
            if (message?.type === FILE_GIVE || message?.type === FILE_NONE) {
              asks.settle(message, bytes => content.add(bytes))
              continue
            }

            if (message.type === INBOX_MESSAGE) {
              const said = received(message, peerId)

              if (said != null) inbox.add(said)
              continue
            }

            if (message.type !== 'update' && message.type !== 'sync-request' && message.type !== 'sync-response') {
              appMessages.push({ from: peerId, message })
              continue
            }

            provider.receive(message)
            // A remote change is a reason to look at storage again.
            pass().catch(() => {})
          }
        }
      })()
        .catch(() => {})
        .finally(() => {
          if (peers.get(peerId)?.provider === provider) {
            provider.destroy()
            peers.delete(peerId)
          }
        })

      return provider
    }

    // No STUN: two contexts on one machine, and a deterministic run beats a
    // claim about whatever network the test happens to be on.
    const peer = await createPeer({
      rtcConfiguration: { iceServers: [] },

      /**
       * A full side that can only reach the other over a circuit.
       *
       * Two phones on mobile data are behind carrier NAT, and when no hole
       * punch succeeds the relay is the whole of the path. The specs that use
       * this ask a question nothing else does: the sync stream is known to
       * cross a circuit, but *files* travel by bitswap, which refuses one.
       */
      ...(overRelay
        ? {
            relayOptIn: true,
            relayBootstrapAddrs: await relayAddresses(),

            // Off by default here, because the specs that use `overRelay` are
            // about what a circuit alone can carry - and with a hole punch
            // available on one machine, it is never the circuit that carries
            // anything. On says: meet through the relay, then leave it, which
            // is what two devices normally do.
            holePunch,
            admitted: () => true
          }
        : {}),
      onSyncStream: (stream, peerId, address) => {
        lastInbound = { peerId, address }
        attach(stream, peerId)
      }
    })

    const heardOnRelay = new Set()

    peer.node.addEventListener('peer:discovery', event => heardOnRelay.add(event.detail.id.toString()))

    const content = await createContent(peer.node)
    // What `pass()` reconciles through: bitswap, then every peer we hold, in
    // turn. `fetch` below stays the raw thing on purpose - it is how a spec
    // measures whether bitswap alone crosses.
    const fetching = withPeerFallback(content, {
      askAll: cid => askEach(cid, [...peers].map(([id, held]) => ({ id, send: held.send })), asks)
    })

    side = {
      peerId: () => peer.peerId(),

      /** How the last inbound sync stream reached this device. */
      lastInbound: () => lastInbound,

      /** How many peers this side is talking to right now. */
      syncPeers: () => peers.size,

      /** Application messages that arrived on a sync stream. */
      appMessages: () => [...appMessages],

      /** Messages left for us, as they would be shown. */
      inbox: () => inbox.all(),

      /**
       * Leave a message with somebody, built the way the application builds it.
       *
       * Not `sendApp` with a hand-written object: the point of driving it from
       * here is that the real construction runs, so a test that passes says the
       * shipped path works rather than that a literal survived a stream.
       */
      leaveMessage: async (peerId, fields) => {
        const held = peers.get(peerId)

        if (held == null) return { ok: false, error: 'no such peer' }

        try {
          await held.send(inboxMessage(fields))
          return { ok: true, error: null }
        } catch (error) {
          return { ok: false, error: String(error?.message ?? error).slice(0, 160) }
        }
      },

      /**
       * Say no the way `main.js` does: send it, then close after a beat.
       *
       * The beat is the point. A refusal that races its own close arrives
       * nowhere, and then it is a silence again - which is the state this
       * message exists to replace.
       */
      refuse: peerId => {
        const held = peers.get(peerId)

        if (held == null) return false

        held.send({ type: 'sync-refused' })
        held.stream?.close?.().catch?.(() => {})
        return true
      },

      /** This folder's own id, written on first sight. */
      identity: async () => {
        const { folderIdentity } = await import('./storage/identity.js')
        return (await folderIdentity(storage)).id
      },

      /**
       * Work in a different folder from now on.
       *
       * What `pick-folder` does, minus the picker - that opens a native dialog
       * no automation can drive. Everything after the dialog is the same code
       * path, which is the part worth testing.
       */
      useFolder: async folderName => {
        const root = await navigator.storage.getDirectory()
        storage = await directoryStorage({ root: await root.getDirectoryHandle(folderName, { create: true }) })

        // The same two steps `main.js` takes, in the same order: a *fresh*
        // document, never an emptied one - emptying writes a tombstone per path
        // and a peer would act on it - and the baseline dropped, because what
        // was agreed about a path says nothing once the path means another file.
        doc = new Y.Doc()
        index = fileIndex(doc)
        base.clear()
      },

      createOffer: () => peer.createOffer(),
      acceptOffer: offer => peer.acceptOffer(offer),

      /**
       * The offering side finishes the handshake and opens the sync stream.
       * The answering side receives it through `onSyncStream` above - whoever
       * dialled opens, the other answers, exactly one stream either way.
       */
      acceptAnswer: async answer => {
        const peerId = await peer.acceptAnswer(answer)
        const stream = await peer.openSyncStream(peerId)

        attach(stream, peerId)
        return peerId
      },

      write: async (path, text) => {
        await storage.write(path, encode(text))
        return pass()
      },

      remove: async path => {
        await storage.remove(path)
        index.remove(path)
        return pass()
      },

      read: async path => {
        try {
          return decode(await storage.read(path))
        } catch {
          // Absent rather than broken: the caller is asking whether it arrived.
          return null
        }
      },

      list: () => storage.list(),
      paths: () => index.paths(),
      reconcile: pass,
      connections: () => peer.connections(),

      /**
       * Every connection this node has, not only the ones to a given peer.
       *
       * `carriedBy` asks `getConnections(peerId)` and therefore cannot see the
       * connection to the relay at all - which is most of what somebody means
       * when they ask what a device is connected to after a hole punch.
       */
      allConnections: () => peer.node.getConnections().map(c => ({
        peer: String(c.remotePeer),
        address: String(c.remoteAddr ?? ''),
        limited: c.limits != null,
        encryption: String(c.encryption ?? 'none'),
        multiplexer: String(c.multiplexer ?? 'none'),
        direction: c.direction,
        status: c.status
      })),


      /**
       * Put bytes in the blockstore without writing them to storage.
       *
       * That is what a block belonging to a *different* share would look like
       * if one ever lingered in this process: reachable by address, backed by
       * no file here. See #70.
       */
      hold: async text => content.add(new TextEncoder().encode(text)),

      /**
       * Ask a *peer* for a file, rather than the network.
       *
       * This is #72's other path: bitswap refuses a limited connection, the
       * sync stream does not. Everything about who may ask is already settled -
       * the stream exists because the admission dialog said yes.
       */
      askPeerForFile: async (peerId, cid, timeoutMs = 60_000) => {
        const held = peers.get(peerId)

        if (held == null) return { error: 'no such peer' }

        const out = await askEach(cid, [{ id: peerId, send: held.send }], asks, { timeoutMs })

        return out.bytes == null
          ? { got: null, refused: out.refused.join('; ').replace(/^[^:]+: /, '') }
          : { got: new TextDecoder().decode(out.bytes), refused: null }
      },

      /** Ask for bytes by address, the way an admitted peer would. */
      fetch: async (cid, timeoutMs = 15000) => {
        try {
          const bytes = await Promise.race([
            content.get(cid),
            new Promise((_, no) => setTimeout(() => no(new Error('timed out')), timeoutMs))
          ])

          return new TextDecoder().decode(bytes)
        } catch {
          return null
        }
      },

      /** Who is out there, for a side that reached the meeting place. */
      heard: () => [...heardOnRelay],

      /** Open the sync stream to somebody found there. */
      call: async peerId => {
        try {
          attach(await peer.openSyncStream(peerId), peerId)
          return { ok: true, error: null }
        } catch (error) {
          return { ok: false, error: String(error?.message ?? error).slice(0, 200) }
        }
      },

      /**
       * Send an arbitrary message on the sync stream.
       *
       * For showing that a circuit carries application data of a real size,
       * rather than only the handful of bytes a Yjs update happens to be. The
       * receiving side files unknown types under `appMessages`.
       */
      sendApp: async (peerId, message) => {
        const held = peers.get(peerId)

        if (held == null) return { ok: false, error: 'no such peer' }

        try {
          await held.send(message)
          return { ok: true, error: null }
        } catch (error) {
          return { ok: false, error: String(error?.message ?? error).slice(0, 160) }
        }
      },

      /**
       * Push hard and report what the stream said.
       *
       * #74 step 3 is backpressure, and the question it turns on is whether
       * `send()` ever actually refuses here. The interface says it returns
       * false when the internal buffer is full **and may throw for the same
       * reason** - so this sends without waiting and counts both, rather than
       * assuming either.
       */
      /**
       * The same push, through the bulk path - so the two can be compared.
       *
       * Same messages, same stream, same run: the only difference is who
       * decides when the next block goes out.
       */
      pushBulk: async (peerId, { count = 8, bytes = 1024 * 1024 } = {}) => {
        const held = peers.get(peerId)

        if (held == null) return { error: 'no such peer' }

        const stream = held.stream
        const payload = 'x'.repeat(bytes)
        const out = { sent: 0, threw: 0, firstError: null, peakBuffer: 0 }

        // Sampled at every single `send()`, not on a timer and not between
        // messages. A timer reported a peak of zero, which was true whenever it
        // happened to fire and said nothing: `sendBulk` only yields when the
        // stream refuses, so a run where nothing is refused never gives the
        // timer a turn. Wrapping the call is the only place the number is real.
        out.refused = 0
        out.blocks = 0

        const realSend = stream.send.bind(stream)

        stream.send = block => {
          const accepted = realSend(block)

          out.blocks += 1
          if (accepted === false) out.refused += 1
          out.peakBuffer = Math.max(out.peakBuffer, stream.writeBufferLength ?? 0)

          return accepted
        }

        const watching = { restore: () => { stream.send = realSend } }

        try {
          for (let i = 0; i < count; i++) {
            try {
              await sendBulk(stream, held.codec.encode({ type: 'push-probe', i, payload }))
              out.sent += 1
            } catch (error) {
              out.threw += 1
              out.firstError ??= String(error?.message ?? error).slice(0, 160)
            }

            out.peakBuffer = Math.max(out.peakBuffer, stream?.writeBufferLength ?? 0)
          }
        } finally {
          watching.restore()
        }

        return out
      },

      pushHard: async (peerId, { count = 8, bytes = 1024 * 1024 } = {}) => {
        const held = peers.get(peerId)

        if (held == null) return { error: 'no such peer' }

        const stream = held.stream
        const payload = 'x'.repeat(bytes)
        const out = { sent: 0, refused: 0, threw: 0, firstError: null, peakBuffer: 0, neededDrain: 0 }

        // Sampled the same way as the bulk probe, so the peaks are comparable.
        // This path never yields, so the interval only fires once it is done -
        // which is why the in-loop reading below is kept as well.
        const watching = setInterval(() => {
          out.peakBuffer = Math.max(out.peakBuffer, stream?.writeBufferLength ?? 0)
        }, 1)

        for (let i = 0; i < count; i++) {
          try {
            const ok = held.send({ type: 'push-probe', i, payload })

            out.sent += 1
            if (ok === false) out.refused += 1
          } catch (error) {
            out.threw += 1
            out.firstError ??= String(error?.message ?? error).slice(0, 160)
          }

          out.peakBuffer = Math.max(out.peakBuffer, stream?.writeBufferLength ?? 0)
          if (stream?.writableNeedsDrain === true) out.neededDrain += 1
        }

        clearInterval(watching)

        return out
      },

      /** Which protocol this side negotiated with them. */
      spokenWith: peerId => peers.get(peerId)?.stream?.protocol ?? null,

      /** Every connection to them, and whether it is metered. */
      carriedBy: async peerId => {
        const { peerIdFromString } = await import('@libp2p/peer-id')

        return peer.node.getConnections(peerIdFromString(peerId))
          .map(c => ({
            address: String(c.remoteAddr ?? ''),
            limited: c.limits != null,
            // What actually carries it. A relayed connection negotiates
            // `/noise` and `/yamux`; a WebRTC one reports `native` and
            // `/webrtc`, because DTLS did the encrypting and the data channel
            // is the muxer. This is the only thing that says which is which
            // without believing the address.
            encryption: String(c.encryption ?? 'none'),
            multiplexer: String(c.multiplexer ?? 'none'),
            direction: String(c.direction ?? '?')
          }))
      }
    }

    return peer.peerId()
  }
}

// One side per browser context, which is what a device is.
let side = null

for (const name of ['peerId', 'createOffer', 'acceptOffer', 'acceptAnswer', 'write', 'remove', 'read', 'list', 'paths', 'reconcile', 'connections', 'useFolder', 'syncPeers', 'identity', 'lastInbound', 'appMessages', 'refuse', 'heard', 'call', 'carriedBy', 'spokenWith', 'sendApp', 'pushHard', 'pushBulk', 'allConnections', 'askPeerForFile', 'leaveMessage', 'inbox', 'hold', 'fetch']) {
  window.__ablage[name] = (...args) => side[name](...args)
}
