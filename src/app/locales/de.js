/**
 * Der eigene Text dieser App, deutsch. Siehe `en.js` für den Zuschnitt.
 */
export default {
  page: {
    title: 'ablage',
    lede: 'Ein Ordner, der auf zwei Geräten derselbe bleibt. Kein Konto, nichts dazwischen.'
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
  lang: { label: 'Sprache' },
  view: {
    switchToTechnical: 'Technische Angaben zeigen',
    switchToSimple: 'Technische Angaben ausblenden', label: 'Ansicht', simple: 'Einfach', technical: 'Technisch' },
  language: { label: 'Sprache' },
  link: {
    heading: 'Dieses Gerät und das andere',
    idle: 'Noch nicht verbunden.',
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
  foot: { legal: 'Impressum & Datenschutz' },
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
    rest: 'Zwei weitere Antworten — einen Ordner nehmen, den Sie schon haben, und den Inhalt einmalig übernehmen — sind noch nicht gebaut.',
    followed: ({ name }) => `Folgt ${name}`,
    kept: 'Diesen Ordner behalten — das andere Gerät arbeitet jetzt woanders.'
  },
  intro: {
    experimental: '<strong>Hochgradig experimentell — benutzen Sie es für nichts, dessen Verlust weh tut.</strong> Es ist eine lauffähige Demonstration, keine Sicherung: das Format kann sich ändern, und ein Ordner hier ist keine Kopie von irgendetwas.',
    what: 'Dies ist ein Ordner, den zwei Ihrer Geräte teilen. Es gibt kein Konto, und keinen Server dazwischen, der Ihre Dateien hält.',
    how: 'Zeigen Sie den Code auf diesem Bildschirm dem anderen Gerät, oder schicken Sie ihm den Link. Sobald beide verbunden sind, erscheint alles, was Sie in den Ordner legen, auf beiden.',
    secure: 'Die Verbindung ist Ende zu Ende verschlüsselt. Niemand dazwischen kann mitlesen — kein Netzbetreiber, kein Gateway, und wir auch nicht.',
    who: 'Beide Geräte müssen gleichzeitig offen sein. Die Zustellung, wenn sie es nicht sind, ist noch nicht gebaut — und der Ordner sagt das, statt so zu tun.'
  },
  how: {
    heading: 'Woran das hängt',
    dtls: 'Verschlüsselt wird mit DTLS, derselben Schicht, die ein Browser für jede WebRTC-Verbindung benutzt. Das ist nichts Aufgesetztes und lässt sich nicht abschalten.',
    signed: 'Was der QR-Code trägt, ist mit dem eigenen Schlüssel dieses Geräts signiert, und die Signatur deckt den Zertifikats-Fingerabdruck der Verbindung ab. Der verschlüsselte Kanal ist damit an genau das Gerät gebunden, das Sie gescannt haben — ein untergeschobenes anderes macht die Signatur ungültig, bevor überhaupt gewählt wird.',
    bytes: 'Die Dateiinhalte reisen per Bitswap über dieselbe Verbindung, adressiert über ihren Inhalts-Hash. Geteilt wird als Dokument nur die Liste aus Pfaden und Hashes; die Bytes stecken nie darin.',
    music: 'Beim Zeigen eines Codes läuft eine Mozart-Aufnahme von 1903. Das ist keine Deko: eine Seite, die hörbar Ton abspielt, wird vom Telefon nicht schlafen gelegt — und den Link zu verschicken heißt, diese App zu verlassen. Stille reichte nicht: was der Browser für unhörbar hält, zählt nicht als Wiedergabe.',
    open: 'Nichts davon müssen Sie uns glauben: es sind libp2p, WebRTC und Helia, und die Teile, die zu diesem Handschlag gehören, liegen offen unter NiKrause/libp2p-webrtc-qr.'
  }
}
