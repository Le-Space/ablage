import { chromium } from '@playwright/test'
const APP = 'http://localhost:5190/'
const browser = await chromium.launch()
const a = await (await browser.newContext()).newPage()
const b = await (await browser.newContext()).newPage()
await a.goto(APP); await b.goto(APP)
await a.waitForFunction(() => window.__probe != null)
await b.waitForFunction(() => window.__probe != null)

const offer = await a.evaluate(() => window.__probe.createOffer())
const answer = await b.evaluate(o => window.__probe.acceptOffer(o), offer)
await a.evaluate(ans => window.__probe.acceptAnswer(ans), answer)
console.log('Verbindungen:', await a.evaluate(() => window.__probe.connections()))

// Beide abonnieren, bevor irgendjemand sendet.
console.log('A Topics:', await a.evaluate(() => window.__probe.rawSubscribe()))
console.log('B Topics:', await b.evaluate(() => window.__probe.rawSubscribe()))

for (const wait of [1000, 3000, 5000]) {
  await a.waitForTimeout(wait)
  const m = await a.evaluate(() => window.__probe.mesh('raw/probe'))
  console.log(`nach ${wait}ms  gossipsub-Peers ${m.gossipsubPeers.length}  Topic-Teilnehmer ${m.subscribers.length}`)
}

console.log('A sendet:', JSON.stringify(await a.evaluate(() => window.__probe.rawPublish('raw/probe', 'hallo von A'))))
for (let i = 0; i < 10; i++) {
  await b.waitForTimeout(500)
  const got = await b.evaluate(() => window.__probe.rawReceived())
  if (got) { console.log('B empfing:', got); break }
  if (i === 9) console.log('B empfing: NICHTS')
}
await browser.close()
