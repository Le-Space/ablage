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
    who: 'Both devices have to be open at the same time. Delivery when they are apart is not built yet, and the folder says so rather than pretending.'
  }
}
