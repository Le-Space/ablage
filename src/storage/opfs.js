/**
 * The origin-private filesystem, behind four methods.
 *
 * Chosen over `showDirectoryPicker` for stage 1 because it works in every
 * engine, while the picker is Chromium-only - building on the picker would make
 * two of three engines untestable from the first commit. The picker arrives in
 * stage 3 as a second implementation of this same contract, which is why the
 * contract is four methods and not a handle.
 *
 * **Nested paths work from the start**, even though stage 1 shows one flat
 * directory. The index stores whole paths, so storage has to accept them; the
 * alternative is a migration the day directories appear.
 */

/** @param {FileSystemDirectoryHandle} root @param {string} path */
async function walk (root, path, { create = false } = {}) {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  let dir = root

  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create })
  }

  return { dir, name }
}

/**
 * @param {{ root?: FileSystemDirectoryHandle }} [options] a root to use instead
 *   of the origin's own - the tests hand in a subdirectory so one run cannot
 *   see another's files.
 */
export async function opfsStorage ({ root } = {}) {
  const base = root ?? await navigator.storage.getDirectory()

  /** Depth-first, returning whole paths rather than a tree. */
  async function collect (dir, prefix = '') {
    const found = []

    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name

      if (handle.kind === 'directory') {
        found.push(...await collect(handle, path))
      } else {
        found.push(path)
      }
    }

    return found
  }

  return {
    async list () {
      return collect(base)
    },

    async read (path) {
      const { dir, name } = await walk(base, path)
      const file = await (await dir.getFileHandle(name)).getFile()

      return new Uint8Array(await file.arrayBuffer())
    },

    async write (path, bytes) {
      const { dir, name } = await walk(base, path, { create: true })
      const handle = await dir.getFileHandle(name, { create: true })
      const writable = await handle.createWritable()

      await writable.write(bytes)
      await writable.close()
    },

    async remove (path) {
      const { dir, name } = await walk(base, path)

      try {
        await dir.removeEntry(name)
      } catch (error) {
        // Removing what is not there is the state the caller wanted. The
        // reconciler asks for this whenever a tombstone arrives twice.
        if (error?.name !== 'NotFoundError') throw error
      }
    }
  }
}
