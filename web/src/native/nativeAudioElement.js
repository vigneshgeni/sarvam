import {
  nativeAudioPlay,
  nativeAudioResume,
  nativeAudioPause,
  nativeAudioSeek,
  nativeAudioStop,
  nativeAudioSetRate,
  getNativeAudioState,
} from './liveActivity.js'

export const NATIVE_SRC_PREFIX = 'sarvam-native:'

const POLL_MS = 400

/**
 * A tiny stand-in for HTMLAudioElement used ONLY in the native iOS app.
 *
 * Why: in the WKWebView the downloaded speech audio was empty (CapacitorHttp dropped the
 * bytes), and an HTML audio element cannot be controlled from the Lock Screen / Dynamic Island.
 * Here the real playback lives in the native AVPlayer (SarvamAudioPlayer). This object exposes
 * the same small surface the Listen sheet already uses (src, play, pause, currentTime,
 * duration, playbackRate, onended, ontimeupdate, onloadedmetadata) and mirrors native state
 * by polling it. It never invents progress: position/duration come from AVPlayer.
 */
export class NativeAudioElement {
  constructor() {
    this.preload = 'auto'
    this.onended = null
    this.ontimeupdate = null
    this.onloadedmetadata = null
    this.onplayingchange = null // (playing: boolean) => void
    this._src = ''
    this._loadedSrc = ''
    this._active = false
    this._ended = false
    this._paused = true
    this._currentTime = 0
    this._duration = NaN
    this._rate = 1
    this._meta = { title: 'Your document', langLabel: 'English' }
    this._pollTimer = null
    this._playToken = 0
    this._cmdSeq = 0
    this._pendingSeek = 0
  }

  setMeta(meta) {
    this._meta = { ...this._meta, ...meta }
  }

  get src() {
    return this._src
  }
  set src(value) {
    this._src = value || ''
  }

  removeAttribute(name) {
    if (name !== 'src') return
    this._src = ''
    this._teardown()
  }

  get paused() {
    return this._paused
  }
  get ended() {
    return this._ended
  }
  get duration() {
    return this._duration
  }

  get currentTime() {
    return this._currentTime
  }
  set currentTime(value) {
    const v = Number.isFinite(value) ? Math.max(0, value) : 0
    this._currentTime = v
    if (this._active) {
      this._cmdSeq++
      nativeAudioSeek(v).catch(() => {})
    } else {
      this._pendingSeek = v
    }
  }

  get playbackRate() {
    return this._rate
  }
  set playbackRate(value) {
    this._rate = Number.isFinite(value) && value > 0 ? value : 1
    if (this._active) {
      nativeAudioSetRate(this._rate).catch(() => {})
    }
  }

  // Unused HTMLAudioElement members the sheet may touch
  addEventListener() {}
  removeEventListener() {}
  load() {}

  async play() {
    // Silent-WAV "unlock" data: URIs used for the browser autoplay trick are not needed natively.
    if (!this._src || !this._src.startsWith(NATIVE_SRC_PREFIX)) return

    // Resume an already loaded track (paused, not finished)
    if (this._active && this._loadedSrc === this._src && !this._ended) {
      this._cmdSeq++
      await nativeAudioResume()
      this._setPaused(false)
      this._startPolling()
      return
    }

    // (Re)start from the file: first play, or replay after the end
    const token = ++this._playToken
    const filePath = this._src.slice(NATIVE_SRC_PREFIX.length)
    this._ended = false
    this._pendingSeek = 0
    const res = await nativeAudioPlay({
      filePath,
      title: this._meta.title,
      langLabel: this._meta.langLabel,
      rate: this._rate,
      startPosition: 0,
      autoStart: false, // load first so the sheet can apply a start position without a blip
    })
    if (token !== this._playToken) {
      // Stopped or superseded while loading
      nativeAudioStop().catch(() => {})
      return
    }
    this._active = true
    this._loadedSrc = this._src
    this._duration = res && res.duration > 0 ? res.duration : NaN
    this._currentTime = 0
    if (this.onloadedmetadata) this.onloadedmetadata()
    this._cmdSeq++
    await nativeAudioResume()
    if (token !== this._playToken) return
    this._setPaused(false)
    this._startPolling()
  }

  pause() {
    this._setPaused(true)
    if (this._active) {
      this._cmdSeq++
      nativeAudioPause().catch(() => {})
    }
  }

  _setPaused(paused) {
    const changed = this._paused !== paused
    this._paused = paused
    if (changed && this.onplayingchange) this.onplayingchange(!paused)
  }

  _teardown() {
    this._playToken++
    this._stopPolling()
    const wasActive = this._active
    this._active = false
    this._loadedSrc = ''
    this._ended = false
    this._paused = true
    this._currentTime = 0
    this._duration = NaN
    this._pendingSeek = 0
    if (wasActive) {
      nativeAudioStop().catch(() => {})
    }
  }

  _startPolling() {
    this._stopPolling()
    this._pollTimer = setInterval(() => this._poll(), POLL_MS)
    this._poll()
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  }

  async _poll() {
    if (!this._active) return
    const seq = this._cmdSeq
    const st = await getNativeAudioState()
    // Ignore the reply if the user issued a command while the poll was in flight, or we stopped.
    if (!st || !this._active || seq !== this._cmdSeq) return

    if (!st.active) {
      // The native player is gone (stopped from elsewhere). Treat as paused.
      this._active = false
      this._loadedSrc = ''
      this._stopPolling()
      this._setPaused(true)
      return
    }

    this._currentTime = st.position
    if (st.duration > 0) this._duration = st.duration

    if (st.ended) {
      this._ended = true
      this._currentTime = Number.isFinite(this._duration) ? this._duration : st.position
      this._stopPolling()
      this._setPaused(true)
      if (this.onended) this.onended()
      return
    }

    const playing = !!st.playing
    if (playing === this._paused) this._setPaused(!playing)
    if (this.ontimeupdate) this.ontimeupdate()
  }
}
