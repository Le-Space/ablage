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
