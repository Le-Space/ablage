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

console.log('session.dialProtocol :', await a.evaluate(id => window.__probe.streamViaSession(id), bId))
await a.waitForTimeout(1500)
console.log('  B hörte            :', await b.evaluate(() => window.__probe.heard()) ?? 'NICHTS')

console.log('node.dialProtocol    :', await a.evaluate(id => window.__probe.streamViaNode(id), bId))
await a.waitForTimeout(1000)

// Welche Protokolle laufen jetzt tatsaechlich ueber die Verbindung?
const m = await a.evaluate(() => window.__probe.mesh('raw/probe'))
console.log('Streams auf der Verbindung:', m.streams.join(', ') || 'keine')

// Und jetzt Pubsub, nachdem ein Stream nachweislich moeglich war.
await a.evaluate(() => window.__probe.rawSubscribe())
await b.evaluate(() => window.__probe.rawSubscribe())
for (const wait of [1000, 3000]) {
  await a.waitForTimeout(wait)
  const mm = await a.evaluate(() => window.__probe.mesh('raw/probe'))
  console.log(`  nach ${wait}ms: gossipsub-Peers ${mm.gossipsubPeers.length}, Topic-Teilnehmer ${mm.subscribers.length}, Streams: ${mm.streams.join(', ') || 'keine'}`)
}
await browser.close()
