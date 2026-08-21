/**
 * Whether the waiting music plays, remembered.
 *
 * On by default, because it is not decoration: a phone suspends a silent page
 * seconds after you leave for a messenger, and that closes the connection you
 * are in the middle of making. Somebody who turns it off is choosing a quieter
 * screen over a connection that survives the app switch, which is a fair trade
 * to offer and a bad one to make for them.
 *
 * Same shape as `view-mode.js`: anything but an explicit "false" is on, so a
 * half-written value lands on the working side rather than the silent one.
 */
export const MUSIC_STORAGE_KEY = 'ablage.music'

let wanted = true

export const musicWanted = () => wanted

/** @param {boolean} [next] omit to read the stored choice, which is what a page load wants. */
export function applyMusicChoice (next) {
  if (next == null) {
    try {
      wanted = localStorage.getItem(MUSIC_STORAGE_KEY) !== 'false'
    } catch {
      wanted = true
    }

    return wanted
  }

  wanted = next

  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, String(wanted))
  } catch {
    // Storage blocked: the choice holds for this session and no longer.
  }

  return wanted
}
