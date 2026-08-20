import { expect, test } from '@playwright/test'

/**
 * The four methods, in a real browser, because OPFS does not exist outside one.
 *
 * Small on purpose: this is the part of the system with the least logic and the
 * most platform. What is worth asserting is the contract the reconciler relies
 * on - especially that removing something absent is not an error, because a
 * tombstone arriving twice is ordinary.
 */

const open = async (page, name) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.clear(n), name)

  return {
    list: () => page.evaluate(async n => (await window.__ablage.storage(n)).list(), name),
    read: path => page.evaluate(async ([n, p]) => (await window.__ablage.storage(n)).read(p), [name, path]),
    write: (path, text) => page.evaluate(async ([n, p, t]) => (await window.__ablage.storage(n)).write(p, t), [name, path, text]),
    remove: path => page.evaluate(async ([n, p]) => (await window.__ablage.storage(n)).remove(p), [name, path]),
    bytes: path => page.evaluate(async ([n, p]) => (await window.__ablage.storage(n)).readBytes(p), [name, path])
  }
}

test.describe('opfs storage', () => {
  test('an empty store lists nothing', async ({ page }) => {
    const store = await open(page, 'empty')

    expect(await store.list()).toEqual([])
  })

  test('what is written comes back', async ({ page }) => {
    const store = await open(page, 'roundtrip')

    await store.write('notes.txt', 'hallo')

    expect(await store.list()).toEqual(['notes.txt'])
    expect(await store.read('notes.txt')).toBe('hallo')
  })

  test('bytes survive exactly, not as text', async ({ page }) => {
    // Files are not strings. A store that decodes on the way through would ruin
    // every image the moment somebody drops one in.
    const store = await open(page, 'bytes')

    await store.write('umlaut.txt', 'Größenänderung')

    expect(await store.read('umlaut.txt')).toBe('Größenänderung')
    expect(await store.bytes('umlaut.txt')).toHaveLength(new TextEncoder().encode('Größenänderung').length)
  })

  test('a nested path is stored whole and listed whole', async ({ page }) => {
    // Stage 1 shows one flat directory, but the index stores whole paths - so
    // storage has to accept them today or there is a migration the day
    // directories appear.
    const store = await open(page, 'nested')

    await store.write('notes/2026/august.md', 'inhalt')

    expect(await store.list()).toEqual(['notes/2026/august.md'])
    expect(await store.read('notes/2026/august.md')).toBe('inhalt')
  })

  test('writing the same path again replaces it', async ({ page }) => {
    const store = await open(page, 'replace')

    await store.write('same.txt', 'erst')
    await store.write('same.txt', 'dann')

    expect(await store.read('same.txt')).toBe('dann')
    expect(await store.list()).toEqual(['same.txt'])
  })

  test('removing takes the path out of the listing', async ({ page }) => {
    const store = await open(page, 'remove')

    await store.write('gone.txt', 'weg gleich')
    await store.remove('gone.txt')

    expect(await store.list()).toEqual([])
  })

  test('removing something absent is not an error', async ({ page }) => {
    // The reconciler asks for this whenever a tombstone arrives twice, which is
    // ordinary rather than exceptional.
    const store = await open(page, 'absent')

    await expect(store.remove('never-existed.txt')).resolves.toBeUndefined()
  })

  test('several files list together, nested and flat alike', async ({ page }) => {
    const store = await open(page, 'several')

    await store.write('a.txt', '1')
    await store.write('deep/b.txt', '2')
    await store.write('deep/deeper/c.txt', '3')

    expect((await store.list()).sort()).toEqual(['a.txt', 'deep/b.txt', 'deep/deeper/c.txt'])
  })
})
