/**
 * Paths into a tree, for drawing.
 *
 * Display only. The index stores whole paths and always has, which is what made
 * this a rendering problem rather than a migration - the promise made in the
 * first commit, collected here.
 *
 * Pure on purpose: a folder listing is the part of an interface most likely to
 * be quietly wrong about sorting or nesting, and none of that needs a browser
 * to check.
 */

/**
 * @typedef {object} Node
 * @property {string} name the last segment
 * @property {string} path the whole path, so a click knows what it means
 * @property {'file' | 'folder'} kind
 * @property {Node[]} [children] folders only
 * @property {number} [size] files only
 */

/**
 * @param {Array<{ path: string, size?: number }>} entries
 * @returns {Node[]} folders first, then files, each alphabetical
 */
export function tree (entries) {
  const root = { children: new Map() }

  for (const { path, size } of entries) {
    const parts = path.split('/').filter(Boolean)

    if (parts.length === 0) continue

    let node = root
    let walked = ''

    for (const part of parts.slice(0, -1)) {
      walked = walked ? `${walked}/${part}` : part

      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: walked, kind: 'folder', children: new Map() })
      }

      node = node.children.get(part)
    }

    const name = parts[parts.length - 1]

    // A file wins over a folder of the same name at the same level. It cannot
    // happen through this app, but an index merged from two devices is not
    // something to trust blindly.
    node.children.set(name, { name, path, kind: 'file', size })
  }

  return sorted(root)
}

function sorted (node) {
  return [...node.children.values()]
    .map(child => child.kind === 'folder' ? { ...child, children: sorted(child) } : child)
    .sort((a, b) => {
      // Folders first, the way every file manager does it - a list that
      // interleaves them is a list nobody can scan.
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

/** Every folder path in a tree, for remembering which ones were open. */
export function folderPaths (nodes) {
  return nodes.flatMap(node =>
    node.kind === 'folder' ? [node.path, ...folderPaths(node.children)] : [])
}
