import { expect, test } from '@playwright/test'

/**
 * Keeping a folder, and noticing a change made outside the app.
 *
 * **What is not here, and why:** the picker itself. `showDirectoryPicker()`
 * opens a native dialog, and no browser automation can drive it - unlike
 * `<input type=file>`, which Playwright can fill. So the picking is verified by
 * hand and everything around it is verified here.
 *
 * That gap is smaller than it sounds. A picked directory and the origin's
 * private one are both `FileSystemDirectoryHandle`, so every storage test
 * already covers the picked folder for everything except the moment of
 * choosing.
 */

const open = async page => {
  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
}

test.describe('keeping a folder', () => {
  test('a handle survives being stored and read back', async ({ page }) => {
    await open(page)

    // The part that decides whether the feature is usable at all: a folder that
    // had to be re-picked on every launch would sink it.
    const result = await page.evaluate(async () => {
      const h = await window.__ablage.handles()
      return h.roundTrip()
    })

    expect(result.name).toBe('watched')
  })

  test('nothing stored reads as nothing, not as an error', async ({ page }) => {
    await open(page)

    const result = await page.evaluate(async () => {
      const h = await window.__ablage.handles()
      return h.survivesNothingStored()
    })

    expect(result).toBeNull()
  })

  test('the picker is offered only where it exists', async ({ page, browserName }) => {
    await open(page)

    const canPick = await page.evaluate(async () => (await window.__ablage.handles()).canPick)

    // Chromium has it, Firefox and WebKit do not - which is the whole reason
    // the private folder is the foundation and this is a bridge on top.
    expect(canPick).toBe(browserName === 'chromium')
  })
})

test.describe('noticing a change from outside', () => {
  test('a file written behind the app is reported', async ({ page }) => {
    await open(page)

    const seen = await page.evaluate(async () => {
      const w = await window.__ablage.watch()

      await new Promise(r => setTimeout(r, 300))     // let the first listing settle
      await w.write('outside.txt', 'nicht durch die app')
      await new Promise(r => setTimeout(r, 600))

      w.stop()
      return w.seen()
    })

    // There are no change events on a directory handle - none, in any engine -
    // so this is polling. A sync client that pretended otherwise would quietly
    // miss every edit made in a text editor.
    expect(seen).toContain('outside.txt')
  })

  test('a file removed behind the app is reported too', async ({ page }) => {
    await open(page)

    const seen = await page.evaluate(async () => {
      const w = await window.__ablage.watch()

      await w.write('vanishes.txt', 'gleich weg')
      await new Promise(r => setTimeout(r, 400))
      await w.remove('vanishes.txt')
      await new Promise(r => setTimeout(r, 600))

      w.stop()
      return w.seen()
    })

    expect(seen).toContain('vanishes.txt')
  })
})
