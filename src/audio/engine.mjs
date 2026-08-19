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
    return {
      ...this.metrics.snapshot(this.buffer),
      clock: this.clock.snapshot(),
      drift: this.drift.snapshot(),
      transports: transportStats,
    }
  }
}
