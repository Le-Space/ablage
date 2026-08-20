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
export async function openStorage ({ root } = {}) {
  if (root != null) {
    return { store: await directoryStorage({ root }), kind: 'given' }
  }

  const restored = canPickFolder() ? await restoreFolder() : null

  if (restored?.granted) {
    return { store: await directoryStorage({ root: restored.handle }), kind: 'picked', handle: restored.handle }
  }

  return {
    store: await directoryStorage(),
    kind: 'private',
    // So the interface can offer the folder back rather than making somebody
    // pick it again.
    pending: restored?.handle ?? null
  }
}

export { directoryStorage }
