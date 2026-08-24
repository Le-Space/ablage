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
import { looksLikeImage, previews } from './previews.js'
import { tree } from './tree.js'
import { applyMusicChoice, musicWanted } from './music.js'
import { multiaddr } from '@multiformats/multiaddr'
import { findReachableRelays, readRelayOptIn } from '@le-space/libp2p-webrtc-qr'

import { admission, decide } from '../sync/admission.js'
import { bakedRelayAddresses, discoverRelays, relayProbe, rememberRelays, startupRelays } from '../relay-sources.js'
import { peerSet } from '../sync/peer-set.js'
import { sharing } from '../sync/sharing.js'
import { folderIdentity } from '../storage/identity.js'
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
const previewEl = $('preview')
const previewImageEl = $('preview-image')
const previewNameEl = $('preview-name')
const folderDetailEl = $('folder-detail')
const folderNoteEl = $('folder-note')
const myPeerEl = $('my-peer')
const byCodeEl = $('by-code')
const byRelayEl = $('by-relay')
const peersEl = $('peers')
const peerListEl = $('peer-list')
const peersEmptyEl = $('peers-empty')
const peerFilterEl = $('peer-filter')
const peerNoneEl = $('peer-none')
const callAddressEl = $('call-address')
const admitEl = $('admit-ask')
const shareAskEl = $('share-ask')
const switchToldEl = $('switch-told')
const switchToldBodyEl = $('switch-told-body')
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
const peers = peerSet()

/** What this device decided to send to whom. Per peer - see `sharing.js`. */
const shared = sharing()

/**
 * The end, because that is the part that differs.
 *
 * A peer id is 52 characters of base58 and nobody reads it as a name. Every id
 * of the same key type opens with `12D3KooW`, so a list shortened from the
 * front is a column of identical text - it looked tidy and told nobody which
 * device was which.
 *
 * The tail is where the entropy is, and it is also what the filter searches, so
 * what is on screen is what somebody can type.
 */
const shortId = id => `…${id.slice(-10)}`

/**
 * A search field is furniture over three rows and the only way through thirty.
 *
 * Ten because that is about where a list stops being something you read and
 * starts being something you scan - and a peer id is not a name, so scanning
 * does not work at all.
 */
const FILTER_FROM = 10

/** What the search field is holding back. */
let known = []

/** Everyone the meeting place has turned up, and what can be done about them. */
function showPeers (found) {
  known = found

  const needle = peerFilterEl.value.trim().toLowerCase()

  peerFilterEl.hidden = found.length < FILTER_FROM

  // Matched anywhere in the id, not only at the front. Ids of the same key type
  // open with the same characters, so a prefix search would return everything
  // until about the eighth letter - which is not a search.
  const shown = needle === '' ? found : found.filter(({ peerId }) => peerId.toLowerCase().includes(needle))

  peerNoneEl.hidden = !(found.length > 0 && shown.length === 0)

  drawPeers(shown, found)
}

function drawPeers (found, all = found) {
  // Shown even when empty, because "nobody is out there yet" is an answer and a
  // missing panel is not. The line underneath says how long to wait.
  peersEl.hidden = false
  peersEmptyEl.hidden = all.length > 0
  // Two different empty lists. Without a relay there is nowhere to be found, so
  // the line has to say what to switch on - "devices appear a few seconds after
  // they reach a relay" is true and useless to somebody who has not turned one
  // on, which is everybody by default.
  peersEmptyEl.textContent = t(readRelayOptIn(globalThis.localStorage, RELAY_OPT_IN_KEY) ? 'peers.empty' : 'peers.noRelay')
  peerListEl.replaceChildren(...found.map(({ peerId, state }) => {
    const li = document.createElement('li')
    const name = document.createElement('code')
    const how = document.createElement('span')
    const ask = document.createElement('button')

    name.className = 'peer-name'
    name.textContent = shortId(peerId)
    name.title = peerId
    how.className = 'peer-how'
    how.textContent = t(state === 'connected' ? 'peers.connected' : 'peers.heard')
    ask.type = 'button'
    ask.textContent = t('peers.share')
    ask.addEventListener('click', () => askToShare(peerId))

    li.append(name, how, ask)
    return li
  }))
}

/**
 * Ask a device out there whether it will share this folder.
 *
 * Opening the sync stream *is* the request: on the other side it arrives at
 * `node.handle`, and a peer met through a relay lands in the admission dialog
 * rather than being attached. So the half that asks was already built - this is
 * only the half that calls.
 */
async function askToShare (peerId) {
  setState(t('peers.asking', { id: shortId(peerId) }), 'waiting')

  try {
    attach(await peer.openSyncStream(peerId), peerId).requestSync()
  } catch (error) {
    // The stream would not open at all - unreachable, or gone since the list
    // was drawn. Not a refusal: that one arrives as a message, because a stream
    // that merely ends is indistinguishable from a connection that dropped.
    setState(t('peers.unreachable', { id: shortId(peerId) }), 'idle')
    report(error)
  }
}

/**
 * Call somebody who is not in the list.
 *
 * Two things are accepted and they are not equally useful, which the hint
 * beside the field says rather than leaving somebody to find out:
 *
 * A **multiaddr** carries where to go, so it works for a device this app has
 * never heard of - which is the case the field exists for.
 *
 * A bare **peer id** carries only who, and libp2p has to already know an
 * address for them. That holds for somebody in the list a moment ago, and not
 * for a stranger: there is no DHT here to look one up in.
 */
async function callDirectly (text) {
  const typed = text.trim()

  if (typed === '') return

  const isAddress = typed.startsWith('/')
  const peerId = isAddress ? typed.split('/p2p/').pop()?.split('/')[0] : typed

  if (peerId == null || peerId === '') {
    setState(t('peers.notAnAddress'), 'idle')
    return
  }

  setState(t('peers.asking', { id: shortId(peerId) }), 'waiting')

  try {
    // Dialled first when an address was given, so the peer is reachable before
    // the stream is asked for. Without this, `openSyncStream` has only a peer
    // id and nowhere to send it.
    if (isAddress) await peer.node.dial(multiaddr(typed))

    attach(await peer.openSyncStream(peerId), peerId).requestSync()
  } catch (error) {
    setState(t('peers.unreachable', { id: shortId(peerId) }), 'idle')
    report(error)
  }
}

/**
 * This device's address, in the current language.
 *
 * Its own function because it is written from JavaScript and therefore invisible
 * to `data-i18n` - the same trap the folder line fell into once, and the reason
 * `language.test.js` checks that kind of text separately. Called from
 * `applyLocale`, so a switch reaches it too.
 */
function showMyPeer () {
  if (peer == null) return

  const id = peer.peerId()

  // Shortened the same way the rows out there are, and from the same end, so
  // the two can be compared by eye. The whole id is one hover away, and the
  // technical view prints it outright.
  myPeerEl.textContent = t('link.myPeer', { id: isSimple() ? shortId(id) : id })
  myPeerEl.title = id
}

/**
 * Where the relay choice is kept.
 *
 * Ours, not the library's: it takes a key rather than inventing one, so a
 * package cannot put its own namespace in somebody else's origin.
 */
const RELAY_OPT_IN_KEY = 'ablage.relay'

/** And which one, which is a separate question from whether. */
const RELAY_ADDRESSES_KEY = 'ablage.relay.addresses'

/**
 * Peers this device let go of on purpose.
 *
 * Dropping one ends its read loop, and the loop's ending says "the connection
 * ended" - true, and it overwrites the sentence explaining *why* it ended.
 * Under load it won that race: "took 3 files" became "the connection ended",
 * and the answer somebody had just chosen left no trace.
 *
 * A deliberate ending is not news. Only a surprise is.
 */
const letGo = new Set()

/** Who may write into this folder. The QR scan is the only automatic yes. */
const admitted = admission()

/** This folder's id and name, for the message a switch sends. */
let folder = { id: null, name: null }

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

const thumbnails = previews()

/**
 * Read a thumbnail only once its row is on screen.
 *
 * `render()` runs on every index change, so drawing a folder of photos would
 * otherwise read and decode all of them each time. Waiting for the row to be
 * visible means an unscrolled list of two hundred files reads the handful
 * somebody is actually looking at.
 */
const whenVisible = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue

    whenVisible.unobserve(entry.target)
    entry.target.dispatchEvent(new CustomEvent('shown'))
  }
}, { rootMargin: '200px' })

/**
 * Show it big.
 *
 * Opened by a tap, and by a hover that lasted long enough to be meant - without
 * the delay, crossing the list on the way to something else would flash a full
 * screen picture at every row. Closed by anything: Escape and the backdrop come
 * with `<dialog>`, and moving the pointer away from the row that opened it ends
 * a peek that was never asked to stay.
 */
/**
 * The pictures in this folder, in the order the list draws them.
 *
 * Read when the preview opens rather than held: files arrive and leave while
 * somebody is looking, and a list captured once would send them to a picture
 * that is no longer there.
 */
const picturesHere = () =>
  index.paths().sort().filter(path => looksLikeImage(path) && index.get(path)?.cid != null)

/** Which picture is open, so left and right have somewhere to go from. */
let openPicture = -1

/**
 * Show the picture at this position, without closing what is already open.
 *
 * Reached by tapping a thumbnail, by an arrow key, and by a swipe. Out of range
 * does nothing at all: the ends of a folder are the ends, and wrapping around
 * would leave somebody swiping forever without knowing they had passed the last
 * one.
 */
async function showPreviewAt (position) {
  const pictures = picturesHere()

  if (position < 0 || position >= pictures.length) return

  const path = pictures[position]
  const url = await thumbnails.urlFor(path, index.get(path)?.cid, storage)

  if (url == null) return

  openPicture = position
  previewImageEl.src = url
  previewImageEl.alt = path
  previewNameEl.textContent = pictures.length > 1
    ? t('preview.counted', { name: path.split('/').pop(), at: position + 1, of: pictures.length })
    : path.split('/').pop()

  if (!previewEl.open) previewEl.showModal()
}

/** @param {string} path the picture a thumbnail belongs to */
const showPreviewOf = path => showPreviewAt(picturesHere().indexOf(path))

/**
 * Put it away and let go of the picture.
 *
 * The clearing happens here rather than in a `close` listener because
 * **`dialog.close()` fires no `close` event in this Chromium** - the same trap
 * `<qr-intro>` hit, where a dialog that had visibly shut went on reporting
 * itself as open. `cancel` does fire, and that is the Escape path.
 */
function hidePreview () {
  previewEl.close()
  previewImageEl.removeAttribute('src')
  openPicture = -1
}

/**
 * A tap closes; a swipe moves. They arrive as the same click, so the two are
 * told apart by what the pointer did before it.
 */
let dragFrom = null
let swiped = false

previewEl.addEventListener('pointerdown', event => {
  dragFrom = { x: event.clientX, y: event.clientY }
  swiped = false
})

previewEl.addEventListener('pointerup', event => {
  if (dragFrom == null) return

  const dx = event.clientX - dragFrom.x
  const dy = event.clientY - dragFrom.y

  dragFrom = null

  // Far enough to be meant, and more sideways than not: a scroll or a shaky
  // finger on the way to closing should not turn the page.
  if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return

  swiped = true
  showPreviewAt(openPicture + (dx < 0 ? 1 : -1))
})

previewEl.addEventListener('click', () => {
  // The click that ends a swipe is not a tap. Without this, every swipe would
  // also close the picture it had just turned to.
  if (swiped) {
    swiped = false
    return
  }

  hidePreview()
})

previewEl.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

  // Otherwise the dialog scrolls under the picture on a narrow window.
  event.preventDefault()
  showPreviewAt(openPicture + (event.key === 'ArrowRight' ? 1 : -1))
})

previewEl.addEventListener('cancel', () => previewImageEl.removeAttribute('src'))

/** Folders the person collapsed. Open is the default; closing is the choice. */
const collapsed = new Set()

/**
 * Swap the generic icon for the picture itself, once the row is on screen.
 *
 * The icon stays until then rather than an empty box appearing: a row that
 * changes height when its picture arrives makes the list jump under whoever is
 * reading it.
 */
function attachThumbnail (li, node) {
  const cid = index.get(node.path)?.cid

  if (cid == null) return

  li.addEventListener('shown', async () => {
    const url = await thumbnails.urlFor(node.path, cid, storage)

    if (url == null) return

    const img = document.createElement('img')

    img.className = 'thumb'
    img.src = url
    img.alt = ''
    img.loading = 'lazy'

    let peek = null

    // A tap is unambiguous; a hover has to wait to be sure it was meant.
    img.addEventListener('click', event => {
      event.stopPropagation()
      showPreviewOf(node.path)
    })

    img.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return

      peek = setTimeout(() => showPreviewOf(node.path), 400)
    })

    const stop = () => {
      clearTimeout(peek)
      peek = null
    }

    img.addEventListener('pointerleave', stop)
    img.addEventListener('pointercancel', stop)

    li.querySelector('svg')?.replaceWith(img)
  }, { once: true })

  whenVisible.observe(li)
}

function fileRow (node) {
  const li = document.createElement('li')
  const name = document.createElement('span')
  const size = document.createElement('span')
  const remove = document.createElement('button')

  li.className = 'file'
  li.insertAdjacentHTML('afterbegin', fileIcon())

  if (looksLikeImage(node.path)) attachThumbnail(li, node)
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

  // Everything the list no longer holds. A blob stays alive until it is
  // revoked, whether or not anything still points at it.
  thumbnails.keepOnly(index.paths().map(path => index.get(path)?.cid).filter(Boolean))
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

  // The channel is kept beside the provider, not only inside it. A folder
  // switch replaces the provider - it has to, the document underneath is a new
  // one - and the stream it talks over is the same stream. Without this the
  // only way to rebuild would be to drop the connection and hand somebody a QR
  // code again.
  peers.add(peerId, provider, send)

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
      const message = JSON.parse(decode(data.subarray?.() ?? data))

      // The application's own message, on the sync stream. The provider's
      // switch has no default, so an unknown type would be dropped in silence -
      // which is why it is taken out here rather than added there: the CRDT has
      // no opinion about folders.
      if (message.type === 'folder-switch') {
        toldAboutSwitch(peerId, message)
        continue
      }

      // The other side said no. Reported as an answer rather than as the
      // disconnection that follows it, which is the only thing this used to
      // look like.
      if (message.type === 'sync-refused') {
        setState(t('peers.refused', { id: shortId(peerId) }), 'idle')
        letGo.add(peerId)
        peers.drop(peerId)
        return
      }

      provider.receive(message)
      // A remote change is a reason to look at storage again.
      pass()
    }
  })()
    .catch(report)
    .finally(() => {
      // Only this peer's, and only if it is still the current one - a
      // reconnection may have put a newer provider under the same key while
      // this loop was ending.
      peers.dropIfCurrent(peerId, provider)

      // The others are still there; saying "gone" while two peers remain would
      // be describing this stream rather than the state of the folder. And a
      // peer this device let go of on purpose has already been explained -
      // repeating it as an ending replaces the reason with the effect.
      if (!connected() && !letGo.delete(peerId)) setState(t('link.gone'), 'idle')
    })

  return provider
}

async function start () {
  const opened = await openStorage()

  storage = opened.store
  showFolder(opened)
  peer = await createPeer({
    // Read here and nowhere else. `relayOptIn` decides the bootstrap list,
    // whether a `/p2p-circuit` is announced, and what the gater refuses - all
    // of them fixed when the node is created, so the choice takes effect at the
    // next start rather than at once.
    //
    // Nothing writes this key yet. `<qr-intro>` grows the checkbox that would,
    // but it wants a `relay.check` and only the app knows its addresses -
    // ablage ships none. This is the half of the seam that does not need one:
    // without it, a choice made later would reach the interface and stop there.
    relayOptIn: readRelayOptIn(globalThis.localStorage, RELAY_OPT_IN_KEY),

    // Without these the choice does nothing. `relayBootstrapList` needs both an
    // opt-in *and* an address, and with an empty list `peerDiscovery` is `[]` -
    // no bootstrap, no pubsub discovery. The app then connected to a relay
    // during the introduction's check and heard nobody for ever, which is what
    // "connected, and no peers anywhere" turned out to mean.
    relayBootstrapAddrs: startupRelays(globalThis.localStorage, RELAY_ADDRESSES_KEY),
    onSyncStream: (stream, peerId) => {
      // `peer.arrivedByScan`, not the address. A peer that hole-punched out of
      // the relay has a `/webrtc/p2p/<id>` address with no circuit in it -
      // character for character what a scan produces - and reading consent off
      // that let strangers in without a question.
      if (decide({ scanned: peer.arrivedByScan(peerId), peerId, admitted }) === 'admit') {
        attach(stream, peerId)
        return
      }

      askToAdmit(stream, peerId)
    }
  })
  content = await createContent(peer.node)

  // The index changing is the other trigger - a local write is the first.
  index.observe(() => render())

  // The node is up, so the two controls that need it become pressable. Before
  // this line they are not, and that is the point: they call `peer` directly.
  inviteButton.disabled = false
  scanButton.disabled = false
  pickEl.disabled = false

  // Only once the node exists - before that there is no address to show.
  showMyPeer()
  myPeerEl.hidden = false

  peer.watchPeers(showPeers)

  // Redrawn as they type, from the list already held - a filter that waited for
  // the next discovery event would feel broken for five seconds at a time.
  peerFilterEl.addEventListener('input', () => showPeers(known))

  // The one thing a test cannot arrange: twelve devices on a relay. Everything
  // else about the list is the app's own code, and this hands it a cast.
  window.__showPeersForTest = showPeers
  showPeers([])



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
  // never reaches them.
  showFolder()
  showMyPeer()

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

/**
 * The second way in, offered in the introduction as a choice.
 *
 * The element owns the checkbox, the wording and the remembering; what it does
 * not own is where the addresses come from or how to ping one, which is why
 * `check` is ours. It writes the answer under our key, and `createPeer` reads
 * that same key at the next start - which is the whole seam.
 *
 * `peer` is read when `check` runs rather than captured now: the introduction
 * can be open before the node exists, and the check only happens if somebody
 * ticks the box.
 */
introEl.relay = {
  storageKey: RELAY_OPT_IN_KEY,
  check: () => {
    // The gate is shut on a node that started without a relay, and it would
    // refuse this very check - which is what made a live relay report itself as
    // silent. Opened for the probe; using one still waits for the next start.
    peer?.allowRelayDials(true)

    return findReachableRelays({
      baked: bakedRelayAddresses(),
      probe: relayProbe(peer.node, multiaddr),
      discover: discoverRelays
    }).then(found => {
      // Kept, because the next start needs an address and this one answered a
      // probe from this device. Discovery can take a while and the baked list
      // ages; a relay that replied a minute ago is the better first guess.
      rememberRelays(globalThis.localStorage, RELAY_ADDRESSES_KEY, found.addresses)
      return found
    })
  }
}

// A choice made now takes effect at the next start: the bootstrap list, the
// `/p2p-circuit` announcement and the gater are all fixed when the node is
// created. Said out loud rather than left for somebody to notice that ticking
// the box changed nothing today.
/**
 * Which story the introduction tells.
 *
 * Somebody who has just asked to be reached without a code should not then read
 * about holding one up to a camera. The paragraph follows the box, and so does
 * the pairing block behind the dialog - the introduction and the card underneath
 * would otherwise disagree about how this works.
 */
function tellHow (viaRelay) {
  $('intro-how-code').hidden = viaRelay
  $('intro-how-relay').hidden = !viaRelay

  // And the card behind the dialog, so the two never describe different apps.
  // One world or the other: with a relay a code is not how anybody gets in, and
  // without one an empty device list is furniture for somebody who never asked
  // to be found.
  byCodeEl.hidden = viaRelay
  byRelayEl.hidden = !viaRelay
}

tellHow(readRelayOptIn(globalThis.localStorage, RELAY_OPT_IN_KEY))

introEl.addEventListener('relay-opt-in', event => {
  tellHow(event.detail.optIn)
  setState(t(event.detail.optIn ? 'relay.onNextStart' : 'relay.off'), 'idle')
})

const introPolicy = createIntroPolicy({ storageKey: 'ablage.introSeen' })

/**
 * The way to say "I have read this".
 *
 * Closed through the element's own `close`, so the "do not show again" box is
 * read the same way it is when the × is used. A second path that forgot to
 * check it would remember nothing, and nobody would find out until the dialog
 * came back.
 */
$('intro-start').addEventListener('click', () => introEl.close())

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

/**
 * Ask once, and record it per peer.
 *
 * @param {string} name the folder being switched to
 * @returns {Promise<boolean>} whether the connected peers may be sent it
 */
function askAboutSharing (name) {
  return new Promise(resolve => {
    $('share-ask-body').textContent = t('share.askBody', { count: peers.size, name })

    const answer = allowed => {
      shareAskEl.close()
      // Recorded against the peers connected *at the moment of the question*.
      // One that joins afterwards is a device nobody was asked about, and
      // inheriting this answer is exactly what per-peer storage prevents.
      // `ids()`, not `keys()`. The peer map became a `peerSet` in #19 and this
      // call was left behind - it threw inside the click, so the promise never
      // settled and the whole switch stopped at the question. Nothing noticed,
      // because no test had ever driven §2 from one interface to the other.
      shared.set(peers.ids(), allowed)
      resolve(allowed)
    }

    $('share-yes').onclick = () => answer(true)
    $('share-no').onclick = () => answer(false)
    shareAskEl.showModal()
  })
}

/**
 * Tell the peers, then start again on the new folder.
 *
 * The message goes first and on the *old* providers, because they are the ones
 * still holding the document the other side is synced against. A moment later
 * they are replaced: a provider built on the old document would go on
 * describing a folder this device no longer has, which is what happens today
 * when nothing is sent at all - measured, the peer keeps the old listing for
 * ever and nobody tells it why.
 */
function announceSwitch (name, id) {
  const tell = shared.allowed(peers.ids())

  // `startFreshIndex` between the two, because `rebuild` below has to build on
  // the *new* document and the message has to leave over the old one.
  const message = { type: 'folder-switch', id, name }

  peers.switchFolder({
    tell,
    message,
    // Between the message and the rebuild: sent from the document the peer is
    // synced against, rebuilt on the one that replaces it.
    beforeRebuild: startFreshIndex,
    rebuild: send => {
      const provider = new Provider(doc, send)

      provider.requestSync()
      return provider
    }
  })
}

/**
 * Somebody reached this device without scanning anything.
 *
 * The stream is already open - that is how this dialog can say who is asking -
 * but nothing is attached, so nothing they send reaches the document and
 * nothing is written to disk. A refusal closes the stream, which is the only
 * way the other side learns the answer at all.
 */
function askToAdmit (stream, peerId) {
  $('admit-who').textContent = peerId
  $('admit-remember').checked = false

  const answer = admit => {
    admitEl.close()

    if (!admit) {
      // Said, then closed. A stream that simply ends looks exactly like a
      // connection that dropped, and the device on the other end is left
      // waiting for an answer it already got.
      try {
        stream.send(encode(JSON.stringify({ type: 'sync-refused' })))
      } catch {
        // Already gone. Then the close below is redundant and harmless.
      }

      // Closed straight away. There was a delay here, on the theory that a
      // refusal would race its own close - and the control says otherwise:
      // closing immediately, the message still arrived three times out of
      // three, because `close()` flushes what is written before it ends the
      // stream. A pause with no reason behind it is a pause somebody has to
      // work out later.
      stream.close?.().catch?.(() => {})
      setState(t('admit.refused'), 'idle')
      return
    }

    if ($('admit-remember').checked) admitted.remember(peerId)

    attach(stream, peerId)
    setState(t('admit.admitted'), 'connected')
  }

  $('admit-yes').onclick = () => answer(true)
  $('admit-no').onclick = () => answer(false)
  admitEl.showModal()
}

/**
 * Somebody on the other end is now working in a different folder.
 *
 * Two answers of the four the issue names. "Follow it here" and "keep mine" are
 * the ends of the range; using a folder you already have, and taking the
 * contents once without syncing, are refinements between them and are not built
 * - which the dialog says rather than leaving somebody to guess why their case
 * is missing.
 */
/**
 * Start again on nothing and ask them for everything.
 *
 * The fresh document is what stops the old folder's entries being merged with
 * theirs - the union of two folders is the "merged view" §1 forbids. Shared by
 * three of the four answers, which differ in *where* the files land and in
 * whether anything arrives after the first exchange.
 */
function followPeer (peerId) {
  startFreshIndex()

  return peers.follow(peerId, send => {
    const provider = new Provider(doc, send)

    provider.requestSync()
    return provider
  })
}

function toldAboutSwitch (peerId, message) {
  switchToldBodyEl.textContent = t('switched.body', { name: message.name })
  $('switch-select').hidden = !canPickFolder()

  const close = () => switchToldEl.close()

  $('switch-keep').onclick = () => {
    close()
    // Their folder is not this one. Stop describing this folder to them, keep
    // the connection: a dropped connection would read as a fault rather than
    // as an answer.
    letGo.add(peerId)
    peers.drop(peerId)
    setState(t('switched.kept'), 'idle')
  }

  $('switch-follow').onclick = () => {
    close()
    followPeer(peerId)
    setState(t('switched.followed', { name: message.name }), 'waiting')
  }

  /**
   * The same, into a folder of this person's choosing.
   *
   * Their `xyz` is a name, not a place - and on this device it may already
   * exist somewhere else entirely, which is the whole reason this answer is one
   * of the four. The picker must be opened from the click that asked for it:
   * doing the storage work first would spend the gesture.
   */
  $('switch-select').onclick = async () => {
    close()

    try {
      const handle = await pickFolder()

      storage = (await openStorage()).store
      folder = { id: (await folderIdentity(storage)).id, name: handle.name }

      followPeer(peerId)
      showFolder({ kind: 'picked', handle })
      setState(t('switched.selected', { name: handle.name }), 'waiting')
      await pass()
    } catch (error) {
      if (error?.name !== 'AbortError') report(error)
    }
  }

  /**
   * Take what is there now, and nothing after it.
   *
   * "Once" needs a moment to mean, and this is the honest one: the first
   * exchange is what they have, so when the reconciler has finished acting on
   * it, the copying is done. Waiting for anything later would be waiting for
   * ongoing sync, which is the answer this is not.
   */
  $('switch-once').onclick = async () => {
    close()
    followPeer(peerId)
    setState(t('switched.taking'), 'waiting')

    // Their state vector comes back as one response, and `pass()` is queued
    // behind whatever the read loop started - so waiting for it is waiting for
    // that response to have been acted on.
    await new Promise(resolve => setTimeout(resolve, 1500))
    await pass()

    const count = index.paths().length

    // Dropped, not disconnected: the copying is finished, the acquaintance is
    // not. `drop` leaves the connection and stops describing this folder.
    letGo.add(peerId)
    peers.drop(peerId)
    setState(t('switched.took', { count }), 'idle')
  }

  switchToldEl.showModal()
}

pickButton.addEventListener('click', async () => {
  try {
    // Both paths need the gesture this handler is: picking opens a dialog, and
    // re-granting permission on a remembered handle does too.
    const restored = pickButton.dataset.resume === 'yes' ? (await openStorage()).pending : null
    const handle = restored != null && await askForFolder(restored) ? restored : await pickFolder()

    // Asked before anything changes, so "keep it to this device" leaves the
    // folder as it was rather than half-switched.
    const share = connected() ? await askAboutSharing(handle.name) : false

    storage = (await openStorage()).store
    const identity = await folderIdentity(storage)

    folder = { id: identity.id, name: handle.name }

    if (connected()) {
      announceSwitch(handle.name, identity.id)
      if (!share) setState(t('share.stopped'), 'idle')
    } else {
      startFreshIndex()
    }

    showFolder({ kind: 'picked', handle })
    await pass()
  } catch (error) {
    // The picker throws AbortError when somebody closes it, which is an answer
    // rather than a failure.
    if (error?.name !== 'AbortError') report(error)
  }
})

$('call').addEventListener('click', () => callDirectly(callAddressEl.value))

callAddressEl.addEventListener('keydown', event => {
  // Enter, because a field with a button beside it is a field somebody will
  // press Enter in.
  if (event.key === 'Enter') callDirectly(callAddressEl.value)
})

// ---- adding files ----------------------------------------------------------

/**
 * Resolves when the parts a dropped file needs are there.
 *
 * `start()` opens storage first and builds the node after it, so there is a
 * window where a file can be written and then handed to a reconciler with no
 * `content` to address it with. Adding an encrypter and a muxer widened that
 * window enough for CI to land in it, and the file simply never appeared -
 * `report()` put the error in the state line, where nobody adding a file is
 * looking.
 */
let ready = null

async function addFiles (fileList) {
  // Awaited rather than refused: somebody who dropped a file meant it, and the
  // wait is the app starting, not a fault.
  await ready

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
// Held so anything that needs the whole app - a dropped file, most of all -
// can wait for it rather than act on half of it.
ready = start()

ready.then(consumeLink).then(maybeIntroduce).catch(report)
