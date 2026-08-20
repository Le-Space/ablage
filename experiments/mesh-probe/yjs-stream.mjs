import { chromium } from '@playwright/test'
const APP = 'http://localhost:5190/'
const browser = await chromium.launch()
const a = await (await browser.newContext()).newPage()
const b = await (await browser.newContext()).newPage()
for (const [n, p] of [['A', a], ['B', b]]) p.on('pageerror', e => console.log(`${n} pageerror: ${e.message}`))
await a.goto(APP); await b.goto(APP)
await a.waitForFunction(() => window.__probe != null)
await b.waitForFunction(() => window.__probe != null)

const bId = await b.evaluate(() => window.__probe.peerId())
const offer = await a.evaluate(() => window.__probe.createOffer())
const answer = await b.evaluate(o => window.__probe.acceptOffer(o), offer)
await a.evaluate(ans => window.__probe.acceptAnswer(ans), answer)
console.log('Verbindungen:', await a.evaluate(() => window.__probe.connections()))

// B hört, A wählt.
await b.evaluate(() => window.__probe.startStreamSync(null))
console.log('A:', await a.evaluate(id => window.__probe.startStreamSync(id), bId))
await a.waitForTimeout(1500)

// Richtung 1: A schreibt, B liest.
await a.evaluate(() => window.__probe.set('A1', 'hallo von A'))
let got = null
for (let i = 0; i < 16 && got == null; i++) {
  await b.waitForTimeout(400)
  got = await b.evaluate(() => window.__probe.get('A1'))
}
console.log('B sieht A1:', got ?? 'NICHTS')

// Richtung 2: B schreibt, A liest.
await b.evaluate(() => window.__probe.set('B2', 'und zurück von B'))
let back = null
for (let i = 0; i < 16 && back == null; i++) {
  await a.waitForTimeout(400)
  back = await a.evaluate(() => window.__probe.get('B2'))
}
console.log('A sieht B2:', back ?? 'NICHTS')

// Und ein spät verbundener Zustand: A schreibt noch etwas nach.
await a.evaluate(() => window.__probe.set('A3', 'nachtraeglich'))
let late = null
for (let i = 0; i < 16 && late == null; i++) {
  await b.waitForTimeout(400)
  late = await b.evaluate(() => window.__probe.get('A3'))
}
console.log('B sieht A3:', late ?? 'NICHTS')

await browser.close()
