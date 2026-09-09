/**
 * A message from somebody who is not syncing with you.
 *
 * The inbox in #75: a visitor on a website leaves a name and what they want,
 * and it reaches a device of ours. Files are the other half and are not this -
 * they travel by bitswap, which refuses a relayed connection (#72), and a
 * visitor on a website almost never has a direct path to a phone. A message on
 * the sync stream does cross a circuit, measured, so that is the half that can
 * be built today.
 *
 * **Everything here is a stranger's input.** It arrives on a stream anyone who
 * reaches the inbox may open, so nothing is trusted: the fields are checked,
 * trimmed and cut to a length, and what cannot be made sense of is refused
 * rather than repaired. The one thing that is *not* checked is the peer id -
 * Noise has already established which peer sent this, and it is on the
 * connection rather than in the message.
 */

import { safeStore } from './baseline.js'

export const INBOX_MESSAGE = 'inbox-message'

/** Enough to say who you are without being a place to put an essay. */
export const MAX_NAME = 80

/**
 * Enough for what somebody wants, and far below the 32 MiB the framed sync
 * stream would carry - the limit here is about what a person should be asked to
 * read, not what the transport allows.
 */
export const MAX_TEXT = 2000

/**
 * @param {{ name?: unknown, text?: unknown }} fields
 * @returns {{ type: string, name: string, text: string, at: number }}
 */
export function inboxMessage ({ name, text }) {
  const said = trimmed(text, MAX_TEXT)

  if (said === '') throw new Error('a message with nothing in it is not a message')

  return {
    type: INBOX_MESSAGE,
    // Optional on purpose. Somebody who will not give a name still has
    // something to say, and a required field would only be filled with "x".
    name: trimmed(name, MAX_NAME),
    text: said,
    at: Date.now()
  }
}

/**
 * The same message as it should be believed on arrival.
 *
 * `at` is the sender's clock and is therefore theirs, not ours: it is kept as
 * `saidAt` for display and never used to order anything, because a stranger can
 * put any number in it.
 *
 * @param {unknown} message
 * @param {string} from the peer id, from the connection rather than the message
 * @returns {{ from: string, name: string, text: string, saidAt: number | null, arrivedAt: number } | null}
 */
export function received (message, from) {
  if (message == null || typeof message !== 'object') return null
  if (/** @type {any} */ (message).type !== INBOX_MESSAGE) return null

  const text = trimmed(/** @type {any} */ (message).text, MAX_TEXT)

  if (text === '') return null

  const at = /** @type {any} */ (message).at

  return {
    from,
    name: trimmed(/** @type {any} */ (message).name, MAX_NAME),
    text,
    saidAt: Number.isFinite(at) ? Number(at) : null,
    // Ours, and the only one worth ordering by.
    arrivedAt: Date.now()
  }
}

/**
 * A string, trimmed and cut - never `undefined`, never an object.
 *
 * Cut rather than refused: somebody who pastes half a document has still said
 * something, and losing the rest is friendlier than losing all of it.
 */
function trimmed (value, limit) {
  if (typeof value !== 'string') return ''

  return value.trim().slice(0, limit)
}

/**
 * Enough to be an inbox and not enough to be an archive. Two thousand
 * characters times two hundred is well inside what a browser keeps for an
 * origin, and somebody with more than two hundred unread messages from
 * strangers has a different problem than storage.
 */
export const MAX_KEPT = 200

/**
 * What arrived, kept across reloads.
 *
 * #84 drew a message and forgot it the moment the page went away - which for a
 * feature whose whole point is "somebody left you something while you were not
 * looking" was most of the feature missing. This keeps the last `limit`
 * messages, newest first, under one key per share.
 *
 * `storage` defaults through `safeStore()` and both the read and every write
 * sit in their own `try`: a browser that blocks `localStorage` still runs, and
 * then the inbox holds for this page and no longer - the safe half of the
 * mistake, and the same shape `sharing.js` and `fetchable.js` have.
 *
 * @param {{ key?: string, storage?: Storage | null, limit?: number }} [options]
 */
export function inbox ({ key = 'ablage.inbox', storage = safeStore(), limit = MAX_KEPT } = {}) {
  /** @type {ReturnType<typeof received>[]} newest first */
  let kept = []

  try {
    const read = JSON.parse(storage?.getItem(key) ?? '[]')

    // Believed only as far as it is the shape we wrote. Storage is ours, but a
    // half-written value or a hand-edited one is not a reason to refuse to
    // start.
    if (Array.isArray(read)) kept = read.filter(isKept).slice(0, limit)
  } catch {
    kept = []
  }

  const save = () => {
    try {
      storage?.setItem(key, JSON.stringify(kept))
    } catch {
      // Holds for this page, which is what it did before this existed.
    }
  }

  return {
    /** Newest first. A copy: nobody gets to edit history through the list. */
    all: () => kept.map(m => ({ ...m })),

    /**
     * Keep one, in front, and let the oldest go past the limit.
     *
     * @param {ReturnType<typeof received>} said as `received` returns it
     */
    add (said) {
      if (!isKept(said)) return

      kept = [{ ...said }, ...kept].slice(0, limit)
      save()
    },

    /** Everything, gone - for the person, not for a peer. */
    clear () {
      kept = []
      save()
    }
  }
}

/** The shape `received` produces, and nothing looser. */
function isKept (m) {
  return m != null && typeof m === 'object' &&
    typeof m.from === 'string' && m.from !== '' &&
    typeof m.name === 'string' &&
    typeof m.text === 'string' && m.text !== '' &&
    (m.saidAt === null || Number.isFinite(m.saidAt)) &&
    Number.isFinite(m.arrivedAt)
}
