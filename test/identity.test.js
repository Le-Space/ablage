import assert from 'node:assert/strict'
import test from 'node:test'

import { IDENTITY_FILE, folderIdentity } from '../src/storage/identity.js'

/**
 * The folder's id, away from a browser.
 *
 * A fake store rather than a real directory: everything here is about what is
 * written and when, and none of it is about the File System Access API.
 */

const decode = bytes => new TextDecoder().decode(bytes)

const store = (initial = {}) => {
  const files = new Map(Object.entries(initial).map(([k, v]) => [k, new TextEncoder().encode(v)]))

  return {
    files,
    async read (path) {
      const bytes = files.get(path)
      if (bytes == null) throw Object.assign(new Error('missing'), { name: 'NotFoundError' })
      return bytes
    },
    async write (path, bytes) {
      files.set(path, bytes)
    }
  }
}

test('a folder seen for the first time is given an id', async () => {
  const files = store()

  const { id, created } = await folderIdentity(files)

  assert.equal(created, true)
  assert.match(id, /^[0-9a-f-]{36}$/)
  assert.equal(JSON.parse(decode(files.files.get(IDENTITY_FILE))).id, id)
})

test('and keeps it, rather than getting a new one every time', async () => {
  // The whole point. An id regenerated on each visit would name a different
  // folder every session, which is worse than the name it replaces.
  const files = store()

  const first = await folderIdentity(files)
  const second = await folderIdentity(files)

  assert.equal(second.id, first.id)
  assert.equal(second.created, false)
})

test('the id survives the folder being renamed, because it is inside it', async () => {
  // Renaming a directory does not touch what is in it, so this is the same
  // store read again - which is exactly the property the name does not have.
  const files = store()
  const before = await folderIdentity(files)

  assert.equal((await folderIdentity(files)).id, before.id)
})

test('two folders get two ids', async () => {
  const one = await folderIdentity(store())
  const other = await folderIdentity(store())

  // Two people with a folder called Rechnungen do not mean the same folder.
  assert.notEqual(one.id, other.id)
})

test('a half-written file is treated as no file, not as a broken folder', async () => {
  // What an interrupted write looks like. Refusing to work because of it would
  // strand the folder rather than repair it.
  for (const contents of ['', '{', '{}', '{"id": ""}', 'not json at all']) {
    const files = store({ [IDENTITY_FILE]: contents })

    const { id, created } = await folderIdentity(files)

    assert.equal(created, true, `should have rewritten: ${contents}`)
    assert.match(id, /^[0-9a-f-]{36}$/)
  }
})

test('it records when the folder was first seen, in a form a person can read', async () => {
  const files = store()

  await folderIdentity(files, { now: () => Date.parse('2026-08-22T10:00:00Z') })

  const written = JSON.parse(decode(files.files.get(IDENTITY_FILE)))

  assert.equal(written.createdAt, '2026-08-22T10:00:00.000Z')
  assert.equal(written.by, 'ablage')
})

test('the file ends with a newline, because people open it in editors', async () => {
  const files = store()

  await folderIdentity(files)

  assert.ok(decode(files.files.get(IDENTITY_FILE)).endsWith('\n'))
})
