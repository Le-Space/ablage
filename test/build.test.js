import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * What the built page will do on an IPFS gateway.
 *
 * Checked against `dist`, not against the dev server: the dev server serves
 * absolute paths on purpose and is right to. The build is the thing that gets
 * published, and it is the thing that was wrong.
 *
 * `npm test` builds first, so this always has something current to read.
 */

const built = () => {
  try {
    return readFileSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)), 'utf8')
  } catch {
    assert.fail('dist/index.html is missing - run `npx vite build` first')
  }
}

test('no asset is referenced from the root', () => {
  // Served from `/ipfs/<cid>/`, an absolute `/assets/app.js` resolves against
  // the gateway's own root and 404s. The symptom is a blank page reporting
  // nothing useful, and the first deploy did exactly that - `base: './'` in the
  // vite config is the fix, and this is what notices if it goes away.
  const absolute = [...built().matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map(m => m[1])

  assert.deepEqual(absolute, [], 'absolute asset paths break on an IPFS gateway')
})

test('the test harness is not part of what gets published', () => {
  // It starts a second libp2p node for anyone who finds the URL.
  const missing = (() => {
    try {
      readFileSync(fileURLToPath(new URL('../dist/harness.html', import.meta.url)))
      return false
    } catch {
      return true
    }
  })()

  assert.equal(missing, true, 'harness.html must stay out of the build')
})

test('the crawler-visible half of the page survives the build', () => {
  // Everything a crawler reads is in the head, and nothing in the app renders
  // it - so a build step that rewrote or dropped these would show up nowhere
  // else. The absolute-path rule above deliberately does not apply here: an
  // `og:image` resolved against a crawler's own host is nothing at all.
  const html = built()

  for (const needle of [
    'property="og:image" content="https://ablage.le-space.de/og-image.png"',
    'rel="canonical" href="https://ablage.le-space.de/"',
    'hreflang="de"',
    'application/ld+json'
  ]) {
    assert.ok(html.includes(needle), `missing from the built page: ${needle}`)
  }
})

test('the built page says what it is without running any javascript', () => {
  // The app translates `data-i18n` at runtime; the markup carries the English
  // as its default. That default is what a crawler indexes, so an empty
  // heading here would mean a page that describes itself only to browsers.
  const html = built()

  assert.match(html, /<h1[^>]*>ablage<\/h1>/)
  assert.match(html, /<meta name="description" content="[^"]{40,}"/)
})
