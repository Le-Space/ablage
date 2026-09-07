import { pEvent } from 'p-event'

/**
 * Writing to a libp2p stream without losing what does not fit.
 *
 * **`send()` returns a boolean and it is not decoration.** The interface says
 * so plainly: *"If the method returns false it means the internal buffer is now
 * full and the caller should wait for the 'drain' event before sending more
 * data."* Both sides of this app ignored it, each with its own copy of
 * `message => stream.send(encode(JSON.stringify(message)))`.
 *
 * What that costs is silence. A message that overruns yamux's send window is
 * simply gone: the call returns, nothing throws, and the far side never sees
 * it. Measured over a circuit - 1 MiB arrived, 4 MiB did not, and the send
 * reported success in 84 ms either way. It was read as a size limit at first;
 * there is no size limit. yamux frames a large message into 64 KiB pieces on
 * its own, and what runs out is the window, not the room.
 *
 * The pattern is `@libp2p/perf`'s, which is the one part of libp2p that pushes
 * bulk data through a stream on purpose:
 *
 *     const sendMore = stream.send(buf)
 *     if (!sendMore) await pEvent(stream, 'drain', { rejectionEvents: ['close'] })
 *
 * **Written in blocks, because one `send()` has a size of its own.** A whole
 * 4 MiB message in a single call is refused outright - `Message length too
 * long` - so the bytes go out in pieces small enough to be accepted, and the
 * length prefix from `framing.js` is what lets the far side put them back
 * together. `@libp2p/perf` does exactly this and is the only part of libp2p
 * that moves bulk data on purpose.
 *
 * **Serialised, because two of the three callers do not await.** `Provider`
 * posts an update without awaiting it, and so does its `sync-response`. Two
 * unawaited writes can interleave, and the second would overrun a window the
 * first was already waiting on. A queue makes fire-and-forget safe without
 * every caller having to know that.
 */

/**
 * @param {{ send(data: Uint8Array): boolean }} stream
 * @param {(message: unknown) => Uint8Array} encode
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {(message: unknown) => Promise<void>}
 */
/**
 * How much goes into one `send()`.
 *
 * yamux's own default message size, so a block is never the thing that is too
 * long. Larger would be refused; smaller would only mean more calls.
 */
export const BLOCK_BYTES = 64 * 1024

export function sendOnStream (stream, encode, { signal, blockSize = BLOCK_BYTES, drainTimeout = 30_000 } = {}) {
  /** Each write waits for the one before it, so callers need not. */
  let queue = Promise.resolve()

  return message => {
    queue = queue
      // A failed write must not poison every write after it - the stream may
      // recover, and if it does not the next attempt fails on its own terms.
      .catch(() => {})
      .then(async () => {
        const bytes = encode(message)

        for (let at = 0; at < bytes.byteLength; at += blockSize) {
          const more = stream.send(bytes.subarray(at, at + blockSize))

          // **Only wait when there is something left to write.** The first
          // version waited after every full buffer, including the last block -
          // and after the last block nothing is queued, so no window update is
          // coming and `drain` never fires. That turned every large write into
          // a wait for the test's own timeout: a suite that ran in twelve
          // minutes took two hours and twenty, with single specs at 54.
          if (more || at + blockSize >= bytes.byteLength) continue

          await pEvent(stream, 'drain', {
            rejectionEvents: ['close'],
            signal,
            // A peer that stops reading must not hold this write forever. The
            // caller learns the message did not go out, which is the whole
            // point of honouring the return value in the first place.
            timeout: drainTimeout
          })
        }
      })

    return queue
  }
}
