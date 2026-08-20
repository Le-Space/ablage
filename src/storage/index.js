import { opfsStorage } from './opfs.js'

/**
 * Which store this browser gets.
 *
 * One function today, and the seam for stage 3: a picked directory satisfies
 * the same four methods, feature-detected, with OPFS staying the store
 * everywhere the picker does not exist - which is Firefox and WebKit.
 */
export async function openStorage (options) {
  return opfsStorage(options)
}

export { opfsStorage }
