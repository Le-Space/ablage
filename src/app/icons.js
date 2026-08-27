/**
 * The Le-Space visual grammar, applied to folders.
 *
 * The family mark is "Der erste Knoten": a filled **coral** circle for the local
 * node, hollow **cyan** rings for peers, and **dashed** cyan lines for sync. The
 * grammar carries meaning rather than decoration, so it transfers directly -
 * this app is two folders instead of two nodes, and everything else stays put.
 *
 * Colours come from the tokens rather than being written in: the mark inherits
 * the palette, so a light theme moves it along with the rest of the page.
 */

const svg = (viewBox, body, extra = '') =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" fill="none" ${extra}>${body}</svg>`

/**
 * The mark: this folder, the other folder, and the sync between them.
 *
 * The near one is filled coral - it is *here*, it is the one you are looking at.
 * The far one is a cyan outline, the same way a peer is drawn in the family
 * mark. The dashed line is the connection, and it is dashed because it is not
 * always there: both devices have to be open, which is the one thing this app
 * has to say about itself.
 */
export const mark = () => svg('0 0 96 96', `
  <path d="M8 34 h20 l6 8 h22 a4 4 0 0 1 4 4 v26 a4 4 0 0 1 -4 4 h-48 a4 4 0 0 1 -4 -4 v-34 a4 4 0 0 1 4 -4 z"
        fill="var(--ls-red, #FF6B5B)" />
  <path d="M56 22 h14 l4 6 h14 a3 3 0 0 1 3 3 v20 a3 3 0 0 1 -3 3 h-32 a3 3 0 0 1 -3 -3 v-26 a3 3 0 0 1 3 -3 z"
        stroke="var(--ls-accent, #58C7F3)" stroke-width="5" stroke-linejoin="round" />
  <line x1="52" y1="60" x2="70" y2="60" stroke="var(--ls-accent, #58C7F3)"
        stroke-width="4" stroke-linecap="round" stroke-dasharray="0.1 8" />
  <circle cx="14" cy="18" r="2.6" fill="var(--ls-accent, #58C7F3)" opacity="0.55" />
`, 'role="img" aria-label="ablage"')

/**
 * A folder in the list. Coral, because a folder here is a place of yours.
 * Outlined rather than filled - the mark is the only thing that gets a solid
 * shape, or every row starts competing with it.
 */
export const folderIcon = () => svg('0 0 24 24', `
  <path d="M3 6.5 h5.5 l1.8 2.2 h10.7 a1.2 1.2 0 0 1 1.2 1.2 v8.6 a1.2 1.2 0 0 1 -1.2 1.2 h-18 a1.2 1.2 0 0 1 -1.2 -1.2 v-10.8 a1.2 1.2 0 0 1 1.2 -1.2 z"
        stroke="var(--ls-red)" stroke-width="1.8" stroke-linejoin="round" />
`, 'aria-hidden="true"')

/**
 * A file. Cyan and dimmer, so a folder reads as the heavier thing in a row -
 * which is what a person scanning a list is looking for first.
 */
export const fileIcon = () => svg('0 0 24 24', `
  <path d="M6 3 h8 l5 5 v13 a1 1 0 0 1 -1 1 h-12 a1 1 0 0 1 -1 -1 v-17 a1 1 0 0 1 1 -1 z"
        stroke="var(--ls-accent)" stroke-width="1.6" stroke-linejoin="round" opacity="0.8" />
  <path d="M14 3 v5 h5" stroke="var(--ls-accent)" stroke-width="1.6" stroke-linejoin="round" opacity="0.8" />
`, 'aria-hidden="true"')

/**
 * Rename, and remove.
 *
 * **Only these two.** A pencil and a bin are conventional enough that nobody
 * has to be taught them, which is the whole test for replacing a word with a
 * picture. "Open this share" has no such picture - it is also the primary
 * action in the row, and the one somebody is looking for - so it stays a word.
 *
 * `currentColor`, so a disabled or hovered button carries them along, and
 * `aria-hidden` because the button beside them supplies the name.
 */
export const pencilIcon = () => svg('0 0 24 24', `
  <path d="M4 20 h4 l10-10 a2.1 2.1 0 0 0 -3-3 l-10 10 z"
        stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
  <path d="M13.5 6.5 l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
`, 'aria-hidden="true"')

export const binIcon = () => svg('0 0 24 24', `
  <path d="M4 7 h16 M10 4.5 h4 M6.5 7 l1 12.5 a1 1 0 0 0 1 .9 h7 a1 1 0 0 0 1-.9 l1-12.5"
        stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M10.5 10.5 v6 M13.5 10.5 v6"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.75" />
`, 'aria-hidden="true"')

/** The favicon, as a data URI: the mark on the deep-space background. */
export const favicon = () => {
  const flat = mark()
    .replace(/var\(--ls-red, ([^)]+)\)/g, '$1')
    .replace(/var\(--ls-accent, ([^)]+)\)/g, '$1')
    .replace('<svg ', '<svg width="96" height="96" ')

  return `data:image/svg+xml,${encodeURIComponent(flat)}`
}
