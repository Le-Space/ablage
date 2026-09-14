# Roadmap

**[Deutsch](roadmap.de.md)** · English

## Open questions, in the order they will hurt

- [x] ~~**Does gossipsub form a mesh over exactly one direct QR connection?**~~
  No. Measured, and the sync runs over a direct stream instead — see
  [sync](sync.md#how-the-two-sides-sync-one-direct-stream-not-pubsub) and
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
