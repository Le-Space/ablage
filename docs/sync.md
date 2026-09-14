# Sync

**[Deutsch](sync.de.md)** · English

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

## Yjs, not OrbitDB

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

## How the two sides sync: one direct stream, not pubsub

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
