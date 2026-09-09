import { FILE_GIVE, FILE_NONE, ask, take } from './file-transfer.js'

/**
 * When the network does not have a file, ask the people who do.
 *
 * #72 in the app rather than the harness. `reconcile` asks `content.get` for
 * every file it is missing, and `content.get` is bitswap - which will not run
 * on a relayed connection (ipfs/helia#1124). So on the one path two phones
 * behind carrier NAT can have, the list arrived and the files never did, with
 * no error anywhere. `file-transfer.js` built the other door: ask an admitted
 * peer over the sync stream, which crosses circuits, and believe the answer
 * only if it hashes to what was asked for. This connects that door to the
 * place that needs it.
 *
 * Two halves, shared by `main.js` and the harness so they cannot drift:
 *
 * - `askRegistry()` remembers which content addresses this side is waiting
 *   on, and settles the wait when an answer arrives on any stream.
 * - `withPeerFallback(content, ...)` is `content` with a second try: bitswap
 *   first, because on a direct connection it is faster and carries any size;
 *   then each connected peer in turn, until one hands over bytes that verify.
 *
 * The order matters and is deliberate. bitswap is never *skipped* - a device
 * on the same Wi-Fi should not start routing files through the sync stream
 * because the fallback exists. It is asked first, and only its failure opens
 * the second door.
 */

/** Long enough for a peer on a slow circuit to read and send an 8 MiB file. */
export const ASK_TIMEOUT_MS = 30_000

/**
 * The content addresses this side is waiting on, and how a wait ends.
 *
 * One waiter per address: a second ask for the same address while the first
 * is open would race the same answer, so it is refused rather than queued.
 */
export function askRegistry () {
  /** @type {Map<string, (out: { bytes?: Uint8Array, refused?: string }) => void>} */
  const waiting = new Map()

  return {
    /** @param {string} cid */
    isWaitingFor: cid => waiting.has(cid),

    /**
     * Wait for an answer about `cid`, or for the clock to run out.
     *
     * @param {string} cid
     * @param {number} [timeoutMs]
     * @returns {Promise<{ bytes?: Uint8Array, refused?: string }>}
     */
    waitFor (cid, timeoutMs = ASK_TIMEOUT_MS) {
      if (waiting.has(cid)) return Promise.resolve({ refused: 'already asking' })

      return new Promise(resolve => {
        const timer = setTimeout(() => {
          if (waiting.delete(cid)) resolve({ refused: 'nobody answered' })
        }, timeoutMs)

        waiting.set(cid, out => {
          clearTimeout(timer)
          waiting.delete(cid)
          resolve(out)
        })
      })
    },

    /**
     * Give up on a wait from our side - the ask never left, or the stream died.
     *
     * Without this a peer whose `send` throws leaves its wait open, and the
     * next peer's `waitFor` for the same address is refused as "already
     * asking" - which the unit test for "who said what" caught before it
     * reached a device.
     *
     * @param {string} cid
     * @param {string} reason
     */
    cancel (cid, reason) {
      const resolve = waiting.get(cid)

      if (resolve != null) resolve({ refused: reason })
    },

    /**
     * An answer arrived on some stream. Settles the matching wait, if any.
     *
     * Verification lives in `take`: the bytes are hashed with the function
     * that produced the address, so a peer that answers with the wrong bytes
     * settles the wait with a refusal, not with a file.
     *
     * @param {unknown} message
     * @param {(bytes: Uint8Array) => Promise<string>} hash
     * @returns {boolean} whether this was an answer to something we asked
     */
    settle (message, hash) {
      const m = /** @type {any} */ (message)

      if (m == null || (m.type !== FILE_GIVE && m.type !== FILE_NONE)) return false

      const resolve = waiting.get(m.cid)

      if (resolve == null) return false

      take(m, m.cid, hash).then(resolve, error => resolve({ refused: String(error?.message ?? error) }))
      return true
    }
  }
}

/**
 * Ask each peer in turn until one hands over bytes that verify.
 *
 * In turn, not all at once: a file is up to 8 MiB this way, and three peers
 * answering at the same time is three copies over connections that may all be
 * metered. The first refusal moves on; the first bytes win.
 *
 * @param {string} cid
 * @param {Array<{ id: string, send: (message: unknown) => unknown }>} targets
 * @param {ReturnType<typeof askRegistry>} registry
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ bytes: Uint8Array } | { refused: string[] }>}
 */
export async function askEach (cid, targets, registry, { timeoutMs = ASK_TIMEOUT_MS } = {}) {
  const refused = []

  for (const target of targets) {
    try {
      const waiting = registry.waitFor(cid, timeoutMs)

      await target.send(ask(cid))

      const out = await waiting

      if (out.bytes != null) return { bytes: out.bytes }

      refused.push(`${target.id}: ${out.refused ?? 'declined'}`)
    } catch (error) {
      const why = String(error?.message ?? error)

      // The ask did not go out, so nothing is coming: close the wait now
      // rather than letting the next peer trip over it.
      registry.cancel(cid, why)
      refused.push(`${target.id}: ${why}`)
    }
  }

  return { refused }
}

/**
 * `content`, with the peers as a second try.
 *
 * Everything but `get` passes straight through, so the caller keeps using the
 * same object - `add` in particular, which is what `take` verifies against.
 *
 * @template {{ get: Function }} C
 * @param {C} content
 * @param {{ askAll: (cid: string) => Promise<{ bytes?: Uint8Array, refused?: string[] }> }} options
 * @returns {C}
 */
export function withPeerFallback (content, { askAll }) {
  return {
    ...content,

    async get (cid, options) {
      try {
        return await content.get(cid, options)
      } catch (first) {
        const out = await askAll(cid)

        if (out.bytes != null) return out.bytes

        // Both doors closed, and the message says so: which peer said what,
        // after the network's own reason. "timed out" alone was the state
        // #72 opens with.
        const why = (out.refused ?? []).join('; ') || 'no peer to ask'

        throw new Error(`not on the network (${String(first?.message ?? first)}) and no peer had it (${why})`)
      }
    }
  }
}
