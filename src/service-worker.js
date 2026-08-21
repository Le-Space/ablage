/**
 * Serving the app itself without a network.
 *
 * The data half already works and always did: the files live in OPFS or in the
 * folder you picked, and both are ordinary persistent storage. What was missing
 * is the **shell** - every load fetched the HTML and JS over HTTP, so a browser
 * with no connection got nothing to run and the local files were unreachable.
 * A folder that only opens when the internet is up is not a folder.
 *
 * Deliberately not a caching framework. Two rules, because this app makes only
 * two kinds of same-origin request.
 *
 * **Everything here is relative.** This page is served from `ablage.le-space.de`
 * and from an IPFS gateway under `/ipfs/<cid>/`, and a worker that precached
 * `/index.html` would ask the gateway for its own root. `self.registration.scope`
 * is the one thing that is right in both places - the same reason `base: './'`
 * is in the vite config, and the same mistake one layer down.
 */

// Both filled in at build time - see the `serviceWorker` plugin in vite.config.js.
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__

const CACHE = `ablage-${VERSION}`

/** Absolute URLs for this deployment, wherever it is mounted. */
const scoped = path => new URL(path, self.registration.scope).toString()

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)

    await cache.addAll(PRECACHE.map(scoped))
    // Take over straight away rather than waiting for every tab to close. The
    // alternative leaves somebody who just reloaded looking at the old build
    // with no way to know why, and there is no cross-tab state a version skew
    // could corrupt: the files are read from storage by whichever build runs.
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key)
    }

    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event

  // Only GET can be replayed from a cache. And only our own origin: this app
  // talks to STUN servers and, on a gateway, to whatever else is on that host.
  // A worker answering for those would be caching other people's data and
  // hiding real network failures from code that handles them.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)

    // `ignoreVary`, and it is not a detail. The precache was filled by *this
    // worker's* requests, which carry no `Origin`; the page's request for the
    // same module carries one. Both vite preview and the Aleph gateway answer
    // assets with `Vary: Origin`, so a default match compares those two headers,
    // finds them different, and reports a miss - with the file sitting right
    // there in the cache. Offline that is not a slow path, it is a blank page:
    // the shell loads from the navigation fallback and every script fails.
    //
    // Nothing here varies by origin in any way that matters. It is one static
    // site answering itself.
    const cached = await cache.match(request, { ignoreVary: true })

    // Hashed assets never change under the same name, so the cache is
    // authoritative and a network round trip would only add latency.
    if (cached != null && PRECACHE.some(path => scoped(path) === url.toString())) {
      return cached
    }

    try {
      const response = await fetch(request)

      // Opaque and error responses are not worth keeping: caching a 404 would
      // make it permanent for this version. This is also how the waiting music
      // ends up cached - after it has been played once, rather than by making
      // everybody download three megabytes before their first invite.
      if (response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone())
      }

      return response
    } catch (error) {
      if (cached != null) return cached

      // A navigation with nothing cached for that exact URL still has to render
      // something. Every route here is the same single page - and an invite
      // link is that page with a hash, which never reaches the network anyway.
      if (request.mode === 'navigate') {
        const shell = await cache.match(scoped('index.html'), { ignoreVary: true })
        if (shell != null) return shell
      }

      throw error
    }
  })())
})
