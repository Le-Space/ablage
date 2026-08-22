/**
 * Small pictures beside the names, and a big one on demand.
 *
 * Two things this must not do. It must not read every file whenever the list is
 * drawn - `render()` runs on each index change, and decoding a folder of photos
 * on every one of them is how an app becomes the reason a laptop's fan runs. And
 * it must not leak object URLs, which stay alive until they are revoked whether
 * or not the element using them still exists.
 *
 * So the cache is keyed by **content address**. Two paths holding the same bytes
 * share one thumbnail, a file that changed gets a new one because its address
 * changed, and a rename costs nothing at all.
 */

const IMAGE = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)$/i

/** By extension rather than by sniffing: this decides whether to *read* at all. */
export const looksLikeImage = path => IMAGE.test(String(path ?? ''))

const TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml'
}

export const mediaType = path =>
  TYPES[String(path).split('.').pop()?.toLowerCase()] ?? 'application/octet-stream'

export function previews () {
  /** @type {Map<string, string>} content address -> object URL */
  const urls = new Map()
  /** @type {Map<string, Promise<string | null>>} so two rows do not read twice */
  const loading = new Map()

  return {
    /**
     * The picture for these bytes, read once.
     *
     * @param {string} path used for the media type and the extension test
     * @param {string} cid the content address, and the cache key
     * @param {{ read(path: string): Promise<Uint8Array> }} storage
     */
    async urlFor (path, cid, storage) {
      if (!looksLikeImage(path) || cid == null) return null
      if (urls.has(cid)) return urls.get(cid)

      if (!loading.has(cid)) {
        loading.set(cid, (async () => {
          try {
            const bytes = await storage.read(path)
            const url = URL.createObjectURL(new Blob([bytes], { type: mediaType(path) }))

            urls.set(cid, url)
            return url
          } catch {
            // A file the index knows and storage does not have yet. The next
            // draw asks again, which is what the reconciler is about to make
            // possible.
            return null
          } finally {
            loading.delete(cid)
          }
        })())
      }

      return loading.get(cid)
    },

    /**
     * Let go of everything no longer in the folder.
     *
     * Called after a draw, with the addresses the list still holds. Without it
     * the browser keeps every picture ever shown - a revoked URL is the only
     * way to say a blob is finished with.
     */
    keepOnly (cids) {
      const keep = new Set(cids)

      for (const [cid, url] of [...urls]) {
        if (keep.has(cid)) continue

        URL.revokeObjectURL(url)
        urls.delete(cid)
      }
    },

    size () {
      return urls.size
    }
  }
}
