/**
 * What the browser tests drive.
 *
 * Deliberately not the application: there is no application yet, and a test
 * that waited for one would be testing a plan. This exposes the parts that need
 * a browser to run at all - today storage, tomorrow the peer and the whole
 * reconciliation over a real connection.
 */
import { reconcile } from './reconcile.js'
import { opfsStorage } from './storage/opfs.js'

/** A named subdirectory per test, so one run cannot see another's files. */
async function scratch (name) {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(name, { create: true })
}

const decode = bytes => new TextDecoder().decode(bytes)
const encode = text => new TextEncoder().encode(text)

window.__ablage = {
  storage: async name => {
    const store = await opfsStorage({ root: await scratch(name) })

    return {
      list: () => store.list(),
      read: async path => decode(await store.read(path)),
      write: (path, text) => store.write(path, encode(text)),
      remove: path => store.remove(path),
      readBytes: async path => [...await store.read(path)]
    }
  },

  /** Wipe a scratch directory between tests. */
  clear: async name => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(name, { recursive: true }).catch(() => {})
  },

  reconcile
}
