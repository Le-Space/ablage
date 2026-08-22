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

test('the built page can be installed and can start itself', () => {
  // Both are head-only and neither renders, so nothing else would notice if a
  // build step dropped them.
  const html = built()

  assert.ok(html.includes('rel="manifest" href="./manifest.webmanifest"'),
    'the manifest link is missing or absolute - on a gateway an absolute path asks for the gateway\'s own root')
  assert.ok(html.includes('apple-mobile-web-app-capable'),
    'iOS reads none of the manifest for this and wants its own tag')
})

test('the service worker ships with this build\'s own file list', () => {
  const worker = readFileSync(fileURLToPath(new URL('../dist/sw.js', import.meta.url)), 'utf8')
  const html = built()

  // The placeholders are substituted at build time. Shipping one unfilled is a
  // worker that throws on install, which fails silently: the app still works,
  // from the network, forever.
  assert.ok(!worker.includes('__VERSION__'), 'the version placeholder was not filled in')
  assert.ok(!worker.includes('__PRECACHE__'), 'the precache placeholder was not filled in')

  // The hashed name changes every time the app changes, and a hand-written list
  // would be wrong the first time - silently, because the page still loads.
  const asset = html.match(/assets\/(app-[^"]+\.js)/)?.[1]

  assert.ok(asset != null, 'no hashed app bundle in the built page')
  assert.ok(worker.includes(asset), `the worker precaches something other than ${asset}`)

  // Every path relative. This site is served from `ablage.le-space.de` and from
  // a gateway under `/ipfs/<cid>/`; a leading slash is the gateway's root.
  for (const path of JSON.parse(worker.match(/const PRECACHE = (\[[^\]]*\])/)[1])) {
    assert.ok(!path.startsWith('/'), `precached path is absolute: ${path}`)
  }
})

test('the controls that need a node ship disabled', () => {
  // Asserted on the built markup rather than in a browser, because the window
  // this closes is too short to hit on purpose locally - the node starts in
  // about a millisecond here and took long enough on Firefox in CI to fail a
  // run. What is checkable everywhere is that the attribute is there.
  const html = built()

  for (const id of ['invite', 'scan']) {
    const tag = html.match(new RegExp(`<button id="${id}"[^>]*>`))?.[0]

    assert.ok(tag != null, `no button #${id} in the built page`)
    assert.ok(tag.includes('disabled'), `#${id} ships pressable, and its handler calls the node: ${tag}`)
  }
})

test('the refusal to switch folders under a connection is written in both languages', () => {
  // The guard itself is one line in `main.js` and no automated test drives it:
  // reaching it needs a real second peer, and the folder picker on the other
  // side of it opens a native dialog. What *is* checkable is that the sentence
  // it shows exists at all - a guard that fell back to an empty state line
  // would read as a button that does nothing.
  const html = built()

  assert.ok(html.includes('assets/'), 'no built page to check against')

  for (const locale of ['en', 'de']) {
    const source = readFileSync(fileURLToPath(new URL(`../src/app/locales/${locale}.js`, import.meta.url)), 'utf8')

    assert.ok(source.includes('notWhileConnected:'), `folder.notWhileConnected missing from ${locale}`)
  }
})

test('the box that grants a standing permission ships unticked', () => {
  // The default *is* the decision here. Somebody answering a dialog about a
  // device that reached them through a relay should have to reach for
  // "remember", not discover afterwards that not reading carefully granted
  // something standing.
  const html = built()
  const box = html.match(/<input id="admit-remember"[^>]*>/)?.[0]

  assert.ok(box != null, 'no remember box in the built page')
  assert.ok(!box.includes('checked'), `ships ticked: ${box}`)
})

test('refusing a device is offered as plainly as letting it in', () => {
  // A dialog with one obvious button and one that looks like a way out teaches
  // people to press the obvious one. Both are buttons, and both are named.
  const html = built()

  for (const id of ['admit-yes', 'admit-no']) {
    assert.match(html, new RegExp(`<button id="${id}"[^>]*type="button"`))
  }
})

test('the built page says which build it is', () => {
  // In the markup, not written from JavaScript: `curl` should answer "is the
  // fix live yet?", and the stamp should survive a bundle that fails to boot -
  // which is the build most in need of being identified.
  const html = built()

  for (const token of ['__ABLAGE_VERSION__', '__ABLAGE_COMMIT__', '__ABLAGE_BUILD_TIME__', '__ABLAGE_BUILD_ISO__']) {
    assert.ok(!html.includes(token), `placeholder left unfilled: ${token}`)
  }

  assert.match(html, /<time datetime="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z">/)
  assert.match(html, /<code>[0-9a-f]{7}<\/code>|<code>unknown<\/code>/)
})

test('the service worker changes when the stamp does', () => {
  // The version used to hash the asset *names*. A rebuild that changed only the
  // build time changes only `index.html`, so the cache name stayed and a
  // returning visitor kept being served the old page - showing a stamp for a
  // build that is no longer deployed.
  const worker = readFileSync(fileURLToPath(new URL('../dist/sw.js', import.meta.url)), 'utf8')
  const built = readFileSync(fileURLToPath(new URL('../vite.config.js', import.meta.url)), 'utf8')

  assert.match(worker, /const VERSION = "[0-9a-f]{12}"/)
  assert.ok(
    built.includes('stamp.__ABLAGE_BUILD_ISO__'),
    'the stamp is not part of the cache version, so a rebuild would not reach returning visitors'
  )
})

test('the relay choice is read from a key of our own', () => {
  // The library takes a key rather than inventing one, so that a package cannot
  // put its namespace in somebody else's origin. Passing none would silently
  // mean "never opted in", which is a working app that ignores the choice.
  const source = readFileSync(fileURLToPath(new URL('../src/app/main.js', import.meta.url)), 'utf8')

  assert.match(source, /const RELAY_OPT_IN_KEY = 'ablage\./)
  assert.match(source, /relayOptIn: readRelayOptIn\(globalThis\.localStorage, RELAY_OPT_IN_KEY\)/)
})

test('the file input ships disabled, like the controls that need a node', () => {
  // `start()` opens storage before it builds the node, so a file dropped in
  // between is written and then handed to a reconciler with no `content` to
  // address it with. The file never appears and the error goes to the state
  // line, where nobody adding a file is looking.
  //
  // Adding an encrypter and a muxer widened that window enough for CI to land
  // in it - which is how a change to the relay broke a test about dropping a
  // text file.
  const html = built()
  const input = html.match(/<input id="pick"[^>]*>/)?.[0]

  assert.ok(input != null, 'no file input in the built page')
  assert.ok(input.includes('disabled'), `ships enabled: ${input}`)
})
