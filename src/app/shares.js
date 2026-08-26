/**
 * Named shares, and which one this start belongs to.
 *
 * A share is the unit everything else hangs off: an identity, a folder, and the
 * devices allowed into it. Until now there was exactly one of each and none of
 * them were named, so "the folder I share with my partner" and "the folder I
 * share with a client" could not both exist.
 *
 * **Local, and deliberately so.** Which shares this device has and what they
 * are called is this device's business. Putting the list in the synced document
 * would let the other side read - or change - the record of itself.
 *
 * **Who is in a share is not kept here.** `admission.js` already holds exactly
 * that list - the devices this share lets in without asking - and it is keyed
 * per share now. A second copy in the book would be two answers to one
 * question, and the interesting failure is the one where they disagree and the
 * screen shows the wrong one.
 */

export const SHARES_STORAGE_KEY = 'ablage.shares'

/**
 * The share that existed before shares did.
 *
 * Its id is fixed and its storage keys are the *old, unsuffixed* ones - see
 * `scoped` below. That is what makes this a feature rather than a migration:
 * somebody who has been using this app has one share already, with their folder
 * and their remembered devices, and nothing has to be moved to make that true.
 */
export const FIRST_SHARE = 'default'

/**
 * The share that remembers nothing about who this device is.
 *
 * **Always present, and it is not a placeholder.** A stored identity is what
 * lets two devices recognise each other without being asked again - and it is
 * also what lets a relay recognise *you*, across sessions, as the same peer id
 * arriving from wherever you happen to be. That is a real cost, and somebody
 * who does not want to pay it should not have to give up the app to avoid it.
 *
 * Opened, no key is stored and none is read: libp2p makes a fresh one, and this
 * device is a stranger to everybody - including to the device it synced with an
 * hour ago, which will ask again. That is the trade, and it is the whole point
 * rather than a shortcoming.
 *
 * This was the behaviour of every start before shares existed. Keeping it as a
 * choice rather than deleting it is why it has a name.
 */
export const ONE_OFF_SHARE = 'once'

/**
 * Where this share's copy of something is kept.
 *
 * The first share keeps the unsuffixed key it has always had. Everything after
 * it is suffixed. One function so the special case is written once, in a place
 * that explains itself, rather than as a conditional at each of the four call
 * sites that need it.
 *
 * @param {string} base a storage key, or an IndexedDB key
 * @param {string} shareId
 */
export const scoped = (base, shareId) => shareId === FIRST_SHARE ? base : `${base}.${shareId}`

const read = storage => {
  try {
    const held = JSON.parse(storage?.getItem(SHARES_STORAGE_KEY) ?? 'null')

    if (held == null || !Array.isArray(held.entries)) return null

    const entries = held.entries.filter(entry =>
      entry != null && typeof entry.id === 'string' && entry.id !== '')

    return entries.length > 0 ? { entries, current: held.current } : null
  } catch {
    // Absent, unparsable, or a store the browser refused. A book that cannot be
    // read is an empty one, and an empty one grows the first share below.
    return null
  }
}

const write = (storage, book) => {
  try {
    storage?.setItem(SHARES_STORAGE_KEY, JSON.stringify(book))
  } catch {
    // Holds for this session and no longer. The share still works; it is the
    // remembering that does not.
  }
}

/**
 * Ids are made here rather than taken from the name.
 *
 * A name is something people change, and a key derived from one would move a
 * share's folder and identity the moment it was renamed - silently, and with no
 * way back. `crypto.randomUUID` where it exists; a browser without it gets
 * something with the same job rather than an app that does not start.
 */
const freshId = () => {
  try {
    return globalThis.crypto.randomUUID()
  } catch {
    return `s-${Math.abs(Date.now() ^ (performance?.now?.() ?? 0) * 1e6).toString(36)}`
  }
}

/**
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} storage
 */
export function shares (storage) {
  let book = read(storage) ?? {
    entries: [{ id: FIRST_SHARE, name: null }],
    current: FIRST_SHARE
  }

  // Built in rather than stored: it has no name to change, nothing to remember,
  // and a copy of it in somebody's storage would be a row that could be deleted
  // and then could not come back.
  const withOneOff = entries => [...entries, { id: ONE_OFF_SHARE, name: null, oneOff: true }]

  // A name of `null` means "not named yet", which the interface renders in the
  // reader's language. Storing a translated string would freeze one language
  // into somebody's storage the first time they opened the app.
  const save = () => write(storage, book)
  const find = id => book.entries.find(entry => entry.id === id) ?? null

  const currentId = () =>
    book.current === ONE_OFF_SHARE || find(book.current) != null ? book.current : book.entries[0].id

  return {
    all: () => withOneOff(book.entries).map(entry => ({ ...entry })),

    currentId,

    current () {
      const id = currentId()

      return id === ONE_OFF_SHARE ? { id, name: null, oneOff: true } : { ...find(id) }
    },

    /** @param {string | null} name */
    create (name = null) {
      const entry = { id: freshId(), name: name ?? null }

      book = { entries: [...book.entries, entry], current: book.current }
      save()
      return entry.id
    },

    choose (id) {
      if (id !== ONE_OFF_SHARE && find(id) == null) return false

      book = { ...book, current: id }
      save()
      return true
    },

    rename (id, name) {
      const entry = find(id)

      // The one-off share has nothing to call it. Naming a thing that forgets
      // its own identity every start would be a label on an empty box.
      if (entry == null) return false

      entry.name = name === '' ? null : name
      save()
      return true
    },

    /**
     * Taking a share out leaves its folder and its identity where they are.
     *
     * Removing an entry is a decision about a list. Reaching into somebody's
     * files because a row was deleted is a different and much larger one, and
     * not what anybody pressing this is asking for.
     */
    remove (id) {
      if (book.entries.length <= 1 || find(id) == null) return false

      const entries = book.entries.filter(entry => entry.id !== id)

      book = { entries, current: book.current === id ? entries[0].id : book.current }
      save()
      return true
    }
  }
}
