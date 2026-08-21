import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

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

    const version = createHash('sha256')
      .update(assets.join('|'))
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

  plugins: [serviceWorker()],

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
