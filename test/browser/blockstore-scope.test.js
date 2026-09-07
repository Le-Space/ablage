import { expect, test } from '@playwright/test'

/**
 * Can a peer admitted for one share reach blocks belonging to another?
 *
 * #70 left this open and #43 worried about it: the blockstore is one store
 * while admission is per share, so being let into a public inbox might mean
 * being able to fetch anything the same device holds. The inbox widget makes it
 * pressing, because a public inbox admits strangers by design.
 *
 * **Three facts from the code say the worry does not apply, and this measures
 * the one they rest on.** `createHeliaLight()` is given no blockstore and
 * Helia's default is `new MemoryBlockstore()`; each share runs as its own peer
 * with its own key; and choosing another share calls `location.reload()`. So
 * another share's blocks are not guarded against this one - they were never in
 * this process to begin with.
 *
 * The load-bearing half is that the store does not outlive the page. These
 * bytes go into the blockstore and never into storage, which is exactly what a
 * lingering block from another share would look like. If they were still served
 * after a reload, the reasoning collapses and #70's worry is real.
 */
test.describe.configure({ retries: 0 })

const open = async (context, name) => {
  const page = await context.newPage()

  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n), name)

  return page
}

const connect = async (a, b) => {
  const offer = await a.evaluate(() => window.__ablage.createOffer())
  const answer = await b.evaluate(o => window.__ablage.acceptOffer(o), offer)

  await a.evaluate(ans => window.__ablage.acceptAnswer(ans), answer)
}

test('bytes held only in the blockstore stop being served once the page reloads', async ({ browser }) => {
  test.setTimeout(180_000)

  const holder = await browser.newContext()
  const reader = await browser.newContext()

  try {
    const a = await open(holder, 'scope-a')
    const b = await open(reader, 'scope-b')

    // **Two blocks, and the second is never fetched before the reload.** The
    // first attempt used one for both halves and passed the wrong way round:
    // the reader had cached it, so the fetch after the reload was answered out
    // of its own store rather than by the holder.
    const shown = await a.evaluate(() => window.__ablage.hold('fetched before the reload'))
    const unseen = await a.evaluate(() => window.__ablage.hold('never asked for until after'))

    await connect(a, b)

    // While that page is up the bytes are served. Without this the second half
    // would pass for the wrong reason - a peer that could never fetch anything.
    expect(await b.evaluate(c => window.__ablage.fetch(c), shown)).toBe('fetched before the reload')

    // A share switch is a reload, so this is what one looks like from the far
    // side: same device, same storage, a new node and an empty store.
    await a.reload()
    await a.waitForFunction(() => window.__ablage != null)
    await a.evaluate(() => window.__ablage.start('scope-a'))

    await connect(a, b)

    expect(await b.evaluate(c => window.__ablage.fetch(c, 10000), unseen)).toBe(null)
  } finally {
    await holder.close()
    await reader.close()
  }
})
