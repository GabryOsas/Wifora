/**
 * Estimates the rate difference between a remote audio timeline and the local
 * playout timeline. It deliberately produces only bounded micro-corrections:
 * large jumps are ignored instead of turning a bad timestamp into an audible
 * speed change.
 */
export class DriftController {
  constructor({ sampleRate = 48_000, smoothing = 0.2, maxPpm = 1_000, maxCorrectionPpm = 200 } = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new TypeError('sampleRate must be a positive number')
    if (!Number.isFinite(smoothing) || smoothing <= 0 || smoothing > 1) {
      throw new RangeError('smoothing must be greater than 0 and at most 1')
    }
    if (!Number.isFinite(maxPpm) || maxPpm <= 0) throw new RangeError('maxPpm must be a positive number')
    if (!Number.isFinite(maxCorrectionPpm) || maxCorrectionPpm <= 0) {
      throw new RangeError('maxCorrectionPpm must be a positive number')
    }

    this.sampleRate = sampleRate
    this.smoothing = smoothing
    this.maxPpm = maxPpm
    this.maxCorrectionPpm = maxCorrectionPpm
    this.reset()
  }

  /**
   * Records a pair of monotonically increasing sample timestamps. The remote
   * timestamp must advance at the source clock rate; localTimestamp advances
   * at the playout clock rate. Returns the recommended playout speed.
   */
  observe({ remoteTimestamp, localTimestamp } = {}) {
    this.#assertTimestamp(remoteTimestamp, 'remoteTimestamp')
    this.#assertTimestamp(localTimestamp, 'localTimestamp')

    if (this.previousRemoteTimestamp === null) {
      this.previousRemoteTimestamp = remoteTimestamp
      this.previousLocalTimestamp = localTimestamp
      return this.snapshot()
    }

    const remoteDelta = remoteTimestamp - this.previousRemoteTimestamp
    const localDelta = localTimestamp - this.previousLocalTimestamp
    this.previousRemoteTimestamp = remoteTimestamp
    this.previousLocalTimestamp = localTimestamp

    if (remoteDelta <= 0 || localDelta <= 0) {
      this.rejectedObservations++
      return this.snapshot()
    }

    const observedPpm = (remoteDelta / localDelta - 1) * 1_000_000
    if (!Number.isFinite(observedPpm) || Math.abs(observedPpm) > this.maxPpm) {
      this.rejectedObservations++
      return this.snapshot()
    }

    this.estimatedPpm =
      this.observations === 0 ? observedPpm : this.estimatedPpm + this.smoothing * (observedPpm - this.estimatedPpm)
    this.observations++
    this.correctionPpm = Math.max(-this.maxCorrectionPpm, Math.min(this.maxCorrectionPpm, this.estimatedPpm))
    return this.snapshot()
  }

  reset() {
    this.previousRemoteTimestamp = null
    this.previousLocalTimestamp = null
    this.estimatedPpm = 0
    this.correctionPpm = 0
    this.observations = 0
    this.rejectedObservations = 0
  }

  snapshot() {
    return {
      sampleRate: this.sampleRate,
      estimatedPpm: this.estimatedPpm,
      correctionPpm: this.correctionPpm,
      playbackRate: 1 + this.correctionPpm / 1_000_000,
      observations: this.observations,
      rejectedObservations: this.rejectedObservations,
    }
  }

  #assertTimestamp(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative safe integer`)
    }
  }
}
