/**
 * Two languages, both compiled in.
 *
 * Not fetched on demand. A language switch that needs the network fails in
 * exactly the situation this app is for - two devices in a room with no uplink -
 * and it fails quietly, showing raw keys. For two languages and a few dozen
 * strings, shipping both is a rounding error next to libp2p.
 *
 * The elements' text is not here: the library carries its own German
 * (`QR_STATUS_STRINGS_DE` and siblings), which is the point of it living there.
 * This file holds what this app says in its own voice.
 *
 * The shape is the one already running in libp2p-webrtc-qr's demo, deliberately.
 */
import {
  QR_INTRO_STRINGS,
  QR_INTRO_STRINGS_DE,
  QR_INVITE_STRINGS,
  QR_INVITE_STRINGS_DE,
  QR_SCANNER_STRINGS,
  QR_SCANNER_STRINGS_DE,
  QR_STATUS_STRINGS,
  QR_STATUS_STRINGS_DE
} from '@le-space/libp2p-webrtc-qr/elements'

import de from './locales/de.js'
import en from './locales/en.js'

export const SUPPORTED = ['en', 'de']
const STORAGE_KEY = 'ablage.locale'

const CATALOGUES = { en, de }

const ELEMENTS = {
  en: { intro: QR_INTRO_STRINGS, invite: QR_INVITE_STRINGS, scanner: QR_SCANNER_STRINGS, status: QR_STATUS_STRINGS },
  de: { intro: QR_INTRO_STRINGS_DE, invite: QR_INVITE_STRINGS_DE, scanner: QR_SCANNER_STRINGS_DE, status: QR_STATUS_STRINGS_DE }
}

let current = 'en'

/**
 * A stored choice wins - somebody who reached for the switch meant it. Otherwise
 * the browser decides, and only its primary subtag: `de-AT` and `de-CH` are
 * speakers of German.
 */
export function initialLocale () {
  // The URL wins over everything: a German link handed to somebody has to open
  // in German even on a browser that chose English here last week. It is also
  // what makes `hreflang="de"` point at something real rather than at a page
  // that decides for itself.
  try {
    const asked = new URLSearchParams(window.location.search).get('lang')
    if (SUPPORTED.includes(asked)) return asked
  } catch {
    // No URL to read; carry on with the stored choice.
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (SUPPORTED.includes(stored)) return stored
  } catch {
    // Storage blocked; the browser's own setting decides.
  }

  return (navigator.language ?? 'en').slice(0, 2).toLowerCase() === 'de' ? 'de' : 'en'
}

export function setLocale (next) {
  current = SUPPORTED.includes(next) ? next : 'en'

  try {
    localStorage.setItem(STORAGE_KEY, current)
  } catch {
    // The choice holds for this session and no longer.
  }

  return current
}

export const locale = () => current
export const elementStrings = () => ELEMENTS[current]

/**
 * Fill everything that names a key.
 *
 * Marked in the markup rather than driven from a list of selectors here: a list
 * in a module is a list that stops matching the page, and silently.
 */
export function translateDocument (root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n)
  }

  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.dataset.i18nHtml)
  }

  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map(part => part.trim())
      if (attr && key) el.setAttribute(attr, t(key))
    }
  }
}

/**
 * A missing key returns the key itself rather than an empty string. Blank text
 * reads as a finished screen with nothing to say; a visible `files.empty` reads
 * as the bug it is and names which one.
 */
export function t (key, params = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], CATALOGUES[current]) ??
    key.split('.').reduce((node, part) => node?.[part], CATALOGUES.en)

  if (value == null) return key
  return typeof value === 'function' ? String(value(params)) : String(value)
}
