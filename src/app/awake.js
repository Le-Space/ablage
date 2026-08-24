/**
 * Whether the screen is asked to stay awake, remembered.
 *
 * **Off by default**, unlike the waiting music. A wake lock is a promise about
 * somebody else's battery, and the music is bounded - it plays while a code is
 * on display and stops - where this holds for as long as the page is open. A
 * setting that flattens a phone is not one to switch on for people.
 *
 * The other half of the reason it exists at all: a phone that dozes off drops
 * the connection it was syncing over, and the person watching sees a transfer
 * that simply stopped. `createKeepAlive` covers leaving for another app; this
 * covers nobody touching the screen. Neither substitutes for the other.
 *
 * Same shape as `view-mode.js` and `music.js`, with the default inverted: only
 * an explicit "true" turns it on, so a half-written value lands on the side
 * that costs nothing.
 */
export const AWAKE_STORAGE_KEY = 'ablage.awake'

let wanted = false

export const awakeWanted = () => wanted

/** @param {boolean} [next] omit to read the stored choice, which is what a page load wants. */
export function applyAwakeChoice (next) {
  if (next == null) {
    try {
      wanted = localStorage.getItem(AWAKE_STORAGE_KEY) === 'true'
    } catch {
      wanted = false
    }

    return wanted
  }

  wanted = next

  try {
    localStorage.setItem(AWAKE_STORAGE_KEY, String(wanted))
  } catch {
    // Storage blocked: the choice holds for this session and no longer.
  }

  return wanted
}
