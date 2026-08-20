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

    const doc = new Y.Doc()
    const index = fileIndex(doc)
    const base = baseline({ key: `ablage.baseline.${name}` })
    const storage = await directoryStorage({ root: await scratch(name) })

    let provider = null
    let pending = Promise.resolve()

    /** Serialised: two passes at once would both see the same disagreement. */
    const pass = () => {
      pending = pending.then(() => reconcile({ index, storage, content, base }))
      return pending
    }

    const attach = stream => {
      const send = message => stream.send(encode(JSON.stringify(message)))

      provider = new Provider(doc, send)

      ;(async () => {
        for await (const data of stream) {
          provider.receive(JSON.parse(decode(data.subarray?.() ?? data)))
          // A remote change is a reason to look at storage again.
          pass().catch(() => {})
        }
      })().catch(() => {})

      return provider
    }

    // No STUN: two contexts on one machine, and a deterministic run beats a
    // claim about whatever network the test happens to be on.
    const peer = await createPeer({
      rtcConfiguration: { iceServers: [] },
      onSyncStream: stream => { attach(stream) }
    })

    const content = await createContent(peer.node)

    side = {
      peerId: () => peer.peerId(),
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
        await attach(stream).requestSync()
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

for (const name of ['peerId', 'createOffer', 'acceptOffer', 'acceptAnswer', 'write', 'remove', 'read', 'list', 'paths', 'reconcile', 'connections']) {
  window.__ablage[name] = (...args) => side[name](...args)
}
