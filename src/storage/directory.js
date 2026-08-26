/**
 * A folder, behind four methods.
 *
 * Not "OPFS storage", which is what this was called until stage 3 showed the
 * name was wrong: every call below is on `FileSystemDirectoryHandle`, and that
 * is exactly what `showDirectoryPicker()` returns as well as
 * `navigator.storage.getDirectory()`. The picked folder needed no second
 * implementation, only a second way to *get* a handle - see `handle.js`.
 *
 * Which means the tests written against OPFS cover the picked folder too, for
 * everything except the picking itself. That part opens a native dialog and no
 * browser automation can drive it, so it is verified by hand and said so.
 *
 * **Nested paths work from the start**, even while stage 1 showed one flat
 * directory. The index stores whole paths, so storage has to accept them; the
 * alternative is a migration the day directories appear.
 */

import { IDENTITY_FILE } from './identity.js'

/**
 * Where the folders of shares other than the first one live.
 *
 * A dot-name, like the identity file, and skipped by `list` for the same
 * reason: the first share is the origin's root folder, so anything else has to
 * sit inside it, and the index must not be told about it.
 */
export const SHARE_FOLDERS = '.ablage-shares'

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
 * @param {{ root?: FileSystemDirectoryHandle }} [options] the folder to work in.
 *   A picked directory, or a subdirectory of the origin's own - the tests hand
 *   in the latter so one run cannot see another's files.
 */
export async function directoryStorage ({ root } = {}) {
  const base = root ?? await navigator.storage.getDirectory()

  /** Depth-first, returning whole paths rather than a tree. */
  async function collect (dir, prefix = '') {
    const found = []

    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name

      // The folder's own id is not one of its files. Replicating it would put
      // our id in the other side's folder, and then two folders would claim to
      // be the same one - measured, not feared: without this line the second
      // device's id becomes the first device's. Excluded here rather than in
      // the interface, because it is the *index* that must never see it;
      // `read` and `write` still reach it, which is how `identity.js` gets at
      // it at all.
      if (path === IDENTITY_FILE) continue

      // The other shares' folders, for a browser with no picker. The first
      // share is the root itself, so everything else lives inside it - and
      // without this line the first share lists every other share's files as
      // its own, which is separate storage that reads as one folder.
      if (path === SHARE_FOLDERS) continue

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
