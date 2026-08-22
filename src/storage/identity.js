/**
 * Which folder this is, in a way that survives being renamed and moved.
 *
 * A name is not an identity. Two people with a folder called `Rechnungen` do
 * not mean the same folder, and the same folder renamed on one side reads as a
 * new one - so a message saying "I switched to Rechnungen" is a claim about a
 * string, and the answers to it (#8 §3) would be wrong in both directions.
 *
 * So the id lives **in the folder**, not beside it. Kept in this browser's
 * storage instead it would be lost exactly when the folder is carried to
 * another machine, which is the moment it is needed. The cost is a visible file
 * in somebody's own directory, and that is the honest trade rather than a
 * hidden one - the file says what it is when they open it.
 */

/**
 * Reserved, and excluded from the index by `directoryStorage`.
 *
 * Replicating it would be worse than useless: the other side's folder would
 * receive our id and answer to it, so two folders would claim to be the same
 * one and neither would be able to say otherwise.
 */
export const IDENTITY_FILE = '.ablage-folder.json'

const encode = value => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)

/**
 * `crypto.randomUUID` needs a secure context, which a page served over plain
 * http on a phone is not. The fallback is the same 122 random bits by hand
 * rather than something weaker, because an id that collides is an id that makes
 * two different folders answer to the same message.
 */
function newId () {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The folder's id, written on first sight and read every time after.
 *
 * @param {{ read(path: string): Promise<Uint8Array>, write(path: string, bytes: Uint8Array): Promise<void> }} storage
 * @param {{ now?: () => number, id?: () => string }} [options] for tests
 * @returns {Promise<{ id: string, created: boolean }>}
 */
export async function folderIdentity (storage, { now = Date.now, id = newId } = {}) {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await storage.read(IDENTITY_FILE)))

    // A file that is there but says nothing usable is treated as absent. Half a
    // file is how a write that was interrupted looks, and refusing to work
    // because of one would strand the folder rather than repair it.
    if (typeof parsed?.id === 'string' && parsed.id !== '') {
      return { id: parsed.id, created: false }
    }
  } catch {
    // Missing, unreadable, or not JSON. All three mean the same thing here.
  }

  const fresh = { id: id(), createdAt: new Date(now()).toISOString(), by: 'ablage' }

  await storage.write(IDENTITY_FILE, encode(fresh))
  return { id: fresh.id, created: true }
}
