import { expect, test } from '@playwright/test'

/**
 * The book, through the interface.
 *
 * The unit tests cover the rules. What they cannot cover is the thing this
 * feature exists for: opening a share and having the app *be* that share
 * afterwards - a different identity, a different folder, a different list of
 * devices - which is only true after a reload, because all three are read once
 * before the node exists.
 */

const open = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#share-name')).not.toBeEmpty({ timeout: 60_000 })
}

const mine = page => page.locator('#my-peer').getAttribute('title')

test('the open share is named above everything it decides', async ({ page }) => {
  await open(page)

  await expect(page.locator('#share-name')).toHaveText(/This folder|Dieser Ordner/)
})

test('a new share can be added and opened, and the identity changes with it', async ({ page }) => {
  // The whole point of a share owning its own key: to everybody else these are
  // two unrelated devices.
  await open(page)

  const before = await mine(page)

  await page.locator('#shares-open').click()
  await page.locator('#share-new-name').fill('Photos')
  await page.locator('#share-new').getByRole('button').click()

  const row = page.locator('.share', { hasText: 'Photos' })

  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /Open now|Jetzt öffnen/ }).click()

  await expect(page.locator('#share-name')).toHaveText('Photos', { timeout: 60_000 })
  expect(await mine(page)).not.toBe(before)
})

test('and going back is going back to the same identity', async ({ page }) => {
  // A share that came back as somebody new would be a share that lost its
  // devices, which is the failure this feature exists to end.
  await open(page)

  const first = await mine(page)

  await page.locator('#shares-open').click()
  await page.locator('#share-new-name').fill('Photos')
  await page.locator('#share-new').getByRole('button').click()
  await page.locator('.share', { hasText: 'Photos' }).getByRole('button', { name: /Open now|Jetzt öffnen/ }).click()
  await expect(page.locator('#share-name')).toHaveText('Photos', { timeout: 60_000 })

  await page.locator('#shares-open').click()
  await page.locator('.share', { hasText: /This folder|Dieser Ordner/ })
    .getByRole('button', { name: /Open now|Jetzt öffnen/ }).click()

  await expect(page.locator('#share-name')).toHaveText(/This folder|Dieser Ordner/, { timeout: 60_000 })
  expect(await mine(page)).toBe(first)
})

test('the one-off share is a stranger every time', async ({ page }) => {
  // What a named share buys is recognition; what this buys is the opposite, and
  // it was every start's behaviour before shares existed.
  await open(page)

  await page.locator('#shares-open').click()
  await page.locator('.share', { hasText: /One-off|Einmalig/ })
    .getByRole('button', { name: /Open now|Jetzt öffnen/ }).click()

  await expect(page.locator('#share-name')).toHaveText(/One-off|Einmalig/, { timeout: 60_000 })

  const once = await mine(page)

  await page.reload()
  await expect(page.locator('#share-name')).toHaveText(/One-off|Einmalig/, { timeout: 60_000 })

  expect(await mine(page)).not.toBe(once)
})

test('and it offers nothing to rename or remove, because there is nothing there', async ({ page }) => {
  await open(page)
  await page.locator('#shares-open').click()

  const row = page.locator('.share', { hasText: /One-off|Einmalig/ })

  await expect(row.getByRole('button', { name: /Rename|Umbenennen/ })).toHaveCount(0)
  await expect(row.getByRole('button', { name: /Remove|Entfernen/ })).toHaveCount(0)
})

test('removing a share says the files are still there', async ({ page }) => {
  // "Remove" beside a folder reads like a threat to the files and is not one.
  await open(page)

  await page.locator('#shares-open').click()
  await page.locator('#share-new-name').fill('Photos')
  await page.locator('#share-new').getByRole('button').click()

  await page.locator('.share', { hasText: 'Photos' }).getByRole('button', { name: /Remove|Entfernen/ }).click()

  await expect(page.locator('.share', { hasText: 'Photos' })).toHaveCount(0)
  await expect(page.locator('#link-state')).toContainText(/files are untouched|Dateien bleiben unberührt/i)
})
