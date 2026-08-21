# Notes for agents — ablage

Files, carried between devices that met by scanning a code. `README.md` says
what it is; this file is what is expensive to learn twice.

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

### Which relay can do what

A circuit relay brokers the connection; the data then flows **directly** between
devices — measured at 1.6 s, with the relay used only for signalling. So the
2 min / 128 KB limits in go-peer's `relayv2.DefaultResources()` never bite for
connecting, and would for replication.

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
