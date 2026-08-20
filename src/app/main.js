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
import { tree } from './tree.js'
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
const stateEl = $('link-state')
const networkEl = $('network')
const filesEl = $('files')
const emptyEl = $('files-empty')
const dropEl = $('drop')
const pickEl = $('pick')
const pickButton = $('pick-folder')
const folderEl = $('folder')

const doc = new Y.Doc()
const index = fileIndex(doc)
// What this device last agreed with the other one about - the third value
// that tells "I edited it" apart from "we both edited it".
const base = baseline()

let storage = null
let content = null
let peer = null
let provider = null
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
  name.className = 'name'
  name.textContent = node.name
  size.className = 'size'
  size.textContent = `${node.size ?? 0} bytes`
  remove.type = 'button'
  remove.textContent = 'Remove'
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
  head.textContent = `${shut ? '▸' : '▾'} ${node.name}`
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

/** Both halves of a connection end here, whichever side dialled. */
function attach (stream) {
  const send = message => stream.send(encode(JSON.stringify(message)))

  provider = new Provider(doc, send)
  setState('Connected. Changes travel directly between the two devices.', 'connected')

  ;(async () => {
    for await (const data of stream) {
      provider.receive(JSON.parse(decode(data.subarray?.() ?? data)))
      // A remote change is a reason to look at storage again.
      pass()
    }
    setState('The other device went away. Show a code to reconnect.', 'idle')
  })().catch(report)

  return provider
}

async function start () {
  const opened = await openStorage()

  storage = opened.store
  showFolder(opened)
  peer = await createPeer({ onSyncStream: stream => attach(stream) })
  content = await createContent(peer.node)

  // The index changing is the other trigger - a local write is the first.
  index.observe(() => render())

  networkEl.hidden = false
  networkEl.probe?.()

  await pass()
}

// ---- which folder ----------------------------------------------------------

let unwatch = null

/**
 * Say which folder this is, and offer a real one where that is possible.
 *
 * Three states, and the middle one is the reason this is not a single button:
 * a handle restored from a previous visit is remembered but its **permission is
 * not**, and asking for it again needs a user gesture. A page that demanded it
 * on load would be asking before it had said why.
 */
function showFolder ({ kind, handle, pending }) {
  unwatch?.()
  unwatch = null

  if (kind === 'picked') {
    folderEl.textContent = `Syncing ${handle.name}`
    pickButton.textContent = 'Choose another folder'

    // Only a picked folder can change behind the app's back. Nothing outside it
    // can write to the origin's private one.
    unwatch = watchFolder(handle, () => pass())
    return
  }

  folderEl.textContent = pending != null
    ? `${pending.name} is remembered — give it back to continue there`
    : 'Working in this browser\'s private storage'

  pickButton.textContent = pending != null ? `Use ${pending.name} again` : 'Choose a folder'
  pickButton.dataset.resume = pending != null ? 'yes' : ''
}

pickButton.hidden = !canPickFolder()

pickButton.addEventListener('click', async () => {
  try {
    // Both paths need the gesture this handler is: picking opens a dialog, and
    // re-granting permission on a remembered handle does too.
    const restored = pickButton.dataset.resume === 'yes' ? (await openStorage()).pending : null
    const handle = restored != null && await askForFolder(restored) ? restored : await pickFolder()

    storage = (await openStorage()).store
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

// ---- pairing ---------------------------------------------------------------

inviteButton.addEventListener('click', async () => {
  try {
    setState('Making a code…', 'waiting')
    const offer = await peer.createOffer()

    // The code carries the *link*, so the other device's camera app can open it
    // without this page being open there first.
    const url = new URL(window.location.href)
    url.hash = `i=${encodeURIComponent(offer)}`
    inviteLink.value = url.toString()
    codeEl.value = url.toString()

    inviteBox.showModal()
    setState('Waiting for the other device to answer.', 'waiting')
  } catch (error) {
    report(error)
  }
})

scanReplyButton.addEventListener('click', () => {
  scannerEl.validate = text => ({ ok: text.includes('r=') || text.startsWith('q') })
  scannerEl.open()
  scannerEl.addEventListener('scan', async event => {
    scannerEl.close()
    inviteBox.close()

    try {
      const peerId = await peer.acceptAnswer(payloadOf(event.detail.text))
      attach(await peer.openSyncStream(peerId)).requestSync()
    } catch (error) {
      report(error)
    }
  }, { once: true })
})

scanButton.addEventListener('click', () => {
  scannerEl.open()
  scannerEl.addEventListener('scan', async event => {
    scannerEl.close()

    try {
      setState('Answering…', 'waiting')
      const answer = await peer.acceptOffer(payloadOf(event.detail.text))
      const url = new URL(window.location.href)
      url.hash = `r=${encodeURIComponent(answer)}`

      inviteLink.value = url.toString()
      codeEl.value = url.toString()
      inviteBox.showModal()
      scanReplyButton.hidden = true
      setState('Show this back to the other device.', 'waiting')
    } catch (error) {
      report(error)
    }
  }, { once: true })
})

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copyButton.textContent = 'Copied'
    setTimeout(() => { copyButton.textContent = 'Copy' }, 2000)
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
    setState('Answering the invite you opened…', 'waiting')
    const answer = await peer.acceptOffer(decodeURIComponent(invite))
    const url = new URL(window.location.href)
    url.hash = `r=${encodeURIComponent(answer)}`

    inviteLink.value = url.toString()
    codeEl.value = url.toString()
    scanReplyButton.hidden = true
    inviteBox.showModal()
    setState('Show this back to the other device.', 'waiting')
  } catch (error) {
    report(error)
  }
}

start().then(consumeLink).catch(report)
