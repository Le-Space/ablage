import { expect, test } from '@playwright/test'

/**
 * A folder's name is a peer's text, and it is drawn as text.
 *
 * The file tree is built from index paths, and the index is the shared Yjs
 * document - every admitted peer writes into it. A file row already drew its
 * name with `textContent`. A folder head did not: `main.js` built it with
 * `innerHTML` and the name inside the template, so a path like
 * `<img src=x onerror=…>/x.txt` synced from a peer ran script on every device
 * that rendered the share - and, the index being a CRDT, again on every
 * reload until the path was removed. #43's audit named "what is not gated";
 * this was a sink nobody had listed.
 *
 * Seeded into this device's own store rather than sent by a peer, because the
 * render path is the same either way and one page proves it in a second. The
 * assertion is the one from the inbox: nothing ran, no element was created,
 * and the name is on screen exactly as written.
 */

const POISON = '<img src=x onerror="window.__owned = true">'

test('a folder named like markup is drawn as its literal name and runs nothing', async ({ page }) => {
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled()

  await page.evaluate(async name => {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(name, { create: true })
    const file = await dir.getFileHandle('x.txt', { create: true })
    const w = await file.createWritable()
    await w.write('inside')
    await w.close()
  }, POISON)

  await page.reload()
  await expect(page.locator('#invite')).toBeEnabled()
  await expect(page.locator('.tree')).toContainText('x.txt')

  expect(await page.evaluate(() => window.__owned), 'the folder name executed').toBeUndefined()
  expect(await page.locator('.tree').evaluate(el => el.querySelectorAll('img, script').length), 'markup became elements').toBe(0)
  await expect(page.locator('.tree')).toContainText(POISON)
})
