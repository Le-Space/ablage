/**
 * Simple by default, technical on request.
 *
 * One control, two consumers: it hides anything marked `data-view="technical"`
 * on this page, and it sets the `technical` attribute on `<qr-intro>` so the
 * library element shows its own caveats. Two switches for "how much detail do
 * you want" would be one switch too many.
 *
 * Marked in the markup rather than listed here, for the reason a list in a
 * module always stops matching the page - silently.
 */
export const VIEW_MODE_STORAGE_KEY = 'ablage.simpleView'

let simple = true

function stored () {
  try {
    // Anything but an explicit "false" is simple, so a half-written value lands
    // on the gentler side.
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export const isSimple = () => simple

/** @param {boolean} [next] omit to read the stored choice, which is what a page load wants. */
export function applyViewMode (next) {
  simple = next == null ? stored() : next

  if (next != null) {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, String(simple))
    } catch {
      // Storage blocked: the choice holds for this session and no longer.
    }
  }

  document.documentElement.dataset.view = simple ? 'simple' : 'technical'
  return simple
}
