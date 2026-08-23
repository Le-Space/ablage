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
  view: {
    switchToTechnical: 'Show the technical detail',
    switchToSimple: 'Hide the technical detail', label: 'View', simple: 'Simple', technical: 'Technical' },
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
    myPeer: ({ id }) => `This device: ${id}`,
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
  admit: {
    title: 'A device wants to sync with this folder',
    body: 'It reached you through a relay rather than by scanning your code, so nobody has agreed to this yet. Letting it sync means it can add, change and delete files in the folder this device is working in.',
    remember: 'Remember this device',
    yes: 'Let it sync',
    no: 'Refuse',
    refused: 'Refused — that device was not let into this folder.',
    admitted: 'Syncing with a device that reached you through a relay.'
  },
  foot: { legal: 'Imprint & privacy' },
  folder: {
    // The distinction the code deliberately cannot make. Both are a
    // `FileSystemDirectoryHandle`, so the interface has to say which one this
    // is - a person who thinks their files are in ~/Documents when they are in
    // the browser profile finds out when they clear the browser.
    onDisk: ({ name }) => `On your disk: ${name}`,
    onDiskDetail: 'These are your real files. What appears here appears in your file manager, and what you delete there disappears here.',
    inBrowser: 'Inside this browser — not a folder on your disk',
    inBrowserDetail: 'No file manager can see these files, and clearing this browser\u2019s data deletes them. Choose a folder to work in your own files instead.',
    grant: 'Choosing a folder lets ablage read and write in that folder and nowhere else. You can withdraw it in the browser\u2019s settings for this site, and the browser may ask again after a restart.',
    noPicker: 'Only Chromium-based browsers can open a folder on your disk. Here, ablage works in its own storage inside the browser.',
    syncing: ({ name }) => `Syncing ${name}`,
    private: "Working in this browser's private storage",
    remembered: ({ name }) => `${name} is remembered, but this browser dropped the permission — give it back to continue there`,
    notWhileConnected: 'Disconnect first — changing folders while a device is connected would need that device asked what the change means for it, and that is not built yet.',
    choose: 'Choose a folder',
    another: 'Choose another folder',
    resume: ({ name }) => `Use ${name} again`
  },
  peers: {
    heading: 'Devices out there',
    heard: 'heard on the relay',
    connected: 'connected',
    share: 'Ask to share',
    asking: ({ id }) => `Asked ${id} — waiting for an answer`,
    refused: ({ id }) => `${id} did not accept`
  },
  relay: {
    onNextStart: 'A relay will be used the next time this page is opened — the connection settings are fixed when the app starts.',
    off: 'No relay. This device can only be reached by somebody scanning its code.'
  },
  share: {
    askTitle: 'Send this folder to the connected devices?',
    askBody: ({ count, name }) => `${count === 1 ? 'One device is' : `${count} devices are`} connected. Sending means the contents of ${name} appear there; keeping it means this device works on its own until it disconnects.`,
    yes: 'Send it',
    no: 'Keep it to this device',
    stopped: 'Working on this device alone — the connected devices were not sent this folder.'
  },
  switched: {
    title: 'The other device switched folders',
    body: ({ name }) => `It is now working in a folder called ${name}, which is not the one you were sharing.`,
    follow: 'Follow it here',
    keep: 'Keep my folder',
    rest: 'Two more answers — using a folder you already have, and taking the contents once without syncing — are not built yet.',
    followed: ({ name }) => `Following ${name}`,
    kept: 'Kept this folder — the other device is working somewhere else now.'
  },
  intro: {
    experimental: '<strong>Highly experimental — do not use this for anything you cannot lose.</strong> It is a working demonstration, not a backup: the format may change, and a folder here is not a copy of anything.',
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
