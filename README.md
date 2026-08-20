# ablage

A folder on this device that stays the same as a folder on another device — files
added, changed and deleted — with **no account and nothing in the middle**.

Two devices pair once by scanning a QR code off each other's screen. After that
they are peers: the bytes travel directly, and no server ever holds them.

> **Nothing here works yet.** This repository is the plan and the decisions. The
> reasoning behind it is in
> [NiKrause/libp2p-webrtc-qr#56](https://github.com/NiKrause/libp2p-webrtc-qr/issues/56).
>
> One thing is no longer a plan: the transport underneath has been measured.
> See *How the two sides sync* below.

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

### OPFS first, the real folder second

Measured, not assumed:

| | `showDirectoryPicker` (host filesystem) | OPFS |
| --- | --- | --- |
| Chromium | **yes** | yes |
| Firefox | no | yes |
| WebKit | no | yes |

So v1 stores in OPFS and works in every browser; picking a real folder is a
Chromium bridge on top, not the foundation. Building on `showDirectoryPicker`
would make two of three engines untestable from day one.

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
- [ ] **Two devices change the same file.** Dropbox keeps both and names one
  `file (conflicted copy)`. Last-writer-wins destroys somebody's work silently,
  and clocks on two devices are not comparable. Copy Dropbox: keep both, never
  lose bytes.
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
4. **Trees** — by then display and traversal, because the paths were always
   paths.

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
