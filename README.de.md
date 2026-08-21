# ablage

Deutsch · **[English](README.md)**

Ein Ordner auf diesem Gerät, der derselbe bleibt wie ein Ordner auf einem
anderen — hinzugefügte, geänderte und gelöschte Dateien — **ohne Konto und ohne
irgendetwas dazwischen**.

Zwei Geräte verbinden sich einmal, indem eines einen QR-Code vom Bildschirm des
anderen abscannt. Danach sind sie Peers: die Bytes reisen direkt, und kein
Server hält sie je.

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
npm test          # 47 Unit-Tests, dann 128 in Chromium und Firefox
```

Die Begründungen stehen in
[NiKrause/libp2p-webrtc-qr#56](https://github.com/NiKrause/libp2p-webrtc-qr/issues/56),
der Zuschnitt des Codes in [PLAN.md](PLAN.md).

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

## Entscheidungen, die schon gefallen sind

### Yjs, nicht OrbitDB

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

### Wie die beiden Seiten abgleichen: ein direkter Stream, kein Pubsub

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

### Der Kurzcode ist da, und aus

`@le-space/libp2p-webrtc-qr` kann eine Einladung so packen wie
[QWBP](https://magarcia.github.io/qwbp/spec.html) — etwa ein Viertel der Zeichen,
also **ein einzelner statischer Code statt einer Animation**. Er ist eingebaut,
in jeder Ansicht, und **standardmäßig aus**.

Nicht weil er unfertig wäre: eine Verbindung aus rekonstruiertem SDP verstummt
unter Last — vier von acht Läufen stromaufwärts gemessen, gegen null von acht
beim langen Format
([libp2p-webrtc-qr#83](https://github.com/NiKrause/libp2p-webrtc-qr/issues/83)).
Für einen Ordnerabgleich, wo Last der Normalfall ist, ist das die falsche
Voreinstellung.

„Experimentell" steht in jeder Ansicht auf dem Etikett, denn das ist eine
Warnung und kein Detail — wer es anhakt und dann eine hängende Übertragung
sieht, muss es vorher gelesen haben. Welche Packung es benutzt und wie sie sich
von ihrem Namensgeber unterscheidet, folgt dem technischen Schalter.

*Gelesen* wird beides, immer: diese App nimmt jedes Format an, egal was das
Kästchen sagt, und antwortet in dem Format, in dem die Einladung kam. Das Häkchen
ändert nur, was dieses Gerät ausgibt. Was übertragen wird, ist nicht
wire-kompatibel mit QWBP — die Packung ist ihre, die Signatur darüber unsere.

### Der private Ordner zuerst, der echte danach

Gemessen, nicht vermutet:

| | `showDirectoryPicker` | privater Ordner des Origins |
| --- | --- | --- |
| Chromium | **ja** | ja |
| Firefox | nein | ja |
| WebKit | nein | ja |

Die Grundlage ist deshalb der private Ordner, den jede Maschine hat; einen
echten zu wählen ist eine Brücke obendrauf.

**Es stellte sich heraus, dass gar kein zweiter Speicher nötig war.** Ein
gewählter Ordner und der private sind beide ein `FileSystemDirectoryHandle`, und
jeder Aufruf des Speichers gehört zu dieser Schnittstelle — Stufe 3 ergänzte also
einen zweiten Weg, ein Handle zu *bekommen*, nicht einen zweiten, es zu benutzen.

Zwei Stellen sind leicht falsch zu machen. Ein Handle überlebt in IndexedDB,
**seine Berechtigung nicht** — und erneut zu fragen braucht eine Nutzergeste,
weshalb die App den gemerkten Ordner anbietet, statt beim Laden Berechtigung zu
verlangen. Und es gibt **keine Änderungsereignisse** auf einem
Verzeichnis-Handle, in keiner Maschine: eine Änderung im Texteditor zu bemerken
heißt abfragen. Abgefragt werden Größe und Änderungszeit, nicht der Inhalt —
einen Ordner auf einem Zeitgeber zu hashen ist der Weg, auf dem ein
Sync-Werkzeug zum Grund wird, warum der Lüfter läuft.

### Gleichzeitig anwesend zu sein ist eine Stufe, kein Entwurf

Mit einer direkten QR-Verbindung und sonst nichts müssen beide Geräte
gleichzeitig da und erreichbar sein. Die Oberfläche sagt das ab dem ersten
Commit — formuliert als **noch nicht verbunden**, nie als *so ist es gedacht* —
weil sonst die erste Rückfrage lautet „warum ist meine Datei nicht angekommen".

Die Zustellung, wenn die beiden getrennt sind, ist eine spätere Stufe und eine
eigene Entscheidung. Genau darauf legt sich der Name nicht fest: `ablage` ist der
Ort, an dem die Dateien liegen, und sagt nichts über die Entfernung der Geräte.

## Offene Fragen, in der Reihenfolge, in der sie wehtun werden

- [x] ~~**Bildet Gossipsub ein Mesh über eine einzelne QR-Verbindung?**~~ Nein.
- [x] ~~**Zwei Geräte ändern dieselbe Datei.**~~ Beide Fassungen bleiben, auf
  Dropbox' Art und aus Dropbox' Grund. Der Name der geretteten Kopie leitet sich
  aus der **Inhaltsadresse** ab, nicht aus einem Gerätenamen oder Zeitstempel —
  zwei Geräte, die zum selben Inhalt auseinanderliefen, laufen so auf einen
  Eintrag zusammen statt auf zwei.

  **Die Regel ist ein Parameter, und wenn sie eine Einstellung wird, gehört sie
  ins geteilte Dokument statt auf ein Gerät.** Eine Auflösung schreibt in den
  geteilten Index und repliziert: hielte eine Seite beide Kopien und die andere
  überschriebe, gewänne wer zuerst reagiert, nicht wer was eingestellt hat. Eine
  Einstellung, die je nach Zeitpunkt wirkt, ist schlechter als keine.

- [ ] **Historie.** Weder Yjs noch OrbitDB gäben uns Dateihistorie von sich aus —
  beide protokollieren, was mit dem *Index* geschah, und die Bytes liegen in
  Helia hinter ihren Adressen. **Die Adressen sind die Historie**: wer jede CID
  behält, die ein Pfad je hatte, kann jede Fassung wiederholen, solange die
  Blöcke existieren. Das sind also zwei Entscheidungen: alte Adressen im Eintrag
  behalten (fast gratis) und die Blöcke behalten (unbegrenztes Wachstum bei oft
  bearbeiteten Videos).

- [ ] **Löschung gegen ein Gerät, das weg war.** Ein Grabstein, der verfällt,
  kann von einem Gerät wiederbelebt werden, das danach zurückkommt; einer, der
  nie verfällt, wächst ewig. Eines von beidem wählen und aufschreiben, welches.

- [ ] **Hält ein Telefon die Verbindung überhaupt?** Es schließt die
  Peer-Verbindung Sekunden nachdem die App in den Hintergrund geht
  ([#65](https://github.com/NiKrause/libp2p-webrtc-qr/issues/65)). Übersteht der
  Audio-Keep-Alive einen App-Wechsel, ist das hier ein Telefon-Produkt; wenn
  nicht, gehört es als Zwei-Rechner-Sache gebaut und benannt.

## Worauf es aufbaut

- [`@le-space/libp2p-webrtc-qr`](https://github.com/NiKrause/libp2p-webrtc-qr) —
  der QR-Handschlag, die direkte Verbindung, und die Elemente für Code, Kamera,
  Netzprüfung und Einführung
- [Yjs](https://github.com/yjs/yjs) — der Index
- [Helia](https://github.com/ipfs/helia) — Inhaltsadressierung, und Bitswap für
  die Bytes

## Lizenz

Apache-2.0 oder MIT, nach Wahl.
