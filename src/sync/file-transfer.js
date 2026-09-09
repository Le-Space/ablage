/**
 * Ask a peer for a file, over the stream that already crosses circuits.
 *
 * #72: on a relay-only connection the file list arrives and the files never do.
 * The list travels on the sync stream, which sets `runOnLimitedConnection` on
 * both sides; the bytes travel by bitswap, which does not and cannot be made to
 * (ipfs/helia#1124). Two phones on mobile data behind carrier NAT is not an
 * exotic case - it is the one this app was built for.
 *
 * #72 names two ways out and this is the cheaper: move the bytes over the
 * admitted sync stream. It needs no upstream change and exposes no blockstore -
 * the stream is already gated by the admission dialog, so the peer asking is
 * one that was let in.
 *
 * **What is not trusted.** A peer answering with bytes is answering about a
 * content address, and a content address is checkable: the bytes are hashed the
 * same way they would have been on the way in, and a mismatch is refused. So a
 * peer can decline, and it can be slow, but it cannot hand us something else
 * and have it written to a folder under a name we asked for.
 */

/**
 * A ceiling on what one ask may carry.
 *
 * Not the transport's - the sync stream carries 32 MiB (`framing.js`) and a
 * circuit carried 16 MiB in 585 ms when it was measured. This is about what an
 * unattended device should hand out on request without anybody choosing to, and
 * about base64: the bytes ride inside a JSON message, which costs a third again
 * in transit. A larger file is not refused forever, it is refused *this way*,
 * and bitswap still fetches it wherever there is a direct path.
 */
export const MAX_TRANSFER_BYTES = 8 * 1024 * 1024

export const FILE_ASK = 'file-ask'
export const FILE_GIVE = 'file-give'
export const FILE_NONE = 'file-none'

/** @param {string} cid */
export function ask (cid) {
  return { type: FILE_ASK, cid }
}

/**
 * What to answer when somebody asks for a content address.
 *
 * `read` is the local lookup; it returns bytes or null. Anything it throws is
 * an answer too - a device that cannot read its own file should say so rather
 * than leave the asker waiting for a message that is never coming.
 *
 * @param {unknown} message
 * @param {(cid: string) => Promise<Uint8Array | null>} read
 */
export async function answer (message, read) {
  const cid = asked(message)

  if (cid == null) return null

  try {
    const bytes = await read(cid)

    if (bytes == null) return { type: FILE_NONE, cid, why: 'not here' }

    if (bytes.byteLength > MAX_TRANSFER_BYTES) {
      return { type: FILE_NONE, cid, why: 'too large for this way' }
    }

    return { type: FILE_GIVE, cid, bytes: toBase64(bytes) }
  } catch (error) {
    return { type: FILE_NONE, cid, why: String(error?.message ?? error).slice(0, 120) }
  }
}

/** The content address somebody asked for, or null if this is not an ask. */
export function asked (message) {
  if (message == null || typeof message !== 'object') return null
  if (message.type !== FILE_ASK) return null

  return typeof message.cid === 'string' && message.cid !== '' ? message.cid : null
}

/**
 * Read an answer, and believe it only if it hashes to what was asked for.
 *
 * `hash` is the same function that would have produced the address on the way
 * in - passing it rather than importing keeps this module free of the IPFS
 * stack, which is what lets it be tested in a second rather than a browser.
 *
 * @param {unknown} message
 * @param {string} wanted the content address that was asked for
 * @param {(bytes: Uint8Array) => Promise<string>} hash
 * @returns {Promise<{ bytes: Uint8Array } | { refused: string }>}
 */
export async function take (message, wanted, hash) {
  if (message == null || typeof message !== 'object') return { refused: 'not an answer' }
  if (message.cid !== wanted) return { refused: 'an answer about a different file' }

  if (message.type === FILE_NONE) {
    return { refused: typeof message.why === 'string' ? message.why : 'declined' }
  }

  if (message.type !== FILE_GIVE) return { refused: 'not an answer' }

  let bytes

  try {
    bytes = fromBase64(message.bytes)
  } catch {
    return { refused: 'the bytes were not readable' }
  }

  if (bytes.byteLength > MAX_TRANSFER_BYTES) return { refused: 'over the size limit' }

  // **The one check that makes this safe to write to disk.** Without it, a peer
  // that was admitted to sync could answer any ask with any bytes, and they
  // would land in the folder under the name that was asked for.
  if (await hash(bytes) !== wanted) return { refused: 'the bytes are not what was asked for' }

  return { bytes }
}

function toBase64 (bytes) {
  let binary = ''

  // In chunks: `String.fromCharCode(...bytes)` on a megabyte overflows the
  // argument list, which fails as a RangeError far from anything about files.
  for (let at = 0; at < bytes.byteLength; at += 8192) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 8192))
  }

  return btoa(binary)
}

function fromBase64 (text) {
  if (typeof text !== 'string') throw new Error('not a string')

  const binary = atob(text)
  const out = new Uint8Array(binary.length)

  for (let at = 0; at < binary.length; at++) out[at] = binary.charCodeAt(at)

  return out
}
