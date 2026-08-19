import { TransportPolicy } from './transport-policy.js'
import { AdaptiveJitterController } from './jitter-controller.js'
import { ClockSyncController } from './clock-sync.js'

/**
 * Browser-side Adaptive Policy Engine that coordinates TransportPolicy,
 * AdaptiveJitterController, and ClockSyncController.
 */
export class ClientAdaptivePolicyEngine {
  constructor({
    profile = 'adaptive',
    degradeSamples = 2,
    recoverSamples = 5,
    maxRttMs = 500,
    maxCorrectionPpm = 100,
  } = {}) {
    this.transport = new TransportPolicy({ profile, degradeSamples, recoverSamples })
    this.jitter = new AdaptiveJitterController({ degradeSamples, recoverSamples })
    this.clockSync = new ClockSyncController({ maxRttMs, maxCorrectionPpm })
    this.lastHealthScore = 100
  }

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
      clockDriftPpm: clockDriftPpm || this.clockSync.driftPpm,
    })

    return {
      healthScore,
      transport: transportSnapshot,
      jitter: jitterSnapshot,
      clockSync: this.clockSync.snapshot(),
    }
  }

  observeClockReply(reply) {
    return this.clockSync.observeReply(reply)
  }

  setProfile(profileKey) {
    return this.transport.setProfile(profileKey)
  }

  snapshot() {
    return {
      healthScore: this.lastHealthScore,
      transport: this.transport.snapshot(),
      jitter: this.jitter.snapshot(),
      clockSync: this.clockSync.snapshot(),
    }
  }
}
