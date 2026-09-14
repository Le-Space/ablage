# ablage

Deutsch · **[English](README.md)**

Ein Ordner auf diesem Gerät, der derselbe bleibt wie ein Ordner auf einem
anderen — hinzugefügte, geänderte und gelöschte Dateien — **ohne Konto und ohne
irgendetwas dazwischen**.

Zwei Geräte verbinden sich einmal, indem eines einen QR-Code vom Bildschirm des
anderen abscannt. Danach sind sie Peers: die Bytes reisen direkt, und kein
Server hält sie je.

**Live-Demo: [ablage.le-space.de](https://ablage.le-space.de/?lang=de)** — auf
zwei Geräten öffnen. Jeder Push auf `main`, der die Tests besteht, landet dort.

> **Alle vier Stufen laufen.** Dateien oder einen ganzen Ordner hineinziehen,
> einen Code zeigen, und es liegt auf dem anderen Gerät. Änderungen aktualisieren,
> Löschungen wandern mit, und wer gleichzeitig auf beiden Seiten ändert, behält
> beide Fassungen. Auf Chromium kann es einen **echten Ordner** abgleichen, den
> Sie wählen, und bemerkt Änderungen außerhalb der App. Ende-zu-Ende geprüft in
> Chromium und Firefox. Auf Deutsch und Englisch, mit einer Einführung beim
> ersten Besuch.

```bash
npm install
npm run dev       # die App
npm test          # Unit-Tests, dann die Browser-Suite in Chromium und Firefox
```

## Die eine Regel

**Das CRDT hält Metadaten. Bitswap bewegt Bytes.** Niemals Dateiinhalte im CRDT.
Was ein Eintrag enthält und warum sein Pfad von Anfang an ganz gespeichert
wird, steht in [docs/sync.de.md](docs/sync.de.md#die-eine-regel).

## Weiterlesen

- **[Abgleich](docs/sync.de.md)** — die Form eines Eintrags, Yjs statt OrbitDB,
  und warum die beiden Seiten über einen direkten Stream abgleichen statt über
  Pubsub
- **[Verbinden](docs/pairing.de.md)** — der Kurzcode und warum er aus ist, die
  Kamera, die kein Test abdeckt, und warum beide Geräte gleichzeitig da sein
  müssen
- **[Der Ordner](docs/folder.de.md)** — der private Ordner zuerst, ein echter
  auf Chromium, offline arbeiten und installieren
- **[Fahrplan](docs/roadmap.de.md)** — die offenen Fragen; die Stufen bisher
  nur auf Englisch
- **[PLAN.md](PLAN.md)** — der Zuschnitt des Codes und die Reihenfolge, in der
  er entsteht (auf Englisch)
- **[AGENTS.md](AGENTS.md)** — was teuer ist, zweimal zu lernen: Relays,
  begrenzte Verbindungen und eine Version, die mit jedem Commit wandert (auf
  Englisch)

Die Begründungen stehen in
[NiKrause/libp2p-webrtc-qr#56](https://github.com/NiKrause/libp2p-webrtc-qr/issues/56).

## Worauf es aufbaut

- [`@le-space/libp2p-webrtc-qr`](https://github.com/NiKrause/libp2p-webrtc-qr) —
  der QR-Handschlag, die direkte Verbindung, und die Elemente für Code, Kamera,
  Netzprüfung und Einführung
- [Yjs](https://github.com/yjs/yjs) — der Index
- [Helia](https://github.com/ipfs/helia) — Inhaltsadressierung, und Bitswap für
  die Bytes

## Lizenz

Apache-2.0 oder MIT, nach Wahl.
