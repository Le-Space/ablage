/**
 * Der eigene Text dieser App, deutsch. Siehe `en.js` für den Zuschnitt.
 */
export default {
  page: {
    title: 'ablage',
    lede: 'Ein Ordner, der auf zwei Geräten derselbe bleibt. Kein Konto, nichts dazwischen.',
    ledeRelay: 'Ein Ordner, der auf zwei Geräten derselbe bleibt. Kein Konto — ein Relay hilft den beiden, sich zu finden, und kann nicht mitlesen.'
  },
  compact: {
    label: 'Kurzcode — ein Code statt einer Bilderfolge. Experimentell.',
    detail: 'Gepackt nach <a href="https://magarcia.github.io/qwbp/spec.html" target="_blank" rel="noreferrer">QWBP</a>, aber signiert statt blank — also nicht wire-kompatibel mit QWBP selbst.'
  },
    music: {
      toggle: 'Wartemusik abspielen',
      piece: 'Mozart, Die Zauberflöte — „Dies Bildnis ist bezaubernd schön“, gesungen von Emile Cossira, 1903. In jeder Schicht gemeinfrei: Komposition, Aufführung und Aufnahme.',
      blocked: 'Dieser Browser hat den Ton nicht gestartet, diese Seite wird also von nichts wachgehalten — die App zum Verschicken des Links zu verlassen kann die Einladung beenden, bevor das andere Gerät antwortet.',
      why: 'Das ist keine Deko. Ein Telefon legt eine stille Seite Sekunden nach dem Wechsel in den Messenger schlafen, und das würde die Verbindung beenden, die Sie gerade aufbauen — hörbare Wiedergabe hält diese Seite am Laufen, während Sie den Link verschicken.'
    },
  brand: { home: 'Le-Space — von wem das ist (öffnet einen neuen Tab, damit diese Seite ihre Verbindungen behält)' },
  awake: {
    toggle: 'Bildschirm anlassen',
    why: 'Ein Telefon, das einschläft, trennt die Verbindung, und eine laufende Übertragung bricht einfach ab. Solange dies an ist und diese Seite auf dem Bildschirm steht, bleibt er hell — das kostet Akku, deshalb ist es aus, bis Sie es einschalten.',
    unsupported: 'Dieser Browser kann den Bildschirm nicht wachhalten. Hier hilft nur, die Seite offen und den Bildschirm von Hand hell zu lassen, damit eine lange Übertragung durchläuft.'
  },
  lang: { label: 'Sprache' },
  view: {
    switchToTechnical: 'Technische Angaben zeigen',
    switchToSimple: 'Technische Angaben ausblenden', label: 'Ansicht', simple: 'Einfach', technical: 'Technisch' },
  language: { label: 'Sprache' },
  link: {
    heading: 'Dieses Gerät und das andere',
    idle: 'Noch nicht verbunden.',
    pairSummary: 'Per Code koppeln, ohne irgendetwas dazwischen',
    invite: 'Meinen Code zeigen',
    scan: 'Code des anderen scannen',
    fold: 'Oder als Link senden',
    copy: 'Kopieren',
    copied: 'Kopiert',
    making: 'Code wird erzeugt…',
    waiting: 'Warte auf die Antwort des anderen Geräts.',
    answering: 'Antworte…',
    showBack: 'Zeigen Sie das dem anderen Gerät zurück.',
    connected: 'Verbunden. Änderungen laufen direkt zwischen den beiden Geräten.',
    gone: 'Das andere Gerät ist weg. Zeigen Sie einen Code, um neu zu verbinden.',
    fromLink: 'Beantworte die Einladung, die Sie geöffnet haben…',
    modalTitle: 'Zeigen Sie das dem anderen Gerät',
    pasteSummary: 'Sie haben die Antwort als Text geschickt',
    pasteLabel: 'Antwort hier einfügen',
    pasteUse: 'Diese Antwort verwenden',
    pasteBad: 'Das sieht nicht nach einer Antwort aus. Ein Antwort-Link enthält #r=.',
    myPeer: ({ id }) => `Dieses Gerät: ${id}`,
    scanReply: 'Antwort scannen',
    cameraHint: 'Die Kamera des anderen Geräts öffnet denselben Link — oder schicken Sie ihn hin.'
  },
  files: {
    heading: 'Dateien',
    drop: 'Dateien oder einen Ordner hierher ziehen, oder ',
    choose: 'auswählen',
    empty: 'Noch nichts da.',
    remove: 'Entfernen',
    // Deutsch löst den Plural auf, wo das Englische bei seinem "bytes" bleibt.
    size: ({ bytes }) => `${bytes} ${bytes === 1 ? 'Byte' : 'Bytes'}`
  },
  admit: {
    title: 'Ein Gerät möchte mit diesem Ordner abgleichen',
    body: 'Es hat Sie über ein Relay erreicht und nicht durch das Scannen Ihres Codes — zugestimmt hat dem also noch niemand. Zulassen heißt, es kann Dateien in dem Ordner anlegen, ändern und löschen, in dem dieses Gerät arbeitet.',
    remember: 'Dieses Gerät merken',
    yes: 'Abgleich zulassen',
    no: 'Ablehnen',
    refused: 'Abgelehnt — dieses Gerät kam nicht in den Ordner.',
    admitted: 'Gleicht mit einem Gerät ab, das Sie über ein Relay erreicht hat.'
  },
  privacy: {
    title: 'Was dieses Gerät verlässt',
    sub: 'Ehrlich beantwortet, einschließlich dessen, was noch nicht gelöst ist.',
    close: 'Schließen',

    leaves: {
      q: 'Was verlässt dieses Gerät überhaupt?',
      a: `<p>Zweierlei, und nur an ein Gerät, dem Sie zugestimmt haben: <strong>die Liste der Dateien</strong> — Namen, Größen und je eine Inhaltsadresse — und <strong>die Dateiinhalte selbst</strong>.</p>
<p>Es gibt kein Konto, keinen Server, der Ihren Ordner hält, und keine Kopie, die irgendwo für Sie aufbewahrt wird. Diese Seite ist ein statisches Bündel; sie hat gar niemanden, an den sie etwas senden könnte.</p>
<p>Alles läuft in einer verschlüsselten Verbindung, und die Schlüssel haben nur die beiden Geräte. Welches Verfahren die Arbeit tut, hängt vom Weg ab: WebRTCs eigenes DTLS, wenn sie direkt verbunden sind, Noise, wenn alles über ein Relay läuft. Nie beides — eine Schicht pro Verbindung.</p>`
    },

    relay: {
      q: 'Wenn ich das Relay einschalte — was sieht es?',
      a: `<p><strong>Ihre Dateien nicht.</strong> Ein Relay reicht Bytes weiter, die es nicht entschlüsseln kann; genau das macht es unbedenklich, ein fremdes zu benutzen.</p>
<p>Es sieht aber, <em>dass</em> Sie da sind, und das ist nicht nichts: den öffentlichen Schlüssel Ihres Geräts, die Adressen, die es ankündigt, mit welchem anderen Gerät Sie sprechen, wann, wie lange und ungefähr wie viel. Das ist eine Aufzeichnung Ihrer Gewohnheiten, auch ohne einen einzigen Dateinamen darin.</p>
<p>Sobald sich die beiden Geräte direkt erreichen können, läuft die Übertragung nicht mehr über das Relay und es fällt aus dem Weg. Können sie es nicht, funktioniert alles weiter darüber.</p>
<p>Mit ausgeschaltetem Relay existiert nichts davon: die App baut keine einzige Verbindung nach außen auf, bevor jemand einen Code scannt.</p>`
    },

    reading: {
      q: 'Könnte jemand meine Dateien unberechtigt mitlesen oder kopieren?',
      a: `<p><strong>Heute, mit eingeschaltetem Relay: ja, in einem engen Fall — und wir haben es gemessen, nicht vermutet.</strong></p>
<p>Ein Gerät, das abgleichen will, muss eingelassen werden: es erscheint in einem Dialog und Sie antworten. Diese Schranke deckt den Abgleich ab. Sie deckt <em>nicht</em> den getrennten Kanal ab, auf dem die Dateiinhalte reisen — der gibt einen Block an jedes Gerät heraus, das ihn unter seiner Inhaltsadresse verlangt.</p>
<p>Eine Inhaltsadresse ist ein Hash der Datei. Jemand müsste also entweder schon einmal eingelassen worden sein oder die betreffende Datei bereits genau so besitzen und prüfen wollen, ob Sie sie auch haben. Durchsuchen, auflisten oder stöbern kann niemand, und keine Adresse wird irgendwo veröffentlicht — diese App lässt die öffentlichen Gateways und das Nachschlagenetz bewusst weg, die eine auffindbar machen würden.</p>
<p>Es bleibt ein Loch, es ist unseres, und es wird als <a href="https://github.com/Le-Space/ablage/issues/43" target="_blank" rel="noopener noreferrer">Issue #43</a> verfolgt.</p>`
    },

    meeting: {
      q: 'Wie finden sich zwei Geräte, und wer hört dabei mit?',
      a: `<p>Geräte kündigen sich auf gemeinsamen, öffentlichen Kanälen an — denselben, die andere Anwendungen auf diesem Relay benutzen. Eine Ankündigung trägt einen öffentlichen Schlüssel und Netzwerkadressen; sie trägt nichts über Sie, Ihren Ordner oder Ihre Dateien.</p>
<p>Wer auf diesen Kanälen lauscht, sieht, wer anwesend ist. So entsteht die Geräteliste, die Sie sehen — und alle anderen können dieselbe Liste bauen.</p>
<p>Die Kopplung über einen gescannten Code benutzt nichts davon.</p>`
    },

    rest: {
      q: 'Wo liegen die Dateien auf meinem Gerät?',
      a: `<p>In dem Ordner, den Sie gewählt haben, als ganz gewöhnliche Dateien. Kann Ihr Browser keinen Ordner öffnen, liegen sie stattdessen im Speicher des Browsers — und das Leeren der Browserdaten löscht sie, was die Dateikarte auch offen sagt.</p>
<p><strong>Verschlüsselt sind sie dort nicht.</strong> Wer Ihr entsperrtes Gerät hat, hat sie, genau wie bei jedem anderen Ordner. Was hier hilft, ist Festplattenverschlüsselung, und die ist Sache Ihres Betriebssystems, nicht dieser App.</p>
<p>Ein paar kleine Einstellungen liegen ebenfalls im Browser: welche Geräte Sie sich gemerkt haben, welches Relay zuletzt geantwortet hat, sowie Sprache und Ansicht.</p>`
    },

    remember: {
      q: 'Was bewirkt „Dieses Gerät merken"?',
      a: `<p>Es überspringt die Frage beim nächsten Mal. Das Gerät wird in diesem Browser vermerkt und ohne erneutes Nachfragen eingelassen, solange der Eintrag besteht.</p>
<p>Das Kästchen ist mit Absicht leer — die sicherere Antwort ist die, die man bekommt, wenn man nicht genau liest.</p>
<p>Es gibt derzeit <strong>keine Ansicht, die diese Liste zeigt oder ein Gerät wieder herausnimmt</strong>. Das Leeren der Browserdaten für diese Seite leert sie. Diese Lücke gehört zu <a href="https://github.com/Le-Space/ablage/issues/43" target="_blank" rel="noopener noreferrer">Issue #43</a>.</p>`
    }
  },
  foot: { legal: 'Impressum & Datenschutz', privacy: 'Datenschutz' },
  folder: {
    // Die Unterscheidung, die der Code bewusst nicht trifft. Beides ist ein
    // `FileSystemDirectoryHandle`, also muss es die Oberfläche sagen - wer
    // glaubt, seine Dateien lägen in ~/Dokumente, während sie im Browserprofil
    // liegen, merkt es beim Leeren des Browsers.
    onDisk: ({ name }) => `Auf Ihrer Festplatte: ${name}`,
    onDiskDetail: 'Das sind Ihre echten Dateien. Was hier erscheint, erscheint in Ihrem Dateimanager, und was Sie dort löschen, verschwindet hier.',
    inBrowser: 'Im Browser — kein Ordner auf Ihrer Festplatte',
    inBrowserDetail: 'Kein Dateimanager sieht diese Dateien, und das Leeren der Browserdaten löscht sie. Wählen Sie einen Ordner, um stattdessen in Ihren eigenen Dateien zu arbeiten.',
    grant: 'Einen Ordner zu wählen erlaubt ablage, in genau diesem Ordner zu lesen und zu schreiben, sonst nirgends. Sie können das in den Browsereinstellungen für diese Seite zurücknehmen, und der Browser fragt nach einem Neustart unter Umständen erneut.',
    noPicker: 'Nur Chromium-Browser können einen Ordner auf Ihrer Festplatte öffnen. Hier arbeitet ablage in seinem eigenen Speicher im Browser.',
    syncing: ({ name }) => `Gleicht ${name} ab`,
    private: 'Arbeitet im privaten Speicher dieses Browsers',
    remembered: ({ name }) => `${name} ist gemerkt, aber dieser Browser hat die Berechtigung fallen lassen — geben Sie sie zurück, um dort weiterzumachen`,
    notWhileConnected: 'Erst trennen — den Ordner zu wechseln, während ein Gerät verbunden ist, müsste dieses Gerät fragen, was der Wechsel für es bedeutet. Das ist noch nicht gebaut.',
    choose: 'Ordner wählen',
    another: 'Anderen Ordner wählen',
    resume: ({ name }) => `${name} wieder benutzen`
  },
  preview: { counted: ({ name, at, of }) => `${name} — ${at} von ${of}` },
  shares: {
    label: 'Freigabe',
    manage: 'Freigaben…',
    title: 'Freigaben',
    blurb: 'Eine Freigabe ist ein Ordner, die dafür zugelassenen Geräte und eine eigene Identität. Zwei Freigaben sehen für alle anderen aus wie zwei fremde Geräte — deshalb startet die App neu, wenn Sie eine auswählen.',
    unnamed: 'Dieser Ordner',
    oneOff: 'Einmalig',
    oneOffAbout: 'bei jedem Start eine neue Identität — nichts wiederzuerkennen',
    namePlaceholder: 'Name für eine neue Freigabe',
    add: 'Freigabe anlegen',
    close: 'Schließen',
    open: 'Öffnen',
    openNow: 'Jetzt öffnen',
    current: 'offen',
    rename: 'Umbenennen',
    remove: 'Entfernen',
    members: ({ count }) => count === 0 ? 'noch keine Geräte' : count === 1 ? 'ein Gerät' : `${count} Geräte`,
    switching: 'Startet neu mit dieser Freigabe…',
    removeLast: 'Die einzige Freigabe lässt sich nicht entfernen.',
    keptFiles: 'Aus der Liste entfernt. Der Ordner und seine Dateien bleiben unberührt.'
  },
  peers: {
    heading: 'Geräte da draußen',
    filter: 'Nach Peer-ID filtern',
    noMatch: 'Kein Gerät hier passt dazu.',
    heard: 'über das Relay gehört',
    connected: 'verbunden',
    share: 'Teilen anfragen',
    asking: ({ id }) => `${id} gefragt — wartet auf Antwort`,
    afterReload: 'Das Relay ist eingeschaltet, aber noch nicht in Betrieb — welches Relay erreicht wird, entscheidet sich beim Start der App. Laden Sie die Seite neu, dann erscheinen Geräte hier binnen weniger Sekunden.',
    reload: 'Neu laden und benutzen',
    searching: 'Suche ein Relay. Geräte erscheinen hier ein paar Sekunden, nachdem dieses hier durchgekommen ist.',
    aloneOnRelay: 'Ein Relay hat geantwortet, sonst ist noch niemand da. Öffnen Sie ablage auf Ihrem anderen Gerät — es erscheint dann binnen weniger Sekunden.',
    empty: 'Noch hat niemand gerufen. Geräte erscheinen hier ein paar Sekunden, nachdem sie ein Relay erreicht haben.',
    unreachable: ({ id }) => `${id} war nicht erreichbar`,
    notAnAddress: 'Das ist weder eine Peer-ID noch eine Adresse.',
    callSummary: 'Ein Gerät anrufen, das nicht in der Liste steht',
    callPlaceholder: 'Peer-ID oder Multiadresse',
    call: 'Anrufen',
    callHint: 'Eine Adresse, die mit / beginnt, erreicht auch ein Gerät, von dem diese App nie gehört hat. Eine blanke Peer-ID nur eines, zu dem sie schon eine Adresse kennt.',
    refused: ({ id }) => `${id} hat nicht angenommen`
  },
  relay: {
    onNextStart: 'Ein Relay wird beim nächsten Öffnen dieser Seite benutzt — die Verbindungseinstellungen stehen fest, sobald die App startet.',
    off: 'Kein Relay. Dieses Gerät ist nur erreichbar, wenn jemand seinen Code scannt.'
  },
  share: {
    askTitle: 'Diesen Ordner an die verbundenen Geräte senden?',
    askBody: ({ count, name }) => `${count === 1 ? 'Ein Gerät ist' : `${count} Geräte sind`} verbunden. Senden heißt, der Inhalt von ${name} erscheint dort; behalten heißt, dieses Gerät arbeitet für sich, bis die Verbindung endet.`,
    yes: 'Senden',
    no: 'Auf diesem Gerät behalten',
    stopped: 'Arbeitet allein auf diesem Gerät — die verbundenen Geräte haben diesen Ordner nicht bekommen.'
  },
  switched: {
    title: 'Das andere Gerät hat den Ordner gewechselt',
    body: ({ name }) => `Es arbeitet jetzt in einem Ordner namens ${name}, und das ist nicht der, den Sie geteilt haben.`,
    follow: 'Hier auch dorthin wechseln',
    keep: 'Meinen Ordner behalten',
    select: 'Einen Ordner nehmen, den ich schon habe',
    selected: ({ name }) => `Arbeitet in ${name}, im Gleichlauf mit dem anderen Gerät`,
    once: 'Inhalt einmalig übernehmen',
    taking: 'Übernimmt den Inhalt einmalig. Was danach kommt, kommt nicht von selbst.',
    took: ({ count }) => `${count === 1 ? 'Eine Datei' : `${count} Dateien`} übernommen. Dieser Ordner läuft nicht mehr mit jenem Gerät mit.`,
    followed: ({ name }) => `Folgt ${name}`,
    kept: 'Diesen Ordner behalten — das andere Gerät arbeitet jetzt woanders.'
  },
  intro: {
    start: 'Los geht\u2019s',
    experimental: '<strong>Hochgradig experimentell — benutzen Sie es für nichts, dessen Verlust weh tut.</strong> Es ist eine lauffähige Demonstration, keine Sicherung: das Format kann sich ändern, und ein Ordner hier ist keine Kopie von irgendetwas.',
    what: 'Dies ist ein Ordner, den zwei Ihrer Geräte teilen. Es gibt kein Konto, und keinen Server dazwischen, der Ihre Dateien hält.',
    how: 'Zeigen Sie den Code auf diesem Bildschirm dem anderen Gerät, oder schicken Sie ihm den Link. Sobald beide verbunden sind, erscheint alles, was Sie in den Ordner legen, auf beiden.',
    howRelay: 'Ein Relay stellt die beiden Geräte einander vor, mehr nicht. Beide rufen auf demselben Treffpunkt; danach erscheint jedes in der Liste des anderen, und eines fragt das andere. Das Relay sieht nie, was hinübergeht — es reicht eine Adresse weiter und tritt zur Seite.',
    secure: 'Die Verbindung ist Ende zu Ende verschlüsselt. Niemand dazwischen kann mitlesen — kein Netzbetreiber, kein Gateway, und wir auch nicht.',
    who: 'Beide Geräte müssen gleichzeitig offen sein. Die Zustellung, wenn sie es nicht sind, ist noch nicht gebaut — und der Ordner sagt das, statt so zu tun.'
  },
  how: {
    heading: 'Woran das hängt',
    dtls: 'Verschlüsselt wird mit DTLS, derselben Schicht, die ein Browser für jede WebRTC-Verbindung benutzt. Das ist nichts Aufgesetztes und lässt sich nicht abschalten.',
    identity: 'Eine benannte Freigabe beh\u00e4lt ein eigenes Schl\u00fcsselpaar, dieses Ger\u00e4t erscheint also beim n\u00e4chsten Mal unter derselben Peer-Id und das andere erkennt es wieder, statt erneut zu fragen. Ein Schl\u00fcssel je Freigabe, damit zwei Ihrer Freigaben f\u00fcr alle anderen wie zwei fremde Ger\u00e4te aussehen.',
    identityOnce: 'Die einmalige Freigabe speichert nichts: bei jedem Start ein neues Schl\u00fcsselpaar, die Peer-Id ist also jedes Mal eine andere, und kein Relay kann erkennen, dass zwei Besuche dasselbe Ger\u00e4t waren. Das andere Ger\u00e4t kann es ebenso wenig und fragt erneut \u2014 das ist der Handel, und so arbeitete jeder Start, bevor es Freigaben gab.',
    identityLimit: 'Was getrennte Identit\u00e4ten nicht bringen: sie verbergen keine gemeinsame IP-Adresse. Ein Relay sieht, unter welcher Peer-Id Sie ankommen, und von wo \u2014 und zwei gleichzeitig ge\u00f6ffnete Freigaben sind trivial verkn\u00fcpfbar. Gegen\u00fcber anderen Peers auf dem Treffpunkt ist die Eigenschaft echt, gegen\u00fcber dem Relay deutlich schw\u00e4cher.',
    signed: 'Was der QR-Code trägt, ist mit dem eigenen Schlüssel dieses Geräts signiert, und die Signatur deckt den Zertifikats-Fingerabdruck der Verbindung ab. Der verschlüsselte Kanal ist damit an genau das Gerät gebunden, das Sie gescannt haben — ein untergeschobenes anderes macht die Signatur ungültig, bevor überhaupt gewählt wird.',
    relay: `Über ein Relay handeln die beiden Geräte Noise untereinander aus, und das Relay reicht Bytes weiter, die es nicht entschlüsseln kann. Die Strom-Aufteilung liegt oberhalb dieser Verschlüsselung, es sieht also nicht einmal die Protokollnamen — es kann eine Dateiübertragung nicht von einer Listenänderung unterscheiden. Was es sieht: wer mit wem, wann, wie lange und ungefähr wie viel.`,
    layers: `Nicht doppelt verschlüsselt: libp2p nimmt eine Schicht pro Verbindung. Auf WebRTC übergibt es skipEncryption und lässt Noise weg, weil DTLS die Arbeit schon getan hat — eine Verbindung meldet ihre Verschlüsselung dort als „native" und über ein Relay als „/noise". Das TLS zum Relay selbst ist ein drittes, davon getrenntes Ding: es verbirgt den Verkehr vor dem Netz zwischen Ihnen und dem Relay, und das Relay beendet es.`,
    gap: `Der Dialog, der ein Gerät einlässt, bewacht den Abgleich — nicht den Kanal, auf dem die Bytes reisen: Bitswap gibt einen Block an jeden verbundenen Peer heraus, der seine Inhaltsadresse nennt. Gemessen, nicht vermutet, und offen als <a href="https://github.com/Le-Space/ablage/issues/43" target="_blank" rel="noopener noreferrer">Issue #43</a>.`,
    bytes: 'Die Dateiinhalte reisen per Bitswap über dieselbe Verbindung, adressiert über ihren Inhalts-Hash. Geteilt wird als Dokument nur die Liste aus Pfaden und Hashes; die Bytes stecken nie darin.',
    music: 'Beim Zeigen eines Codes läuft eine Mozart-Aufnahme von 1903. Das ist keine Deko: eine Seite, die hörbar Ton abspielt, wird vom Telefon nicht schlafen gelegt — und den Link zu verschicken heißt, diese App zu verlassen. Stille reichte nicht: was der Browser für unhörbar hält, zählt nicht als Wiedergabe.',
    open: 'Nichts davon müssen Sie uns glauben: es sind libp2p, WebRTC und Helia, und die Teile, die zu diesem Handschlag gehören, liegen offen unter NiKrause/libp2p-webrtc-qr.'
  }
}
