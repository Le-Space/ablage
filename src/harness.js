/**
 * What the browser tests drive.
 *
 * Deliberately not the application - there is no application yet, and a test
 * waiting for one would be testing a plan. This assembles the parts that need a
 * browser: storage, a peer, content addressing, and the reconciliation that
 * joins them.
 */
import * as Y from 'yjs'

import { createContent } from './content.js'
import { createPeer } from './peer.js'
import { reconcile } from './reconcile.js'
import { baseline } from './sync/baseline.js'
import { fileIndex } from './sync/file-index.js'
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
  meetAndDial: async () => {
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
      onSyncStream: (stream, peerId) => inbound.push(peerId)
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
  bitswapAcrossTheRelay: async () => {
    const { createPeer } = await import('./peer.js')
    const { createContent } = await import('./content.js')

    const start = async () => {
      const peer = await createPeer({ relayOptIn: true, relayBootstrapAddrs: await relayAddresses() })
      const heard = new Set()

      peer.node.addEventListener('peer:discovery', event => heard.add(event.detail.id.toString()))

      return { peer, content: await createContent(peer.node), heard }
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
  start: async name => {
    await window.__ablage.clear(name)

    let doc = new Y.Doc()
    let index = fileIndex(doc)
    const base = baseline({ key: `ablage.baseline.${name}` })
    let storage = await directoryStorage({ root: await scratch(name) })

    const peers = new Map()
    const appMessages = []
    let lastInbound = null
    let pending = Promise.resolve()

    /** Serialised: two passes at once would both see the same disagreement. */
    const pass = () => {
      pending = pending.then(() => reconcile({ index, storage, content, base }))
      return pending
    }

    // One per peer, and each loop reads its own - the same shape `main.js`
    // has. A shared binding lets a second peer take over the first one's
    // incoming messages, which is the bug `several-peers.test.js` is for.
    const attach = (stream, peerId) => {
      const send = message => stream.send(encode(JSON.stringify(message)))
      const provider = new Provider(doc, send)

      peers.get(peerId)?.provider.destroy()
      peers.set(peerId, { provider, send, stream })

      // Both sides ask, the same as `main.js`. A `sync-request` is answered
      // with what its *sender* lacks, so one request moves a folder one way
      // and the side that was asked never catches up.
      provider.requestSync()

      ;(async () => {
        for await (const data of stream) {
          const message = JSON.parse(decode(data.subarray?.() ?? data))

          // The application's own messages, kept out of the provider - the same
          // split `main.js` makes. Recorded here so a test can see that one
          // arrived, rather than only that a stream ended.
          if (message.type === 'sync-refused' || message.type === 'folder-switch') {
            appMessages.push({ from: peerId, message })
            continue
          }

          provider.receive(message)
          // A remote change is a reason to look at storage again.
          pass().catch(() => {})
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
      onSyncStream: (stream, peerId, address) => {
        lastInbound = { peerId, address }
        attach(stream, peerId)
      }
    })

    const content = await createContent(peer.node)

    side = {
      peerId: () => peer.peerId(),

      /** How the last inbound sync stream reached this device. */
      lastInbound: () => lastInbound,

      /** How many peers this side is talking to right now. */
      syncPeers: () => peers.size,

      /** Application messages that arrived on a sync stream. */
      appMessages: () => [...appMessages],

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
      connections: () => peer.connections()
    }

    return peer.peerId()
  }
}

// One side per browser context, which is what a device is.
let side = null

for (const name of ['peerId', 'createOffer', 'acceptOffer', 'acceptAnswer', 'write', 'remove', 'read', 'list', 'paths', 'reconcile', 'connections', 'useFolder', 'syncPeers', 'identity', 'lastInbound', 'appMessages', 'refuse']) {
  window.__ablage[name] = (...args) => side[name](...args)
}
