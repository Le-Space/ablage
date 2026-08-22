/**
 * The interface. Everything it knows how to do is in the modules below it.
 *
 * The one wording decision worth stating: two devices that have never met are
 * **not connected yet**, never "out of sync" or "pending". They are not in
 * disagreement about anything. Saying otherwise makes the first support
 * question "why does it say pending", and it would be describing a stage as
 * though it were a fault.
 */
import '@le-space/libp2p-webrtc-qr/elements'
import * as Y from 'yjs'

import { createContent } from '../content.js'
import { createPeer } from '../peer.js'
import { reconcile } from '../reconcile.js'
import { baseline } from '../sync/baseline.js'
import { fileIndex } from '../sync/file-index.js'
import { Provider } from '../sync/provider.js'
import { openStorage } from '../storage/index.js'
import { createKeepAlive } from '@le-space/libp2p-webrtc-qr'
import { createIntroPolicy } from '@le-space/libp2p-webrtc-qr/elements'
import { elementStrings, initialLocale, locale, setLocale, t, translateDocument } from './i18n.js'
import { fileIcon, folderIcon, mark } from './icons.js'
import { tree } from './tree.js'
import { applyMusicChoice, musicWanted } from './music.js'
import { applyViewMode, isSimple } from './view-mode.js'
import { askForFolder, canPickFolder, pickFolder } from '../storage/handle.js'
import { watchFolder } from '../storage/watch.js'

const $ = id => document.getElementById(id)
const encode = text => new TextEncoder().encode(text)
const decode = bytes => new TextDecoder().decode(bytes)

const inviteButton = $('invite')
const scanButton = $('scan')
const scanReplyButton = $('scan-reply')
const copyButton = $('copy')
const inviteBox = $('invite-box')
const inviteLink = $('invite-link')
const codeEl = $('code')
const scannerEl = $('scanner')
const replyText = $('reply-text')
const useReplyButton = $('use-reply')
const pasteFold = $('paste-fold')
const stateEl = $('link-state')
const networkEl = $('network')
const filesEl = $('files')
const emptyEl = $('files-empty')
const dropEl = $('drop')
const pickEl = $('pick')
const pickButton = $('pick-folder')
const folderEl = $('folder')
// Two flags and one button, in the header and again in the dialog. The dialog
// needs its own pair because the header sits behind its overlay, and that is
// the first thing anybody sees.
const localeButtons = { de: $('locale-de'), en: $('locale-en') }
const introLocaleButtons = { de: $('intro-locale-de'), en: $('intro-locale-en') }
const introEl = $('intro')
const viewModeEl = $('view-mode')
const compactEl = $('compact-payload')
const introViewEl = $('intro-view')
const musicEl = $('music')
const musicNowEl = $('music-now')
const musicWhyEl = $('music-why')
const folderDetailEl = $('folder-detail')
const folderNoteEl = $('folder-note')
const markEl = $('mark')

// Both are replaced when the folder changes: the index describes *a* folder,
// and after a switch it describes the wrong one. See `switchToFolder` below.
let doc = new Y.Doc()
let index = fileIndex(doc)
// What this device last agreed with the other one about - the third value
// that tells "I edited it" apart from "we both edited it".
const base = baseline()

let storage = null
let content = null
let peer = null
/**
 * One provider per connected peer, keyed by peer id.
 *
 * It was a single slot, which was wrong twice over. A second connection
 * replaced the first with no disconnect and no message - and worse, the first
 * stream's read loop went on calling the *module's* `provider`, so messages
 * arriving from one peer were fed into the channel talking to another.
 *
 * The `Provider` was already built for this: `origin === this` suppresses the
 * echo only back to the peer an update came from, so a change from A is
 * forwarded to B through this device and never returned to A.
 */
const peers = new Map()

/** Whether anybody is listening to the shared document right now. */
const connected = () => peers.size > 0
let pending = Promise.resolve()

/**
 * Serialised. Two passes at once would both see the same disagreement and both
 * act on it - and the second would be acting on a world that no longer exists.
 */
function pass () {
  pending = pending.then(() => reconcile({ index, storage, content, base })).then(render, report)
  return pending
}

function setState (text, kind) {
  stateEl.textContent = text
  stateEl.className = `state is-${kind}`
}

function report (error) {
  setState(error?.message ?? String(error), 'idle')
}

/** Folders the person collapsed. Open is the default; closing is the choice. */
const collapsed = new Set()

function fileRow (node) {
  const li = document.createElement('li')
  const name = document.createElement('span')
  const size = document.createElement('span')
  const remove = document.createElement('button')

  li.className = 'file'
  li.insertAdjacentHTML('afterbegin', fileIcon())
  name.className = 'name'
  name.textContent = node.name
  size.className = 'size'
  size.textContent = t('files.size', { bytes: node.size ?? 0 })
  remove.type = 'button'
  remove.textContent = t('files.remove')
  remove.addEventListener('click', async () => {
    await storage.remove(node.path)
    index.remove(node.path)
    await pass()
  })

  li.append(name, size, remove)
  return li
}

function folderRow (node) {
  const li = document.createElement('li')
  const head = document.createElement('button')
  const shut = collapsed.has(node.path)

  li.className = 'folder'
  head.type = 'button'
  head.className = 'folder-head'
  head.setAttribute('aria-expanded', String(!shut))
  // The chevron says open or shut; the folder mark says what kind of thing this
  // is. Two different questions, so two different marks rather than one glyph
  // doing both jobs badly.
  head.innerHTML = `<span class="chev">${shut ? '▸' : '▾'}</span>${folderIcon()}<span>${node.name}</span>`
  head.addEventListener('click', () => {
    // Toggling is a view, not a change: no reconciliation, no network.
    if (shut) collapsed.delete(node.path)
    else collapsed.add(node.path)
    render()
  })

  li.append(head)

  if (!shut) {
    li.append(list(node.children))
  }

  return li
}

function list (nodes) {
  const ul = document.createElement('ul')

  ul.className = 'files'
  ul.append(...nodes.map(node => node.kind === 'folder' ? folderRow(node) : fileRow(node)))

  return ul
}

async function render () {
  const entries = index.paths().sort().map(path => ({ path, size: index.get(path)?.size }))

  filesEl.replaceChildren(...list(tree(entries)).childNodes)
  emptyEl.hidden = entries.length > 0
}

/**
 * Both halves of a connection end here, whichever side dialled.
 *
 * @param {string} peerId who is on the other end. Keyed by it so a reconnection
 *   replaces that peer's provider rather than accumulating one per attempt.
 */
function attach (stream, peerId) {
  const send = message => stream.send(encode(JSON.stringify(message)))

  // Its own binding, read by its own loop below. Reading the shared one was
  // how a second peer took over the first one's messages.
  const provider = new Provider(doc, send)

  // A reconnection to the same peer: the old provider still holds a listener on
  // the document and would keep posting into a closed stream.
  peers.get(peerId)?.destroy()
  peers.set(peerId, provider)

  setState(t('link.connected'), 'connected')

  // Both sides pass through here, which is why it belongs here rather than in
  // either handler. The scanning side closes its own box the moment it scans;
  // the *answering* side has no such moment - it puts its reply on screen and
  // then nothing happens to it, because the connection is established by the
  // other device dialling in. Its code sat there after the two were already
  // syncing, which reads as a handshake that did not finish.
  //
  // Closing a dialog that is not open is a no-op, so the scanning side is
  // unaffected. The `close` listener above stops the waiting music, which is
  // the other thing that should end here.
  inviteBox.close()

  ;(async () => {
    for await (const data of stream) {
      provider.receive(JSON.parse(decode(data.subarray?.() ?? data)))
      // A remote change is a reason to look at storage again.
      pass()
    }
  })()
    .catch(report)
    .finally(() => {
      // Only this peer's, and only if it is still the current one - a
      // reconnection may have put a newer provider under the same key while
      // this loop was ending.
      if (peers.get(peerId) === provider) {
        provider.destroy()
        peers.delete(peerId)
      }

      // The others are still there; saying "gone" while two peers remain would
      // be describing this stream rather than the state of the folder.
      if (!connected()) setState(t('link.gone'), 'idle')
    })

  return provider
}

async function start () {
  const opened = await openStorage()

  storage = opened.store
  showFolder(opened)
  peer = await createPeer({ onSyncStream: (stream, peerId) => attach(stream, peerId) })
  content = await createContent(peer.node)

  // The index changing is the other trigger - a local write is the first.
  index.observe(() => render())

  // The node is up, so the two controls that need it become pressable. Before
  // this line they are not, and that is the point: they call `peer` directly.
  inviteButton.disabled = false
  scanButton.disabled = false

  networkEl.hidden = false
  networkEl.probe?.()

  await pass()
}

// ---- language --------------------------------------------------------------

/**
 * Put the whole page in one language.
 *
 * The elements are handed their tables rather than reaching for a locale
 * themselves: `strings` is the seam the library offers, and a library that read
 * a global would be a library with an opinion about how an app stores one.
 */
function applyLocale (next) {
  setLocale(next)

  const strings = elementStrings()
  codeEl.strings = strings.invite
  scannerEl.strings = strings.scanner
  networkEl.strings = strings.status
  introEl.strings = strings.intro

  document.documentElement.lang = locale()
  // `aria-pressed` rather than a class, because that is what a screen reader
  // reads out; the dimming in the stylesheet follows from it.
  for (const buttons of [localeButtons, introLocaleButtons]) {
    for (const [code, button] of Object.entries(buttons)) {
      button.setAttribute('aria-pressed', String(code === locale()))
    }
  }
  // The dialog carries its own pair because the header is behind the overlay
  // while it is open. Written from here rather than by listening to the header,
  // so neither select is the master and there is no loop to break.
  translateDocument()

  // The button names where it goes, not where it is: a control labelled with
  // its current state reads as a claim rather than an offer.
  for (const button of [viewModeEl, introViewEl]) {
    button.textContent = isSimple() ? t('view.technical') : t('view.simple')
    button.title = isSimple() ? t('view.switchToTechnical') : t('view.switchToSimple')
    button.setAttribute('aria-pressed', String(!isSimple()))
  }

  // Written from JavaScript rather than marked in the markup, so `data-i18n`
  // never reaches it.
  showFolder()

  // Rows carry their own text and are not repainted by anything else.
  render()
}

for (const buttons of [localeButtons, introLocaleButtons]) {
  for (const [code, button] of Object.entries(buttons)) {
    button.addEventListener('click', () => applyLocale(code))
  }
}

// ---- how much detail -------------------------------------------------------

/**
 * One control for two things: what this page shows, and whether the library's
 * introduction carries its own caveats. Two switches for the same question
 * would be one too many.
 */
function applyView (next) {
  applyViewMode(next)
  introEl.technical = !isSimple()
}

// A toggle takes no value from its event - it flips whatever is current.
const viewChanged = () => {
  applyView(!isSimple())
  // The button's own label is one of the app's words, so the pass that writes
  // the language writes it too. A second code path for it would drift.
  applyLocale(locale())
}

viewModeEl.addEventListener('click', viewChanged)
introViewEl.addEventListener('click', viewChanged)

markEl.innerHTML = mark()

// ---- the introduction ------------------------------------------------------

const introPolicy = createIntroPolicy({ storageKey: 'ablage.introSeen' })

introEl.addEventListener('close', event => {
  if (event.detail.remember) introPolicy.remember()
})

// ---- which folder ----------------------------------------------------------

let unwatch = null
// The folder line carries its own text and is not repainted by anything else,
// so a language change has to be told - the same shape as the copy button in
// libp2p-webrtc-qr's demo, and the same trap.
let folderState = { kind: 'private', pending: null }

/**
 * Say which folder this is, and offer a real one where that is possible.
 *
 * Three states, and the middle one is the reason this is not a single button:
 * a handle restored from a previous visit is remembered but its **permission is
 * not**, and asking for it again needs a user gesture. A page that demanded it
 * on load would be asking before it had said why.
 */
function showFolder (state = folderState) {
  const { kind, handle, pending } = state

  folderState = state
  unwatch?.()
  unwatch = null

  // What this browser can do at all, before the control that does it.
  folderNoteEl.textContent = canPickFolder() ? t('folder.grant') : t('folder.noPicker')

  if (kind === 'picked') {
    // Named for what it is rather than for what the app is doing with it:
    // "Syncing Documents" says nothing about whose Documents, or where.
    folderEl.textContent = t('folder.onDisk', { name: handle.name })
    folderEl.dataset.place = 'disk'
    folderDetailEl.textContent = t('folder.onDiskDetail')
    pickButton.textContent = t('folder.another')

    // Only a picked folder can change behind the app's back. Nothing outside it
    // can write to the origin's private one.
    unwatch = watchFolder(handle, () => pass())
    return
  }

  folderEl.textContent = pending != null
    ? t('folder.remembered', { name: pending.name })
    : t('folder.inBrowser')
  folderEl.dataset.place = 'browser'
  folderDetailEl.textContent = t('folder.inBrowserDetail')

  pickButton.textContent = pending != null ? t('folder.resume', { name: pending.name }) : t('folder.choose')
  pickButton.dataset.resume = pending != null ? 'yes' : ''
}

pickButton.hidden = !canPickFolder()

/**
 * Start again, describing the folder this device is now working in.
 *
 * The index describes *a* folder. After a switch it describes the wrong one,
 * and the reconciler acts on it: every entry it holds is missing from the new
 * folder, so it fetches the bytes by address and **writes them there**. A
 * folder chosen because it was empty does not stay empty - measured, not
 * feared: switching to a fresh directory copied the previous folder's file into
 * it.
 *
 * A fresh document rather than emptying this one. `index.remove` writes a
 * tombstone, which is right for a deleted file and catastrophic here: with a
 * peer attached, emptying the index would send a deletion for every path and
 * the other device would act on it. The bug being fixed would become a worse
 * one pointed at somebody else's disk.
 *
 * The baseline goes too. What this device last agreed about `notes/todo.md`
 * says nothing once that path means a different file.
 */
function startFreshIndex () {
  doc = new Y.Doc()
  index = fileIndex(doc)
  index.observe(() => render())
  base.clear()
}

pickButton.addEventListener('click', async () => {
  // Refused rather than done badly. Switching under an attached peer is issue
  // #8 §2 and §3: it needs somebody to be asked what the switch means for the
  // other side, and there are four reasonable answers. Until that exists, the
  // honest thing is to say so - not to guess, and not to pour one folder into
  // another while somebody watches.
  if (connected()) {
    setState(t('folder.notWhileConnected'), 'waiting')
    return
  }

  try {
    // Both paths need the gesture this handler is: picking opens a dialog, and
    // re-granting permission on a remembered handle does too.
    const restored = pickButton.dataset.resume === 'yes' ? (await openStorage()).pending : null
    const handle = restored != null && await askForFolder(restored) ? restored : await pickFolder()

    storage = (await openStorage()).store
    startFreshIndex()
    showFolder({ kind: 'picked', handle })
    await pass()
  } catch (error) {
    // The picker throws AbortError when somebody closes it, which is an answer
    // rather than a failure.
    if (error?.name !== 'AbortError') report(error)
  }
})

// ---- adding files ----------------------------------------------------------

async function addFiles (fileList) {
  for (const file of fileList) {
    // `webkitRelativePath` is what a chosen *folder* fills in - without it a
    // whole directory would arrive as a heap of files at the top level, and the
    // nesting the index was built for would never occur.
    await storage.write(file.webkitRelativePath || file.name, new Uint8Array(await file.arrayBuffer()))
  }

  await pass()
}

pickEl.addEventListener('change', () => addFiles(pickEl.files))
dropEl.addEventListener('click', () => pickEl.click())

for (const type of ['dragenter', 'dragover']) {
  dropEl.addEventListener(type, event => {
    event.preventDefault()
    dropEl.classList.add('is-over')
  })
}

for (const type of ['dragleave', 'drop']) {
  dropEl.addEventListener(type, event => {
    event.preventDefault()
    dropEl.classList.remove('is-over')
  })
}

/**
 * A dropped folder is not in `files` - it is an entry in `items`, and walking it
 * is the only way to reach what is inside. Without this, dragging a folder in
 * silently does nothing at all, which reads as the app being broken.
 */
async function walkEntry (entry, prefix = '') {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject))
    const path = prefix ? `${prefix}/${file.name}` : file.name

    await storage.write(path, new Uint8Array(await file.arrayBuffer()))
    return
  }

  const reader = entry.createReader()

  // `readEntries` returns a page at a time and signals the end with an empty
  // batch. Reading it once gives the first hundred and quietly loses the rest.
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))

    if (batch.length === 0) break

    for (const child of batch) {
      await walkEntry(child, prefix ? `${prefix}/${entry.name}` : entry.name)
    }
  }
}

dropEl.addEventListener('drop', async event => {
  const entries = [...event.dataTransfer.items]
    .map(item => item.webkitGetAsEntry?.())
    .filter(Boolean)

  if (entries.some(entry => entry.isDirectory)) {
    for (const entry of entries) await walkEntry(entry)
    await pass()
    return
  }

  await addFiles(event.dataTransfer.files)
})

// ---- keeping this page alive while somebody sends the link ------------------

/**
 * Audible on purpose, and the reason is the whole point of it.
 *
 * Sending an invite means leaving this app for a messenger, and a backgrounded
 * page has its connection closed out from under it seconds later
 * (libp2p-webrtc-qr#65). A page playing audible audio is one a phone will not
 * suspend - and silence does not work, because a stream the browser judges
 * inaudible stops counting as playback at all.
 *
 * The recording is a 1903 phonogram, chosen so that every layer is free rather
 * than only the tune: `public/audio/README.md` works through composition,
 * performance and phonogram rights, and why the obvious Beethoven choice failed
 * on the third one.
 *
 * Whether this actually survives an app switch on Android is still unsettled -
 * it is the experiment in AGENTS.md, and this is what makes it answerable.
 */
const keepAlive = createKeepAlive({
  track: 'audio/zauberfloete-dies-bildnis-cossira-1903.mp3',
  metadata: {
    title: 'Waiting for the other device',
    artist: 'Mozart, Die Zauberflöte - Emile Cossira, 1903'
  }
})

/**
 * Must be called from inside the gesture and before any await: an `AudioContext`
 * starts suspended under the autoplay policy, and resuming one outside a gesture
 * is refused. By the time an offer has gathered its candidates there is no
 * gesture left to spend.
 */
/**
 * Both outcomes are worth a sentence; only one of them is good news.
 *
 * The same paragraph either way, because an element appearing inside a centred
 * `<dialog>` moves everything above it - see the note in the markup.
 */
function sayWhatTheSoundIs (playing) {
  musicWhyEl.dataset.i18n = playing ? 'music.why' : 'music.blocked'
  musicWhyEl.textContent = t(playing ? 'music.why' : 'music.blocked')
  musicWhyEl.classList.toggle('blocked', !playing)
}

function startKeepAlive () {
  if (!musicWanted()) return

  // Reported on what actually happened rather than on what was asked for.
  // Whether audio can play is a question about the device's audio stack - and
  // a browser that refused leaves this page with nothing keeping it awake,
  // which is exactly the failure the feature exists to prevent and therefore
  // the last thing to stay quiet about.
  keepAlive.start()
    .then(sayWhatTheSoundIs)
    .catch(() => sayWhatTheSoundIs(false))
}

musicEl.addEventListener('change', event => {
  applyMusicChoice(event.target.checked)

  if (!event.target.checked) {
    keepAlive.stop().catch(() => {})
    musicNowEl.hidden = true
    return
  }

  musicNowEl.hidden = false

  // Ticking the box is itself a gesture, which is the only moment the autoplay
  // policy allows audio to start - so a code already on screen gets its music
  // now rather than on the next invite.
  if (inviteBox.open) startKeepAlive()
})

/**
 * The answering side never gets the gesture the offering side does - opening an
 * invite link renders the reply without anybody pressing anything, and that
 * person has the harder job, because they are the one who has to leave twice.
 * So take the next touch they make, whatever it was for.
 */
document.addEventListener('pointerdown', () => {
  if (keepAlive.running || !inviteBox.open) return

  startKeepAlive()
}, { capture: true, passive: true })

// Both endings at once: the code is off the screen, so audio still playing
// would hold the CPU awake for nothing and say we are working on something that
// finished.
inviteBox.addEventListener('close', () => {
  keepAlive.stop().catch(() => {})
})

// ---- pairing ---------------------------------------------------------------

inviteButton.addEventListener('click', async () => {
  try {
    // First, and before the await below: this is the gesture, and there is not
    // another one coming.
    startKeepAlive()
    setState(t('link.making'), 'waiting')
    // Read per invite rather than held in a variable: the box can be ticked
    // between two codes, and whoever ticks it means the next one.
    const offer = await peer.createOffer({ compact: compactEl.checked })

    // The code carries the *link*, so the other device's camera app can open it
    // without this page being open there first.
    const url = new URL(window.location.href)
    url.hash = `i=${encodeURIComponent(offer)}`
    inviteLink.value = url.toString()
    codeEl.value = url.toString()

    // Back on, for a device that answered somebody earlier: `scan-reply` is
    // hidden while showing a *reply*, and without this it stayed hidden for the
    // rest of the session - so the second pairing had no way to finish.
    scanReplyButton.hidden = false
    pasteFold.hidden = false
    inviteBox.showModal()
    setState(t('link.waiting'), 'waiting')
  } catch (error) {
    report(error)
  }
})

/**
 * A reply, however it reached this device - a camera, or the field in the
 * dialog. One function, because there is one thing to do with it and two ways
 * in, and the second was written months after the first everywhere it is two.
 */
async function acceptReply (text) {
  inviteBox.close()

  try {
    const peerId = await peer.acceptAnswer(payloadOf(text))
    attach(await peer.openSyncStream(peerId), peerId).requestSync()
  } catch (error) {
    report(error)
  }
}

scanReplyButton.addEventListener('click', () => {
  scannerEl.validate = text => ({ ok: text.includes('r=') || text.startsWith('q') })
  scannerEl.open()
  scannerEl.addEventListener('scan', event => {
    scannerEl.close()
    acceptReply(event.detail.text)
  }, { once: true })
})

useReplyButton.addEventListener('click', () => {
  const text = replyText.value.trim()

  if (text === '') return

  // Said here rather than left to `acceptAnswer` to fail: pasting the *invite*
  // back instead of the reply is the easy mistake, and the error from down there
  // would be about a payload rather than about which of two links this is.
  if (!text.includes('r=') && !text.startsWith('q')) {
    setState(t('link.pasteBad'), 'idle')
    return
  }

  replyText.value = ''
  acceptReply(text)
})

scanButton.addEventListener('click', () => {
  scannerEl.open()
  scannerEl.addEventListener('scan', async event => {
    scannerEl.close()

    try {
      setState(t('link.answering'), 'waiting')
      const answer = await peer.acceptOffer(payloadOf(event.detail.text))
      const url = new URL(window.location.href)
      url.hash = `r=${encodeURIComponent(answer)}`

      inviteLink.value = url.toString()
      codeEl.value = url.toString()
      scanReplyButton.hidden = true
      pasteFold.hidden = true
      inviteBox.showModal()
      setState(t('link.showBack'), 'waiting')
    } catch (error) {
      report(error)
    }
  }, { once: true })
})

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copyButton.textContent = t('link.copied')
    setTimeout(() => { copyButton.textContent = t('link.copy') }, 2000)
  } catch {
    // Refused - insecure origin, a permission policy, some mobile browsers. The
    // field beside the button is the answer, so point at it.
    inviteLink.focus()
    inviteLink.select()
  }
})

inviteLink.addEventListener('focus', () => inviteLink.select())

for (const element of document.querySelectorAll('[data-close]')) {
  element.addEventListener('click', () => element.closest('dialog').close())
}

/** Accept a whole link or a bare payload - people paste both. */
function payloadOf (text) {
  try {
    const params = new URLSearchParams(new URL(text.trim()).hash.replace(/^#/, ''))
    return (params.get('i') ?? params.get('r') ?? text).replace(/\s+/g, '')
  } catch {
    return text.trim().replace(/\s+/g, '')
  }
}

/** Somebody arrived by link: answer it without making them press anything. */
async function consumeLink () {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const invite = params.get('i')

  if (invite == null) return

  try {
    setState(t('link.fromLink'), 'waiting')
    const answer = await peer.acceptOffer(decodeURIComponent(invite))
    const url = new URL(window.location.href)
    url.hash = `r=${encodeURIComponent(answer)}`

    inviteLink.value = url.toString()
    codeEl.value = url.toString()
    scanReplyButton.hidden = true
    pasteFold.hidden = true
    inviteBox.showModal()
    setState(t('link.showBack'), 'waiting')
  } catch (error) {
    report(error)
  }
}

/**
 * Somebody who arrived by invite does not get the introduction: they came to
 * accept something, and a dialog stands in front of the only thing they came
 * for. They see it on their next plain visit.
 */
function maybeIntroduce () {
  // `?intro=off` keeps it shut. A modal blocks every click behind it, which is
  // right for a person and fatal for a suite: every spec that clicks anything
  // would wait on a dialog it never asked for. It is in the URL because that is
  // the handle every way of opening a page shares - a fixture reaches one of
  // them. The same trap, and the same answer, as in libp2p-webrtc-qr.
  //
  // Not only a test flag: a screen being shared, or an embedded demo, wants it
  // too.
  if (new URLSearchParams(location.search).get('intro') === 'off') return

  const arrivedViaInvite = window.location.hash.length > 1

  if (introPolicy.shouldOpen({ arrivedViaInvite })) {
    introEl.open().catch(() => {})
  }
}

/**
 * Serve the app itself without a network.
 *
 * Registered on a built site always, and on the dev server only when asked.
 * The worker calls `skipWaiting()` and `clients.claim()`, so leaving it on in
 * development would put it in control partway through any run - and a reload
 * served from a cache of unhashed dev modules is a stale app that looks like a
 * failing test. `?sw=on` is how the offline spec turns it on deliberately.
 *
 * Relative, and it matters: this page is also served from an IPFS gateway under
 * `/ipfs/<cid>/`, where `/sw.js` is the gateway's root and not ours.
 */
if ('serviceWorker' in navigator) {
  const asked = new URLSearchParams(window.location.search).get('sw')

  if (import.meta.env.PROD || asked === 'on') {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // No offline shell, and nothing else changes. Not worth a message: this
      // fails on an insecure origin, which is a way of running the app rather
      // than a fault in it.
    })
  }
}

applyView()
musicEl.checked = applyMusicChoice()
// Hidden only when the music is off, and decided before the first paint so the
// dialog is never seen resizing itself.
musicNowEl.hidden = !musicEl.checked
applyLocale(initialLocale())
start().then(consumeLink).then(maybeIntroduce).catch(report)
