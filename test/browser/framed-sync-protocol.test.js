import { chromium, expect, test } from '@playwright/test'

/**
 * A message survives being split, and says so by its protocol.
 *
 * The sync stream had no framing: the reader parsed whatever chunk arrived and
 * assumed a message was always delivered in one piece. That holds while
 * messages are small and stops holding without warning - a 4 MiB message
 * arrived as 11 chunks, 9 of them unparsable, each discarded in silence.
 *
 * This is #74's **first** step and only that. `/ablage/sync/1.1.0` carries a
 * length prefix; 1.0.0 is still offered and still understood, so a device on
 * the older version keeps working and nobody has to update two phones on the
 * same afternoon. The send path is untouched.
 *
 * **Which turned out to be enough for far more than expected.** Measured on
 * `main` beforehand: 256 KiB crossed and 512 KiB did not. With framing alone,
 * and no change to how anything is written, 16 MiB crosses. So that ceiling was
 * never the sender - it was the reader, unable to put a split message back
 * together.
 */
test.describe.configure({ retries: 0 })

const start = async (browser, name) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/harness.html')
  await page.waitForFunction(() => window.__ablage != null)
  await page.evaluate(n => window.__ablage.start(n, { overRelay: true }), name)

  return { page, context, id: await page.evaluate(() => window.__ablage.peerId()) }
}

const arrives = (page, kb) =>
  page.evaluate(async size => {
    const until = Date.now() + 30_000

    while (Date.now() < until) {
      if (window.__ablage.appMessages().some(m => m.message.type === 'probe' && m.message.kb === size)) return true
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    return false
  }, kb)

test('two devices agree on the framed protocol, and a large message survives', async () => {
  test.setTimeout(300_000)

  const browser = await chromium.launch()
  const a = await start(browser, 'framed-a')
  const b = await start(browser, 'framed-b')

  try {
    await expect
      .poll(() => a.page.evaluate(id => window.__ablage.heard().includes(id), b.id), { timeout: 120_000 })
      .toBe(true)

    expect(await a.page.evaluate(id => window.__ablage.call(id), b.id)).toMatchObject({ ok: true })

    // Newest-first, so two devices that both have it use it.
    expect(await a.page.evaluate(id => window.__ablage.spokenWith(id), b.id)).toBe('/ablage/sync/1.1.0')

    // Four megabytes over a relay-only connection. Sixteen times what the same
    // pair could carry before, with nothing changed about how it is sent.
    const sent = await a.page.evaluate(
      id => window.__ablage.sendApp(id, { type: 'probe', kb: 4096, payload: 'x'.repeat(4096 * 1024) }),
      b.id
    )

    expect(sent, JSON.stringify(sent)).toMatchObject({ ok: true })
    expect(await arrives(b.page, 4096)).toBe(true)

    /**
     * And past our own ceiling it **says so**.
     *
     * `MAX_MESSAGE_BYTES` in `framing.js` is 32 MiB, and a payload over it is
     * refused by the sender with an error the caller can see. That is the
     * point: the failure this whole issue is about was silent, and a limit
     * nobody is told about is the same bug with a different number.
     */
    const refused = await a.page.evaluate(
      id => window.__ablage.sendApp(id, { type: 'probe', kb: 32768, payload: 'x'.repeat(32768 * 1024) }),
      b.id
    )

    expect(refused.ok, JSON.stringify(refused)).toBe(false)
    expect(refused.error).toMatch(/too long/i)
  } finally {
    await a.context.close()
    await b.context.close()
    await browser.close()
  }
})
