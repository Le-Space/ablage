import assert from 'node:assert/strict'
import test from 'node:test'

import { folderPaths, tree } from '../src/app/tree.js'

const names = nodes => nodes.map(n => n.kind === 'folder' ? { [n.name]: names(n.children) } : n.name)

test('a flat list stays flat', () => {
  assert.deepEqual(names(tree([{ path: 'a.txt' }, { path: 'b.txt' }])), ['a.txt', 'b.txt'])
})

test('a path becomes the nesting it always described', () => {
  // The promise from the first commit: paths were stored whole so that trees
  // would be display rather than a migration. This is that promise collected.
  assert.deepEqual(
    names(tree([{ path: 'notes/2026/august.md' }])),
    [{ notes: [{ 2026: ['august.md'] }] }]
  )
})

test('siblings share their parent rather than repeating it', () => {
  assert.deepEqual(
    names(tree([{ path: 'notes/a.md' }, { path: 'notes/b.md' }])),
    [{ notes: ['a.md', 'b.md'] }]
  )
})

test('folders come before files, then alphabetically', () => {
  // What every file manager does. A list that interleaves them cannot be
  // scanned.
  assert.deepEqual(
    names(tree([{ path: 'zebra.txt' }, { path: 'alpha.txt' }, { path: 'notes/x.md' }, { path: 'archive/y.md' }])),
    [{ archive: ['y.md'] }, { notes: ['x.md'] }, 'alpha.txt', 'zebra.txt']
  )
})

test('every node carries the whole path, not just its name', () => {
  // A click has to know what it means, and the name alone is ambiguous the
  // moment two folders hold a file called the same thing.
  const [folder] = tree([{ path: 'deep/nested/file.txt' }])

  assert.equal(folder.path, 'deep')
  assert.equal(folder.children[0].path, 'deep/nested')
  assert.equal(folder.children[0].children[0].path, 'deep/nested/file.txt')
})

test('a file keeps its size, a folder has none to keep', () => {
  const [folder, file] = tree([{ path: 'dir/inner.txt', size: 12 }, { path: 'top.txt', size: 34 }])

  assert.equal(file.size, 34)
  assert.equal(folder.size, undefined)
  assert.equal(folder.children[0].size, 12)
})

test('folder paths come back for remembering what was open', () => {
  const nodes = tree([{ path: 'a/b/c.txt' }, { path: 'a/d.txt' }, { path: 'e.txt' }])

  assert.deepEqual(folderPaths(nodes).sort(), ['a', 'a/b'])
})

test('leading and doubled separators do not invent empty folders', () => {
  // Not reachable through the app, but an index merged from two devices is not
  // something to trust blindly.
  assert.deepEqual(names(tree([{ path: '/a//b.txt' }])), [{ a: ['b.txt'] }])
})

test('an empty list is an empty tree, not a crash', () => {
  assert.deepEqual(tree([]), [])
})
