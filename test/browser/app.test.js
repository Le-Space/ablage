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
  test('carries the Le-Space mark, drawn from the family grammar', async ({ page }) => {
    await open(page)

    // Coral for the local node, cyan for the peer, dashed for the sync between
    // them - the same grammar as every other project in the family, applied to
    // folders instead of nodes.
    const svg = page.locator('#mark svg')
    await expect(svg).toBeVisible()
    await expect(svg).toHaveAttribute('aria-label', 'ablage')
  })

  test('a row shows what kind of thing it is', async ({ page }) => {
    await open(page)

    await page.evaluate(async () => {
      const { directoryStorage } = await import('/src/storage/directory.js')
      const store = await directoryStorage()
      await store.write('box/inner.txt', new TextEncoder().encode('drin'))
    })
    await page.setInputFiles('#pick', { name: 'flat.txt', mimeType: 'text/plain', buffer: Buffer.from('oben') })

    // A folder mark and a file mark, not one glyph doing both jobs.
    await expect(page.locator('.folder-head svg')).toBeVisible()
    await expect(page.locator('.file svg').first()).toBeVisible()
  })

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

    // In the technical view, where the chips now live: they are diagnostics,
    // and "IPv6: none" is not something the simple view can act on. What this
    // test is about is unchanged - that the panel is the library's element.
    await page.locator('#view-mode').click()

    // Third consumer of `@le-space/libp2p-webrtc-qr`, and the point of the
    // elements existing: this app writes no network judgement of its own.
    await expect(page.locator('qr-status')).toBeVisible()
    await expect(page.locator('qr-status')).toContainText(/Result|Checking/)
  })
})

test.describe('the short code', () => {
  // Scoped to its own checkbox. `.option` is the shared class for a small
  // opt-in control and there are two of them now - the other is the waiting
  // music - so a bare `.option` matches both and Playwright refuses it rather
  // than picking one, which is the right refusal.
  const option = page => page.locator('label.option:has(#compact-payload)')

  const technical = async page => {
    await page.goto('/?intro=off')
    await page.locator('#view-mode').click()
  }

  test('is offered to everybody, not only to the technical view', async ({ page }) => {
    // One code instead of a sequence of flashing ones is the plainest possible
    // improvement, and holding it back from whoever picked the simple view
    // would keep it from exactly the person it helps most.
    await page.goto('/?intro=off')

    await expect(page.locator('#compact-payload')).toBeVisible()
    await expect(option(page)).toContainText('Experimental')
  })

  test('warns in every view, and explains itself only in the technical one', async ({ page }) => {
    await page.goto('/?intro=off')

    // A warning is not a detail: somebody who ticks this and then watches a
    // transfer stall needs to have been told either way. Which packing it uses
    // and how it differs from the thing it is named after is the detail.
    await expect(option(page).locator('small')).toBeHidden()

    await page.locator('#view-mode').click()

    await expect(option(page).locator('small')).toBeVisible()
    await expect(option(page).locator('small')).toContainText('QWBP')
  })

  test('is off until it is ticked, because v3 goes silent under load', async ({ page }) => {
    await page.goto('/?intro=off')

    // The default is the decision, not an oversight: libp2p-webrtc-qr#83.
    await expect(page.locator('#compact-payload')).not.toBeChecked()
  })

  test('changes the code this device hands out, and nothing about what it reads', async ({ page }) => {
    await page.goto('/?intro=off')
    await page.locator('#compact-payload').check()
    await page.locator('#invite').click()

    // `q3:` is the compact prefix. A v2 payload is base64 of a deflated JSON
    // object and never begins with it - so this asserts the format changed,
    // which is the only thing the box is allowed to do.
    await expect(page.locator('#invite-link')).toHaveValue(/#i=q3(%3A|:)/i, { timeout: 30_000 })
  })

  test('hands out the long code when it is not ticked', async ({ page }) => {
    // The control against the test above: without it, a link that never
    // contained `q3:` would pass for the wrong reason.
    await page.goto('/?intro=off')
    await page.locator('#invite').click()

    await expect(page.locator('#invite-link')).toHaveValue(/#i=/, { timeout: 30_000 })
    await expect(page.locator('#invite-link')).not.toHaveValue(/#i=q3(%3A|:)/i)
  })

  test('says it in German too', async ({ page }) => {
    await technical(page)
    await page.locator('#locale-de').click()

    await expect(option(page)).toContainText('Kurzcode')
    await expect(option(page).locator('small')).toContainText('signiert statt blank')
  })
})

test.describe('where the link lives', () => {
  test('the link is beside the code, not on the card behind it', async ({ page }) => {
    await page.goto('/?intro=off')

    // On the card it was an orphan: a field labelled "or send it as a link",
    // offering to send something that did not exist yet.
    await expect(page.locator('#invite-link')).toBeHidden()

    await page.locator('#invite').click()
    await expect.poll(() => page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

    const inside = await page.evaluate(() =>
      document.getElementById('invite-box').contains(document.getElementById('invite-link')))

    expect(inside).toBe(true)
  })

  test('the way back sits above the music, next to the action it belongs to', async ({ page }) => {
    await page.goto('/?intro=off')
    await page.locator('#invite').click()
    await expect.poll(() => page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

    // Taking a reply is part of this handover; the music is about something
    // else entirely, and it was standing between the two.
    const order = await page.evaluate(() => {
      const paste = document.getElementById('paste-fold')
      const music = document.querySelector('.music')
      return paste.compareDocumentPosition(music) & Node.DOCUMENT_POSITION_FOLLOWING ? 'paste first' : 'music first'
    })

    expect(order).toBe('paste first')
  })
})
