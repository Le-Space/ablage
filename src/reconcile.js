/**
 * Where the index and storage disagree, and what to do about it.
 *
 * This is the application. Yjs holds an index, Helia holds bytes, and neither
 * of them knows that a path with a content address should become a file on
 * disk. That translation is here.
 *
 * **A comparison, not an event log.** Both triggers - the index changed, or
 * storage changed - run the same pass, and the pass asks one question of every
 * path it knows: do these two agree? A missed event is then a non-event, because
 * the next pass finds the same disagreement. An event-driven design assumes
 * every change was seen, and this project has already paid for what happens when
 * that assumption is wrong after a reconnection.
 */

/**
 * @typedef {object} Storage
 * @property {() => Promise<string[]>} list
 * @property {(path: string) => Promise<Uint8Array>} read
 * @property {(path: string, bytes: Uint8Array) => Promise<void>} write
 * @property {(path: string) => Promise<void>} remove
 */

/**
 * @typedef {object} Content
 * @property {(bytes: Uint8Array) => Promise<string>} add bytes in, CID out
 * @property {(cid: string) => Promise<Uint8Array>} get and back again
 */

/** What a single path needs doing. Named so a log line reads as a sentence. */
export const FETCH = 'fetch'
export const REMOVE = 'remove'
export const ANNOUNCE = 'announce'
export const AGREED = 'agreed'
export const CONFLICT = 'conflict'

/**
 * Decide, for one path, without doing anything about it.
 *
 * Three values, not two. `entry` is what the shared index says, `local` is what
 * storage holds, and `base` is what this device last agreed with the other one
 * about. Without `base`, "I edited this" and "we both edited this" are the same
 * observation - the index says one address, storage says another - and telling
 * them apart is the whole of stage 2.
 *
 * Separated from the doing so the table in PLAN.md is a set of unit tests:
 * every row here runs without a browser, a network or a filesystem.
 *
 * @param {{ cid: string | null, deletedAt: number | null } | undefined} entry
 * @param {{ cid: string } | undefined} local what storage has, if anything
 * @param {string | null} base the address both sides last agreed on
 */
export function decide (entry, local, base = null) {
  const tombstoned = entry?.deletedAt != null

  if (entry == null) {
    // Storage has something the index has never heard of. Somebody dropped a
    // file in.
    return local == null ? AGREED : ANNOUNCE
  }

  if (tombstoned) {
    if (local == null) return AGREED

    // Deleted over there, edited here. Deleting now would throw away work that
    // the other side never saw, so this is a conflict like any other.
    return base != null && local.cid !== base ? CONFLICT : REMOVE
  }

  if (local == null) {
    return FETCH
  }

  if (local.cid === entry.cid) {
    return AGREED
  }

  // Both moved away from the same starting point, or from no shared starting
  // point at all. Nothing here can pick a winner: last-writer-wins destroys
  // work silently, and two devices' clocks are not comparable.
  if (local.cid === base) return FETCH        // only the other side moved
  if (entry.cid === base) return ANNOUNCE     // only this side moved

  return CONFLICT
}

/**
 * How a conflict is settled. A parameter, not an `if` in the middle of the pass.
 *
 * Whichever rule is used has to be the **same on both devices**, and that is a
 * property of the shape rather than a matter of discipline: the resolution
 * writes into the shared index, so it replicates. If one side kept both copies
 * and the other overwrote, the winner would be whoever reacted first, not
 * whoever configured what. A setting that works depending on timing is worse
 * than none.
 *
 * Which is why, when this does become configurable, the setting belongs in the
 * shared document as a property of the folder - never per device.
 */

/**
 * Keep both, and name the rescued one after its own content.
 *
 * Dropbox's rule, for Dropbox's reason: nothing is ever lost, and a human looks
 * once. The suffix is the first characters of the local address rather than a
 * device name or a timestamp, so it is **derived from the bytes**: two devices
 * that diverged to the same content produce the same rescue name and converge
 * on one entry instead of two.
 */
export function keepBoth (path, { localCid }) {
  const dot = path.lastIndexOf('.')
  const stem = dot > 0 ? path.slice(0, dot) : path
  const extension = dot > 0 ? path.slice(dot) : ''

  return { rescueAs: `${stem} (conflicted copy ${localCid.slice(-6)})${extension}` }
}

/** Report it and touch nothing. What stage 1 did, kept for callers who want it. */
export function refuse () {
  return null
}

/**
 * Run one pass over every path either side knows about.
 *
 * @param {object} parts
 * @param {{ entries: () => Array<{ path: string, cid: string | null, deletedAt: number | null }>, put: Function }} parts.index
 * @param {Storage} parts.storage
 * @param {Content} parts.content
 * @param {{ get: (path: string) => string | null, set: (path: string, cid: string) => void, forget: (path: string) => void }} [parts.base]
 * @param {(path: string, addresses: { entryCid: string | null, localCid: string }) => ({ rescueAs: string } | null)} [parts.resolve]
 * @returns {Promise<Array<{ path: string, action: string }>>} what was done
 */
export async function reconcile ({ index, storage, content, base, resolve = keepBoth }) {
  const entries = new Map(index.entries().map(entry => [entry.path, entry]))
  const present = new Set(await storage.list())

  const addressOf = async path => content.add(await storage.read(path))

  // Union, not either side alone: a file only storage knows about has to be
  // announced, and a path only the index knows about has to be fetched.
  const paths = new Set([...entries.keys(), ...present])
  const done = []

  for (const path of paths) {
    const entry = entries.get(path)
    const local = present.has(path) ? { cid: await addressOf(path) } : undefined
    let action = decide(entry, local, base?.get(path) ?? null)

    if (action === CONFLICT) {
      const settlement = resolve(path, { entryCid: entry?.cid ?? null, localCid: local.cid })

      if (settlement != null) {
        // The local bytes move aside under their own name before the shared
        // version lands on the original path. Order matters: the other way
        // round overwrites what is being rescued.
        const bytes = await storage.read(path)

        await storage.write(settlement.rescueAs, bytes)
        index.put(settlement.rescueAs, { cid: local.cid, size: bytes.byteLength })
        base?.set(settlement.rescueAs, local.cid)

        done.push({ path: settlement.rescueAs, action: ANNOUNCE })
        // And now the ordinary case applies to the original path.
        action = entry.deletedAt != null ? REMOVE : FETCH
      }
    }

    switch (action) {
      case FETCH:
        await storage.write(path, await content.get(entry.cid))
        base?.set(path, entry.cid)
        break

      case REMOVE:
        await storage.remove(path)
        base?.forget(path)
        break

      case ANNOUNCE: {
        const bytes = await storage.read(path)
        const cid = await content.add(bytes)

        index.put(path, { cid, size: bytes.byteLength })
        base?.set(path, cid)
        break
      }

      case AGREED:
        // Agreement is worth remembering: it is the point a later change is
        // measured against.
        if (local != null) base?.set(path, local.cid)
        break
    }

    if (action !== AGREED) {
      done.push({ path, action })
    }
  }

  return done
}
