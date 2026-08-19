/**
 * Estimates a listener's offset and rate difference relative to the host.
 * It uses an NTP-style four-timestamp exchange and keeps playout changes
 * deliberately imperceptible. Browsers may ignore playbackRate on a remote
 * MediaStream; callers must treat the returned rate as best effort.
 */
export class ClockSyncController {
  constructor({ smoothing = 0.2, maxRttMs = 500, maxOffsetMs = 10_000, maxCorrectionPpm = 100 } = {}) {
    if (!Number.isFinite(smoothing) || smoothing <= 0 || smoothing > 1) {
      throw new RangeError('smoothing must be greater than 0 and at most 1')
    }
    if (!Number.isFinite(maxRttMs) || maxRttMs <= 0) throw new RangeError('maxRttMs must be positive')
    if (!Number.isFinite(maxOffsetMs) || maxOffsetMs <= 0) throw new RangeError('maxOffsetMs must be positive')
    if (!Number.isFinite(maxCorrectionPpm) || maxCorrectionPpm <= 0) {
      throw new RangeError('maxCorrectionPpm must be positive')
    }

    this.smoothing = smoothing
    this.maxRttMs = maxRttMs
    this.maxOffsetMs = maxOffsetMs
    this.maxCorrectionPpm = maxCorrectionPpm
    this.reset()
  }

  observeReply({ clientSentAt, hostReceivedAt, hostSentAt, clientReceivedAt } = {}) {
    for (const [name, value] of Object.entries({ clientSentAt, hostReceivedAt, hostSentAt, clientReceivedAt })) {
      if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative number`)
    }

    const rttMs = clientReceivedAt - clientSentAt - (hostSentAt - hostReceivedAt)
    const offsetMs = (hostReceivedAt - clientSentAt + (hostSentAt - clientReceivedAt)) / 2
    if (rttMs < 0 || rttMs > this.maxRttMs || Math.abs(offsetMs) > this.maxOffsetMs) {
      this.rejectedObservations++
      return this.snapshot()
    }

    const previousOffset = this.offsetMs
    const previousReceivedAt = this.lastReceivedAt
    this.offsetMs = previousOffset === null ? offsetMs : previousOffset + this.smoothing * (offsetMs - previousOffset)
    this.lastReceivedAt = clientReceivedAt

    if (previousOffset !== null && previousReceivedAt !== null && clientReceivedAt > previousReceivedAt) {
      const instantPpm = ((offsetMs - previousOffset) / (clientReceivedAt - previousReceivedAt)) * 1_000_000
      if (Number.isFinite(instantPpm) && Math.abs(instantPpm) <= 1_000) {
        this.driftPpm =
          this.observations <= 1 ? instantPpm : this.driftPpm + this.smoothing * (instantPpm - this.driftPpm)
      }
    }

    this.rttMs = rttMs
    this.observations++
    this.correctionPpm = Math.max(-this.maxCorrectionPpm, Math.min(this.maxCorrectionPpm, this.driftPpm))
    return this.snapshot()
  }

  reset() {
    this.offsetMs = null
    this.rttMs = null
    this.driftPpm = 0
    this.correctionPpm = 0
    this.observations = 0
    this.rejectedObservations = 0
    this.lastReceivedAt = null
  }

  snapshot() {
    return {
      offsetMs: this.offsetMs,
      rttMs: this.rttMs,
      driftPpm: this.driftPpm,
      correctionPpm: this.correctionPpm,
      playbackRate: 1 + this.correctionPpm / 1_000_000,
      observations: this.observations,
      rejectedObservations: this.rejectedObservations,
    }
  }
}
