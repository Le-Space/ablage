import * as lp from 'it-length-prefixed'

/**
 * One message in, one message out — which the sync stream did not have.
 *
 * **The failure, measured.** The receive loop did `JSON.parse` on whatever the
 * stream handed it, which assumes a message is always delivered as exactly one
 * chunk. That holds while messages are small and stops holding without warning:
 * a 4 MiB message arrived as **11 chunks, 9 of them unparsable**, and the loop
 * discarded each fragment in silence. Nothing threw, the sender was told it had
 * sent, and the far side was simply short a message.
 *
 * It is not a limit anybody chose. yamux frames a large write into pieces sized
 * by the send window, which grows and shrinks - so the same message can arrive
 * whole one minute and in pieces the next. That is what made it look like a
 * ceiling somewhere between 1 and 4 MiB when it is nothing of the kind.
 *
 * A length prefix says where a message ends, so the reader can wait for the
 * rest. `it-length-prefixed` is what bitswap uses on the same kind of stream.
 */

/** How much of a single message this side will accept. */
export const MAX_MESSAGE_BYTES = 32 * 1024 * 1024

/**
 * Frame one message.
 *
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function frame (bytes, { maxBytes = MAX_MESSAGE_BYTES } = {}) {
  // `it-length-prefixed` refuses anything over 4 MiB by default and says
  // `Message length too long`. That default is its own, not the stream's, and
  // it applied to the *whole* message - so a 4 MiB write failed before a single
  // byte was sent. Stated here so the limit is this module's decision.
  return lp.encode.single(bytes, { maxDataLength: maxBytes }).subarray()
}

/**
 * Read framed messages out of a stream of chunks.
 *
 * Keeps whatever is left over between calls, because the whole point is that a
 * message may span several chunks - and two messages may share one.
 *
 * @returns {(chunk: Uint8Array) => Uint8Array[]}
 */
export function reader ({ maxBytes = MAX_MESSAGE_BYTES } = {}) {
  /** @type {Uint8Array} */
  let held = new Uint8Array(0)

  return chunk => {
    const joined = new Uint8Array(held.byteLength + chunk.byteLength)

    joined.set(held, 0)
    joined.set(chunk, held.byteLength)
    held = joined

    const out = []

    while (true) {
      const taken = takeOne(held, maxBytes)

      if (taken == null) break

      out.push(taken.message)
      held = taken.rest
    }

    return out
  }
}

/**
 * One message off the front, or `null` while it is still incomplete.
 *
 * The varint is decoded by hand rather than with a stream helper: this has to
 * answer "not yet" without consuming anything, and an iterator-shaped decoder
 * cannot be asked that.
 */
function takeOne (bytes, maxBytes) {
  let length = 0
  let shift = 0
  let at = 0

  while (true) {
    if (at >= bytes.byteLength) return null

    const byte = bytes[at]

    at += 1
    length += (byte & 0x7f) * Math.pow(2, shift)

    if ((byte & 0x80) === 0) break

    shift += 7

    // A prefix that never ends is not a slow message, it is a broken one.
    if (shift > 35) throw new Error('length prefix is not a varint')
  }

  if (length > maxBytes) throw new Error(`message of ${length} bytes is over the ${maxBytes} limit`)
  if (bytes.byteLength < at + length) return null

  return { message: bytes.subarray(at, at + length), rest: bytes.subarray(at + length) }
}

/**
 * How to write and read on a stream, given which protocol was negotiated.
 *
 * Both sides of this app used to build these by hand, in two places that had to
 * stay in step and twice did not. One function, two callers.
 *
 * @param {string} protocol
 * @param {string} framedProtocol the id that means "messages carry a length"
 */
export function codecFor (protocol, framedProtocol) {
  const framed = protocol === framedProtocol
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const read = framed ? reader() : null

  return {
    framed,

    /** @param {unknown} message */
    encode: message => {
      const bytes = encoder.encode(JSON.stringify(message))

      return framed ? frame(bytes) : bytes
    },

    /**
     * Every complete message in this chunk - none, one, or several.
     *
     * Unframed, a chunk is assumed to be exactly one message, which is the
     * assumption 1.1.0 exists to stop making. A fragment simply fails to parse
     * and is dropped, as it always was: there is nothing better to do with half
     * a message from a peer that cannot say how long it is.
     *
     * @param {Uint8Array} chunk
     */
    decode: chunk => {
      if (!framed) {
        try {
          return [JSON.parse(decoder.decode(chunk))]
        } catch {
          return []
        }
      }

      return read(chunk).map(bytes => JSON.parse(decoder.decode(bytes)))
    }
  }
}
