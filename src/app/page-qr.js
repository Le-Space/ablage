/**
 * This page as a code, one press from the header.
 *
 * The Le-Space page-QR convention (Le-Space/landing, AGENTS.md "Page-QR
 * convention"), in the shape simple-todo carries it: a glyph in the top right,
 * the code of whatever the address bar says, on a white plaque. Somebody moving
 * between the apps finds it in the same corner.
 *
 * **It is not the pairing code, and it stands beside it.** The other code in
 * this app is a one-time offer for one other device; this one says "open this
 * app over there". They answer different questions, so both exist - and the
 * one-time halves are taken *out* of this one: an `#i=` offer or an `#r=` reply
 * travelling on in a second code is an invitation somebody else could answer,
 * and the invite is the one thing in this app that must reach exactly one
 * device. Scanned into the pairing scanner by mistake, this code is refused
 * with a reason rather than used - `scanFor` in `main.js` checks what it reads.
 *
 * `uqr` draws it inside the bundle, so nothing leaves the page to render it,
 * which is this app's own claim applied to its header.
 */
import { renderSVG } from 'uqr'

/** The halves of a pairing, which are good once and must not travel on. */
const ONE_TIME_KEYS = ['i', 'r']

/**
 * The address to put in the code: this page, without a pairing in the fragment.
 *
 * @param {string} href
 * @returns {string}
 */
export function pageUrl (href) {
  const url = new URL(href)
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  const carries = ONE_TIME_KEYS.filter(key => params.has(key))

  // Untouched unless one of ours is in there. A fragment this app did not write
  // - an anchor, somebody's own `#notes` - is not ours to rewrite, and
  // `URLSearchParams` would hand back `notes=` for it.
  if (carries.length === 0) return url.toString()

  for (const key of carries) params.delete(key)

  url.hash = params.toString()
  return url.toString()
}

/**
 * Wire the header button to a box with the code in it.
 *
 * @param {object} parts
 * @param {HTMLElement} parts.button opens and closes it
 * @param {HTMLElement} parts.box the box itself
 * @param {HTMLElement} parts.code where the drawing goes
 * @param {HTMLElement} parts.address where the address is written out
 */
export function startPageQr ({ button, box, code, address }) {
  const close = () => {
    box.hidden = true
    button.setAttribute('aria-expanded', 'false')
  }

  const open = () => {
    const url = pageUrl(window.location.href)

    // Drawn on opening rather than once at start-up: the address carries which
    // share this is, and a code made three folders ago would send somebody to
    // the wrong one. `renderSVG` draws modules - the address appears in the
    // code, never as markup.
    code.innerHTML = renderSVG(url, { border: 2 })
    // Written out as well as drawn: a camera is not the only way to carry an
    // address, and somebody reading it aloud or copying it needs to see it.
    address.textContent = url
    box.hidden = false
    button.setAttribute('aria-expanded', 'true')
  }

  button.addEventListener('click', () => box.hidden ? open() : close())

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !box.hidden) close()
  })

  // Anywhere else closes it, the way a small popover should. The button is
  // excluded because its own handler already decides, and counting the press
  // twice would reopen what it just closed.
  document.addEventListener('click', event => {
    if (box.hidden || box.contains(event.target) || button.contains(event.target)) return

    close()
  })

  close()
}
