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
 * Kept in memory here. Surviving a reload is stage 3's problem, along with the
 * picked folder: a baseline that is lost reads as "both sides changed", which
 * errs towards keeping bytes rather than losing them.
 */
export function baseline (initial = {}) {
  const known = new Map(Object.entries(initial))

  return {
    /** @param {string} path @returns {string | null} */
    get (path) {
      return known.get(path) ?? null
    },

    /** Record that this path is now agreed at this address. */
    set (path, cid) {
      known.set(path, cid)
    },

    forget (path) {
      known.delete(path)
    },

    snapshot () {
      return Object.fromEntries(known)
    }
  }
}
