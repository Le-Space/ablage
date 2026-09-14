# ablage

**[Deutsch](README.de.md)** · English

A folder on this device that stays the same as a folder on another device — files
added, changed and deleted — with **no account and nothing in the middle**.

Two devices pair once by scanning a QR code off each other's screen. After that
they are peers: the bytes travel directly, and no server ever holds them.

**Live demo: [ablage.le-space.de](https://ablage.le-space.de/)** — open it on two
devices. Every push to `main` that passes the tests is deployed there.

> **All four stages work.** Drop files or a whole folder in, show a code, and it
> is on the other device. Edits update, deletions cross, and a change made on
> both sides at once keeps both copies. On Chromium it can sync a **real folder**
> you choose, and notices edits made outside the app. Asserted end to end in
> Chromium and Firefox. In English and German, with an introduction on a first
> visit.

```bash
npm install
npm run dev       # the app
npm test          # unit tests, then the browser suite in Chromium and Firefox
```

## The one rule

**The CRDT holds metadata. Bitswap moves bytes.** Never file content in the CRDT.
What an entry holds, and why its path is stored whole from day one, is in
[docs/sync.md](docs/sync.md#the-one-rule).

## Read more

- **[Sync](docs/sync.md)** — the entry shape, Yjs rather than OrbitDB, and why
  the two sides sync over one direct stream rather than pubsub
- **[Pairing](docs/pairing.md)** — the short code and why it is off, the camera
  no test covers, and why both devices have to be there at once
- **[The folder](docs/folder.md)** — the private folder first, a real one on
  Chromium, working offline, and installing
- **[Roadmap](docs/roadmap.md)** — the open questions, the stages, and what is
  out of scope
- **[PLAN.md](PLAN.md)** — the shape of the code and the order it gets built in
- **[AGENTS.md](AGENTS.md)** — what is expensive to learn twice: relays, limited
  connections, and a version that moves with every commit

The reasoning is in
[NiKrause/libp2p-webrtc-qr#56](https://github.com/NiKrause/libp2p-webrtc-qr/issues/56).

## Built on

- [`@le-space/libp2p-webrtc-qr`](https://github.com/NiKrause/libp2p-webrtc-qr) —
  the QR handshake, the direct connection, and the elements for the code, the
  camera, the network check and the introduction
- [Yjs](https://github.com/yjs/yjs) — the index
- [Helia](https://github.com/ipfs/helia) — content addressing, and bitswap for
  the bytes

## License

Apache-2.0 OR MIT, at your option.
