import { chromium, expect, test } from '@playwright/test'

/**
 * The four answers to "they switched folders", driven through both interfaces.
 *
 * This is the first spec to reach any of §2 or §3, and what unlocked it is that
 * `showDirectoryPicker` can be stood in for: a picked directory and the origin's
 * private one are both a `FileSystemDirectoryHandle`, which is what let the
 * picker be added without touching the reconciler and is what lets a stand-in
 * be handed back here. The native dialog is the only part skipped; everything
 * after it is the code that runs for real.
 */

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const standInPicker = `
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory()
    return root.getDirectoryHandle('picked-' + (window.__pickCount = (window.__pickCount ?? 0) + 1), { create: true })
  }
`

const side = async browser => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []

  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(standInPicker)
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled()

  return { page, context, errors }
}

/** Paired by text, because no automation can drive a camera. */
const pair = async (alice, bob) => {
  await alice.page.locator('#invite').click()
  await expect.poll(() => alice.page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

  const invite = await alice.page.locator('#invite-link').inputValue()

  await bob.page.goto(invite.replace(/#/, '?intro=off#'))
  await expect.poll(() => bob.page.evaluate(() => document.getElementById('invite-box').open), { timeout: 60_000 }).toBe(true)

  const reply = await bob.page.locator('#invite-link').inputValue()

  await alice.page.locator('#paste-fold summary').click()
  await alice.page.locator('#reply-text').fill(reply)
  await alice.page.locator('#use-reply').click()

  await expect(alice.page.locator('#link-state')).toHaveClass(/is-connected/, { timeout: 60_000 })
}

/** Alice puts a file in, then moves to a different folder and sends it on. */
const switchAndSend = async alice => {
  await alice.page.setInputFiles('#pick', {
    name: 'brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('aus dem neuen Ordner')
  })
  await expect(alice.page.locator('.tree')).toContainText('brief.txt')

  await alice.page.locator('#pick-folder').click()

  // Switching while connected asks first - §2 - and this is the yes.
  await expect.poll(() => alice.page.evaluate(() => document.getElementById('share-ask').open), { timeout: 30_000 }).toBe(true)
  await alice.page.locator('#share-yes').click()
}

const told = bob =>
  expect.poll(() => bob.page.evaluate(() => document.getElementById('switch-told').open), { timeout: 60_000 }).toBe(true)

test('the other side is offered four answers, not two', async () => {
  const browser = await chromium.launch()
  const alice = await side(browser)
  const bob = await side(browser)

  try {
    await pair(alice, bob)
    await switchAndSend(alice)
    await told(bob)

    // Four, because "they switched folders" has four reasonable answers and
    // choosing one would be wrong three times out of four.
    for (const id of ['switch-follow', 'switch-select', 'switch-once', 'switch-keep']) {
      await expect(bob.page.locator(`#${id}`)).toBeVisible()
    }
  } finally {
    await alice.context.close()
    await bob.context.close()
    await browser.close()
  }
})

test('"use a folder I already have" puts their files in the folder I picked', async () => {
  const browser = await chromium.launch()
  const alice = await side(browser)
  const bob = await side(browser)

  try {
    await pair(alice, bob)
    await switchAndSend(alice)
    await told(bob)

    await bob.page.locator('#switch-select').click()

    // Their name is a name, not a place: the files arrive in the folder this
    // person chose, and the interface says which one that is.
    await expect(bob.page.locator('.tree')).toContainText('brief.txt', { timeout: 60_000 })
    await expect(bob.page.locator('#folder')).toHaveAttribute('data-place', 'disk')

    expect(bob.errors).toEqual([])
  } finally {
    await alice.context.close()
    await bob.context.close()
    await browser.close()
  }
})

test('"take the contents once" copies them and then stops', async () => {
  const browser = await chromium.launch()
  const alice = await side(browser)
  const bob = await side(browser)

  try {
    await pair(alice, bob)
    await switchAndSend(alice)
    await told(bob)

    await bob.page.locator('#switch-once').click()

    await expect(bob.page.locator('.tree')).toContainText('brief.txt', { timeout: 60_000 })

    // And then nothing more. A file Alice adds afterwards must not appear -
    // that is the whole difference between this answer and "follow it here".
    await expect(bob.page.locator('#link-state')).toContainText(/no longer kept in step|nicht mehr mit/i, { timeout: 30_000 })

    await alice.page.setInputFiles('#pick', {
      name: 'danach.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('kommt zu spät')
    })
    await expect(alice.page.locator('.tree')).toContainText('danach.txt')

    await bob.page.waitForTimeout(6000)
    await expect(bob.page.locator('.tree')).not.toContainText('danach.txt')
  } finally {
    await alice.context.close()
    await bob.context.close()
    await browser.close()
  }
})
