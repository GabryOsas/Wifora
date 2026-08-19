import { TransportPolicy } from '../../../public/transport-policy.js'
import { AdaptiveJitterController } from '../../../public/jitter-controller.js'
import { DriftController } from '../clock/drift-controller.mjs'

/**
 * Unified Adaptive Policy Engine that coordinates TransportPolicy,
 * AdaptiveJitterController, and Clock Drift Controller based on a composite
 * link health score and real-time network telemetry.
 */
export class AdaptivePolicyEngine {
  constructor({
    profile = 'adaptive',
    degradeSamples = 2,
    recoverSamples = 5,
    sampleRate = 48_000,
    maxPpm = 500,
    maxCorrectionPpm = 100,
  } = {}) {
    this.transport = new TransportPolicy({ profile, degradeSamples, recoverSamples })
    this.jitter = new AdaptiveJitterController({ degradeSamples, recoverSamples })
    this.drift = new DriftController({ sampleRate, maxPpm, maxCorrectionPpm })
    this.lastHealthScore = 100
  }

  /**
   * Computes a normalized Link Health Score from 0 (critical) to 100 (flawless).
   */
  calculateHealthScore({ rttMs = 0, jitterMs = 0, lossPercent = 0, lateFrames = 0, underruns = 0 } = {}) {
    const penalty = lossPercent * 5.0 + jitterMs * 0.8 + rttMs * 0.2 + lateFrames * 10.0 + underruns * 15.0
    return Math.max(0, Math.min(100, Math.round(100 - penalty)))
  }

  update({
    rttMs = 0,
    jitterMs = 0,
    lossPercent = 0,
    lateFrames = 0,
    underruns = 0,
    occupancyRatio,
    clockDriftPpm = 0,
    remoteTimestamp,
    localTimestamp,
    severe = false,
  } = {}) {
    const healthScore = this.calculateHealthScore({ rttMs, jitterMs, lossPercent, lateFrames, underruns })
    this.lastHealthScore = healthScore

    const isSevere = severe || healthScore < 40 || lossPercent >= 10 || rttMs >= 200

    const transportSnapshot = this.transport.update({
      rttMs,
      jitterMs,
      lossPercent,
      severe: isSevere,
    })

    const jitterSnapshot = this.jitter.update({
      rttMs,
      jitterMs,
      lossPercent,
      lateFrames,
      underruns,
      occupancyRatio,
      clockDriftPpm,
    })

    let driftSnapshot = this.drift.snapshot()
    if (Number.isFinite(remoteTimestamp) && Number.isFinite(localTimestamp)) {
      driftSnapshot = this.drift.observe({ remoteTimestamp, localTimestamp })
    }

    return {
      healthScore,
      transport: transportSnapshot,
      jitter: jitterSnapshot,
      drift: driftSnapshot,
    }
  }

  setProfile(profileKey) {
    return this.transport.setProfile(profileKey)
  }

  snapshot() {
    return {
      healthScore: this.lastHealthScore,
      transport: this.transport.snapshot(),
      jitter: this.jitter.snapshot(),
      drift: this.drift.snapshot(),
    }
  }
}
