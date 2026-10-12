import assert from 'node:assert/strict'
import test from 'node:test'

import { pageUrl } from '../src/app/page-qr.js'

/**
 * What goes into the page's own code, and what must not.
 *
 * The one rule with teeth: a pairing in the fragment is good once and for one
 * device. A second code carrying it is an invitation somebody else could
 * answer, so `#i=` and `#r=` come out. Everything else about the address stays,
 * because the point of the code is to open *this* page - this share, this
 * query, this anchor.
 */

test('an invite in the fragment does not travel on', async () => {
  assert.equal(pageUrl('https://ablage.le-space.de/#i=abc'), 'https://ablage.le-space.de/')
})

test('and neither does a reply', async () => {
  assert.equal(pageUrl('https://ablage.le-space.de/#r=xyz'), 'https://ablage.le-space.de/')
})

test('the rest of the address is kept, including the query', async () => {
  assert.equal(
    pageUrl('https://ablage.le-space.de/?intro=off#i=abc'),
    'https://ablage.le-space.de/?intro=off'
  )
})

test('other fragment keys survive beside a removed one', async () => {
  assert.equal(
    pageUrl('https://ablage.le-space.de/#i=abc&share=work'),
    'https://ablage.le-space.de/#share=work'
  )
})

test('a fragment this app did not write is left exactly as it is', async () => {
  // `URLSearchParams` would hand back `notes=` for this, which is a different
  // address. Nothing of ours is in there, so nothing is rewritten.
  assert.equal(pageUrl('https://ablage.le-space.de/#notes'), 'https://ablage.le-space.de/#notes')
})

test('an address with no fragment comes back unchanged', async () => {
  assert.equal(pageUrl('https://ablage.le-space.de/'), 'https://ablage.le-space.de/')
})
