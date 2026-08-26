import { directoryStorage } from './directory.js'
import { canPickFolder, restoreFolder } from './handle.js'

/**
 * Which folder this browser works in.
 *
 * A folder the person picked, if there is one from a previous visit and its
 * permission still holds. Otherwise the origin's private one, which every
 * engine has. The store returned is the same either way - that is the point of
 * the four-method contract, and it is why the picker could be added without
 * touching the reconciler.
 *
 * A restored handle whose permission lapsed is deliberately **not** asked about
 * here: `requestPermission` needs a user gesture, and asking on load is asking
 * before saying why. The application offers it instead, and falls back to the
 * private folder until then.
 */
export async function openStorage ({ root, folderKey, privateName = null } = {}) {
  if (root != null) {
    return { store: await directoryStorage({ root }), kind: 'given' }
  }

  const restored = canPickFolder() ? await restoreFolder(folderKey) : null

  if (restored?.granted) {
    return { store: await directoryStorage({ root: restored.handle }), kind: 'picked', handle: restored.handle }
  }

  return {
    store: await directoryStorage(privateName == null ? {} : { root: await privateFolder(privateName) }),
    kind: 'private',
    // So the interface can offer the folder back rather than making somebody
    // pick it again.
    pending: restored?.handle ?? null
  }
}

/**
 * A private folder of this share's own.
 *
 * Without a picker there is one private folder per origin, and two shares would
 * quietly be the same folder under two names - the worst kind of wrong, because
 * everything looks right until somebody wonders why their invoices are in with
 * their photos.
 *
 * `privateName` is null for the share that existed before shares did, so its
 * files stay exactly where they are: at the root, where they were written.
 */
async function privateFolder (name) {
  const root = await navigator.storage.getDirectory()

  return root.getDirectoryHandle(`share-${name}`, { create: true })
}

export { directoryStorage }
