/**
 * Read an async stream of chunks, giving up when it stops making progress.
 *
 * **Why a deadline at all.** `content.get` had none: bitswap waits for a block
 * for as long as it is asked to, and on a relay-only connection it is asked
 * forever, because the block cannot arrive at all (#72). That was not one file
 * missing. `pass()` chains every reconciliation onto the last, so a fetch that
 * never returns is a queue that never moves again - measured: a device that
 * heard about one unfetchable file stopped syncing its *own* local writes.
 *
 * **Why idle rather than total.** A total deadline has to choose between
 * failing a slow transfer and waiting a long time for a dead one, and it gets
 * both wrong. A large file over a metered circuit may legitimately take minutes
 * while arriving steadily; a block nobody holds arrives never. What separates
 * them is not how long it takes but whether anything is still coming.
 */

/**
 * @template T
 * @param {AsyncIterable<T>} chunks
 * @param {{ idleMs?: number, describe?: string }} [options]
 * @returns {Promise<T[]>}
 */
export async function collect (chunks, { idleMs = 30_000, describe = 'the stream' } = {}) {
  const iterator = chunks[Symbol.asyncIterator]()
  const out = []

  while (true) {
    let timer

    const idle = new Promise((_, no) => {
      timer = setTimeout(() => no(new Error(`nothing arrived from ${describe} in ${Math.round(idleMs / 1000)}s`)), idleMs)
    })

    let next

    try {
      next = await Promise.race([iterator.next(), idle])
    } catch (error) {
      // Tell the source to stop. Without this the underlying request keeps
      // running behind a caller that has already given up.
      await iterator.return?.().catch(() => {})
      throw error
    } finally {
      clearTimeout(timer)
    }

    if (next.done) return out

    out.push(next.value)
  }
}
