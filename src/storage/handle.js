/**
 * Getting a folder, and keeping it.
 *
 * `showDirectoryPicker()` is Chromium-only, which is why it is a bridge on top
 * rather than the foundation - Firefox and WebKit have no picker at all and get
 * the origin's private folder instead. Both hand back a
 * `FileSystemDirectoryHandle`, so `directory.js` never learns which it has.
 *
 * The part that decides whether this is usable is not the picking but the
 * **keeping**: a handle that had to be re-picked on every launch would sink the
 * feature. Handles are structured-cloneable, so IndexedDB can hold one - and a
 * restored handle still needs its permission asked for again, which is a
 * separate step and the one that is easy to forget.
 */

const DB = 'ablage'
const STORE = 'handles'

/**
 * One folder per share, and the first share keeps the key it has always had.
 *
 * `folder` was the only key there was. Suffixing it for every share would have
 * meant moving somebody's existing folder on the first start after an upgrade -
 * a migration, with a window in which a mistake loses the thing the app is for.
 * `scoped` in `shares.js` is where that rule lives; this is its other caller.
 */
const KEY = 'folder'

export const canPickFolder = () => typeof globalThis.showDirectoryPicker === 'function'

function open () {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)

    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transact (mode, run) {
  const db = await open()

  try {
    return await new Promise((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

/** @param {FileSystemDirectoryHandle} handle @param {string} [key] */
export const rememberFolder = (handle, key = KEY) =>
  transact('readwrite', store => store.put(handle, key))

export const forgetFolder = (key = KEY) => transact('readwrite', store => store.delete(key))

/** @param {string} [key] @returns {Promise<FileSystemDirectoryHandle | null>} */
export const storedFolder = (key = KEY) =>
  transact('readonly', store => store.get(key)).catch(() => null)

/**
 * Ask the picker, and remember what comes back.
 *
 * Must be called from a user gesture - the picker is a dialog, and browsers do
 * not open dialogs on a page's own initiative.
 */
export async function pickFolder (key = KEY) {
  const handle = await globalThis.showDirectoryPicker({ mode: 'readwrite' })

  await rememberFolder(handle, key)
  return handle
}

/**
 * A handle from a previous visit, if it is still usable.
 *
 * Permission does not survive with the handle. `queryPermission` says whether it
 * still holds; `requestPermission` asks again and **needs a user gesture**, so
 * it is offered rather than done here: a page that demanded permission on load
 * would be a page that asks before saying why.
 *
 * @returns {Promise<{ handle: FileSystemDirectoryHandle, granted: boolean } | null>}
 */
export async function restoreFolder (key = KEY) {
  const handle = await storedFolder(key)

  if (handle == null) return null

  const state = await handle.queryPermission?.({ mode: 'readwrite' })

  return { handle, granted: state === 'granted' }
}

/** @param {FileSystemDirectoryHandle} handle */
export async function askForFolder (handle) {
  const state = await handle.requestPermission?.({ mode: 'readwrite' })
  return state === 'granted'
}
