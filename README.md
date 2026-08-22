# ablage

**[Deutsch](README.de.md)** · English

A folder on this device that stays the same as a folder on another device — files
added, changed and deleted — with **no account and nothing in the middle**.

Two devices pair once by scanning a QR code off each other's screen. After that
they are peers: the bytes travel directly, and no server ever holds them.

> **All four stages work.** Drop files or a whole folder in, show a code, and it
> is on the other device. Edits update, deletions cross, and a change made on
> both sides at once keeps both copies. On Chromium it can sync a **real folder**
> you choose, and notices edits made outside the app. Asserted end to end in
> Chromium and Firefox. In English and German, with an introduction on a first
> visit.
>
> The reasoning is in
> [NiKrause/libp2p-webrtc-qr#56](https://github.com/NiKrause/libp2p-webrtc-qr/issues/56),
> the shape of the code in [PLAN.md](PLAN.md).

```bash
npm install
npm run dev       # the app
npm test          # 61 unit tests, then 186 in Chromium and Firefox
```

## The one rule

**The CRDT holds metadata. Bitswap moves bytes.** Never file content in the CRDT.

An entry is roughly:

```
path        "notes/todo.md"   — a full relative path from day one, even while
                                there is only one flat directory
cid         bafk…             — content address; the bytes travel separately
size, mtime
deletedAt   null | timestamp  — a tombstone, not a removal
```

Storing a path from the start is what makes directory trees a *feature* rather
than a migration: the index is already a map of paths, and a tree is only how it
is drawn.

## Decisions already made

### Yjs, not OrbitDB

The usual objection to Yjs here is that it needs a transport binding — a libp2p
stream carrying updates — and that writing one is the real work. **That binding
exists and it is ours:**
[`js-libp2p-example-yjs-libp2p`](https://github.com/NiKrause/js-libp2p-examples/tree/uc-extensions-service/examples/js-libp2p-example-yjs-libp2p),
first place at the libp2p Universal Connectivity Hackathon, December 2025.

`yjs-libp2p-provider.js` there is a working provider: document updates published,
incoming updates applied, and a proper two-phase state exchange over
`Y.encodeStateVector` rather than a broadcast.

What is reusable is the **protocol** — those message shapes. Its **channel** is
gossipsub, and gossipsub does not carry over a bare QR connection; that is the
next section, and it is measured rather than assumed. The two are separable, and
keeping them separate is most of the design here.

The other reason to reach for OrbitDB is identity and access control. **That is
already handled a layer down:** the QR handshake signs the SDP with the peer's
libp2p key, so the connection is authenticated before any dial happens. A folder
between two of your own devices does not need the CRDT to establish that again.

### How the two sides sync: one direct stream, not pubsub

**Measured before building on it.** The obvious design is the hackathon
provider's: a Yjs document synced over gossipsub. Over a bare QR connection that
does not work, and the failure is quiet.

| | |
| --- | --- |
| libp2p connection | established |
| `pubsub.getPeers()` | 1 — gossipsub knows the peer |
| `pubsub.getSubscribers(topic)` | **0**, both sides, indefinitely |
| `publish(...)` | `recipients: 0` |
| a direct stream over the same connection | **carries bytes both ways** |

Ruled out one run at a time: not Yjs (raw publish/subscribe behaves the same),
not gossipsub tuning (defaults behave the same), not peer discovery (identify had
already run and both sides knew each other's protocols), and not the transport
refusing streams. Written up as
[libp2p-webrtc-qr#98](https://github.com/NiKrause/libp2p-webrtc-qr/issues/98).

So the sync runs over **one libp2p stream**, opened with `session.dialProtocol`.
Proven in both directions, including changes made after the first exchange:

```
A: dialled
B sees A1: hallo von A          — A writes, B reads
A sees B2: und zurück von B     — B writes, A reads
B sees A3: nachträglich         — a later change arrives too
```

The message shapes stay the hackathon provider's — `sync-request` with a state
vector, `sync-response` and `update` with an encoded update — so the wire format
is recognisable and the two can be compared.

**The channel is a parameter, not a decision baked in.** The provider takes
`send` as a function:

```js
new Provider(doc, message => stream.send(encode(message)))           // two peers
new Provider(doc, message => pubsub.publish(topic, encode(message))) // more, later
```

For two peers a stream is also the simpler shape: gossipsub exists to fan out to
a crowd, and here the crowd is one. **For more than two, gossipsub is the right
tool** — which is exactly why #98 matters and why this repository does not
pretend the question is closed.

Versions this was measured on, so a later result can be compared: libp2p 3.3.8,
`@chainsafe/libp2p-gossipsub` 14.1.2, yjs 13.6.32, `@le-space/libp2p-webrtc-qr`
0.8.0 — each the current release at the time. The hackathon example, where
gossipsub did work, ran libp2p ^2.7.4.

### The short code is offered, and off

`@le-space/libp2p-webrtc-qr` can pack an invite the way
[QWBP](https://magarcia.github.io/qwbp/spec.html) does — about a quarter the
characters, so **one static code instead of an animated sequence**. It is here, in
every view, and **unticked by default**.

Not because it is unfinished: a connection built from a reconstructed SDP goes
silent under load — four of eight runs measured upstream against zero of eight on
the long format
([libp2p-webrtc-qr#83](https://github.com/NiKrause/libp2p-webrtc-qr/issues/83)).
For a folder sync, where load is the normal case rather than the exception, that
is the wrong default.

"Experimental" is on the label in every view, because that is a warning rather
than a detail — somebody who ticks it and then watches a transfer stall needs to
have been told. Which packing it uses, and how it differs from the thing it is
named after, follows the technical switch.

*Reading* is unconditional: this app accepts either format whatever the box says,
and answers in the format the invite arrived in. Ticking it only changes what
this device hands out. What travels is not wire-compatible with QWBP — the
packing is theirs, the signature over those bytes is ours.

### Offline, and installable

The data half never needed a network: the files are in OPFS or in the folder you
picked, and both are ordinary persistent storage. What was missing was the
**shell** — every load fetched the HTML and JS over HTTP, so a browser with no
connection had nothing to run and the local files were unreachable. A folder that
only opens when the internet is up is not a folder.

A service worker precaches the shell, generated at build time so it carries the
real hashed filenames — a hand-written list would be wrong the first time an
asset was renamed, and wrong *silently*, because the page would still load from
the network. Its version is a hash of what it caches rather than a timestamp:
a timestamp would change the worker on every build, which changes the site's
IPFS CID, and then a rebuild that altered nothing would look like a deployment.

**Two things about it are easy to get wrong and both were.**

Every path is relative, including the manifest link and the worker's own
registration. This site is served from `ablage.le-space.de` *and* from a gateway
under `/ipfs/<cid>/`, where a leading slash is the gateway's root — the same
mistake as `base: './'`, one layer down.

And the cache is read with `ignoreVary`. The precache is filled by the worker's
own requests, which carry no `Origin`; the page's request for the same module
carries one. Both vite preview and the Aleph gateway answer assets with
`Vary: Origin`, so a default match compares those headers, finds them different,
and reports a miss with the file sitting right there. Offline that is not a slow
path — it is a blank page: the shell loads from the navigation fallback and every
script fails. It cost a false-positive test to find, because every visible string
on the page is an English default in the markup, so a page whose JavaScript never
ran looks exactly like a working one.

Installable as well — manifest, a maskable icon, and the tags iOS wants because
it reads none of the manifest for them.

### The camera is the one part nothing here covers

Every automated test hands a payload over as text, through the field in the
invite dialog. `getUserMedia` and the scanner element are exercised by hand
only — the container these tests run in has no camera, and answers
`Requested device not found` to anything that asks for one.

That is worth stating because the machine they are *written* on does have one.
A test that opens a camera passes on a laptop and fails every run on CI, which
happened twice before it was written down. `test/browser/handover.test.js` now
takes `getUserMedia` away in its own setup, so a local run asks the same
question the container does.

### The private folder first, the real one second

Measured, not assumed:

| | `showDirectoryPicker` (host filesystem) | the origin's private folder |
| --- | --- | --- |
| Chromium | **yes** | yes |
| Firefox | no | yes |
| WebKit | no | yes |

So the foundation is the private folder, which every engine has, and picking a
real one is a Chromium bridge on top. Building on `showDirectoryPicker` would
have made two of three engines untestable from day one.

**It turned out to need no second storage at all.** Both a picked directory and
the private one are a `FileSystemDirectoryHandle`, and every call the store
makes is on that interface — so stage 3 added a second way to *get* a handle,
not a second way to use one. The module was renamed from `opfs.js` to
`directory.js`, because the old name described where the handle came from rather
than what the code did.

Which means the tests written against the private folder cover the picked one
too, for everything except the picking. That opens a native dialog and **no
browser automation can drive it** — unlike `<input type=file>`, which Playwright
can fill. It is verified by hand, and everything around it is verified here.

Two parts are easy to get wrong and are worth naming. A handle survives in
IndexedDB, but its **permission does not** — and asking again needs a user
gesture, so the app offers the remembered folder rather than demanding
permission on load. And there are **no change events** on a directory handle, in
any engine, so noticing an edit made in a text editor means polling. What is
polled is each file's size and modification time, not its contents: hashing a
folder on a timer is how a sync tool becomes the reason a laptop's fan runs.

### Being present at the same time is a stage, not the design

With a direct QR connection and nothing else, both devices have to be present
and connectable at once. The interface has to say so from the first commit —
phrased as **not connected yet**, never as *this is what it does* — because
otherwise the first question is "why did my file not arrive".

Delivery when the two are apart is a later stage and its own decision. It is
what the name avoids committing to: `ablage` is the place the files are, and
says nothing about how far apart the devices holding it are.

## Open questions, in the order they will hurt

- [x] ~~**Does gossipsub form a mesh over exactly one direct QR connection?**~~
  No. Measured, and the sync runs over a direct stream instead — see above and
  [libp2p-webrtc-qr#98](https://github.com/NiKrause/libp2p-webrtc-qr/issues/98).
- [x] ~~**Two devices change the same file.**~~ Both copies are kept, Dropbox's
  way and for Dropbox's reason. The rescued name is derived from the **content
  address**, not from a device name or a timestamp, so two devices that diverged
  to the same bytes converge on one entry rather than two.

  Telling that apart from an ordinary edit needs a third value: what this device
  last agreed with the other one about. Without it, "I changed this" and "we
  both changed it" are the same observation. That is `sync/baseline.js`, and it
  is **local on purpose** — two devices legitimately remember different things,
  so putting it in the shared document would let one overwrite the other.

  **The rule is a parameter, and when it becomes a setting it belongs in the
  shared document rather than on a device.** A resolution writes into the shared
  index, so it replicates: if one side kept both copies and the other overwrote,
  the winner would be whoever reacted first rather than whoever configured what.
  A setting that works depending on timing is worse than none.
- [ ] **History.** Neither Yjs nor OrbitDB would give us file history by
  itself — both log what happened to the *index*, and the bytes live in Helia
  behind their addresses. **The addresses are the history**: keeping every CID a
  path ever had makes every version retrievable, provided the blocks still
  exist. So this is two decisions, not one: keep old addresses in the entry
  (nearly free), and keep the blocks (unbounded growth on a folder of edited
  videos). Worth settling before the entry shape hardens.

  Yjs can also replay its own log, but only with `gc: false` — it collects
  deleted content by default, and `Y.snapshot()` needs it kept.

- [ ] **Deletion versus a device that was away.** A tombstone that expires can be
  resurrected by a device that returns after it expired; one that never expires
  grows forever. Pick one and write down which.
- [ ] **Does a phone hold the connection at all?** It closes the peer connection
  seconds after the app goes to the background
  ([#65](https://github.com/NiKrause/libp2p-webrtc-qr/issues/65)). If audio
  keep-alive survives an app switch this is a phone product; if not, it should be
  built as a two-desktop feature and say so.

## Staging

1. **MVP** — one flat directory in OPFS, index in Yjs, add and delete only. Two
   browser contexts, one QR connection, files appear on both sides. An e2e test
   that adds a file on A and asserts the bytes on B.
2. **Updates and conflicts** — changing a file, and the conflicted-copy rule with
   a test that proves nothing is lost.
3. **The real folder (Chromium)** — `showDirectoryPicker`, the handle persisted
   in IndexedDB, and a watcher. Feature-detected; OPFS stays the store elsewhere.
4. ~~**Trees**~~ — and it was display and traversal, exactly because the paths
   were always paths. The tree builder is a pure function with nine tests and no
   browser in sight; folders come before files the way every file manager does
   it, and collapsing one is a view rather than a change.

   Dropping a *folder* needed its own work, though. A dropped directory is not
   in `dataTransfer.files` at all — it is an entry in `items`, and walking it is
   the only way to reach what is inside. Without that, dragging a folder in does
   nothing whatsoever, which reads as the app being broken. `readEntries` also
   returns one page at a time and signals the end with an empty batch, so
   reading it once gives the first hundred files and silently loses the rest.

Not in scope until asked: encryption at rest, more than two peers, partial sync,
and anything resembling a server.

## Built on

- [`@le-space/libp2p-webrtc-qr`](https://github.com/NiKrause/libp2p-webrtc-qr) —
  the QR handshake and the direct connection
- [Yjs](https://github.com/yjs/yjs) — the index
- [Helia](https://github.com/ipfs/helia) — content addressing, and bitswap for
  the bytes

## License

Apache-2.0 OR MIT, at your option.
