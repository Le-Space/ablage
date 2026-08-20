import * as Y from 'yjs'

/**
 * Yjs over one direct libp2p stream, instead of over gossipsub.
 *
 * Measured, not assumed: over a bare QR connection gossipsub knows the other
 * peer (`getPeers()` is 1) and never exchanges subscriptions with it
 * (`getSubscribers(topic)` stays 0, `publish` reports `recipients: 0`). A
 * direct stream over the same connection carries bytes both ways.
 *
 * For two peers pubsub is overhead anyway - it exists to fan out to a crowd,
 * and here the crowd is one.
 *
 * The message shapes are the hackathon provider's, so the wire format stays
 * recognisable: `sync-request` carries a state vector, `sync-response` and
 * `update` carry an encoded update. libp2p 3 streams are *message* streams, so
 * there is no framing to write - each iteration yields exactly one message.
 */
export class StreamProvider {
  #doc
  #send
  #onUpdate

  /**
   * @param {Y.Doc} doc
   * @param {(message: object) => Promise<void>} send
   */
  constructor (doc, send) {
    this.#doc = doc
    this.#send = send
    this.synced = false

    // `origin` is this provider when the update came from the wire, and that is
    // how an echo is avoided: applying a remote update must not send it back.
    this.#onUpdate = (update, origin) => {
      if (origin === this) return
      this.#post({ type: 'update', update: this.#encode(update) })
    }

    doc.on('update', this.#onUpdate)
  }

  /** Ask the other side what it is missing. Sent once, when the stream opens. */
  async requestSync () {
    await this.#post({ type: 'sync-request', stateVector: this.#encode(Y.encodeStateVector(this.#doc)) })
  }

  /** @param {object} message one decoded message from the stream */
  receive (message) {
    switch (message.type) {
      case 'update':
      case 'sync-response':
        Y.applyUpdate(this.#doc, this.#decode(message.update), this)
        this.synced = true
        break

      case 'sync-request': {
        // Only what they are missing, not the whole document.
        const diff = Y.encodeStateAsUpdate(this.#doc, this.#decode(message.stateVector))
        this.#post({ type: 'sync-response', update: this.#encode(diff) })
        break
      }
    }
  }

  destroy () {
    this.#doc.off('update', this.#onUpdate)
  }

  async #post (message) {
    try {
      await this.#send(message)
    } catch {
      // A stream that closed under us is the connection going away, which the
      // application already knows about. Nothing here is worth throwing over.
    }
  }

  #encode (bytes) {
    return btoa(String.fromCharCode(...bytes))
  }

  #decode (text) {
    return Uint8Array.from(atob(text), c => c.charCodeAt(0))
  }
}
