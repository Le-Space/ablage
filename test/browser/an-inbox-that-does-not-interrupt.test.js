import { expect, test } from '@playwright/test'

/**
 * How a stranger's message is put on screen, and what it is not allowed to do.
 *
 * That it arrives at all is measured elsewhere, over a connection only a relay
 * carries — see `a-message-from-a-stranger.test.js`. What is left is the part
 * with a person in front of it, and two of the three things here are about
 * restraint rather than display: this card is the only thing in the app that
 * somebody you have never met can cause to appear.
 */
test.setTimeout(120_000)

const open = async page => {
  await page.goto('/?intro=off')
  await expect(page.locator('#invite')).toBeEnabled()
}

const arrive = (page, said) =>
  page.evaluate(m => window.__inboxForTest({ from: 'peer-aaaaaaaaaa', saidAt: null, arrivedAt: Date.now(), ...m }), said)

test('the card stays away until there is something in it', async ({ page }) => {
  await open(page)

  // An empty inbox is not an inbox with nothing in it - it is no inbox.
  await expect(page.locator('#inbox')).toBeHidden()

  await arrive(page, { name: 'Jo', text: 'could I have the March export?' })

  await expect(page.locator('#inbox')).toBeVisible()
  await expect(page.locator('#inbox-list li')).toHaveCount(1)
  await expect(page.locator('.inbox-text')).toHaveText('could I have the March export?')
  await expect(page.locator('.inbox-who')).toContainText('Jo')
})

test('somebody who gave no name reads as anonymous, not as broken', async ({ page }) => {
  await open(page)
  await arrive(page, { name: '', text: 'hello' })

  await expect(page.locator('.inbox-who')).toContainText('Someone')
  await expect(page.locator('.inbox-who')).not.toContainText('undefined')
})

test('the newest is on top', async ({ page }) => {
  await open(page)
  await arrive(page, { name: 'First', text: 'one' })
  await arrive(page, { name: 'Second', text: 'two' })

  await expect(page.locator('#inbox-list li')).toHaveCount(2)
  await expect(page.locator('#inbox-list li').first()).toContainText('two')
})

test('their text is text, whatever it looks like', async ({ page }) => {
  await open(page)

  // Written by somebody who has never met you and needed no permission to send
  // it. `innerHTML` anywhere on this path would make the inbox the way in.
  await arrive(page, { name: '<img src=x onerror="window.__owned = true">', text: '<script>window.__owned = true<\/script>' })

  await expect(page.locator('.inbox-text')).toHaveText('<script>window.__owned = true<\/script>')
  expect(await page.evaluate(() => window.__owned)).toBeUndefined()
  expect(await page.locator('#inbox-list').evaluate(el => el.querySelectorAll('img, script').length)).toBe(0)
})

test('a message does not take the screen', async ({ page }) => {
  await open(page)
  await arrive(page, { name: 'Jo', text: 'are you there?' })

  // Not a dialog, and that is the design: every other interruption in this app
  // comes from a device already let in and needs an answer before anything else
  // makes sense. This one comes from anyone who can reach us.
  expect(await page.locator('#inbox').evaluate(el => el.tagName)).toBe('SECTION')
  expect(await page.evaluate(() => document.querySelector('dialog[open]') != null)).toBe(false)

  // And whatever the person was doing, they are still doing it.
  await page.locator('#invite').focus()
  await arrive(page, { name: 'Jo', text: 'still there?' })
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('invite')
})

test('a message is still there after a reload', async ({ page }) => {
  // #84 drew it and forgot it - for "somebody left you something while you
  // were not looking", that was most of the feature missing. The hook goes
  // through `takeIn`, the same path the sync stream uses, so this is the real
  // thing being kept and not a drawing.
  await open(page)
  await arrive(page, { name: 'Jo', text: 'still here tomorrow?' })

  await page.reload()
  await expect(page.locator('#invite')).toBeEnabled()

  await expect(page.locator('#inbox')).toBeVisible()
  await expect(page.locator('#inbox-list li')).toHaveCount(1)
  await expect(page.locator('.inbox-text')).toHaveText('still here tomorrow?')
  await expect(page.locator('.inbox-who')).toContainText('Jo')
})

test('and reloading twice does not turn one message into two', async ({ page }) => {
  // Restoring draws; it must not *add*. A restore that went through `takeIn`
  // would keep the message again on every load, and the list would grow by
  // itself.
  await open(page)
  await arrive(page, { name: 'Jo', text: 'once' })

  for (let i = 0; i < 2; i++) {
    await page.reload()
    await expect(page.locator('#invite')).toBeEnabled()
  }

  await expect(page.locator('#inbox-list li')).toHaveCount(1)
})

test('newest stays on top across a reload', async ({ page }) => {
  await open(page)
  await arrive(page, { name: 'First', text: 'one' })
  await arrive(page, { name: 'Second', text: 'two' })

  await page.reload()
  await expect(page.locator('#invite')).toBeEnabled()

  await expect(page.locator('#inbox-list li').first()).toContainText('two')
  await expect(page.locator('#inbox-list li').last()).toContainText('one')
})

test('clearing empties the inbox, and it stays empty after a reload', async ({ page }) => {
  // Emptied on disk before on screen - the same order `takeIn` keeps in - so a
  // reload does not bring back what the person already dismissed.
  await open(page)
  await arrive(page, { name: 'Jo', text: 'one' })
  await arrive(page, { name: 'Jo', text: 'two' })
  await expect(page.locator('#inbox-list li')).toHaveCount(2)

  await page.locator('#inbox-clear').click()

  await expect(page.locator('#inbox')).toBeHidden()
  await expect(page.locator('#inbox-list li')).toHaveCount(0)

  await page.reload()
  await expect(page.locator('#invite')).toBeEnabled()

  await expect(page.locator('#inbox')).toBeHidden()
  await expect(page.locator('#inbox-list li')).toHaveCount(0)
})

test('and a message arriving after a clear shows up as the only one', async ({ page }) => {
  await open(page)
  await arrive(page, { name: 'Jo', text: 'before' })
  await page.locator('#inbox-clear').click()
  await arrive(page, { name: 'Jo', text: 'after' })

  await expect(page.locator('#inbox')).toBeVisible()
  await expect(page.locator('#inbox-list li')).toHaveCount(1)
  await expect(page.locator('.inbox-text')).toHaveText('after')
})
