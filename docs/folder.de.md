# Der Ordner

Deutsch · **[English](folder.md)**

## Der private Ordner zuerst, der echte danach

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

## Offline, und installierbar

Die Datenhälfte brauchte nie ein Netz: die Dateien liegen in OPFS oder in dem
Ordner, den Sie gewählt haben, beides gewöhnlicher dauerhafter Speicher. Was
fehlte, war die **Hülle** — jeder Aufruf holte HTML und JS über HTTP, ein
Browser ohne Verbindung hatte also nichts auszuführen und kam an die lokalen
Dateien nicht heran. Ein Ordner, der sich nur bei Internet öffnet, ist kein
Ordner.

Ein Service Worker legt die Hülle in den Cache, zur Bauzeit erzeugt und damit
mit den echten gehashten Dateinamen — eine handgeschriebene Liste wäre beim
ersten Umbenennen falsch, und zwar *lautlos*, weil die Seite weiterhin aus dem
Netz lädt. Seine Version ist ein Hash dessen, was er cacht, kein Zeitstempel:
ein Zeitstempel änderte den Worker bei jedem Build, das ändert die IPFS-CID der
Seite, und ein Neubau ohne jede Änderung sähe aus wie eine Veröffentlichung.

**Zwei Dinge daran sind leicht falsch zu machen, und beide waren es.**

Jeder Pfad ist relativ, auch der Manifest-Link und die Registrierung des Workers
selbst. Diese Seite wird von `ablage.le-space.de` *und* von einem Gateway unter
`/ipfs/<cid>/` ausgeliefert, wo ein führender Schrägstrich die Wurzel des
Gateways ist — derselbe Fehler wie bei `base: './'`, eine Schicht tiefer.

Und der Cache wird mit `ignoreVary` gelesen. Der Vorrat wird durch die Anfragen
*des Workers* gefüllt, die kein `Origin` tragen; die Anfrage der Seite nach
demselben Modul trägt eines. Sowohl vite preview als auch das Aleph-Gateway
beantworten Assets mit `Vary: Origin`, ein voreingestellter Abgleich vergleicht
also diese Kopfzeilen, findet sie verschieden und meldet einen Fehlschlag —
während die Datei direkt daneben liegt. Offline ist das kein langsamer Weg,
sondern eine leere Seite: die Hülle kommt aus dem Navigations-Rückfall und jedes
Skript scheitert. Gefunden hat es ein falsch-positiver Test, denn jeder sichtbare
Text steht als englischer Default im Markup — eine Seite, deren JavaScript nie
lief, sieht genauso aus wie eine funktionierende.

Installierbar außerdem — Manifest, ein maskable Icon und die Tags, die iOS will,
weil es davon nichts aus dem Manifest liest.
