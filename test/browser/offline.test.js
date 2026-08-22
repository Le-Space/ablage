import { expect, test } from '@playwright/test'

import { PREVIEW_URL } from '../../playwright.config.js'

/**
 * The app itself, without a network.
 *
 * The data half needed nothing: the files are in OPFS or in the folder you
 * picked, and both are ordinary persistent storage. What was missing was the
 * shell - every load fetched the HTML and JS over HTTP, so a browser with no
 * connection had nothing to run and the local files were unreachable. A folder
 * that only opens when the internet is up is not a folder.
 *
 * Run against the **built** site, not the dev server. On the dev server the app
 * is dozens of unbundled modules fetched one at a time; offline, the first
 * reload fails on whichever of them had not been asked for yet. That is a fact
 * about the dev server, not about what gets published - and testing it would
 * report a failure the deployed app does not have, or hide one it does.
 */

const ready = async page => {
  await page.goto(`${PREVIEW_URL}/?intro=off`)
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 30_000 })
}

test.describe('with the network gone', () => {
  test('the app still opens', async ({ page, context }) => {
    await ready(page)
    await context.setOffline(true)

    await page.reload()

    // Asserted on something only the *script* can produce. `<h1>ablage</h1>` is
    // in the markup as its English default, and so is every other visible
    // string - so a page whose JavaScript never loaded looks identical to a
    // working one. The first version of this test asserted the heading and
    // passed while nothing ran at all.
    await expect(page.locator('#view-mode')).toHaveText('Technical')
    await expect(page.locator('#invite')).toBeEnabled()
    await expect(page.locator('.brand svg')).toBeVisible()
  })

  test('and the files that were already here are listed', async ({ page, context }) => {
    await ready(page)

    await page.setInputFiles('#pick', {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('written while online')
    })
    await expect(page.locator('.tree')).toContainText('notes.txt')

    await context.setOffline(true)
    await page.reload()

    // The point of the whole thing: a folder that opens and has the folder in
    // it. The bytes never needed a network - they are in the origin's storage -
    // but until now nothing could render them.
    await expect(page.locator('.tree')).toContainText('notes.txt', { timeout: 30_000 })
  })

  test('it says it is not connected, rather than pretending', async ({ page, context }) => {
    await ready(page)
    await context.setOffline(true)
    await page.reload()

    // Offline is not paired. The one thing this screen must not do is imply the
    // other device is reachable.
    await expect(page.locator('#link-state')).not.toHaveClass(/is-connected/)
  })
})

test.describe('installing it', () => {
  test('the manifest is served and describes this app', async ({ page }) => {
    await page.goto(`${PREVIEW_URL}/?intro=off`)

    const href = await page.locator('link[rel="manifest"]').getAttribute('href')

    // Relative, because on a gateway this page lives under `/ipfs/<cid>/` and
    // an absolute path asks the gateway for its own root.
    expect(href).toBe('./manifest.webmanifest')

    const manifest = await (await page.request.get(`${PREVIEW_URL}/manifest.webmanifest`)).json()

    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('.')
  })

  test('there is an icon a launcher can crop', async ({ page }) => {
    const manifest = await (await page.request.get(`${PREVIEW_URL}/manifest.webmanifest`)).json()
    const maskable = manifest.icons.find(icon => icon.purpose === 'maskable')

    // Android crops to its own shape and only the middle 80% survives. Without
    // one of these it crops the ordinary icon and cuts the mark in half.
    expect(maskable).toBeDefined()
    expect((await page.request.get(`${PREVIEW_URL}/${maskable.src.replace('./', '')}`)).status()).toBe(200)
  })
})
