# Fahrplan

Deutsch · **[English](roadmap.md)**

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

## Stufen

Bisher nur in der [englischen Fassung](roadmap.md#staging).
