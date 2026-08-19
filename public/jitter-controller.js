/**
 * Browser-safe adaptive jitter-buffer policy. It accepts telemetry in
 * milliseconds/percentages and returns the target supported by
 * RTCRtpReceiver.jitterBufferTarget when that API is available.
 */
export class AdaptiveJitterController {
  constructor({ degradeSamples = 2, recoverSamples = 5 } = {}) {
    if (!Number.isInteger(degradeSamples) || degradeSamples < 1) {
      throw new RangeError('degradeSamples must be a positive integer')
    }
    if (!Number.isInteger(recoverSamples) || recoverSamples < 1) {
      throw new RangeError('recoverSamples must be a positive integer')
    }

    this.degradeSamples = degradeSamples
    this.recoverSamples = recoverSamples
    this.reset()
  }

  update(metrics = {}) {
    const desired = this.#desiredMode(metrics)
    const desiredIndex = MODES.indexOf(desired)
    const currentIndex = MODES.indexOf(this.mode)

    if (desiredIndex > currentIndex) {
      this.recoverySamples = 0
      this.degradationSamples++
      if (desired === 'recovery' || this.degradationSamples >= this.degradeSamples) {
        this.mode = desired
        this.degradationSamples = 0
      }
    } else if (desiredIndex < currentIndex) {
      this.degradationSamples = 0
      this.recoverySamples++
      if (this.recoverySamples >= this.recoverSamples) {
        this.mode = MODES[currentIndex - 1]
        this.recoverySamples = 0
      }
    } else {
      this.degradationSamples = 0
      this.recoverySamples = 0
    }

    return this.snapshot()
  }

  reset() {
    this.mode = 'ultraLow'
    this.degradationSamples = 0
    this.recoverySamples = 0
  }

  snapshot() {
    return {
      mode: this.mode,
      targetMs: TARGETS[this.mode],
      degradationSamples: this.degradationSamples,
      recoverySamples: this.recoverySamples,
    }
  }

  #desiredMode(metrics) {
    const jitterMs = finiteOr(metrics.jitterMs, 0)
    const lossPercent = finiteOr(metrics.lossPercent, 0)
    const rttMs = finiteOr(metrics.rttMs, 0)
    const occupancyRatio = finiteOr(metrics.occupancyRatio, 1)
    const lateFrames = finiteOr(metrics.lateFrames, 0)
    const underruns = finiteOr(metrics.underruns, 0)
    const clockDriftPpm = Math.abs(finiteOr(metrics.clockDriftPpm, 0))

    if (underruns > 0 || lateFrames >= 2 || jitterMs > 35 || lossPercent >= 4 || rttMs >= 220 || clockDriftPpm >= 180) {
      return 'recovery'
    }
    if (jitterMs > 15 || lossPercent > 2 || rttMs > 110 || occupancyRatio < 0.2 || clockDriftPpm >= 100) {
      return 'stable'
    }
    if (jitterMs > 7 || lossPercent > 0.7 || rttMs > 60 || occupancyRatio < 0.35 || clockDriftPpm >= 50) {
      return 'balanced'
    }
    return 'ultraLow'
  }
}

const MODES = ['ultraLow', 'balanced', 'stable', 'recovery']
const TARGETS = { ultraLow: 22, balanced: 35, stable: 50, recovery: 65 }

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}
