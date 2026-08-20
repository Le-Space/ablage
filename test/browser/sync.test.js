import { chromium, expect, test } from '@playwright/test'

/**
 * Two devices, one QR handshake, a file on one side and its bytes on the other.
 *
 * The last test in the plan's order, and the one somebody without a plan would
 * have written first because it looks like the cheap one. Everything it needs -
 * the index, the reconciler, the provider, storage - is already covered on its
 * own terms, so when this fails it fails about the *joining*, which is the only
 * thing left for it to be about.
 *
 * Separate browser contexts rather than two pages: two devices do not share an
 * origin's storage, and sharing one would quietly make the test pass for the
 * wrong reason.
 */

test.describe.configure({ mode: 'serial' })

const startSide = async (browser, name) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []

  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n), name)

  return { page, context, errors }
}

/** Poll: a reconciliation is several awaits and a bitswap fetch. */
const eventually = async (page, path, timeout = 20000) => {
  const until = Date.now() + timeout

  while (Date.now() < until) {
    const text = await page.evaluate(p => window.__ablage.read(p), path)
    if (text != null) return text
    await page.waitForTimeout(250)
  }

  return null
}

const gone = async (page, path, timeout = 20000) => {
  const until = Date.now() + timeout

  while (Date.now() < until) {
    const text = await page.evaluate(p => window.__ablage.read(p), path)
    if (text == null) return true
    await page.waitForTimeout(250)
  }

  return false
}

test('a file added on one device arrives on the other', async ({ browser }) => {
  test.setTimeout(120000)

  const a = await startSide(browser, 'sync-a')
  const b = await startSide(browser, 'sync-b')

  try {
    // The handshake, programmatically. Cameras are libp2p-webrtc-qr's problem.
    const offer = await a.page.evaluate(() => window.__ablage.createOffer())
    const answer = await b.page.evaluate(o => window.__ablage.acceptOffer(o), offer)
    await a.page.evaluate(ans => window.__ablage.acceptAnswer(ans), answer)

    expect(await a.page.evaluate(() => window.__ablage.connections())).toBe(1)

    // Before anything is written: B has nothing. Without this the assertion
    // below could pass because the two sides shared storage rather than because
    // the bytes crossed.
    expect(await b.page.evaluate(() => window.__ablage.list())).toEqual([])

    await a.page.evaluate(() => window.__ablage.write('notes.txt', 'hallo von A'))

    // The whole claim of the project, in one assertion: the bytes crossed
    // without a server holding them.
    expect(await eventually(b.page, 'notes.txt')).toBe('hallo von A')
    expect(await b.page.evaluate(() => window.__ablage.list())).toEqual(['notes.txt'])

    expect(a.errors).toEqual([])
    expect(b.errors).toEqual([])
  } finally {
    await a.context.close()
    await b.context.close()
  }
})

test('an edit on one side updates the other, without a conflict', async ({ browser }) => {
  test.setTimeout(120000)

  const a = await startSide(browser, 'edit-a')
  const b = await startSide(browser, 'edit-b')

  try {
    const offer = await a.page.evaluate(() => window.__ablage.createOffer())
    const answer = await b.page.evaluate(o => window.__ablage.acceptOffer(o), offer)
    await a.page.evaluate(ans => window.__ablage.acceptAnswer(ans), answer)

    await a.page.evaluate(() => window.__ablage.write('draft.txt', 'erste fassung'))
    expect(await eventually(b.page, 'draft.txt')).toBe('erste fassung')

    // Now A edits it. Both sides have agreed once, so this is an update and
    // not two versions - which is the whole point of remembering the baseline.
    await a.page.evaluate(() => window.__ablage.write('draft.txt', 'zweite fassung'))

    const until = Date.now() + 20000
    let text = null
    while (Date.now() < until && text !== 'zweite fassung') {
      text = await b.page.evaluate(() => window.__ablage.read('draft.txt'))
      await b.page.waitForTimeout(250)
    }

    expect(text).toBe('zweite fassung')
    // One file, not a rescued copy beside it.
    expect(await b.page.evaluate(() => window.__ablage.list())).toEqual(['draft.txt'])
  } finally {
    await a.context.close()
    await b.context.close()
  }
})

test('it works the other way too, and a deletion crosses', async ({ browser }) => {
  test.setTimeout(120000)

  const a = await startSide(browser, 'sync-back-a')
  const b = await startSide(browser, 'sync-back-b')

  try {
    const offer = await a.page.evaluate(() => window.__ablage.createOffer())
    const answer = await b.page.evaluate(o => window.__ablage.acceptOffer(o), offer)
    await a.page.evaluate(ans => window.__ablage.acceptAnswer(ans), answer)

    // B writes this time: whoever answered the handshake is not a lesser peer.
    await b.page.evaluate(() => window.__ablage.write('from-b.txt', 'und zurück'))
    expect(await eventually(a.page, 'from-b.txt')).toBe('und zurück')

    // And removing it on A takes it off B - the tombstone doing its work over a
    // real connection rather than in a unit test.
    await a.page.evaluate(() => window.__ablage.remove('from-b.txt'))

    expect(await gone(b.page, 'from-b.txt')).toBe(true)
    expect(await b.page.evaluate(() => window.__ablage.list())).toEqual([])
  } finally {
    await a.context.close()
    await b.context.close()
  }
})
