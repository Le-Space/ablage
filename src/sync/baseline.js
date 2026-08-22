/**
 * What this device last agreed with the other one about.
 *
 * The reconciler cannot tell "I changed this file" from "we both changed it" by
 * comparing two content addresses: both look like *the index says X, storage
 * says Y*. The difference is which of the two moved since the last agreement,
 * and that needs a third value.
 *
 * **Local, deliberately not in the shared document.** It is this device's memory
 * of what it has seen, and two devices legitimately remember different things -
 * putting it in the CRDT would make one device's memory overwrite the other's,
 * which is exactly the confusion it exists to resolve.
 *
 * Persisted, because losing it is not harmless: a baseline that is gone reads
 * as "both sides changed", so every file that had been edited since the last
 * agreement would come back as a conflicted copy after a reload. Erring towards
 * keeping bytes is the right direction to fail in, and it is still a mess to
 * clean up.
 *
 * `localStorage` rather than IndexedDB: it is a flat map of short strings, it is
 * written on every agreement, and a synchronous write is exactly what suits
 * that. The handle store next door needs IndexedDB because a handle is not a
 * string.
 *
 * @param {{ key?: string, storage?: Storage }} [options]
 */
export function baseline ({ key = 'ablage.baseline', storage = globalThis.localStorage } = {}) {
  let known

  try {
    known = new Map(Object.entries(JSON.parse(storage?.getItem(key) ?? '{}')))
  } catch {
    // Unreadable or absent. Starting empty costs conflicted copies once, which
    // is recoverable; guessing would not be.
    known = new Map()
  }

  const save = () => {
    try {
      storage?.setItem(key, JSON.stringify(Object.fromEntries(known)))
    } catch {
      // Storage blocked or full. The baseline then holds for this session only,
      // which is what it did before it was persisted at all.
    }
  }

  return {
    /** @param {string} path @returns {string | null} */
    get (path) {
      return known.get(path) ?? null
    },

    /** Record that this path is now agreed at this address. */
    set (path, cid) {
      if (known.get(path) === cid) return

      known.set(path, cid)
      save()
    },

    forget (path) {
      if (!known.delete(path)) return

      save()
    },

    snapshot () {
      return Object.fromEntries(known)
    },

    /**
     * Forget every agreement at once.
     *
     * For a folder switch. What this device last agreed with another about
     * `notes/todo.md` says nothing once `notes/todo.md` means a different file
     * in a different folder - and keeping it would make the first comparison
     * after the switch read an edit as an agreement.
     */
    clear () {
      if (known.size === 0) return

      known.clear()
      save()
    }
  }
}
