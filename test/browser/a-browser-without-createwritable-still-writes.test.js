import { expect, test } from '@playwright/test'

/**
 * Writing without `createWritable()`, the way Safari before 26 has to.
 *
 * No project here runs WebKit, so these specs take the method away and leave
 * everything else: the page loses `createWritable()`, the worker keeps
 * `createSyncAccessHandle()`. That is the shape of Safari from 15.2 up to 26.
 * Before `write-in-worker.js`, every write below failed with "createWritable
 * is not a function", and in the app a chosen file got no row at all.
 */

const withoutCreateWritable = page =>
  page.addInitScript(() => { delete FileSystemFileHandle.prototype.createWritable })

const open = async (page, name) => {
  await withoutCreateWritable(page)
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.clear(n), name)

  // The premise, checked rather than assumed: with the method still there,
  // these specs would pass without ever reaching the worker.
  expect(await page.evaluate(() => typeof FileSystemFileHandle.prototype.createWritable)).toBe('undefined')

  return {
    list: () => page.evaluate(async n => (await window.__ablage.storage(n)).list(), name),
    read: path => page.evaluate(async ([n, p]) => (await window.__ablage.storage(n)).read(p), [name, path]),
    write: (path, text) => page.evaluate(async ([n, p, t]) => (await window.__ablage.storage(n)).write(p, t), [name, path, text])
  }
}

test.describe('a browser without createWritable()', () => {
  test('writes, and what it wrote comes back', async ({ page }) => {
    const store = await open(page, 'nw-roundtrip')

    await store.write('notes.txt', 'hallo')

    expect(await store.list()).toEqual(['notes.txt'])
    expect(await store.read('notes.txt')).toBe('hallo')
  })

  test('a shorter rewrite leaves nothing of the longer file behind', async ({ page }) => {
    // What createWritable() gave for free and a sync access handle does not:
    // starting from an empty file. Without the truncate the old tail stays.
    const store = await open(page, 'nw-rewrite')

    await store.write('notes.txt', 'a much longer first version')
    await store.write('notes.txt', 'kurz')

    expect(await store.read('notes.txt')).toBe('kurz')
  })

  test('a nested path is written and listed whole', async ({ page }) => {
    const store = await open(page, 'nw-nested')

    await store.write('fotos/2026/september.txt', 'drin')

    expect(await store.list()).toEqual(['fotos/2026/september.txt'])
    expect(await store.read('fotos/2026/september.txt')).toBe('drin')
  })

  test('every byte value and six megabytes survive exactly', async ({ page }) => {
    await open(page, 'nw-bytes')

    const out = await page.evaluate(async () => {
      const { directoryStorage } = await import('/src/storage/directory.js')
      const origin = await navigator.storage.getDirectory()

      await origin.removeEntry('nw-bytes-raw', { recursive: true }).catch(() => {})
      const store = await directoryStorage({ root: await origin.getDirectoryHandle('nw-bytes-raw', { create: true }) })

      // 131 is odd, so the first 256 bytes already hold every value once.
      const bytes = new Uint8Array(6 * 1024 * 1024).map((_, i) => (i * 131 + (i >> 16)) & 255)
      await store.write('big.bin', bytes)
      const back = await store.read('big.bin')

      let same = back.length === bytes.length
      for (let i = 0; same && i < bytes.length; i++) same = back[i] === bytes[i]

      return { length: back.length, same, values: new Set(back.subarray(0, 256)).size }
    })

    expect(out).toEqual({ length: 6 * 1024 * 1024, same: true, values: 256 })
  })
})

test.describe('the app without createWritable()', () => {
  test('stores a chosen file, lists it, and still has it after a reload', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    await withoutCreateWritable(page)
    await page.goto('/?intro=off')
    await page.waitForFunction(() => document.getElementById('files-empty') != null)

    await page.setInputFiles('#pick', { name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('inhalt') })
    await expect(page.locator('#files li .name')).toHaveText('notiz.txt')

    // A row can come from the index alone. A reload rebuilds the index from
    // what is on disk, so the row after it is the proof the bytes were written.
    await page.reload()
    await page.waitForFunction(() => document.getElementById('files-empty') != null)
    await expect(page.locator('#files li .name')).toHaveText('notiz.txt')

    expect(errors).toEqual([])
  })
})
