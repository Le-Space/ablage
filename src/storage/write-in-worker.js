/**
 * `write()` for a browser without `createWritable()` - Safari before 26.
 *
 * See `write-worker.js` for why it takes a worker. This is the page's half: one
 * worker, started on the first write that needs it, and a promise per write.
 */

let worker = null
let next = 0
const waiting = new Map()

function start () {
  worker = new Worker(new URL('./write-worker.js', import.meta.url), { type: 'module' })

  worker.onmessage = ({ data }) => {
    const pending = waiting.get(data.id)
    if (pending == null) return

    waiting.delete(data.id)
    if (data.ok) pending.resolve()
    else pending.reject(Object.assign(new Error(data.message), { name: data.name }))
  }

  // A worker that fails to start fails every write it was given, rather than
  // leaving them waiting forever - a write that never settles is the silent
  // failure this file exists to remove.
  worker.onerror = event => {
    const error = new Error(event.message || 'The write worker failed')
    for (const pending of waiting.values()) pending.reject(error)
    waiting.clear()
    worker = null
  }

  return worker
}

/**
 * @param {FileSystemFileHandle} handle a file inside the origin's private folder
 * @param {Uint8Array} bytes
 */
export async function writeInWorker (handle, bytes) {
  // Handed the way there rather than the handle: a list of names is plain
  // data and survives postMessage in every engine.
  const parts = await (await navigator.storage.getDirectory()).resolve(handle)

  if (parts == null) {
    throw new Error('This browser can write only into its own private folder')
  }

  const id = ++next

  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    ;(worker ?? start()).postMessage({ id, parts, bytes })
  })
}
