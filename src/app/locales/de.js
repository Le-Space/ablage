/**
 * Der eigene Text dieser App, deutsch. Siehe `en.js` für den Zuschnitt.
 */
export default {
  page: {
    title: 'ablage',
    lede: 'Ein Ordner, der auf zwei Geräten derselbe bleibt. Kein Konto, nichts dazwischen.'
  },
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
    who: 'Beide Geräte müssen gleichzeitig offen sein. Die Zustellung, wenn sie es nicht sind, ist noch nicht gebaut — und der Ordner sagt das, statt so zu tun.'
  }
}
