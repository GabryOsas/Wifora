import { EventEmitter } from 'node:events'

/**
 * Base abstract class for audio transport adapters.
 * Decouples the AudioEngine from specific delivery mechanisms (WebRTC, AirPlay, Native).
 */
export class AudioTransport extends EventEmitter {
  constructor({ name = 'unnamed-transport', type = 'generic', sampleRate = 48_000, channels = 2 } = {}) {
    super()
    this.name = name
    this.type = type
    this.sampleRate = sampleRate
    this.channels = channels
    this.running = false
    this.stats = {
      framesSent: 0,
      bytesSent: 0,
      droppedFrames: 0,
      errors: 0,
      activeClients: 0,
    }
  }

  async start() {
    this.running = true
    this.emit('started')
    return true
  }

  async sendFrame(frame) {
    if (!this.running) return false
    if (!frame || !frame.samples) {
      this.stats.droppedFrames++
      return false
    }
    this.stats.framesSent++
    this.stats.bytesSent += frame.samples.byteLength || frame.samples.length * 4
    return true
  }

  setPolicy(_policy) {
    // Optional override by subclasses
  }

  async stop() {
    this.running = false
    this.emit('stopped')
    return true
  }

  getStats() {
    return {
      name: this.name,
      type: this.type,
      running: this.running,
      sampleRate: this.sampleRate,
      channels: this.channels,
      ...this.stats,
    }
  }
}
