/**
 * Der eigene Text dieser App, deutsch. Siehe `en.js` für den Zuschnitt.
 */
export default {
  page: {
    title: 'ablage',
    lede: 'Ein Ordner, der auf zwei Geräten derselbe bleibt. Kein Konto, nichts dazwischen.'
  },
  compact: {
    label: 'Kurzcode (nach <a href="https://magarcia.github.io/qwbp/spec.html" target="_blank" rel="noreferrer">QWBP</a>) <small>experimentell, und signiert statt blank</small>'
  },
  view: { label: 'Ansicht', simple: 'Einfach', technical: 'Technisch' },
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
  folder: {
    private: 'Arbeitet im privaten Speicher dieses Browsers',
    syncing: ({ name }) => `Gleicht ${name} ab`,
    remembered: ({ name }) => `${name} ist gemerkt — geben Sie ihn wieder frei, um dort weiterzumachen`,
    choose: 'Ordner wählen',
    another: 'Anderen Ordner wählen',
    resume: ({ name }) => `${name} wieder benutzen`
  },
  intro: {
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
    open: 'Nichts davon müssen Sie uns glauben: es sind libp2p, WebRTC und Helia, und die Teile, die zu diesem Handschlag gehören, liegen offen unter NiKrause/libp2p-webrtc-qr.'
  }
}
