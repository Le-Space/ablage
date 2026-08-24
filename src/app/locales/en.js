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
  brand: { home: 'Le-Space — who made this (opens a new tab, so this page keeps its connections)' },
  awake: {
    toggle: 'Keep the screen awake',
    why: 'A phone that dozes off drops the connection, and a transfer in progress simply stops. While this is on and this page is on screen, the screen stays lit — which costs battery, so it is off until you ask.',
    unsupported: 'This browser cannot hold the screen awake. Leaving the page open and the screen lit by hand is the only thing that keeps a long transfer going here.'
  },
  lang: { label: 'Language' },
  view: {
    switchToTechnical: 'Show the technical detail',
    switchToSimple: 'Hide the technical detail', label: 'View', simple: 'Simple', technical: 'Technical' },
  language: { label: 'Language' },
  link: {
    heading: 'This device and the other one',
    idle: 'Not connected yet.',
    pairSummary: 'Pair by code, with nothing in between',
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
  privacy: {
    title: 'What leaves this device',
    sub: 'Answered honestly, including the part that is not solved yet.',
    close: 'Close',

    leaves: {
      q: 'What actually leaves this device?',
      a: `<p>Two things, and only to a device you agreed to sync with: <strong>the list of files</strong> — names, sizes and a content address for each — and <strong>the file contents themselves</strong>.</p>
<p>There is no account, no server holding your folder and no copy kept anywhere for you. This page is a static bundle; it has nowhere to send anything to.</p>
<p>Everything travels inside an encrypted connection, and the two devices are the only ones holding the keys. Which cipher does the work depends on the path: WebRTC's own DTLS when they are connected directly, Noise when everything goes through a relay. It is never both — one layer per connection.</p>`
    },

    relay: {
      q: 'If I switch the relay on, what can it see?',
      a: `<p><strong>Not your files.</strong> A relay forwards bytes it cannot decrypt — that is what makes it safe to use somebody else's.</p>
<p>It does see <em>that you are there</em>, which is not nothing: your device's public key, the addresses it announces, which other device you talk to, when, for how long, and roughly how much. That is a record of your habits even without a single filename in it.</p>
<p>Whenever the two devices can reach each other directly, they stop using the relay for the transfer and it drops out of the path. If they cannot, everything keeps working through it.</p>
<p>With the relay switched off, none of this exists: the app makes no outbound call at all until somebody scans a code.</p>`
    },

    reading: {
      q: 'Could somebody read or copy my files without permission?',
      a: `<p><strong>Today, with the relay on: yes, in one narrow case — and we measured it rather than guessed.</strong></p>
<p>A device that wants to sync has to be let in: it appears in a dialog and you answer it. That gate covers the syncing itself. It does <em>not</em> cover the separate channel the file contents travel on, which will hand a block to any device that asks for it by its content address.</p>
<p>A content address is a hash of the file. So somebody would need either to have been let in once before, or to already have a copy of the exact file and be checking whether you have it too. They cannot browse, list or search your folder, and no address is published anywhere — this app deliberately leaves out the public gateways and lookup network that would make one findable.</p>
<p>It is still a hole, it is ours, and it is tracked as <a href="https://github.com/Le-Space/ablage/issues/43" target="_blank" rel="noopener noreferrer">issue #43</a>.</p>`
    },

    meeting: {
      q: 'How do two devices find each other, and who else is listening?',
      a: `<p>Devices announce themselves on shared public channels — the same ones other apps built on this relay use. An announcement carries a public key and network addresses; it carries nothing about you, your folder or your files.</p>
<p>Anyone on those channels can see who is present. That is how the device list you see is built, and everyone else on it can build the same list.</p>
<p>Pairing by scanning a code uses none of this.</p>`
    },

    rest: {
      q: 'Where do the files sit on my device?',
      a: `<p>In the folder you picked, as ordinary files. If your browser cannot open a folder, they sit in the browser's own storage instead — and clearing your browser data deletes them, which the file card says out loud.</p>
<p><strong>They are not encrypted at rest.</strong> Anyone with your unlocked device has them, exactly as with any other folder. Full-disk encryption is the thing that helps here, and it is your operating system's job rather than this app's.</p>
<p>A few small settings live in the browser too: which devices you chose to remember, which relay answered last, and your language and view choices.</p>`
    },

    remember: {
      q: 'What does "remember this device" do?',
      a: `<p>It skips the question next time. The device is written down in this browser and is let in without asking again, for as long as the entry is there.</p>
<p>The box is unticked on purpose — the safer answer is the one you get by not reading carefully.</p>
<p>There is currently <strong>no screen that shows the list or takes a device back off it</strong>. Clearing the browser's data for this site clears it. That gap is part of <a href="https://github.com/Le-Space/ablage/issues/43" target="_blank" rel="noopener noreferrer">issue #43</a>.</p>`
    }
  },
  foot: { legal: 'Imprint & privacy', privacy: 'Privacy' },
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
  preview: { counted: ({ name, at, of }) => `${name} — ${at} of ${of}` },
  peers: {
    heading: 'Devices out there',
    filter: 'Filter by peer id',
    noMatch: 'No device here matches that.',
    heard: 'heard on the relay',
    connected: 'connected',
    share: 'Ask to share',
    asking: ({ id }) => `Asked ${id} — waiting for an answer`,
    noRelay: 'Nobody to show. Devices can only find each other through a relay, and this one is switched off — the introduction is where to turn it on.',
    empty: 'Nobody has called out yet. Devices appear here a few seconds after they connect to a relay.',
    unreachable: ({ id }) => `${id} could not be reached`,
    notAnAddress: 'That is neither a peer id nor an address.',
    callSummary: 'Call a device that is not listed',
    callPlaceholder: 'Peer id or multiaddress',
    call: 'Call',
    callHint: 'An address beginning with / works for a device this app has never heard of. A bare peer id only works for one it already knows an address for.',
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
    select: 'Use a folder I already have',
    selected: ({ name }) => `Working in ${name}, kept in step with the other device`,
    once: 'Take the contents once',
    taking: 'Taking the contents once. Nothing after this arrives on its own.',
    took: ({ count }) => `Took ${count === 1 ? 'one file' : `${count} files`}. This folder is no longer kept in step with that device.`,
    followed: ({ name }) => `Following ${name}`,
    kept: 'Kept this folder — the other device is working somewhere else now.'
  },
  intro: {
    start: "Let's go",
    start: "Let's go",
    experimental: '<strong>Highly experimental — do not use this for anything you cannot lose.</strong> It is a working demonstration, not a backup: the format may change, and a folder here is not a copy of anything.',
    what: 'This is a folder shared between two of your devices. There is no account, and no server in the middle holding your files.',
    how: 'Show the code on this screen to the other device, or send it the link. Once the two are connected, whatever you put in the folder appears on both.',
    howRelay: 'A relay introduces the two devices to each other, and nothing else. Both call out on the same meeting place; each then appears in the other\u2019s list, and one asks the other to share. The relay never sees what crosses - it hands over an address and steps aside.',
    secure: 'The connection is encrypted end to end. Nobody in between can read what crosses it — not a network operator, not a gateway, and not us.',
    who: 'Both devices have to be open at the same time. Delivery when they are apart is not built yet, and the folder says so rather than pretending.'
  },
  how: {
    heading: 'How that holds up',
    dtls: 'The encryption is DTLS, the same layer a browser uses for any WebRTC connection. It is not something added on top and it cannot be switched off.',
    signed: 'What the QR code carries is signed with this device\u2019s own key, and the signature covers the certificate fingerprint of the connection. So the encrypted channel is bound to the device you scanned — swapping in another one invalidates the signature before anything is dialled.',
    relay: `Through a relay, the two devices negotiate Noise between themselves and the relay forwards bytes it cannot decrypt. Multiplexing sits above that encryption, so it cannot see the protocol names either — it cannot tell a file transfer from a list update. What it does see is who talks to whom, when, for how long and roughly how much.`,
    layers: `Not doubly encrypted: libp2p picks one layer per connection. On WebRTC it passes skipEncryption and leaves Noise out, because DTLS already did the work — a connection reports its encryption as 'native' there and '/noise' over a relayed WebSocket. The TLS to the relay itself is a third, separate thing: it hides the traffic from the network between you and the relay, and the relay terminates it.`,
    gap: `The dialog that lets a device in gates the syncing, and not the channel the bytes travel on: bitswap will hand a block to any connected peer that names its content address. Measured, not assumed, and open as <a href="https://github.com/Le-Space/ablage/issues/43" target="_blank" rel="noopener noreferrer">issue #43</a>.`,
    bytes: 'The file contents travel over bitswap on that same connection, addressed by their content hash. Only the list of paths and hashes is shared as a document; the bytes are never inside it.',
    music: 'When you show a code, a 1903 recording of Mozart starts playing. It is not decoration: a page playing audible audio is one a phone will not suspend, and sending the link means leaving this app. Silence would not do — a stream the browser judges inaudible stops counting as playback.',
    open: 'None of this is ours to be trusted about: it is libp2p, WebRTC and Helia, and the parts specific to this handshake are in the open at NiKrause/libp2p-webrtc-qr.'
  }
}
