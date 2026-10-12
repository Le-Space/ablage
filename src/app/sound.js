/**
 * The shape of a whole recording, and where in it you are.
 *
 * The player itself is the browser's own `<audio controls>` - play, scrubber,
 * volume, the keyboard handling, the lock-screen controls on a phone. None of
 * that is worth rewriting, and a hand-made one would be worse at all of it.
 * This app carries no framework, so a player component would have meant a
 * rendering library for a `<canvas>` and a `requestAnimationFrame`.
 *
 * What a browser does *not* give is any picture of what it is playing. A bar
 * that creeps across says how far through you are and nothing about the thing
 * itself: where the quiet part is, whether it is speech or music, whether the
 * recording actually has anything on it. The waveform says all of that before a
 * single second has played, and it is the half somebody looks at to decide
 * whether to listen at all.
 *
 * **Decoded, not listened to.** The samples come from `decodeAudioData`, which
 * reads the file on its own and never touches the element's output. An earlier
 * version put the element through `createMediaElementSource` to watch it live,
 * and that is a one-way door: an element routed that way reaches the speakers
 * only through the graph, so a mistake anywhere in it is a file that plays in
 * silence. Nothing here can do that.
 *
 * **Everything about it is optional.** No `AudioContext`, a file too big to be
 * worth decoding, bytes the browser cannot decode: the canvas stays blank and
 * the player works exactly as it would have. A picture that takes the sound
 * with it when it fails would be the wrong way round.
 */

/**
 * Above this, the picture is not worth the memory it costs.
 *
 * Decoding gives 32-bit floats per channel per sample: a three-minute stereo
 * track at 44.1 kHz is about 63 MB while it is being measured, even though what
 * is kept afterwards is a thousand numbers. The buffer is dropped as soon as the
 * peaks are taken, but the spike is real, and a phone is where this app is used.
 */
const TOO_BIG = 60 * 1024 * 1024

/** How many columns the picture is drawn in, whatever the canvas is wide. */
const COLUMNS = 1000

/**
 * The loudest point in each slice of the recording.
 *
 * A peak envelope rather than an average: an average turns a drum into a
 * smudge, because the quiet half of every cycle cancels the loud half. The
 * maximum of the absolute value is what a waveform is usually drawn from, and
 * it keeps a transient looking like a transient.
 *
 * Channels are mixed down first, so a stereo recording is one shape rather than
 * two drawn over each other.
 *
 * Exported for its own tests: this is arithmetic, and arithmetic does not need
 * a browser to be checked.
 *
 * @param {ReadonlyArray<Float32Array>} channels one array of samples per channel
 * @param {number} columns how many slices to reduce it to
 * @returns {Float32Array} one peak per column, each between 0 and 1
 */
export function peaks (channels, columns) {
  const out = new Float32Array(Math.max(0, columns))

  if (channels.length === 0 || columns <= 0) return out

  const length = channels[0].length

  if (length === 0) return out

  const per = length / columns

  for (let column = 0; column < columns; column++) {
    const from = Math.floor(column * per)
    // At least one sample per column: a recording shorter than the picture is
    // wide would otherwise leave empty columns between the drawn ones.
    const to = Math.max(from + 1, Math.min(length, Math.floor((column + 1) * per)))
    let loudest = 0

    for (let i = from; i < to; i++) {
      let sum = 0

      for (const channel of channels) sum += channel[i] ?? 0

      const level = Math.abs(sum / channels.length)

      if (level > loudest) loudest = level
    }

    out[column] = loudest
  }

  return out
}

/**
 * The picture beside the player.
 *
 * @param {object} parts
 * @param {HTMLAudioElement} parts.audio the element being drawn
 * @param {HTMLCanvasElement} parts.canvas where the shape goes
 */
export function soundWaveform ({ audio, canvas }) {
  /** @type {AudioContext | null} */
  let context = null
  /** @type {Float32Array | null} */
  let shape = null
  /** What `shape` belongs to, so a page turned mid-decode draws nothing. */
  let showing = null
  let frame = 0

  const colour = name =>
    globalThis.getComputedStyle?.(canvas).getPropertyValue(name).trim() || '#58c7f3'

  const draw = () => {
    const paint = canvas.getContext('2d')

    if (paint == null) return

    // Sized in device pixels and laid out in CSS pixels, so a phone draws a
    // sharp line rather than a soft one.
    const ratio = globalThis.devicePixelRatio ?? 1
    const width = Math.round(canvas.clientWidth * ratio)
    const height = Math.round(canvas.clientHeight * ratio)

    if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
      canvas.width = width
      canvas.height = height
    }

    paint.clearRect(0, 0, canvas.width, canvas.height)

    if (shape == null || shape.length === 0) return

    const middle = canvas.height / 2
    const played = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.currentTime / audio.duration
      : 0
    const rest = colour('--wave-rest')
    const done = colour('--wave-played')
    const step = canvas.width / shape.length

    for (let column = 0; column < shape.length; column++) {
      const x = column * step
      // A floor of one device pixel: silence is a thin line through the middle,
      // which reads as "nothing here", not as "the picture stopped".
      const tall = Math.max(1, shape[column] * middle)

      paint.fillStyle = x / canvas.width <= played ? done : rest
      paint.fillRect(x, middle - tall, Math.max(1, step - 1), tall * 2)
    }
  }

  const follow = () => {
    draw()
    frame = audio.paused ? 0 : requestAnimationFrame(follow)
  }

  const start = () => {
    if (frame === 0) frame = requestAnimationFrame(follow)
  }

  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
    draw()
  }

  /** @param {string} url the object URL the player was given */
  const measure = async url => {
    const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext

    if (Audio == null) return

    try {
      const bytes = await fetch(url).then(answer => answer.arrayBuffer())

      if (bytes.byteLength > TOO_BIG || showing !== url) return

      context ??= new Audio()

      const decoded = await context.decodeAudioData(bytes)

      // A page turned while this was decoding: the shape belongs to a file
      // nobody is looking at any more.
      if (showing !== url) return

      const channels = []

      for (let i = 0; i < decoded.numberOfChannels; i++) channels.push(decoded.getChannelData(i))

      shape = peaks(channels, COLUMNS)
      draw()
    } catch {
      // Bytes this browser cannot decode, or a context it would not give.
      // The player has the same file and does not need us.
      shape = null
    }
  }

  return {
    /**
     * Draw this recording. The picture arrives a moment after the player does,
     * which is the decode.
     *
     * @param {string} url
     */
    show (url) {
      showing = url
      shape = null
      draw()
      measure(url)
    },

    /** Called from `play`, `pause` and `ended`: the cursor only moves while it plays. */
    start,
    stop,

    /** Put it away, and let go of the samples. */
    clear () {
      cancelAnimationFrame(frame)
      frame = 0
      showing = null
      shape = null
      draw()
    },

    /**
     * Press the picture to go there.
     *
     * The native scrubber is still the accessible way to seek - this is a
     * pointer shortcut on top of it, which is why the canvas stays
     * `aria-hidden` rather than becoming a second slider nobody maintains.
     *
     * @param {number} x where the press landed, in CSS pixels from the left edge
     */
    seekTo (x) {
      const width = canvas.clientWidth

      if (!(width > 0) || !Number.isFinite(audio.duration) || audio.duration <= 0) return

      audio.currentTime = Math.min(audio.duration, Math.max(0, x / width) * audio.duration)
      draw()
    }
  }
}
