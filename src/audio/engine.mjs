import { RingBuffer } from './buffer/ring-buffer.mjs'
import { MediaClock } from './clock/media-clock.mjs'
import { DriftController } from './clock/drift-controller.mjs'
import { AudioMetrics } from './metrics/audio-metrics.mjs'

/**
 * Transport-agnostic audio engine skeleton. Capture backends feed frames here;
 * the WebRTC sender consumes the normalized, timestamped result.
 */
export class AudioEngine {
  constructor({ sampleRate = 48_000, channels = 2, bufferCapacity = 50, drift = {} } = {}) {
    if (!Number.isInteger(channels) || channels < 1) throw new TypeError('channels must be a positive integer')
    this.sampleRate = sampleRate
    this.channels = channels
    this.buffer = new RingBuffer({ capacity: bufferCapacity })
    this.clock = new MediaClock({ sampleRate })
    this.drift = new DriftController({ ...drift, sampleRate })
    this.metrics = new AudioMetrics()
    this.transports = new Set()
    this.captureSource = null
    this.captureTask = null
    this.captureStats = { framesIngested: 0, errors: 0, lastError: null }
  }

  registerTransport(transport) {
    if (!transport || typeof transport.sendFrame !== 'function') {
      throw new TypeError('transport must implement sendFrame(frame)')
    }
    this.transports.add(transport)
    return transport
  }

  unregisterTransport(transport) {
    return this.transports.delete(transport)
  }

  /**
   * Start consuming a native or browser-independent capture source. A source
   * must implement start(), read(), and stop(); frames are validated by ingest
   * before they can reach the engine or any registered transport.
   */
  async startCapture(source, options) {
    if (
      !source ||
      typeof source.start !== 'function' ||
      typeof source.read !== 'function' ||
      typeof source.stop !== 'function'
    ) {
      throw new TypeError('capture source must implement start(), read(), and stop()')
    }
    if (this.captureSource) throw new Error('a capture source is already running')

    this.captureSource = source
    try {
      await source.start(options)
    } catch (error) {
      this.captureSource = null
      throw error
    }

    this.captureTask = this.#consumeCapture(source)
    return source
  }

  async stopCapture() {
    const source = this.captureSource
    if (!source) return false
    this.captureSource = null
    try {
      await source.stop()
    } finally {
      await this.captureTask
      this.captureTask = null
    }
    return true
  }

  async broadcast(frame) {
    const promises = []
    for (const transport of this.transports) {
      promises.push(transport.sendFrame(frame))
    }
    return Promise.all(promises)
  }

  ingest({ samples, sampleRate = this.sampleRate, channels = this.channels, timestamp } = {}) {
    if (!samples || !Number.isSafeInteger(samples.length) || samples.length < 1) {
      throw new TypeError('frame samples must be a non-empty array-like value')
    }
    if (sampleRate !== this.sampleRate || channels !== this.channels) {
      throw new RangeError('frame format does not match the audio engine format')
    }
    const samplesPerChannel = Math.floor(samples.length / channels)
    if (samplesPerChannel * channels !== samples.length) throw new RangeError('samples must align with channels')

    const clock = this.clock.next(samplesPerChannel)
    if (Number.isSafeInteger(timestamp)) this.clock.reanchor(timestamp + samplesPerChannel)
    const frame = { samples, sampleRate, channels, ...clock }
    const result = this.buffer.push(frame)
    this.metrics.recordCaptured({ late: result.dropped !== null })
    if (this.transports.size > 0) {
      this.broadcast(frame).catch(() => {})
    }
    return result
  }

  read(frameSamples) {
    const frame = this.buffer.read()
    if (frame) {
      this.metrics.recordEmitted()
      return frame
    }
    const clock = this.clock.insertSilence(frameSamples)
    this.metrics.recordEmitted({ silent: true })
    return {
      samples: new Float32Array(frameSamples * this.channels),
      sampleRate: this.sampleRate,
      channels: this.channels,
      ...clock,
    }
  }

  /** Record remote and local sample positions to derive a bounded playout correction. */
  observeClockDrift(observation) {
    return this.drift.observe(observation)
  }

  snapshot() {
    const transportStats = Array.from(this.transports).map((t) =>
      typeof t.getStats === 'function' ? t.getStats() : { name: t.name }
    )
    const hasCaptureActivity =
      this.captureSource || this.captureStats.framesIngested > 0 || this.captureStats.errors > 0
    return {
      ...this.metrics.snapshot(this.buffer),
      clock: this.clock.snapshot(),
      drift: this.drift.snapshot(),
      ...(hasCaptureActivity
        ? {
            capture: {
              running: Boolean(this.captureSource),
              ...this.captureStats,
              source: this.captureSource?.deviceInfo || null,
              sourceStats: this.captureSource?.getStats?.() || null,
            },
          }
        : {}),
      transports: transportStats,
    }
  }

  async #consumeCapture(source) {
    try {
      while (this.captureSource === source) {
        const frame = await source.read()
        if (this.captureSource !== source) break
        this.ingest(frame)
        this.captureStats.framesIngested++
      }
    } catch (error) {
      // stopCapture intentionally terminates a pending read; it is not a capture fault.
      if (this.captureSource === source) {
        this.captureStats.errors++
        this.captureStats.lastError = error?.message || String(error)
        this.captureSource = null
      }
    }
  }
}
