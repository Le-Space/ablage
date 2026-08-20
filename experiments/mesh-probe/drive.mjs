import { chromium } from '@playwright/test'

const APP = 'http://localhost:5190/'
const browser = await chromium.launch()
const a = await (await browser.newContext()).newPage()
const b = await (await browser.newContext()).newPage()

for (const [name, page] of [['A', a], ['B', b]]) {
  page.on('pageerror', e => console.log(`  ${name} pageerror: ${e.message}`))
  page.on('console', m => { if (/mesh|sync|Sync|Subscriber|graft/i.test(m.text())) console.log(`  ${name}: ${m.text().slice(0, 120)}`) })
}

await a.goto(APP); await b.goto(APP)
await a.waitForFunction(() => window.__probe != null)
await b.waitForFunction(() => window.__probe != null)
console.log('beide Seiten bereit')

// Die QR-Übergabe, programmatisch - hier geht es nicht um Kameras.
const offer = await a.evaluate(() => window.__probe.createOffer())
const answer = await b.evaluate(o => window.__probe.acceptOffer(o), offer)
await a.evaluate(ans => window.__probe.acceptAnswer(ans), answer)
console.log('verbunden:', await a.evaluate(() => window.__probe.connections()), 'Verbindung(en)')

await a.evaluate(() => window.__probe.startSync())
await b.evaluate(() => window.__probe.startSync())

// Beobachten statt einmal messen: ein Mesh braucht ein paar Sekunden.
for (const wait of [1000, 3000, 6000]) {
  await a.waitForTimeout(wait)
  const ma = await a.evaluate(() => window.__probe.mesh())
  console.log(`nach ${wait}ms  gossipsub-Peers: ${ma.gossipsubPeers.length}  Topic-Teilnehmer: ${ma.subscribers.length}  synced=${ma.synced}`)
  console.log(`            Streams: ${ma.streams.join(', ') || 'keine'}`)
}

console.log('A kennt laut Peer-Store:', JSON.stringify(await a.evaluate(() => window.__probe.known()), null, 1))

await a.evaluate(() => window.__probe.set('A1', 'hallo von A'))
let got = null
for (let i = 0; i < 20 && got == null; i++) {
  await b.waitForTimeout(500)
  got = await b.evaluate(() => window.__probe.get('A1'))
}
console.log('B sieht A1:', got ?? 'NICHTS')

await browser.close()
