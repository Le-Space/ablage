/**
 * Writes a file into the origin's private folder, for a page that cannot.
 *
 * `createWritable()` arrived in Safari 26. Before that, WebKit could write a
 * file in the private folder only through `createSyncAccessHandle()`, and that
 * exists only inside a dedicated worker - so this is the worker. Chromium and
 * Firefox have both; `directory.js` uses `createWritable()` there and never
 * starts this.
 *
 * One write at a time. A sync access handle is an exclusive lock on its file,
 * and two messages for the same path interleaving at an `await` would have the
 * second one fail to open it.
 *
 * Not atomic, unlike `createWritable()`, which writes a copy and swaps it in on
 * close. A write that dies halfway leaves a file whose bytes no longer hash to
 * its address, and the reconciler treats that like any other difference: it
 * fetches the file again.
 */

let queue = Promise.resolve()

self.onmessage = ({ data }) => {
  queue = queue.then(() => write(data))
}

async function write ({ id, parts, bytes }) {
  let access = null

  try {
    let dir = await navigator.storage.getDirectory()

    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part)
    }

    const file = await dir.getFileHandle(parts[parts.length - 1], { create: true })

    // Early implementations returned promises from some of these methods, later
    // ones plain values. Awaiting either is the same.
    access = await file.createSyncAccessHandle()
    await access.truncate(0)
    const written = await access.write(bytes, { at: 0 })
    await access.flush()

    // Closed before answering: the page reads what it wrote, and a file still
    // held by a sync access handle refuses to be read.
    await access.close()
    access = null

    if (written !== bytes.byteLength) {
      throw new Error(`Wrote ${written} of ${bytes.byteLength} bytes`)
    }

    self.postMessage({ id, ok: true })
  } catch (error) {
    if (access != null) {
      try { await access.close() } catch {}
    }

    self.postMessage({ id, ok: false, name: error?.name ?? 'Error', message: String(error?.message ?? error) })
  }
}
