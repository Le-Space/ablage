/**
 * Where a donation goes, and the mark beside each.
 *
 * **Its own module, with no imports at all**, for one reason: `test/donate.test.js`
 * recomputes the checksums in Node, and anything that reaches `i18n.js` drags
 * the library's custom elements in with it - which need an `HTMLElement` that
 * Node does not have. The addresses are the one kind of string here where a
 * mistake cannot be corrected afterwards, so the test has to be able to reach
 * them without a browser.
 *
 * Copied out of `packages/shared/src/components/DonateModal.svelte` in
 * Le-Space/landing by reading that file, not by retyping it. The marks are
 * drawn here rather than fetched: AGENTS.md promises that a start without the
 * relay choice makes no outbound network call at all, and a dialog that phoned
 * a CDN while asking for money would break it in the worst possible place.
 */

export const WAYS = [
  {
    id: 'btc',
    label: 'Bitcoin',
    value: 'bc1qz7xswl5fsq8qswgphu5vv75qwf99wx6ca6zw57',
    mark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#F7931A"/><path d="M16.4 10.6c.2-1.4-.8-2.1-2.2-2.6l.5-1.9-1.2-.3-.5 1.8-.9-.2.5-1.9-1.1-.3-.5 1.9-2.3-.6-.3 1.2s.85.2.83.21c.47.12.55.43.53.68l-1.28 5.1c-.06.14-.2.35-.52.27.01.01-.83-.21-.83-.21L6.5 16.1l2.2.55-.5 1.95 1.15.29.48-1.92.92.24-.48 1.9 1.16.3.49-1.94c1.98.37 3.47.22 4.1-1.57.5-1.44-.03-2.27-1.07-2.81.76-.18 1.33-.68 1.48-1.72zm-2.65 3.83c-.36 1.44-2.79.66-3.58.47l.65-2.6c.79.2 3.31.58 2.93 2.13zm.36-3.85c-.33 1.31-2.35.64-3.01.48l.59-2.36c.66.17 2.76.47 2.42 1.88z" fill="#fff"/></svg>'
  },
  {
    id: 'eth',
    label: 'Ethereum',
    value: '0x888B6254a45BBBDC6566292446c937Fa3E18c7b3',
    mark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#627EEA"/><path d="M12 3.5v6.3l5.1 2.3z" fill="#fff" fill-opacity="0.6"/><path d="M12 3.5 6.9 12.1 12 9.8z" fill="#fff"/><path d="M12 15.6v4.9l5.1-7.2z" fill="#fff" fill-opacity="0.6"/><path d="M12 20.5v-4.9l-5.1-2.3z" fill="#fff"/><path d="m12 14.6 5.1-2.5L12 9.8z" fill="#fff" fill-opacity="0.25"/><path d="M6.9 12.1l5.1 2.5V9.8z" fill="#fff" fill-opacity="0.6"/></svg>'
  },
  {
    id: 'xmr',
    label: 'Monero',
    value: '47L7qyE2GLvDSd4RkVjxy8du78J12Lj4JLvrWBRDakkZGSCpLDmTbY5DRs4BjGdbrySQ35e5wpZfBUwdU5ZcMSUw49E1y7j',
    mark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#FF6600"/><path d="M4 14.6V8.2l4.4 4.4 3.6-3.6 3.6 3.6L20 8.2v6.4h-3.1V11l-2.9 2.9L12 11.7l-2 2.2L7.1 11v3.6z" fill="#fff"/></svg>'
  },
  {
    id: 'iban',
    label: 'GLS Bank',
    value: 'DE73 4306 0967 8219 2914 00',
    mark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" fill="#3EDC97"/><path d="M2 9h20M6 15h5" stroke="#0B0E15" stroke-width="1.6"/></svg>'
  }
]

/** The four, without their marks, for the tests that recompute their checksums. */
export const waysToGive = () => WAYS.map(({ id, label, value }) => ({ id, label, value }))
