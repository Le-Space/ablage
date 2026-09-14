# Abgleich

Deutsch · **[English](sync.md)**

## Die eine Regel

**Das CRDT hält Metadaten. Bitswap bewegt Bytes.** Niemals Dateiinhalte im CRDT.

Ein Eintrag sieht ungefähr so aus:

```
path        "notes/todo.md"   — von Anfang an ein ganzer relativer Pfad, auch
                                solange es nur ein flaches Verzeichnis gibt
cid         bafk…             — Inhaltsadresse; die Bytes reisen getrennt
size, mtime
deletedAt   null | Zeitstempel — ein Grabstein, keine Entfernung
```

Pfade von Beginn an ganz zu speichern ist es, was Verzeichnisbäume zu einer
*Darstellung* macht statt zu einer Migration: der Index ist bereits eine Karte
von Pfaden, und ein Baum ist nur, wie man sie zeichnet.

## Yjs, nicht OrbitDB

Der übliche Einwand gegen Yjs lautet, es brauche eine Transport-Bindung — einen
libp2p-Stream, der Updates trägt — und die zu schreiben sei die eigentliche
Arbeit. **Diese Bindung existiert, und sie ist unsere:**
[`js-libp2p-example-yjs-libp2p`](https://github.com/NiKrause/js-libp2p-examples/tree/uc-extensions-service/examples/js-libp2p-example-yjs-libp2p),
erster Platz beim libp2p Universal Connectivity Hackathon im Dezember 2025.

Wiederverwendbar ist ihr **Protokoll** — die Nachrichtenformen. Ihr **Kanal** ist
Gossipsub, und Gossipsub trägt über eine nackte QR-Verbindung nicht; das ist der
nächste Abschnitt, und es ist gemessen statt angenommen. Beides ist trennbar, und
diese Trennung sauber zu halten ist der größte Teil des Entwurfs hier.

Der andere Grund, zu OrbitDB zu greifen, sind Identität und Zugriffssteuerung.
**Das ist eine Schicht tiefer schon erledigt:** der QR-Handschlag signiert das SDP
mit dem libp2p-Schlüssel des Peers, die Verbindung ist also authentifiziert,
bevor überhaupt gewählt wird. Ein Ordner zwischen zwei eigenen Geräten braucht
das nicht vom CRDT ein zweites Mal.

## Wie die beiden Seiten abgleichen: ein direkter Stream, kein Pubsub

**Gemessen, bevor darauf gebaut wurde.**

| | |
| --- | --- |
| libp2p-Verbindung | steht |
| `pubsub.getPeers()` | 1 — Gossipsub kennt den Peer |
| `pubsub.getSubscribers(topic)` | **0**, auf beiden Seiten, dauerhaft |
| `publish(...)` | `recipients: 0` |
| ein direkter Stream über dieselbe Verbindung | **trägt Bytes in beide Richtungen** |

Ausgeschlossen, jeweils in einem eigenen Lauf: nicht Yjs (roher `publish`/
`subscribe` verhält sich genauso), nicht die Gossipsub-Einstellungen (Vorgaben
verhalten sich genauso), nicht Peer-Discovery (Identify war gelaufen, beide
kannten die Protokolle des anderen), und nicht ein Transport, der keine Streams
zulässt. Festgehalten als
[libp2p-webrtc-qr#98](https://github.com/NiKrause/libp2p-webrtc-qr/issues/98).

**Der Kanal ist ein Parameter, keine eingebackene Entscheidung.** Der Provider
nimmt `send` als Funktion:

```js
new Provider(doc, message => stream.send(encode(message)))           // zwei Peers
new Provider(doc, message => pubsub.publish(topic, encode(message))) // später mehr
```

Für zwei Peers ist ein Stream ohnehin die einfachere Form: Gossipsub existiert,
um in eine Menge zu verteilen, und hier ist die Menge einer. **Für mehr als zwei
ist Gossipsub das richtige Werkzeug** — genau deshalb zählt #98, und deshalb tut
dieses Repository nicht so, als sei die Frage erledigt.
