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

async function render () {
  const paths = index.paths().sort()

  filesEl.replaceChildren(...paths.map(path => {
    const entry = index.get(path)
    const li = document.createElement('li')
    const name = document.createElement('span')
    const size = document.createElement('span')
    const remove = document.createElement('button')

    name.className = 'name'
    name.textContent = path
    size.className = 'size'
    size.textContent = `${entry.size} bytes`
    remove.type = 'button'
    remove.textContent = 'Remove'
    remove.addEventListener('click', async () => {
      await storage.remove(path)
      index.remove(path)
      await pass()
    })

    li.append(name, size, remove)
    return li
  }))

  emptyEl.hidden = paths.length > 0
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
  storage = await openStorage()
  peer = await createPeer({ onSyncStream: stream => attach(stream) })
  content = await createContent(peer.node)

  // The index changing is the other trigger - a local write is the first.
  index.observe(() => render())

  networkEl.hidden = false
  networkEl.probe?.()

  await pass()
}

// ---- adding files ----------------------------------------------------------

async function addFiles (fileList) {
  for (const file of fileList) {
    await storage.write(file.name, new Uint8Array(await file.arrayBuffer()))
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

dropEl.addEventListener('drop', event => addFiles(event.dataTransfer.files))

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
