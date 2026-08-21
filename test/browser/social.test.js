import { expect, test } from '@playwright/test'

const CANONICAL = 'https://ablage.le-space.de/'

/**
 * What a link to this page looks like when somebody pastes it somewhere.
 *
 * Worth a test because it is invisible in normal use: a missing card, or one
 * pointing at a host that does not serve the image, looks identical to a
 * working one from inside the app. It is only ever seen by other people.
 */

const meta = (page, selector) => page.locator(selector).getAttribute('content')

test.describe('the social card', () => {
  test('declares where this page really lives', async ({ page }) => {
    await page.goto('/?intro=off')

    // Served from an IPFS gateway too, under a hash that changes every deploy.
    // The canonical says which address is the one to remember.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', CANONICAL)
  })

  test('image urls are absolute, because a crawler resolves them from elsewhere', async ({ page }) => {
    await page.goto('/?intro=off')

    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      expect(await meta(page, selector)).toMatch(/^https:\/\//)
    }
  })

  test('the card names the thing that makes this worth opening', async ({ page }) => {
    await page.goto('/?intro=off')

    // Somebody deciding whether to tap a link wants the claim, not the category.
    expect(await meta(page, 'meta[property="og:description"]')).toContain('End-to-end encrypted')
  })

  test('the image is actually served, at the size the card promises', async ({ page }) => {
    // A card that points at a 404 is worse than none: the link renders as a
    // blank rectangle rather than as plain text.
    const response = await page.request.get('/og-image.png')

    expect(response.status()).toBe(200)
    expect(Number(response.headers()['content-length'])).toBeGreaterThan(10000)
  })

  test('the icons a home screen asks for are there too', async ({ page }) => {
    for (const path of ['/icon-192.png', '/apple-touch-icon.png']) {
      expect((await page.request.get(path)).status(), path).toBe(200)
    }
  })
})
