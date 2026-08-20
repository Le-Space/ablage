# Implementation plan

The README holds the decisions. This holds the shape of the code and the order
things get built in.

## The program, in one paragraph

The Yjs index says *path `notes/todo.md` has content `bafk…`*. Something has to
notice that, fetch those bytes over bitswap, and write them into storage — and
notice the reverse, that a local file appeared and its content needs announcing.
That something is the **reconciler**, and it is the application. Yjs and bitswap
are parts it uses.

Neither the issue nor the README described it, which is why they were a decision
record and not a plan.

## Modules

```
src/
  peer.js            libp2p node, QRSession, the connection lifecycle
  sync/
    provider.js      Yjs over a channel - the channel is an argument
    file-index.js    the Y.Map of paths: the entry shape and its operations
    baseline.js      what this device last agreed on - the third value
  storage/
    directory.js     list / read / write / remove, over any directory handle
    handle.js        picking a folder, keeping it, asking again for permission
    watch.js         polling, because directory handles have no events
    index.js         picked folder if there is one, private folder otherwise
  content.js         Helia: bytes in, CID out, and back
  reconcile.js       the state machine below
  app/               the interface
```

Four methods are the whole storage contract — `list()`, `read(path)`,
`write(path, bytes)`, `remove(path)`. OPFS satisfies it now, a picked directory
satisfies it in stage 3, and the reconciler never learns which it is talking to.
Drawing that seam now costs nothing; retrofitting it costs a rewrite, because
`FileSystemDirectoryHandle` and OPFS paths do not have the same shape.

## The reconciler

It runs on two triggers — the index changed, or storage changed — and both
reduce to the same question: **where do the index and storage disagree?**

| index | storage | action |
| --- | --- | --- |
| entry, no tombstone | missing | fetch by CID, write |
| entry, no tombstone | present, same CID | nothing |
| entry, no tombstone | present, different CID | stage 2 — this is the conflict case |
| entry with tombstone | present | remove |
| entry with tombstone | missing | nothing |
| no entry | present | add: bytes to Helia, CID into the index |

Stage 1 implements every row except the conflict one, which is stage 2 and gets
its own decision first.

Deliberately a **comparison**, not an event log. A missed event is then a
non-event: the next pass finds the same disagreement and fixes it. An
event-driven design that assumes every change was seen is the kind that goes
subtly wrong after a reconnection, and this project already knows what silent
failure costs.

## Test order

Written in this order, because each one can fail on its own terms:

1. **`file-index`** — pure Yjs, no browser, no network. Entry shape, add, remove,
   tombstones, and that two documents converge when merged. Node tests.
2. **`reconcile`** — the table above, against a fake storage and a fake index.
   Still no browser. This is where the logic lives, so this is where most of the
   tests live.
3. **`storage/opfs`** — needs a browser, so Playwright. Small: it is four
   methods.
4. **End to end** — two contexts, one QR connection, a file added on A and its
   bytes asserted on B. One test, and it is the one that would have been written
   first by somebody who mistook it for the cheap one.

## What stage 1 leaves out, on purpose

Conflicts, updates to an existing file, directories, the picked folder, more than
two peers, and anything about delivery when the two sides are not both present.
Each has a line in the README saying why.
