/**
 * The peers this device is syncing with, and what happens to them when the
 * folder underneath changes.
 *
 * Extracted from the application rather than left there, because the switch is
 * the part worth testing and the application is the part a test cannot reach:
 * it begins with a folder picker, which opens a native dialog no automation can
 * drive. Here it is a map and three operations, and the browser tests exercise
 * the same module the app runs.
 *
 * Each entry keeps the **channel** beside the provider. A switch replaces the
 * provider - it has to, the document underneath is a new one - over the stream
 * that was already there. Without the channel the only way to rebuild would be
 * to drop the connection and hand somebody a QR code again.
 */

export function peerSet () {
  /** @type {Map<string, { provider: any, send: (message: object) => unknown }>} */
  const held = new Map()

  return {
    get size () {
      return held.size
    },

    ids () {
      return [...held.keys()]
    },

    get (peerId) {
      return held.get(peerId) ?? null
    },

    /** A reconnection replaces that peer rather than accumulating one per attempt. */
    add (peerId, provider, send) {
      held.get(peerId)?.provider.destroy()
      held.set(peerId, { provider, send })
    },

    /**
     * Stop describing this folder to somebody, and keep the connection.
     *
     * Dropping the connection would read as a fault rather than as an answer -
     * "keep my folder" is a decision about what to share, not about whether to
     * be reachable.
     */
    drop (peerId) {
      const entry = held.get(peerId)

      if (entry == null) return false

      entry.provider.destroy()
      held.delete(peerId)
      return true
    },

    /** Only if it is still the current one: a reconnection may have replaced it. */
    dropIfCurrent (peerId, provider) {
      if (held.get(peerId)?.provider !== provider) return false

      return this.drop(peerId)
    },

    /**
     * The folder changed. Tell whoever may hear it, then rebuild those on the
     * new document and let the rest go.
     *
     * The message goes first and over the *old* channels: they are what the
     * other side is synced against, and one sent after the swap would arrive
     * describing a document the peer has never seen.
     *
     * @param {object} options
     * @param {readonly string[]} options.tell peers that may be sent the folder
     * @param {object} options.message what to send them
     * @param {() => void} [options.beforeRebuild] run between the two - this is
     *   where the new document is made. Explicit rather than left to the
     *   caller's ordering, because doing it too early sends a message from a
     *   document the peer has never seen, and too late rebuilds on the old one.
     * @param {(send: (message: object) => unknown) => any} options.rebuild
     *   makes a provider on the new document over an existing channel
     */
    switchFolder ({ tell, message, beforeRebuild, rebuild }) {
      const allowed = new Set(tell)

      for (const peerId of allowed) {
        held.get(peerId)?.send(message)
      }

      beforeRebuild?.()

      for (const [peerId, entry] of [...held]) {
        entry.provider.destroy()

        if (!allowed.has(peerId)) {
          held.delete(peerId)
          continue
        }

        held.set(peerId, { provider: rebuild(entry.send), send: entry.send })
      }

      return [...allowed].filter(peerId => held.has(peerId))
    },

    /**
     * This device follows somebody else's switch: start again on the new
     * document and ask them for everything.
     *
     * @returns {any | null} the new provider, or null if that peer has gone
     */
    follow (peerId, rebuild) {
      const entry = held.get(peerId)

      if (entry == null) return null

      entry.provider.destroy()

      const provider = rebuild(entry.send)

      held.set(peerId, { provider, send: entry.send })
      return provider
    }
  }
}
