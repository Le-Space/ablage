/**
 * A panel whose default moves, and whose choice does not.
 *
 * The code-pairing block starts open, because without a relay a code held up to
 * a camera is the only way anybody gets in. Once there is a second way it is no
 * longer the first thing on the card - so the default folds.
 *
 * **But only the default.** A panel that shut itself again whenever a device
 * came or went would be one nobody could use: every relay reconnection would
 * undo what somebody had just done. So the first time a person touches it, the
 * automatic part stops for good.
 */
export function foldDefault ({ onChange }) {
  let decided = false

  return {
    /** A relay appeared or went away. */
    suggest (relayUp) {
      if (decided) return false

      onChange(!relayUp)
      return true
    },

    /** Somebody opened or closed it themselves. */
    decide () {
      decided = true
    },

    get automatic () {
      return !decided
    }
  }
}
