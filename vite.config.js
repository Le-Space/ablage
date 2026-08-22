import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * Stamp the build into the page.
 *
 * A deployed site is an anonymous bundle behind a CID: nothing on it says which
 * build it is, so "is the fix live yet?" is answered by grepping the served
 * HTML for a string that happened to change. The stamp goes into `index.html`
 * rather than being written from JavaScript, so `curl` answers it - and so it
 * survives a bundle that fails to boot, which is the build most in need of
 * being identified.
 */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const commit = () => {
  // Actions builds from a detached HEAD and hands the sha over in the
  // environment. A tree exported without .git still has to build, hence the
  // fallback: an unknown commit is worth less than a real one, not than none.
  if (process.env.GITHUB_SHA != null) return process.env.GITHUB_SHA.slice(0, 7)

  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

// One instant, two renderings - from a single Date so they cannot land on
// opposite sides of a minute and disagree. Minutes and UTC: a deploy is
// identified by which one it is, not by its second, and a local timezone would
// make two people's screenshots disagree.
const builtAt = new Date().toISOString().slice(0, 16)

const stamp = {
  __ABLAGE_VERSION__: version,
  __ABLAGE_BUILD_TIME__: `${builtAt.replace('T', ' ')} UTC`,
  // The machine-readable half of <time>, which has to parse as a datetime -
  // the human string with its trailing "UTC" does not.
  __ABLAGE_BUILD_ISO__: `${builtAt}Z`,
  __ABLAGE_COMMIT__: commit()
}

/**
 * Emit the service worker with this build's file list baked in.
 *
 * Written as a plugin rather than a second entry point because the worker needs
 * to know the *hashed* asset names, and those do not exist until the bundle
 * does. A hand-maintained list would be wrong the first time an asset was
 * renamed, and wrong silently - the page would still load, from the network.
 *
 * The version is a hash of what is being cached, not a timestamp. A timestamp
 * would change the worker on every build, which changes the IPFS CID of an
 * otherwise identical site - and then a rebuild that altered nothing would look
 * like a deployment.
 */
const serviceWorker = () => ({
  name: 'ablage-service-worker',

  /**
   * The same worker on the dev server, so the offline test has something to
   * register. There are no hashed assets to precache here - the dev server
   * serves modules by path - so it precaches the page itself and lets the
   * runtime rule keep the rest.
   */
  configureServer (server) {
    server.middlewares.use('/sw.js', (_request, response) => {
      response.setHeader('Content-Type', 'text/javascript')
      response.end(
        readFileSync('src/service-worker.js', 'utf8')
          .replace("'__VERSION__'", JSON.stringify('dev'))
          .replace('__PRECACHE__', JSON.stringify(['index.html', 'manifest.webmanifest']))
      )
    })
  },

  generateBundle (_options, bundle) {
    // Everything the app needs to start. The audio is deliberately absent: it
    // is three megabytes, and nobody should download it before their first
    // invite. The fetch handler keeps it after it has been played once.
    const precache = ['index.html', ...Object.keys(bundle).filter(name => !name.endsWith('.map'))]
    const assets = [...new Set([...precache, 'manifest.webmanifest'])]

    // The stamp is folded in, and that is not decoration. The hash was over the
    // asset *names*, so a rebuild that changed only `index.html` - which a new
    // build time does, and nothing else - kept the same cache name. A returning
    // visitor would then be served the old `index.html` from cache for ever,
    // showing a build stamp for a build that is no longer deployed.
    const version = createHash('sha256')
      .update([...assets, stamp.__ABLAGE_COMMIT__, stamp.__ABLAGE_BUILD_ISO__].join('|'))
      .digest('hex')
      .slice(0, 12)

    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: readFileSync('src/service-worker.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__PRECACHE__', JSON.stringify(assets, null, 2))
    })
  }
})

export default {
  // Relative, because this is served from an IPFS gateway under a path like
  // `/ipfs/<cid>/`. The default `/` emits `/assets/app.js`, which the gateway
  // resolves against its own root - a 404 for every asset, and a blank page
  // that reports nothing useful. The webrtc-qr demo has carried this line for
  // months and it was the one thing I did not copy.
  base: './',

  plugins: [
    {
      name: 'ablage-build-stamp',
      transformIndexHtml: {
        // Ahead of vite's own %VAR% pass, so the two substitutions cannot
        // interleave over each other's output.
        order: 'pre',
        handler: html => Object.entries(stamp).reduce((out, [token, value]) => out.replaceAll(token, value), html)
      }
    },
    serviceWorker()
  ],

  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  // `experiments/` is a separate package with its own dependencies, kept for
  // reproducing the transport measurement. Vite's dependency scan would
  // otherwise try to resolve its imports against this package and fail loudly
  // about a gossipsub that was never meant to be installed here.
  optimizeDeps: { entries: ['index.html', 'harness.html'] },
  // `harness.html` is deliberately absent from the build. The dev server serves
  // any page in the root, which is what the browser tests use - and a published
  // site has no business shipping its own test rig.
  build: { rollupOptions: { input: { app: 'index.html' } } }
}
