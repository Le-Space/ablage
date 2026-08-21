/**
 * This app's own text, English.
 *
 * The elements' text is not here - the library carries it in both languages.
 * What belongs here is what this app says in its own voice.
 */
export default {
  page: {
    title: 'ablage',
    lede: 'A folder that stays the same on two devices. No account, nothing in the middle.'
  },
  compact: {
    label: 'Short code — one code instead of a sequence. Experimental.',
    detail: 'Packed <a href="https://magarcia.github.io/qwbp/spec.html" target="_blank" rel="noreferrer">QWBP</a>-style, but signed rather than bare — so it is not wire-compatible with QWBP itself.'
  },
    music: {
      toggle: 'Play waiting music',
      piece: 'Mozart, Die Zauberflöte — “Dies Bildnis ist bezaubernd schön”, sung by Emile Cossira in 1903. Public domain in every layer: the composition, the performance and the recording.',
      blocked: 'This browser would not start the audio, so this page has nothing keeping it awake — leaving the app to send the link may end the invite before the other device answers.',
      why: 'It is not decoration. A phone suspends a silent page within seconds of you leaving for a messenger, and that would close the connection you are setting up — audible playback is what keeps this page running while you send the link.'
    },
  lang: { label: 'Language' },
  view: { label: 'View', simple: 'Simple', technical: 'Technical' },
  language: { label: 'Language' },
  link: {
    heading: 'This device and the other one',
    idle: 'Not connected yet.',
    invite: 'Show my code',
    scan: 'Scan their code',
    fold: 'Or send it as a link',
    copy: 'Copy',
    copied: 'Copied',
    making: 'Making a code…',
    waiting: 'Waiting for the other device to answer.',
    answering: 'Answering…',
    showBack: 'Show this back to the other device.',
    connected: 'Connected. Changes travel directly between the two devices.',
    gone: 'The other device went away. Show a code to reconnect.',
    fromLink: 'Answering the invite you opened…',
    modalTitle: 'Show this to the other device',
    pasteSummary: 'They sent the reply as text',
    pasteLabel: 'Paste their reply here',
    pasteUse: 'Use this reply',
    pasteBad: 'That does not look like a reply. A reply link contains #r=.',
    scanReply: 'Scan their reply',
    cameraHint: 'Their camera opens the same link — or send it to them.'
  },
  files: {
    heading: 'Files',
    drop: 'Drop files or a folder here, or ',
    choose: 'choose them',
    empty: 'Nothing here yet.',
    remove: 'Remove',
    size: ({ bytes }) => `${bytes} bytes`
  },
  folder: {
    private: "Working in this browser's private storage",
    syncing: ({ name }) => `Syncing ${name}`,
    remembered: ({ name }) => `${name} is remembered — give it back to continue there`,
    choose: 'Choose a folder',
    another: 'Choose another folder',
    resume: ({ name }) => `Use ${name} again`
  },
  intro: {
    what: 'This is a folder shared between two of your devices. There is no account, and no server in the middle holding your files.',
    how: 'Show the code on this screen to the other device, or send it the link. Once the two are connected, whatever you put in the folder appears on both.',
    secure: 'The connection is encrypted end to end. Nobody in between can read what crosses it — not a network operator, not a gateway, and not us.',
    who: 'Both devices have to be open at the same time. Delivery when they are apart is not built yet, and the folder says so rather than pretending.'
  },
  how: {
    heading: 'How that holds up',
    dtls: 'The encryption is DTLS, the same layer a browser uses for any WebRTC connection. It is not something added on top and it cannot be switched off.',
    signed: 'What the QR code carries is signed with this device\u2019s own key, and the signature covers the certificate fingerprint of the connection. So the encrypted channel is bound to the device you scanned — swapping in another one invalidates the signature before anything is dialled.',
    bytes: 'The file contents travel over bitswap on that same connection, addressed by their content hash. Only the list of paths and hashes is shared as a document; the bytes are never inside it.',
    music: 'When you show a code, a 1903 recording of Mozart starts playing. It is not decoration: a page playing audible audio is one a phone will not suspend, and sending the link means leaving this app. Silence would not do — a stream the browser judges inaudible stops counting as playback.',
    open: 'None of this is ours to be trusted about: it is libp2p, WebRTC and Helia, and the parts specific to this handshake are in the open at NiKrause/libp2p-webrtc-qr.'
  }
}
