/**
 * Noticing a change somebody made outside the app.
 *
 * By polling, because there is nothing else. The File System Access API has no
 * change notification of any kind - no events on a `FileSystemDirectoryHandle`,
 * nothing to subscribe to. Every browser sync client in this shape polls, and
 * pretending otherwise would mean quietly missing edits made in a text editor.
 *
 * What it compares is a **listing plus each file's size and modification time**,
 * not the contents: hashing a folder on a timer is how a sync tool becomes the
 * reason a laptop's fan runs. The reconciler hashes afterwards, once, and only
 * for the paths this said had moved.
 *
 * Only meaningful for a picked folder. Nothing outside the app can write to the
 * origin's private one, so the application does not start this there.
 */

/**
 * @param {FileSystemDirectoryHandle} root
 * @returns {Promise<Map<string, string>>} path to a cheap signature
 */
async function stamp (root, prefix = '') {
  const seen = new Map()

  for await (const [name, handle] of root.entries()) {
    const path = prefix ? `${prefix}/${name}` : name

    if (handle.kind === 'directory') {
      for (const [nested, mark] of await stamp(handle, path)) seen.set(nested, mark)
    } else {
      const file = await handle.getFile()
      seen.set(path, `${file.size}:${file.lastModified}`)
    }
  }

  return seen
}

/**
 * @param {FileSystemDirectoryHandle} root
 * @param {(paths: string[]) => void} onChange called with what moved
 * @param {{ every?: number }} [options]
 * @returns {() => void} stop
 */
export function watchFolder (root, onChange, { every = 2000 } = {}) {
  let last = null
  let timer = null
  let stopped = false

  const tick = async () => {
    try {
      const now = await stamp(root)

      if (last != null) {
        const moved = []

        for (const [path, mark] of now) {
          if (last.get(path) !== mark) moved.push(path)
        }

        for (const path of last.keys()) {
          if (!now.has(path)) moved.push(path)
        }

        if (moved.length > 0) onChange(moved)
      }

      last = now
    } catch {
      // The folder went away, or permission lapsed. The next tick finds out
      // whether it came back; there is nothing useful to do in between.
    }

    if (!stopped) timer = setTimeout(tick, every)
  }

  tick()

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
