import * as Y from 'yjs'

/**
 * The index: which paths exist, and what is in them.
 *
 * A `Y.Map` keyed by path. **The bytes are never in here** - an entry carries a
 * content address and the bytes travel over bitswap. That is the one rule this
 * project has, and it is what keeps a folder of photographs from becoming a CRDT
 * of photographs.
 *
 * Paths are stored whole from the first entry, even while there is only one flat
 * directory. That is what makes trees a display problem later rather than a
 * migration: the index is already a map of paths.
 */

const MAP = 'files'

/**
 * @typedef {object} Entry
 * @property {string} cid content address of the bytes
 * @property {number} size in bytes
 * @property {number} mtime milliseconds since the epoch, from the writer
 * @property {number | null} deletedAt a tombstone, not a removal - see below
 */

/**
 * @param {Y.Doc} doc
 */
export function fileIndex (doc) {
  const files = doc.getMap(MAP)

  return {
    /**
     * @param {string} path
     * @param {{ cid: string, size: number, mtime?: number }} entry
     */
    put (path, { cid, size, mtime = Date.now() }) {
      files.set(path, { cid, size, mtime, deletedAt: null })
    },

    /**
     * Mark a path deleted without removing the entry.
     *
     * A tombstone rather than a `delete`, because the other device may not have
     * heard yet. Removing the key would let its copy re-add the file on the next
     * reconciliation - the deletion would undo itself, which is the failure
     * every sync tool has shipped at least once.
     *
     * How long a tombstone lives is an open question, deliberately: one that
     * expires can be resurrected by a device returning after it expired, one
     * that never expires grows forever. Stage 1 keeps them.
     *
     * @param {string} path
     */
    remove (path, at = Date.now()) {
      const existing = files.get(path)

      if (existing == null) {
        // Deleting something never seen is still worth recording: the other
        // side may be about to announce it.
        files.set(path, { cid: null, size: 0, mtime: at, deletedAt: at })
        return
      }

      files.set(path, { ...existing, deletedAt: at })
    },

    /** @param {string} path @returns {Entry | undefined} */
    get (path) {
      return files.get(path)
    },

    /** Live paths only - what a folder listing would show. */
    paths () {
      return [...files.keys()].filter(path => files.get(path)?.deletedAt == null)
    },

    /** Everything, tombstones included. What the reconciler needs. */
    entries () {
      return [...files.entries()].map(([path, entry]) => ({ path, ...entry }))
    },

    /**
     * @param {(paths: string[]) => void} listener called with the paths that
     *   changed, local or remote alike - the reconciler does not care which.
     */
    observe (listener) {
      const handler = event => listener([...event.keysChanged])
      files.observe(handler)
      return () => files.unobserve(handler)
    }
  }
}
