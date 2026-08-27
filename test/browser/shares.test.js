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
  // The button, not the name: with one share there is no name on screen.
  await expect(page.locator('#shares-open')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('#share-name')).not.toBeEmpty()
}

/**
 * Waited for, not read.
 *
 * The share name appears as soon as the page paints; the peer id appears when
 * the node has been built, which is later. Reading straight after a reload got
 * `null` about one run in twenty - and a test that flakes on the thing it is
 * asserting is worse than one that does not exist.
 */
const mine = async page => {
  await expect(page.locator('#my-peer')).toHaveAttribute('title', /12D3Koo/, { timeout: 60_000 })

  return page.locator('#my-peer').getAttribute('title')
}

test('with one share there is no name on screen, only a way in', async ({ page }) => {
  // "Share: This folder" above the only folder there is names a concept
  // somebody does not have yet, on the densest screen in the app. The button
  // stays, because without it a second share could never be made.
  await open(page)

  await expect(page.locator('#share-now')).toBeHidden()
  await expect(page.locator('#shares-open')).toBeVisible()
})

test('and the name appears as soon as there is something to tell apart', async ({ page }) => {
  await open(page)

  await page.locator('#shares-open').click()
  await page.locator('#share-new-name').fill('Photos')
  await page.locator('#share-new').getByRole('button').click()
  await page.locator('#shares-close').click()

  await expect(page.locator('#share-now')).toBeVisible()
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

/**
 * The seam nothing covered: a share owns a *folder*.
 *
 * Every test above is about identity, names and buttons. None of them opens a
 * share and asks whether the files changed with it - and that is the failure
 * with the worst shape, because two shares quietly writing into one folder
 * looks entirely correct until somebody wonders why their invoices are in with
 * their photos.
 *
 * Found by working through #44, which is what it is for.
 */
test('a share opens its own folder, not the last one', async ({ page }) => {
  await open(page)

  await page.setInputFiles('#pick', {
    name: 'erste.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('gehört zur ersten Freigabe')
  })
  await expect(page.locator('.tree')).toContainText('erste.txt')

  await page.locator('#shares-open').click()
  await page.locator('#share-new-name').fill('Photos')
  await page.locator('#share-new').getByRole('button').click()
  await page.locator('.share', { hasText: 'Photos' })
    .getByRole('button', { name: /Open now|Jetzt öffnen/ }).click()

  await expect(page.locator('#share-name')).toHaveText('Photos', { timeout: 60_000 })

  // The claim. Not "a different name at the top" - a different folder.
  await expect(page.locator('.tree')).not.toContainText('erste.txt')

  await page.setInputFiles('#pick', {
    name: 'zweite.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('gehört zur zweiten')
  })
  await expect(page.locator('.tree')).toContainText('zweite.txt')

  // And back, which is the half that would catch a folder that was emptied
  // rather than swapped.
  await page.locator('#shares-open').click()
  await page.locator('.share', { hasText: /This folder|Dieser Ordner/ })
    .getByRole('button', { name: /Open now|Jetzt öffnen/ }).click()

  await expect(page.locator('#share-name')).toHaveText(/This folder|Dieser Ordner/, { timeout: 60_000 })
  await expect(page.locator('.tree')).toContainText('erste.txt')
  await expect(page.locator('.tree')).not.toContainText('zweite.txt')
})

/**
 * A folded phone, which is where this broke.
 *
 * Three buttons pinned beside a name column ran off the right of the dialog on
 * a Fold 5 while the name broke across three lines. Reported with a screenshot,
 * and the fix is that the row wraps rather than that the words got shorter.
 */
test.describe('narrow enough to fold', () => {
  const withTwo = async page => {
    await page.addInitScript(() => {
      localStorage.setItem('ablage.shares', JSON.stringify({
        entries: [{ id: 'default', name: null }, { id: 'r2', name: 'Sophie' }], current: 'r2'
      }))
    })
    await page.goto('/?intro=off')
    await expect(page.locator('#shares-open')).toBeVisible({ timeout: 60_000 })
    await page.locator('#shares-open').click()
  }

  for (const width of [344, 390, 717]) {
    test(`nothing runs out of the dialog at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await withTwo(page)

      const over = await page.evaluate(() => {
        const box = document.getElementById('shares').getBoundingClientRect()

        return [...document.querySelectorAll('#share-list button, #share-new button, #share-new input')]
          .filter(el => el.getBoundingClientRect().right > box.right + 1)
          .map(el => el.getAttribute('aria-label') ?? (el.textContent.trim() || el.id))
      })

      expect(over, `bei ${width}px`).toEqual([])
    })
  }

  test('the icon buttons are big enough for a thumb, and still say what they are', async ({ page }) => {
    // 44px is the smallest thing a thumb hits reliably. An icon button that
    // saves room by being small has moved the problem rather than solved it -
    // and one with no accessible name is a button nobody can ask about.
    await page.setViewportSize({ width: 344, height: 800 })
    await withTwo(page)

    const icons = page.locator('#share-list .icon-button')

    expect(await icons.count()).toBeGreaterThan(1)

    for (let i = 0; i < await icons.count(); i++) {
      const box = await icons.nth(i).boundingBox()

      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      await expect(icons.nth(i)).toHaveAttribute('aria-label', /Rename|Umbenennen|Remove|Entfernen/)
    }
  })

  test('and "open" stays a word, because no picture means it', async ({ page }) => {
    await page.setViewportSize({ width: 344, height: 800 })
    await withTwo(page)

    await expect(page.locator('.share', { hasText: /This folder|Dieser Ordner/ })
      .getByRole('button', { name: /Open now|Jetzt öffnen/ })).toBeVisible()
  })
})

test('the page does not scroll away behind an open dialog', async ({ page }) => {
  // A modal `<dialog>` takes the keyboard and blocks clicks, and then lets the
  // page underneath scroll as soon as a thumb touches the backdrop - so the
  // thing being answered slides off while the answer is still open. Obvious on
  // a Fold, where there is enough page under the dialog to notice.
  await page.setViewportSize({ width: 717, height: 700 })
  await page.goto('/?intro=off')
  await expect(page.locator('#shares-open')).toBeVisible({ timeout: 60_000 })

  // Something to scroll: without it this passes on a page that is short.
  await page.setInputFiles('#pick', Array.from({ length: 12 }, (_, i) => ({
    name: `datei-${i}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(`${i}`)
  })))
  await expect(page.locator('.tree')).toContainText('datei-11.txt')
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true)

  await page.locator('#shares-open').click()
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(300)

  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  // And it scrolls again afterwards, rather than being left locked.
  await page.locator('#shares-close').click()
  await page.mouse.wheel(0, 800)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})
