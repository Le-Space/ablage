# mesh-probe

The evidence behind "one direct stream, not pubsub" in the root README. Kept so
the measurement can be repeated rather than believed.

```bash
npm install
npx vite --port 5190 --strictPort     # note: serves on [::1], use localhost
node raw.mjs          # gossipsub alone, no Yjs        → recipients: 0
node stream.mjs       # can a second stream be opened? → yes, both ways
node yjs-stream.mjs   # Yjs over that stream           → syncs both ways
```

`drive.mjs` is the original run against the hackathon provider over gossipsub,
kept for comparison: it reports `0 subscriber(s)` forever.

## Three mistakes worth not repeating

Each cost a run, and each was inventing instead of copying something that works:

- **vite serves on `[::1]`**, and a driver asking `127.0.0.1` waits forever on a
  server that is up. Use `localhost`.
- The libp2p config was written from scratch with `connectionEncrypters: []`,
  `streamMuxers: []` and an `addresses` block. The upgrader died on a connection
  it could not finish. The demo's configuration works; copy it.
- `node.handle(protocol, ({ stream }) => …)` destructures a **positional**
  argument. The symptom is `stream was reset right after opening`, which reads
  like a transport fault and is a wrong signature. It is `(stream, connection)`.
