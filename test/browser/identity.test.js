import { expect, test } from '@playwright/test'

/**
 * The same device, twice.
 *
 * Every start used to generate a fresh key pair. The peer id changed on every
 * reload, so the other device saw somebody it had never met and the admission
 * dialog asked again - pairing was something people redid rather than something
 * they had.
 *
 * Asserted through the interface rather than through the key store, because
 * what matters is that the *node* starts as who it was, not that a string
 * survived in `localStorage`.
 */

const mine = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#my-peer')).not.toBeEmpty({ timeout: 60_000 })

  return page.locator('#my-peer').getAttribute('title')
}

test('the peer id is the same after a reload', async ({ page }) => {
  const before = await mine(page)

  await page.reload()

  expect(await mine(page)).toBe(before)
})

test('and after several', async ({ page }) => {
  // Once could be a cache. This is the claim people actually rely on.
  const first = await mine(page)

  for (let i = 0; i < 3; i++) {
    await page.reload()
    expect(await mine(page)).toBe(first)
  }
})

test('a browser with nothing stored gets a working identity anyway', async ({ page }) => {
  // Private windows, blocked storage, a first visit. All of them have to start.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get () { throw new Error('blocked') }
    })
  })

  expect(await mine(page)).toMatch(/12D3Koo/)
})

test('and a different browser profile is a different device', async ({ browser }) => {
  // Two contexts are two origins' worth of storage, which is what two people -
  // or two of somebody's own devices - actually are.
  const one = await browser.newContext()
  const two = await browser.newContext()

  try {
    expect(await mine(await one.newPage())).not.toBe(await mine(await two.newPage()))
  } finally {
    await one.close()
    await two.close()
  }
})
