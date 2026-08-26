import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys'

/**
 * An identity that outlives a reload, one per share.
 *
 * Until now every start generated a fresh key pair, so the peer id changed on
 * every load, the other device saw somebody it had never met, and the admission
 * dialog asked again. Pairing was something you redid rather than something you
 * had.
 *
 * **One key per share, not one per device**, which is the point rather than a
 * detail: two shares by the same person then look like two unrelated strangers
 * on the discovery topic, and nothing links "the folder I share with my
 * partner" to "the folder I share with a client".
 *
 * That property has limits and they belong here rather than in a sales
 * sentence: different peer ids do not hide a shared IP address. A relay sees
 * both identities arriving from one place, and two shares used at the same
 * moment are trivially linkable. The property is real against other *peers* on
 * the meeting place and much weaker against the relay.
 */

export const KEYS_STORAGE_KEY = 'ablage.keys'

/**
 * **The envelope exists before the encryption does, and that is deliberate.**
 *
 * Storing a bare key now and adding a password later would mean a migration -
 * reading two shapes, guessing which is which, and getting it wrong for
 * somebody whose only copy of an identity is in it. So the shape is settled
 * from the first version and `kdf` says which one this is:
 *
 *     { v: 1, kdf: 'none',   material }
 *     { v: 1, kdf: 'PBKDF2', salt, iterations, iv, ciphertext }
 *
 * `crypto.subtle` has everything the second needs. No dependency, and no change
 * to anything that reads this file.
 *
 * **Say plainly what version one is.** A private key under `kdf: 'none'` is
 * readable by any script on this origin, survives in profile backups, and is
 * not protected by the device lock. A reasonable place to start; a bad place to
 * stop. See issue #43.
 */
const ENVELOPE_VERSION = 1

const encode = bytes => btoa(String.fromCharCode(...bytes))
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0))

function read (storage, key) {
  try {
    const held = JSON.parse(storage?.getItem(key) ?? '{}')

    return held != null && typeof held === 'object' && !Array.isArray(held) ? held : {}
  } catch {
    // Absent, unparsable, or a store the browser refused. All of them mean the
    // same here: nothing remembered.
    return {}
  }
}

function write (storage, key, held) {
  try {
    storage?.setItem(key, JSON.stringify(held))
    return true
  } catch {
    // Full or blocked. The caller gets an identity that holds for this session
    // and no longer, which is what happened before this file existed.
    return false
  }
}

/**
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * @param {string} shareId
 * @param {{ key?: string }} [options]
 * @returns {Promise<import('@libp2p/interface').PrivateKey | null>}
 */
export async function recallKey (storage, shareId, { key = KEYS_STORAGE_KEY } = {}) {
  const envelope = read(storage, key)[shareId]

  if (envelope?.kdf !== 'none' || typeof envelope.material !== 'string') return null

  try {
    return privateKeyFromProtobuf(decode(envelope.material))
  } catch {
    // A half-written value, or one from a version that stored something else.
    // Returning null means a new identity rather than a start that throws.
    return null
  }
}

/**
 * The identity for this share, made once and kept.
 *
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} storage
 * @param {string} shareId
 * @param {{ key?: string }} [options]
 */
export async function keyFor (storage, shareId, { key = KEYS_STORAGE_KEY } = {}) {
  const held = await recallKey(storage, shareId, { key })

  if (held != null) return held

  const made = await generateKeyPair('Ed25519')
  const envelope = { v: ENVELOPE_VERSION, kdf: 'none', material: encode(privateKeyToProtobuf(made)) }

  write(storage, key, { ...read(storage, key), [shareId]: envelope })
  return made
}

/** @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} storage */
export function forgetKey (storage, shareId, { key = KEYS_STORAGE_KEY } = {}) {
  const held = read(storage, key)

  if (!(shareId in held)) return

  delete held[shareId]
  write(storage, key, held)
}
