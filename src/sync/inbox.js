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
