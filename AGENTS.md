# Notes for agents — ablage

Files, carried between devices that met by scanning a code. `README.md` says
what it is; this file is what is expensive to learn twice.

## Issues and pull requests are written in English

Always, whatever language the conversation that produced them was in. The code,
the comments and this file are English; a description in another language splits
the record of *why* something was done from the thing itself, and the split
falls on whoever reads it next.

This is about what gets written into the repository and into GitHub. Talk to
whoever you are working with in whatever language suits them.

## One commit, one version

`.githooks/pre-commit` bumps the patch version and stages `package.json` and
`package-lock.json` with the commit. `npm install` points git at that directory
through the `prepare` script, so a fresh clone gets it without being told.

Patch only, and never during a rebase, merge, cherry-pick or `--amend` - those
replay commits that already counted. `npm version minor|major` is still how a
person makes that decision.

The reason is not bookkeeping. This app deploys to IPFS on every push to `main`,
and a fix has more than once been tested against a build that did not contain
it. A version that moves with every commit is what makes *is this the one with
the fix in it?* answerable.

## Connecting: relay-optional by construction

Measured on 2026-08-21, written down because the wrong version of it was in the
code for months. Tracking issue:
[relay-button#119](https://github.com/NiKrause/relay-button/issues/119).

### The promise

The node stays fully functional **without** a relay. That is a guarantee, not a
default: the checkbox is off, a start without it makes no outbound network call
at all, and no relay is contacted without an explicit choice. Someone using the
app in one room leaves metadata nowhere.

A relay is a second way in, for the case the QR path cannot serve: the other
person is not here to scan anything. It is added, never substituted.

### A relay has to be asked for, and then checked

Ticking the box starts the check immediately, so the answer is measured rather
than assumed. Order matters and is not only about speed:

1. the **baked-in** addresses, probed by ping
2. **only if none answer**, Aleph discovery

That way the app talks to Aleph exactly when the known relays are silent, which
is what keeps the metadata footprint small.

### Where the promise lives in the code

`src/relay-policy.js` — `denyDial(address, relayOptIn)` and
`relayBootstrapList(addresses, relayOptIn)`, free of libp2p and covered by
`test/relay-policy.test.js`. A promise that can only be checked by starting a
node is one nobody checks, so it is checkable on its own.

`createPeer({ relayOptIn, relayBootstrapAddrs })` reads them. Two things follow
that are easy to get wrong: the transports (`circuitRelayTransport`,
`webSockets`) are present **unconditionally**, because they dial nothing on
their own and removing them would mean a different node once somebody ticks the
box — and the `addresses` block appears **only** with a relay, because inventing
one during the transport experiment produced a connection the upgrader could not
finish.

The tests pass a relay address in deliberately. One that left it out would pass
for the wrong reason, and would keep passing with the gate deleted.

### A circuit carries data. What stops a protocol is a flag, not the transport

**This is the single fact that cost the most time in this repository. Read it
before concluding that anything "does not work over a relay".**

A circuit relay forwards bytes between two peers and stores nothing — no cache,
no copy, pure relaying. Data crosses it. Measured here, over a circuit that was
the only path two browsers had:

| payload | |
| --- | --- |
| 1 MiB | 46 ms |
| 4 MiB | 179 ms |
| **16 MiB** | **585 ms** |

The relay's own budget is 10 GiB and twenty minutes per circuit, so metering is
not the limit either.

**What decides whether a protocol crosses is `runOnLimitedConnection`.** libp2p
marks a relayed connection *limited* and refuses to open a protocol stream on
one unless the protocol says it may — and **both sides have to say it**, on
`node.handle` and on `dialProtocol`. Either alone is still a refusal.

| | crosses a circuit |
| --- | --- |
| `/ablage/sync/1.0.0` — sets it on both sides | **yes** |
| gossipsub — `runOnLimitedConnection: true` | **yes** |
| bitswap unpatched — sets it on `handle`, drops it on the dial, and never asks to hear about limited peers (ipfs/helia#1124) | no |
| bitswap with `patches/@helia+bitswap+*.patch`, option on | **yes** |

So "files do not cross a relay" is the wrong sentence. The right one is
"bitswap declines to run on a limited connection", and that is a property of one
library, not of the network — and of two lines in it:

- `network.js` registers a topology without `notifyOnLimitedConnection`, so
  libp2p's registrar (`registrar.js:219`) never tells bitswap a relayed peer
  exists, and no wantlist is ever sent to it
- `sendMessage()` calls `dialProtocol(peerId, BITSWAP_120, options)` without
  merging `runOnLimitedConnections` in, so libp2p's own check
  (`connection.js:81`) refuses the stream

**Setting the documented option changes nothing on its own.** Measured with
`overCircuits: true` on a circuit-only pair: `{ limited: true, got: null,
error: 'timed out' }`. Somebody who sets it and sees that will suspect their own
setup; it is the library. Checked across every published version from 0.0.0 to
4.0.14: the option has existed in all of them and been wired to neither site in
any. It was never a regression — it was never finished.

**`patches/` fixes both, and only for a node that asked.** With the patch and
the option on, a block crosses a circuit-only connection in eleven seconds
(`bitswap-gate:256`). With the patch and the option *off* — the default —
nothing crosses (`bitswap-gate:116`). The default is the app's claim, and it is
unchanged; `content.js` takes `overCircuits` per share, because in this app the
node is per share.

**Files cross either way, by the other door.** `file-transfer.js` asks an
admitted peer over the sync stream, which sets the flag on both sides. What
makes that safe to write to a folder is not who answered but what: the bytes are
hashed with the function that produced the address, and a mismatch is refused.
Measured on one circuit-only pair, in one run: bitswap unpatched `null`, sync
stream the file (`a-file-over-the-sync-stream.test.js`).

**Tell relayed from direct by `connection.limits == null`, never by the
address.** A hole-punched connection still reads `/p2p-circuit/webrtc/p2p/…`, so
a check that greps the address for `/p2p-circuit` passes just as happily on a
connection the relay stopped carrying long ago. Specs in this repository were
written that way and were measuring the wrong thing.

Measured, between two browsers that met through a relay:

| address | encryption | muxer | |
| --- | --- | --- | --- |
| `…/p2p-circuit/p2p/<peer>` | `/noise` | `/yamux` | **limited** — the relay carries it |
| `…/p2p-circuit/webrtc/p2p/<peer>` | `native` | `/webrtc` | unlimited — outbound view |
| `/webrtc/p2p/<peer>` | `native` | `/webrtc` | unlimited — inbound view of the same |

**The last two are one connection seen from two ends.** The side that dialled
records the whole route it signalled over; the side that answered sees only that
a connection arrived. Both are real WebRTC — `native` means DTLS did the
encrypting and the data channel is the muxer — and the relay carries neither.
The `/p2p-circuit` in the address is a memory of the introduction, not the path
in use.

So `encryption` and `multiplexer` read it off without needing to know any of
this: `/noise` + `/yamux` is relayed, `native` + `/webrtc` is not. `carriedBy`
in the harness reports both.

**After a hole punch a device holds three connections, and one of them
lapses.** Measured from one browser:

| to | limited | encryption | muxer | |
| --- | --- | --- | --- | --- |
| the relay | no | `/noise` | `/yamux` | how the relay is reached at all — it stays |
| the peer | **yes** | `/noise` | `/yamux` | the circuit — it goes |
| the peer | no | `native` | `/webrtc` | the hole-punched one — it stays |

The circuit does not survive being unnecessary. With the test relay's
two-minute reservation lease it was gone by t+180s; raising the lease to six
minutes kept it alive past t+240s, with the relay's ten-minute duration limit
unchanged in both runs. **It is the lease that ends it, not the duration
limit.** The steady state after a successful hole punch is two connections,
both unlimited: one to the relay, one to the other device. `carriedBy` filters
by peer and therefore never shows the first — which is most of what somebody
means when they ask what a device is connected to.

`file-after-hole-punch.test.js` asserts the limited circuit is still there.
True when it measures, false three minutes later: it pins the transient,
deliberately, and a slower run could make it lie.

**Ignoring `send()`'s answer costs memory, not messages.** 64 MiB in 64 writes
through the ordinary send path: every one refused, none thrown, **nothing
lost**, and 63.5 MiB queued in the browser. #74 is titled "loses large
messages" and that stopped being true with #83 — the loss was the framing.
`sendBulk` in `bulk.js` is the path for anything large: same payload, 1088
blocks, 16 waits, peak buffer 0.

**And a relay that also holds the data is a different animal.** `orbitdb-relay`
runs OrbitDB and pins databases, so simple-todo's browsers get their data *from
the relay* over an ordinary unlimited WebSocket — never through a circuit at
all. That is why the limitation above went unnoticed there for years. ablage's
relay holds nothing, which is why the same limitation is visible here.

### Which relay can do what

A circuit relay brokers the connection, and when a hole punch succeeds the data
then flows **directly** between devices — measured at 1.6 s. When it does not,
the circuit carries the data itself, which works for any protocol that opted in
above. The 2 min / 128 KB limits in go-peer's `relayv2.DefaultResources()`
therefore do bite for replication over that relay; ours allows 10 GiB and
twenty minutes.

The real dividing line is not transport, it is **discovery**:

- **A peer you already know** — from a scanned QR code — needs only a route. Any
  circuit relay does, `uc-go-peer` included.
- **A peer you have to find** needs the relay in the mesh of your gossipsub
  discovery topic. A gossipsub node that has not subscribed to a topic does not
  forward its payloads. `uc-go-peer` subscribes to
  `universal-connectivity-browser-peer-discovery` — a `const` in
  `go-peer/chatroom.go`, not a flag.
- **Data that should be pinned** needs a relay that stores something.
  `uc-go-peer` stores nothing; only `orbitdb-relay` qualifies.

This is why a `uc-go-peer` left two simple-todo browsers at `candidates: 0`. Not
because it cannot form a circuit — it can, reservation in 1.5 s — but because it
was not on their discovery topic. Apps whose topics match it, or which also
subscribe to it, can use it among themselves.

### Do not

- Bake a relay address in and call the result server-free.
- Report "usable network" from any ICE candidate: every device has host
  candidates. Only reflexive ones say anything beyond this network answers.
- Probe several addresses of the same relay at once. libp2p muxes them onto one
  connection and the second ping fails with a stream-limit error that is
  evidence **for** reachability, not against it.

### Where this lands in ablage

`src/peer.js` builds the libp2p node with one transport,
`@le-space/libp2p-webrtc-qr`, and no listen addresses. Its header notes the
configuration mirrors the webrtc-qr demo's exactly, and why: a hand-written
one produced a connection the upgrader could not finish, with an error that
named nothing useful. Keep that provenance when adding relay transports —
extend the demo's shape rather than replacing it.

ablage moves **files**. If they should stay available while a device is
offline, that is pinning, and only `orbitdb-relay` can do it.
