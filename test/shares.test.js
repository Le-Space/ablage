import assert from 'node:assert/strict'
import test from 'node:test'

import { FIRST_SHARE, ONE_OFF_SHARE, scoped, shares, SHARES_STORAGE_KEY } from '../src/app/shares.js'

/**
 * The book, and the one thing it must never do: lose somebody's folder.
 *
 * A share owns an identity, a folder and a list of devices. All three are
 * addressed by the share's id, so an id that changes is a folder that has
 * disappeared as far as anybody using this can tell.
 */

const store = (initial = {}) => {
  const held = { ...initial }

  return {
    getItem: key => held[key] ?? null,
    setItem: (key, value) => { held[key] = String(value) },
    held
  }
}

test('a fresh device already has one named share, and the one-off beside it', async () => {
  // Not an empty list with a "create one" step. Somebody opening this app for
  // the first time has a folder and one device to sync it with; making them
  // name that before anything works would be ceremony.
  const book = shares(store())
  const named = book.all().filter(entry => !entry.oneOff)

  assert.equal(named.length, 1)
  assert.equal(named[0].id, FIRST_SHARE)
  assert.equal(book.currentId(), FIRST_SHARE)
})

test('and the first share keeps the keys it has always had', async () => {
  // The whole reason this is a feature and not a migration. Somebody upgrading
  // has a folder under `folder` and remembered devices under `ablage.admitted`,
  // and nothing may move.
  assert.equal(scoped('ablage.admitted', FIRST_SHARE), 'ablage.admitted')
  assert.equal(scoped('folder', FIRST_SHARE), 'folder')

  assert.equal(scoped('ablage.admitted', 'abc'), 'ablage.admitted.abc')
  assert.equal(scoped('folder', 'abc'), 'folder.abc')
})

test('a new share gets an id of its own, not one made from its name', async () => {
  // A name is something people change. An id derived from one would move a
  // share's folder and identity on rename, silently and with no way back.
  const book = shares(store())
  const id = book.create('Photos')

  assert.notEqual(id, FIRST_SHARE)
  assert.notEqual(id, 'Photos')

  book.rename(id, 'Pictures')
  assert.equal(book.all().find(entry => entry.id === id).name, 'Pictures')
})

test('choosing one survives a reload', async () => {
  const kept = store()
  const id = shares(kept).create('Photos')

  assert.equal(shares(kept).choose(id), true)
  assert.equal(shares(kept).currentId(), id)
})

test('choosing something that is not there changes nothing', async () => {
  const book = shares(store())

  assert.equal(book.choose('nonsense'), false)
  assert.equal(book.currentId(), FIRST_SHARE)
})

test('a stored choice pointing at a share that is gone falls back rather than breaking', async () => {
  const kept = store({
    [SHARES_STORAGE_KEY]: JSON.stringify({ entries: [{ id: 'a', name: 'A' }], current: 'vanished' })
  })

  assert.equal(shares(kept).currentId(), 'a')
})

test('the last named share cannot be removed', async () => {
  // Removing it would leave nothing to open, and the next start would invent a
  // share whose id does not match the folder that is still sitting there. The
  // one-off share does not count as somewhere to go: it forgets who this device
  // is, which is not a place to put somebody who deleted a row by accident.
  const book = shares(store())

  assert.equal(book.remove(FIRST_SHARE), false)
  assert.equal(book.all().filter(entry => !entry.oneOff).length, 1)
})

test('removing the open one moves to another', async () => {
  const book = shares(store())
  const id = book.create('Photos')

  book.choose(id)
  assert.equal(book.remove(id), true)
  assert.equal(book.currentId(), FIRST_SHARE)
})

test('the book does not keep a member list of its own', async () => {
  // `admission.js` already holds the devices a share lets in without asking,
  // and it is keyed per share. A second copy here would be two answers to one
  // question - and the failure worth avoiding is the one where they disagree
  // and the screen shows whichever was read first.
  const book = shares(store())

  assert.equal(book.addPeer, undefined)
  assert.equal(book.knows, undefined)
  assert.equal('peers' in book.current(), false)
})

test('junk in the store is a fresh book, not a start that throws', async () => {
  for (const junk of ['not json', '[]', '{}', '{"entries":"no"}', '{"entries":[]}', '{"entries":[null]}', 'null']) {
    const book = shares(store({ [SHARES_STORAGE_KEY]: junk }))

    assert.equal(book.currentId(), FIRST_SHARE, junk)
  }
})

test('a store the browser refuses still gives a working share', async () => {
  const refused = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') }
  }

  const book = shares(refused)

  assert.equal(book.currentId(), FIRST_SHARE)
  assert.doesNotThrow(() => book.create('Photos'))
})

test('what comes out cannot be edited from outside', async () => {
  // Handing back the live entries would let a caller rename a share by writing
  // to a field, with nothing saved and nothing to explain the difference after
  // a reload.
  const kept = store()
  const book = shares(kept)

  book.all()[0].name = 'sneaky'
  book.current().name = 'sneaky'

  assert.equal(shares(kept).current().name, null)
})

/**
 * The share that remembers nothing.
 *
 * A stored identity is what lets two devices recognise each other - and it is
 * also what lets a relay recognise *you*, across sessions, as the same peer id
 * arriving from wherever you happen to be. That is a real cost, and it was the
 * behaviour of every start before shares existed. Keeping it as a choice rather
 * than deleting it is what these assert.
 */

test('there is always a one-off share, and it is not stored', async () => {
  const kept = store()
  const book = shares(kept)

  assert.equal(book.all().filter(entry => entry.oneOff).length, 1)
  // Not written down: a copy in somebody's storage would be a row that could be
  // deleted and then could not come back.
  assert.equal((kept.held[SHARES_STORAGE_KEY] ?? '').includes(ONE_OFF_SHARE), false)
})

test('it can be opened and the choice survives a reload', async () => {
  const kept = store()

  assert.equal(shares(kept).choose(ONE_OFF_SHARE), true)
  assert.equal(shares(kept).currentId(), ONE_OFF_SHARE)
  assert.equal(shares(kept).current().oneOff, true)
})

test('and it cannot be renamed or removed', async () => {
  // There is nothing to call it and nothing to delete. Both would be controls
  // that quietly do nothing.
  const book = shares(store())

  assert.equal(book.rename(ONE_OFF_SHARE, 'Mine'), false)
  assert.equal(book.remove(ONE_OFF_SHARE), false)
})

test('a named share and the one-off share are told apart by a flag, not by a name', async () => {
  // The interface renders the name in the reader's language, so a stored
  // English string would freeze one language into somebody's storage.
  const book = shares(store())

  assert.equal(book.all().find(entry => entry.id === FIRST_SHARE).oneOff, undefined)
  assert.equal(book.all().find(entry => entry.oneOff).name, null)
})
