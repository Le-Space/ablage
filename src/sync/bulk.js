/**
 * Write a lot of bytes without buffering all of them.
 *
 * #74 step 2 and 3, in the one shape that does not break every caller.
 *
 * **What was actually wrong, measured rather than assumed.** The issue says
 * large messages are lost. They were - but that was the missing framing, and
 * #83 fixed it: 16 MiB now crosses a relay-only connection with the send path
 * untouched. So this is not about loss. Pushing 64 MiB through the ordinary
 * path gives:
 *
 *     { sent: 64, refused: 64, threw: 0, peakBuffer: 66587382 }
 *
 * Every single `send()` returned false - "the buffer is full, stop" - and the
 * stream accepted all of it anyway. Nothing was lost at any size tried. The
 * cost is **memory**: sixty-three megabytes of browser heap for one burst,
 * which on a phone is a way to lose the tab.
 *
 * **Why this is a separate function and not a change to `send`.** The previous
 * attempt made the shared send path waitable and cost three test runs of 2.3,
 * 1.3 and 5.3 hours without converging. The reason is that "sending is
 * synchronous" is assumed all over: `Provider` posts an update without
 * awaiting, `answer()` writes a refusal and closes the stream on the next line.
 * Turning `send` into something that can wait changes the timing of all of them
 * at once, and the suite reports that as unrelated specs hanging in unrelated
 * files.
 *
 * So the ordinary path keeps its exact shape, and bulk gets its own door. A
 * Yjs update of two hundred bytes has nothing to gain from waiting; a file has
 * everything.
 */

/**
 * Big enough not to spend a wait per handful of bytes, small enough that one
 * block is not itself the thing filling the buffer. yamux's default window is
 * 256 KiB, so a block that fits several times over leaves room for the window
 * to reopen while we are still writing.
 */
export const BLOCK_BYTES = 64 * 1024

/**
 * Write `bytes` in blocks, waiting only when the stream says to.
 *
 * @param {{ send: (b: Uint8Array) => boolean, addEventListener: Function, removeEventListener: Function, writableNeedsDrain?: boolean }} stream
 * @param {Uint8Array} bytes already framed - this splits a message, it does not make one
 * @param {{ blockBytes?: number, signal?: AbortSignal }} options
 */
export async function sendBulk (stream, bytes, { blockBytes = BLOCK_BYTES, signal } = {}) {
  for (let at = 0; at < bytes.byteLength; at += blockBytes) {
    signal?.throwIfAborted()

    const block = bytes.subarray(at, Math.min(at + blockBytes, bytes.byteLength))
    const more = at + blockBytes < bytes.byteLength
    const accepted = stream.send(block)

    // **Only between blocks, never after the last one.** This is the trap the
    // first attempt fell into: after the final block nothing further is queued
    // by us, so there is no reason for the far side to send a window update on
    // our account, and a wait here hangs until something unrelated happens.
    // Two of that attempt's own unit tests asserted the wait *should* happen -
    // green tests written from the same wrong picture as the code.
    if (accepted === false && more) await drained(stream, signal)
  }
}

/**
 * Resolve when the stream asks for more.
 *
 * `writableNeedsDrain` is read first because 'drain' fires once and may already
 * have passed between the `send()` above and this line - the same reason
 * `readableEnded` exists next to the 'end' event in the same interface.
 */
function drained (stream, signal) {
  if (stream.writableNeedsDrain === false) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const done = () => {
      stream.removeEventListener('drain', done)
      signal?.removeEventListener('abort', stop)
      resolve()
    }

    const stop = () => {
      stream.removeEventListener('drain', done)
      signal?.removeEventListener('abort', stop)
      reject(signal.reason)
    }

    stream.addEventListener('drain', done)
    signal?.addEventListener('abort', stop)
  })
}
