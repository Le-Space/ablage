# Verbinden

Deutsch · **[English](pairing.md)**

## Der Kurzcode ist da, und aus

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

## Die Kamera ist der eine Teil, den hier nichts abdeckt

Jeder automatische Test übergibt die Nutzlast als Text, über das Feld im
Einladungsdialog. `getUserMedia` und das Scanner-Element werden nur von Hand
ausgeführt — der Container, in dem diese Tests laufen, hat keine Kamera und
antwortet jedem, der danach fragt, mit `Requested device not found`.

Das gehört gesagt, weil die Maschine, auf der sie *geschrieben* werden, eine
hat. Ein Test, der eine Kamera öffnet, besteht auf dem Laptop und fällt in
jedem CI-Lauf durch — zweimal passiert, bevor es hier stand.
`test/browser/handover.test.js` nimmt `getUserMedia` inzwischen im eigenen
Aufbau weg, damit ein lokaler Lauf dieselbe Frage stellt wie der Container.

## Gleichzeitig anwesend zu sein ist eine Stufe, kein Entwurf

Mit einer direkten QR-Verbindung und sonst nichts müssen beide Geräte
gleichzeitig da und erreichbar sein. Die Oberfläche sagt das ab dem ersten
Commit — formuliert als **noch nicht verbunden**, nie als *so ist es gedacht* —
weil sonst die erste Rückfrage lautet „warum ist meine Datei nicht angekommen".

Die Zustellung, wenn die beiden getrennt sind, ist eine spätere Stufe und eine
eigene Entscheidung. Genau darauf legt sich der Name nicht fest: `ablage` ist der
Ort, an dem die Dateien liegen, und sagt nichts über die Entfernung der Geräte.
