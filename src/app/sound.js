/**
 * Something to look at while a recording plays.
 *
 * The player itself is the browser's own `<audio controls>` - play, scrubber,
 * volume, the keyboard handling, the lock-screen controls on a phone. None of
 * that is worth rewriting, and a hand-made one would be worse at all of it.
 * What a browser does *not* give is any sign that sound is coming out, which on
 * a phone with the volume down is the difference between "playing" and "broken".
 *
 * So: bars, drawn from the frequency data the Web Audio API already has.
 *
 * **Why no library.** This app carries no framework at all - it is the browser's
 * own elements and about forty lines here. A player component would have brought
 * a rendering library with it, for a `<canvas>` and a `requestAnimationFrame`.
 *
 * **Everything here is optional.** If `AudioContext` is missing, if the browser
 * refuses one, or if the element has already been routed somewhere else, the
 * meter stays blank and the audio plays exactly as it would have. Sound that
 * works without a picture is the right way round; a picture that takes the
 * sound with it when it fails is not.
 */

/** @type {WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>} */
const routed = new WeakMap()

/**
 * How many of the analyser's bins to draw, and why not all of them.
 *
 * The bins divide the whole audible range evenly, so with 128 of them each is
 * about 190 Hz wide and the top three quarters cover 6-24 kHz - where speech
 * and most music have almost nothing. Drawing all of them gives a meter that
 * twitches on the left and is dead everywhere else, which is what the first
 * version looked like. These are the lowest 32, stretched across the width.
 */
const BARS = 32

/**
 * Bars that follow what is audible.
 *
 * @param {object} parts
 * @param {HTMLAudioElement} parts.audio the element being listened to
 * @param {HTMLCanvasElement} parts.canvas where the bars go
 */
export function soundLevels ({ audio, canvas }) {
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
  /** @type {AudioContext | null} */
  let context = null
  /** @type {AnalyserNode | null} */
  let analyser = null
  let frame = 0

  /**
   * Route the element through an analyser, once and only once.
   *
   * `createMediaElementSource` may be called a single time per element - a
   * second call throws - and from then on the element's sound reaches the
   * speakers only through this graph. So the connection to `destination` is not
   * decoration: without it, drawing the bars would silence the file.
   */
  const listen = () => {
    if (analyser != null) return true

    const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext

    if (Audio == null) return false

    try {
      context ??= new Audio()
      const source = routed.get(audio) ?? context.createMediaElementSource(audio)

      routed.set(audio, source)
      analyser = context.createAnalyser()
      // 128 bins across the whole audible range, of which only the lowest are
      // drawn - see `BARS`. 32 bars read better on a phone than 512 hairlines.
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyser.connect(context.destination)

      return true
    } catch {
      // Already routed by something else, or refused. The file still plays.
      analyser = null
      return false
    }
  }

  const clear = () => {
    const paint = canvas.getContext('2d')

    paint?.clearRect(0, 0, canvas.width, canvas.height)
  }

  const draw = () => {
    const paint = canvas.getContext('2d')

    if (paint == null || analyser == null) return

    // The canvas is sized in device pixels and laid out in CSS pixels, so a
    // phone draws sharp bars rather than four soft ones.
    const ratio = globalThis.devicePixelRatio ?? 1
    const width = Math.round(canvas.clientWidth * ratio)
    const height = Math.round(canvas.clientHeight * ratio)

    if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
      canvas.width = width
      canvas.height = height
    }

    const all = new Uint8Array(analyser.frequencyBinCount)

    analyser.getByteFrequencyData(all)

    const bins = all.subarray(0, Math.min(BARS, all.length))
    paint.clearRect(0, 0, canvas.width, canvas.height)
    // Taken from the element rather than written here, so both themes and any
    // later change to the palette arrive without this file knowing about it.
    paint.fillStyle = globalThis.getComputedStyle?.(canvas).color ?? '#58c7f3'

    const gap = Math.max(1, Math.round(canvas.width / bins.length / 6))
    const bar = Math.max(1, canvas.width / bins.length - gap)

    for (let i = 0; i < bins.length; i++) {
      // A floor of one pixel: a silent passage is a quiet line, not a gap that
      // reads as "stopped".
      const tall = Math.max(1, (bins[i] / 255) * canvas.height)

      paint.fillRect(i * (bar + gap), canvas.height - tall, bar, tall)
    }

    frame = requestAnimationFrame(draw)
  }

  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
    clear()
  }

  return {
    /** Called when the element starts playing, which is also the gesture a suspended context needs. */
    start () {
      // Somebody who asked for less movement gets the player and no animation.
      // The bars are reassurance, and reassurance is not worth overriding that.
      if (still?.matches) return
      if (!listen()) return

      context?.resume?.().catch(() => {})

      if (frame === 0) frame = requestAnimationFrame(draw)
    },

    stop,

    /** Put the meter away. The routing stays: the element can only be routed once. */
    close () {
      stop()
    }
  }
}
