/**
 * A sample-clock for the audio engine.  It advances from samples, never from
 * the wall clock, so timestamps remain monotonic across short event-loop stalls.
 */
export class MediaClock {
  constructor({ sampleRate = 48_000, startTimestamp = 0 } = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new TypeError('sampleRate must be a positive number')
    }
    if (!Number.isSafeInteger(startTimestamp) || startTimestamp < 0) {
      throw new TypeError('startTimestamp must be a non-negative safe integer')
    }
    this.sampleRate = sampleRate
    this.timestamp = startTimestamp
    this.sequence = 0
    this.reanchors = 0
  }

  next(frameSamples) {
    if (!Number.isSafeInteger(frameSamples) || frameSamples < 1) {
      throw new TypeError('frameSamples must be a positive safe integer')
    }
    const frame = { timestamp: this.timestamp, sequence: this.sequence++ }
    this.timestamp += frameSamples
    return frame
  }

  /** Advance the timeline with silence when capture temporarily stops. */
  insertSilence(frameSamples) {
    return { ...this.next(frameSamples), silent: true }
  }

  /** Move forward only; an old capture timestamp must never rewind media time. */
  reanchor(minimumTimestamp) {
    if (!Number.isSafeInteger(minimumTimestamp) || minimumTimestamp < 0) {
      throw new TypeError('minimumTimestamp must be a non-negative safe integer')
    }
    if (minimumTimestamp > this.timestamp) {
      this.timestamp = minimumTimestamp
      this.reanchors++
    }
    return this.timestamp
  }

  snapshot() {
    return {
      sampleRate: this.sampleRate,
      timestamp: this.timestamp,
      sequence: this.sequence,
      reanchors: this.reanchors,
    }
  }
}
