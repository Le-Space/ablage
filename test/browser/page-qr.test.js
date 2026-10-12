import { expect, test } from '@playwright/test'

/**
 * This page as a code, from the header.
 *
 * What is worth a browser for: that the drawing happens at all (it is a library
 * writing SVG into the page), that the address beside it is the one in the
 * address bar, and that a pairing in the fragment does not end up in a code
 * anybody could scan. The address arithmetic itself is in `test/page-qr.test.js`,
 * where it costs nothing.
 */

const open = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#page-qr-button')).toBeVisible({ timeout: 60_000 })
}

test('the header offers it, and it draws this page', async ({ page }) => {
  await open(page)

  const box = page.locator('#page-qr-box')

  await expect(box).toBeHidden()

  await page.locator('#page-qr-button').click()

  await expect(box).toBeVisible()
  await expect(box.locator('svg')).toBeVisible()
  await expect(page.locator('#page-qr-url')).toHaveText(page.url())

  // The plaque is white in both themes, because a camera reads it.
  await expect(page.locator('#page-qr-code')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
})

test('and it goes away with Escape, and with a press elsewhere', async ({ page }) => {
  await open(page)

  const box = page.locator('#page-qr-box')

  await page.locator('#page-qr-button').click()
  await expect(box).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(box).toBeHidden()

  await page.locator('#page-qr-button').click()
  await expect(box).toBeVisible()

  await page.locator('h1').click()
  await expect(box).toBeHidden()
})

test('an invite in the fragment is not drawn into it', async ({ page }) => {
  // The code on this screen is for opening the app over there. The invite is
  // for one device, once - and a code that carries it is one somebody else
  // could answer.
  await page.goto('/?intro=off#i=not-a-real-offer')
  await expect(page.locator('#page-qr-button')).toBeVisible({ timeout: 60_000 })

  await page.locator('#page-qr-button').click()

  const address = await page.locator('#page-qr-url').innerText()

  expect(address).not.toContain('i=')
  expect(address).toContain('intro=off')
})
