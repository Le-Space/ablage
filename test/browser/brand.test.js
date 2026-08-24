import { expect, test } from '@playwright/test'

/**
 * The mark links home, and it must not cost anybody their connection.
 *
 * This page holds live libp2p connections and a document being synced.
 * Following a link in the same tab closes all of it, and somebody who tapped a
 * logo did not ask to end a transfer - so the target is the assertion, not a
 * detail of it.
 */

test('the mark links to le-space.de', async ({ page }) => {
  await page.goto('/?intro=off')

  const link = page.locator('.mark-link')

  await expect(link).toHaveAttribute('href', 'https://le-space.de')
  await expect(link.locator('#mark')).toBeVisible()
})

test('and opens a new tab, so this page keeps its connections', async ({ page }) => {
  await page.goto('/?intro=off')

  await expect(page.locator('.mark-link')).toHaveAttribute('target', '_blank')
  // `noopener` on top: without it the opened page gets a handle on this one.
  await expect(page.locator('.mark-link')).toHaveAttribute('rel', /noopener/)
})

test('the app name is not the thing that navigates away', async ({ page }) => {
  // `ablage` is this app's own name. A name that leaves for another site is a
  // trapdoor, so the small mark beside it carries the link instead.
  await page.goto('/?intro=off')

  await expect(page.locator('.brand h1')).toHaveText('ablage')
  expect(await page.locator('.brand h1 a').count()).toBe(0)
})

test('it says where it goes, in both languages', async ({ page }) => {
  await page.goto('/?intro=off')

  await expect(page.locator('.mark-link')).toHaveAttribute('title', /Le-Space/)

  // A link whose only content is a picture needs a name, or a screen reader
  // reads out the URL.
  await expect(page.locator('.mark-link')).toHaveAttribute('aria-label', /Le-Space/)
})
