/**
 * Four ways to support this, and none of them a platform.
 *
 * Ported from `packages/shared/src/components/DonateModal.svelte` in
 * Le-Space/landing, which is Svelte 5 and could not come across as it stands -
 * this app has no framework. What came across unchanged is the part that
 * matters: the four addresses, character for character, and the reasoning in
 * the comments around them.
 *
 * **Nothing is fetched.** The marks are drawn inline and the addresses are in
 * this file. That is a rule on the landing page and a *promise* here: AGENTS.md
 * says a start without the relay choice makes no outbound network call at all,
 * and a dialog that phoned a CDN while asking for money would break it in the
 * one place where it would look worst.
 *
 * **Every address has a copy button**, because addresses are long, unforgiving
 * and impossible to select cleanly on a phone. A half-selected Monero address
 * is refused by the wallet - which is the good outcome - but it still costs
 * somebody their evening.
 *
 * The checksums are not a claim here, they are a test: `test/donate.test.js`
 * recomputes the two that can be recomputed without a dependency - bech32 for
 * Bitcoin, mod-97 for the IBAN - against these very strings.
 */
import { WAYS } from './giving.js'
import { t } from './i18n.js'


const COPY_MARK = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="2"/></svg>'

/**
 * Fill the dialog and wire the buttons.
 *
 * Drawn once at start-up rather than on opening: it is four rows of static
 * text, and building it on demand would only add a frame between the press and
 * the dialog.
 *
 * @param {object} parts
 * @param {HTMLElement} parts.button opens it
 * @param {HTMLDialogElement} parts.box the dialog
 * @param {HTMLElement} parts.list where the four rows go
 * @param {HTMLElement} parts.close the button that shuts it
 */
export function startDonate ({ button, box, list, close }) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saying

  const draw = () => {
    list.replaceChildren(...WAYS.map(way => {
      const row = document.createElement('li')
      const head = document.createElement('span')
      const mark = document.createElement('span')
      const name = document.createElement('strong')
      const line = document.createElement('span')
      const value = document.createElement('code')
      const copy = document.createElement('button')

      head.className = 'give-head'
      mark.className = 'give-mark'
      mark.innerHTML = way.mark
      name.textContent = way.label
      head.append(mark, name)

      if (way.id === 'iban') {
        const note = document.createElement('span')

        note.className = 'give-note'
        note.textContent = t('give.bank')
        head.append(note)
      }

      line.className = 'give-row'
      value.textContent = way.value
      copy.type = 'button'
      copy.className = 'give-copy'
      copy.innerHTML = `${COPY_MARK}<span>${t('give.copy')}</span>`
      copy.setAttribute('aria-label', `${t('give.copy')} — ${way.label}`)

      copy.addEventListener('click', async () => {
        const said = copy.querySelector('span')

        try {
          await navigator.clipboard.writeText(way.value)
        } catch {
          // A browser that refuses the clipboard still shows the address.
          // Saying "copied" when nothing was copied would be worse than saying
          // nothing at all - and the address is right there to read.
          return
        }

        said.textContent = t('give.copied')
        clearTimeout(saying)
        saying = setTimeout(() => { said.textContent = t('give.copy') }, 2000)
      })

      line.append(value, copy)
      row.append(head, line)
      return row
    }))
  }

  draw()

  button.addEventListener('click', () => box.showModal())
  close.addEventListener('click', () => box.close())
  // A press on the backdrop closes it. The dialog's own box is a child, so a
  // press inside lands on something else and never reaches here.
  box.addEventListener('click', event => { if (event.target === box) box.close() })

  // Redrawn on a language change: the copy button and the bank line are the
  // app's own words, and `applyLocale` cannot reach text this file wrote.
  return { redraw: draw }
}
