import { withBitswap } from '@helia/bitswap'
import { withLibp2p } from '@helia/libp2p'
import { unixfs } from '@helia/unixfs'
import { createHeliaLight } from 'helia'

/**
 * Bytes in, address out - and back again over the connection we already have.
 *
 * Composed by hand rather than with `createHelia`, which is
 * `withBitswap(withLibp2p(withHTTP(...)))`. The HTTP layer adds trustless
 * gateways and delegated routing, so a file could be fetched over the public
 * internet instead of the connection built by scanning a code. For an app whose
 * whole claim is "nothing in the middle", that would quietly make the claim
 * false. Without it, bitswap over this one libp2p connection is the only way
 * the bytes can arrive.
 *
 * Lifted from the webrtc-qr demo, comment and all, because it is the part that
 * is easy to get subtly wrong and impossible to notice afterwards.
 */
export async function createContent (node, { overCircuits = false } = {}) {
  // `runOnLimitedConnections` defaults to false in `@helia/bitswap`, which is
  // why a peer stuck on a relay is served nothing - measured in
  // `bitswap-gate.test.js`. It is an option, not a law, and this exists to be
  // able to say which of the two is being measured.
  const helia = withBitswap(withLibp2p(createHeliaLight(), node), { runOnLimitedConnections: overCircuits })
  await helia.start()

  const fs = unixfs(helia)

  return {
    /** @param {Uint8Array} bytes @returns {Promise<string>} */
    async add (bytes) {
      return (await fs.addBytes(bytes)).toString()
    },

    /**
     * Bytes by address, or an error - but never an endless wait.
     *
     * `fs.cat` had no deadline, and bitswap waits for a block as long as it is
     * asked to. On a relay-only connection it is asked forever, because the
     * block cannot arrive at all (#72) - and `pass()` chains every
     * reconciliation onto the last, so one unfetchable file stopped the device
     * syncing entirely, its own local writes included (#78).
     *
     * The signal goes to `fs.cat`, which takes `AbortOptions`. An earlier
     * attempt raced the iterator from outside instead and changed nothing.
     *
     * @param {string} cid
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<Uint8Array>}
     */
    async get (cid, { signal = AbortSignal.timeout(30_000) } = {}) {
      const chunks = []
      let length = 0

      for await (const chunk of fs.cat(cid, { signal })) {
        chunks.push(chunk)
        length += chunk.length
      }

      const bytes = new Uint8Array(length)
      let at = 0

      for (const chunk of chunks) {
        bytes.set(chunk, at)
        at += chunk.length
      }

      return bytes
    },

    stop: () => helia.stop()
  }
}
