import { expect, test } from '@playwright/test'

/**
 * The interface, which until now had been looked at once and never asserted.
 *
 * Small on purpose: what is worth pinning is the wiring between the parts and
 * the one wording decision, not the layout. The parts themselves are covered
 * where they live.
 */

const open = async page => {
  const errors = []

  page.on('pageerror', error => errors.push(error.message))
  // The introduction is a modal and would swallow every click below it. These
  // tests are about the interface behind it; the introduction has its own file.
  await page.goto('/?intro=off')
  await page.waitForFunction(() => document.getElementById('files-empty') != null)

  return errors
}

test.describe('the interface', () => {
  test('starts up with nothing, and says so without blaming anyone', async ({ page }) => {
    const errors = await open(page)

    await expect(page.locator('#files-empty')).toBeVisible()

    // "Not connected yet", never "out of sync" or "pending". Two devices that
    // have never met are not in disagreement, and describing a stage as a fault
    // is how the first support question gets written.
    await expect(page.locator('#link-state')).toHaveText('Not connected yet.')
    expect(errors).toEqual([])
  })

  test('a chosen file is stored, listed and sized', async ({ page }) => {
    const errors = await open(page)

    await page.setInputFiles('#pick', {
      name: 'notiz.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('inhalt')
    })

    await expect(page.locator('#files li .name')).toHaveText('notiz.txt')
    await expect(page.locator('#files li .size')).toHaveText('6 bytes')
    await expect(page.locator('#files-empty')).toBeHidden()
    expect(errors).toEqual([])
  })

  test('removing takes it out of the list', async ({ page }) => {
    await open(page)

    await page.setInputFiles('#pick', {
      name: 'weg.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('gleich weg')
    })
    await expect(page.locator('#files li .name')).toHaveText('weg.txt')

    await page.locator('#files li button').click()

    await expect(page.locator('#files li')).toHaveCount(0)
    await expect(page.locator('#files-empty')).toBeVisible()
  })

  test('a nested file is drawn as a tree, not as a path in a flat row', async ({ page }) => {
    await open(page)

    // Written under a nested path directly: `setInputFiles` cannot fill in a
    // `webkitRelativePath`, and what is being tested is the drawing.
    await page.evaluate(async () => {
      const { directoryStorage } = await import('/src/storage/directory.js')
      const store = await directoryStorage()
      await store.write('notes/2026/august.md', new TextEncoder().encode('notiz'))
    })

    // Choosing a file is what triggers a pass, and that pass finds both.
    await page.setInputFiles('#pick', {
      name: 'top.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('oben')
    })

    // The promise the index made in its first commit, arriving on screen: the
    // path was always whole, so this is drawing rather than a migration.
    await expect(page.locator('.folder-head').first()).toContainText('notes')
  })

  test('a folder can be collapsed, and that is a view rather than a change', async ({ page }) => {
    await open(page)

    await page.evaluate(async () => {
      const { directoryStorage } = await import('/src/storage/directory.js')
      const store = await directoryStorage()
      await store.write('archive/old.txt', new TextEncoder().encode('alt'))
    })
    await page.setInputFiles('#pick', { name: 'top.txt', mimeType: 'text/plain', buffer: Buffer.from('oben') })

    const head = page.locator('.folder-head').first()
    await expect(head).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.file .name', { hasText: 'old.txt' })).toBeVisible()

    await head.click()

    await expect(head).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.file .name', { hasText: 'old.txt' })).toHaveCount(0)
    // The file itself is untouched - only its row is gone.
    await expect(page.locator('.file .name', { hasText: 'top.txt' })).toBeVisible()
  })

  test('the readiness panel is the library element, not a copy of one', async ({ page }) => {
    await open(page)

    // Third consumer of `@le-space/libp2p-webrtc-qr`, and the point of the
    // elements existing: this app writes no network judgement of its own.
    await expect(page.locator('qr-status')).toBeVisible()
    await expect(page.locator('qr-status')).toContainText(/Result|Checking/)
  })
})
