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
 * Separated from the doing so the table in PLAN.md can be tested directly:
 * every row here is a test, and none of them needs a browser, a network or a
 * filesystem.
 *
 * @param {{ cid: string | null, deletedAt: number | null } | undefined} entry
 * @param {{ cid: string } | undefined} local what storage has, if anything
 */
export function decide (entry, local) {
  const tombstoned = entry?.deletedAt != null

  if (entry == null) {
    // Storage has something the index has never heard of. Somebody dropped a
    // file in.
    return local == null ? AGREED : ANNOUNCE
  }

  if (tombstoned) {
    return local == null ? AGREED : REMOVE
  }

  if (local == null) {
    return FETCH
  }

  if (local.cid === entry.cid) {
    return AGREED
  }

  // Both sides have the path and disagree about its contents. Stage 2, and it
  // gets a decision of its own first - last-writer-wins would silently destroy
  // somebody's work, and two devices' clocks are not comparable.
  return CONFLICT
}

/**
 * Run one pass over every path either side knows about.
 *
 * @param {object} parts
 * @param {{ entries: () => Array<{ path: string, cid: string | null, deletedAt: number | null }> }} parts.index
 * @param {Storage} parts.storage
 * @param {Content} parts.content
 * @param {(path: string) => Promise<string>} [parts.cidOf] address of what
 *   storage holds; computed from the bytes unless supplied
 * @returns {Promise<Array<{ path: string, action: string }>>} what was done,
 *   for a caller that wants to show or assert it
 */
export async function reconcile ({ index, storage, content, cidOf }) {
  const entries = new Map(index.entries().map(entry => [entry.path, entry]))
  const present = new Set(await storage.list())

  const addressOf = cidOf ?? (async path => content.add(await storage.read(path)))

  // Union, not either side alone: a file only storage knows about has to be
  // announced, and a path only the index knows about has to be fetched.
  const paths = new Set([...entries.keys(), ...present])
  const done = []

  for (const path of paths) {
    const entry = entries.get(path)
    const local = present.has(path) ? { cid: await addressOf(path) } : undefined
    const action = decide(entry, local)

    switch (action) {
      case FETCH:
        await storage.write(path, await content.get(entry.cid))
        break

      case REMOVE:
        await storage.remove(path)
        break

      case ANNOUNCE: {
        const bytes = await storage.read(path)
        index.put(path, { cid: await content.add(bytes), size: bytes.byteLength })
        break
      }
    }

    if (action !== AGREED) {
      done.push({ path, action })
    }
  }

  return done
}
