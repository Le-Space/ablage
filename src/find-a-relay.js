/**
 * Looking again when the relay we started with turns out to be dead.
 *
 * **The failure this exists for, in full.** The address baked into this build
 * pointed at a name whose route had been withdrawn: DNS resolved, TCP answered,
 * and TLS never completed - so it looked like a live machine right up to the
 * handshake. Every start dialled it, every start failed, and nothing ever tried
 * anything else. The app has had a discovery channel the whole time; it was
 * only ever consulted from the introduction's relay check, which somebody has
 * to open by hand.
 *
 * **The bootstrap list does not have to change.** That was the reason to
 * believe this needed a restart, and it is wrong: a bootstrap list is only a
 * convenience for the first dial. A relay connection can be made at any moment
 * by dialling one, and the `/p2p-circuit` listen address - which *is* fixed
 * when the node is built - is already there whenever somebody asked for a
 * relay at all.
 *
 * So this waits, looks at what actually happened, and if nothing did, asks the
 * channel and dials what it names.
 */

/**
 * @param {object} options
 * @param {() => number} options.relayAddresses how many `/p2p-circuit`
 *   addresses this node currently announces. Not "is something connected":
 *   being connected to a relay and being reachable through one are different,
 *   and only the second produces an address.
 * @param {() => Promise<{ addresses: readonly string[] }>} options.find the
 *   same search the introduction runs - baked addresses first, then the channel
 * @param {(address: string) => Promise<unknown>} options.dial
 * @param {(addresses: readonly string[]) => void} [options.remember]
 * @param {(state: 'looking' | 'found' | 'gave-up') => void} [options.report]
 * @param {number} [options.after] how long to give the ordinary path first
 * @param {(ms: number) => Promise<void>} [options.wait]
 */
export async function findARelay ({
  relayAddresses,
  find,
  dial,
  remember = () => {},
  report = () => {},
  after = 15_000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  await wait(after)

  // Already reachable: the ordinary path worked and there is nothing to do.
  // Checked *after* the wait rather than before, because the reservation is
  // what takes the time.
  if (relayAddresses() > 0) return 'already'

  report('looking')

  let found

  try {
    found = await find()
  } catch {
    // The channel is somebody else's machine too. Failing to reach it is not a
    // reason to take the app down with it.
    report('gave-up')
    return 'no-answer'
  }

  const addresses = found?.addresses ?? []

  if (addresses.length === 0) {
    report('gave-up')
    return 'none'
  }

  remember(addresses)

  for (const address of addresses) {
    try {
      await dial(address)

      // Dialled, which is not the same as reserved - the relay still has to
      // agree to take calls. The interface says which of the two this is; this
      // function's job ends at having found something that answers.
      report('found')
      return 'dialled'
    } catch {
      // Try the next one. A list of addresses from a discovery channel is a
      // list of candidates, not of promises.
    }
  }

  report('gave-up')
  return 'unreachable'
}
