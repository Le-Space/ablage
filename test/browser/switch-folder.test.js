import { expect, test } from '@playwright/test'

/**
 * What happens to a folder when this device starts working in a different one.
 *
 * The picker itself opens a native dialog no automation can drive, so the test
 * drives everything *after* it - which is where the damage was. `useFolder` in
 * the harness takes the same two steps `main.js` takes, in the same order.
 *
 * Issue #8 §1.
 */

const side = async page => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(() => window.__ablage.start('switch-a'))
}

test('a folder chosen because it was empty stays empty', async ({ page }) => {
  await side(page)

  const seen = await page.evaluate(async () => {
    const h = window.__ablage

    await h.write('alt.txt', 'contents of the first folder')
    await h.reconcile()
    const before = await h.paths()

    await h.useFolder('switch-b-fresh')
    await h.reconcile()

    return { before, filesInB: await h.list(), indexAfter: await h.paths() }
  })

  // Before the fix this read ["alt.txt"]: every entry the index held was
  // missing from the new folder, so the reconciler fetched the bytes by address
  // and wrote them there. Choosing an empty folder filled it with the old one.
  expect(seen.before).toEqual(['alt.txt'])
  expect(seen.filesInB).toEqual([])
  expect(seen.indexAfter).toEqual([])
})

test('and the new folder is what the index then describes', async ({ page }) => {
  await side(page)

  const seen = await page.evaluate(async () => {
    const h = window.__ablage

    await h.write('alt.txt', 'first folder')
    await h.reconcile()

    await h.useFolder('switch-c-fresh')
    await h.write('neu.txt', 'second folder')
    await h.reconcile()

    return { paths: await h.paths(), files: await h.list() }
  })

  // Exactly the files this folder contains - not the previous folder's, and
  // not a merged view of both.
  expect(seen.files).toEqual(['neu.txt'])
  expect(seen.paths).toEqual(['neu.txt'])
})
