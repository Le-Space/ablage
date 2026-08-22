import { expect, test } from '@playwright/test'

/**
 * Saying which of the two folders this is.
 *
 * `directory.js` deliberately cannot tell them apart - a picked folder and the
 * origin's private one are both a `FileSystemDirectoryHandle`, which is what
 * let the picker be added without touching the reconciler. Good design inside,
 * and a trap outside: the app looks identical whether the files are on somebody's
 * disk or locked in a browser profile, and the difference shows up when they
 * clear the browser.
 *
 * The picker itself opens a native dialog no automation can drive, so what is
 * asserted here is the half that can be: what the app says about where it is,
 * and what it says before somebody presses anything.
 */

test.describe('where the files actually are', () => {
  test('says plainly that this is the browser, not a folder on disk', async ({ page }) => {
    await page.goto('/?intro=off')

    // "Working in this browser's private storage" was accurate and told nobody
    // what it costs them.
    await expect(page.locator('#folder')).toHaveAttribute('data-place', 'browser')
    await expect(page.locator('#folder')).toContainText('not a folder on your disk')
    await expect(page.locator('#folder-detail')).toContainText(/clearing this browser/i)
  })

  test('and names the consequence a person can act on', async ({ page }) => {
    await page.goto('/?intro=off')

    // The two facts that matter: nothing outside can see them, and clearing the
    // browser deletes them.
    await expect(page.locator('#folder-detail')).toContainText(/no file manager/i)
  })

  test('says what choosing a folder would grant, before the button', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the permission sentence belongs to the branch that has a picker')
    await page.goto('/?intro=off')

    const note = page.locator('#folder-note')
    const button = page.locator('#pick-folder')

    // Chromium has the picker, so this is the permission sentence.
    await expect(note).toContainText(/nowhere else/i)
    await expect(note).toContainText(/withdraw/i)

    // Before it in the document, not after: finding out what a control does by
    // pressing it is the wrong order for a permission.
    const order = await page.evaluate(() => {
      const n = document.getElementById('folder-note')
      const b = document.getElementById('pick-folder')
      return n.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 'note first' : 'button first'
    })

    expect(order).toBe('note first')
    await expect(button).toBeVisible()
  })

  test('says so in German too', async ({ page, browserName }) => {
    await page.goto('/?intro=off&lang=de')

    // Where the files are is the same sentence on every engine.
    await expect(page.locator('#folder')).toContainText('kein Ordner auf Ihrer Festplatte')

    // The note underneath is not: one engine explains the permission, the
    // others explain why there is nothing to press. Both are German, and
    // asserting only the first would have passed on a third of the matrix.
    await expect(page.locator('#folder-note')).toContainText(
      browserName === 'chromium' ? 'sonst nirgends' : 'im Browser'
    )
  })

  test('where there is no picker, it says why rather than hiding the reason', async ({ page, browserName }) => {
    test.skip(browserName === 'chromium', 'chromium has the picker; this is the other branch')
    await page.goto('/?intro=off')

    // A missing button with no explanation reads as a missing feature rather
    // than as a browser that cannot do it.
    await expect(page.locator('#pick-folder')).toBeHidden()
    await expect(page.locator('#folder-note')).toContainText(/Chromium/i)
  })
})
