/** Audio profiles and the per-peer transport policy derived from WebRTC telemetry. */
export const AUDIO_PROFILES = {
  adaptive: { maxBitrate: 256_000, isAdaptive: true, cbr: false, labelKey: 'profileAdaptive' },
  lowlatency: { maxBitrate: 160_000, isAdaptive: false, cbr: true, labelKey: 'profileLowLatency' },
  hifi: { maxBitrate: 384_000, isAdaptive: false, cbr: false, labelKey: 'profileHifi' },
  eco: { maxBitrate: 96_000, isAdaptive: false, cbr: false, labelKey: 'profileEco' },
}

export const AUTO_TIERS = [
  { tier: 1, name: 'Ultra-Resilient', bitrate: 96_000, maxRtt: 9999, maxLoss: 99, maxJitter: 999 },
  { tier: 2, name: 'Anti-Lag Resilient', bitrate: 128_000, maxRtt: 120, maxLoss: 4, maxJitter: 25 },
  { tier: 3, name: 'Balanced Standard', bitrate: 160_000, maxRtt: 85, maxLoss: 1.8, maxJitter: 15 },
  { tier: 4, name: 'Studio High', bitrate: 224_000, maxRtt: 50, maxLoss: 0.8, maxJitter: 8 },
  { tier: 5, name: 'Studio Master', bitrate: 256_000, maxRtt: 25, maxLoss: 0.2, maxJitter: 4 },
]

export const ADAPTIVE_START_TIER = 3

export class TransportPolicy {
  constructor({ profileKey = 'adaptive', degradeSamples = 2, recoverSamples = 5 } = {}) {
    if (!Number.isInteger(degradeSamples) || degradeSamples < 1) {
      throw new RangeError('degradeSamples must be a positive integer')
    }
    if (!Number.isInteger(recoverSamples) || recoverSamples < 1) {
      throw new RangeError('recoverSamples must be a positive integer')
    }
    this.degradeSamples = degradeSamples
    this.recoverSamples = recoverSamples
    this.setProfile(profileKey)
  }

  setProfile(profileKey) {
    this.profileKey = AUDIO_PROFILES[profileKey] ? profileKey : 'adaptive'
    this.profile = AUDIO_PROFILES[this.profileKey]
    this.currentTier = this.profile.isAdaptive ? ADAPTIVE_START_TIER : AUTO_TIERS.length
    this.pendingDowngradeTier = null
    this.pendingDowngradeSamples = 0
    this.consecutiveGood = 0
    return this.snapshot({ changed: true })
  }

  update({ rttMs, lossPercent, jitterMs, severe = false } = {}) {
    if (!this.profile.isAdaptive) return this.snapshot()

    const targetTier = this.#targetTier({ rttMs, lossPercent, jitterMs })
    const previousTier = this.currentTier
    if (targetTier < this.currentTier) {
      if (severe || this.pendingDowngradeTier === targetTier) {
        this.pendingDowngradeSamples++
      } else {
        this.pendingDowngradeTier = targetTier
        this.pendingDowngradeSamples = 1
      }
      if (severe || this.pendingDowngradeSamples >= this.degradeSamples) {
        this.currentTier = targetTier
        this.consecutiveGood = 0
        this.pendingDowngradeTier = null
        this.pendingDowngradeSamples = 0
      }
    } else if (targetTier > this.currentTier) {
      this.pendingDowngradeTier = null
      this.pendingDowngradeSamples = 0
      this.consecutiveGood++
      if (this.consecutiveGood >= this.recoverSamples) {
        this.currentTier = Math.min(this.currentTier + 1, targetTier)
        this.consecutiveGood = 0
      }
    } else {
      this.pendingDowngradeTier = null
      this.pendingDowngradeSamples = 0
      this.consecutiveGood = Math.min(this.consecutiveGood + 1, this.recoverSamples)
    }
    return this.snapshot({ changed: previousTier !== this.currentTier })
  }

  snapshot({ changed = false } = {}) {
    const tier = AUTO_TIERS[this.currentTier - 1]
    const isLowLatency = this.profileKey === 'lowlatency'
    const isResilient = this.currentTier <= 3
    return {
      changed,
      profileKey: this.profileKey,
      currentTier: this.currentTier,
      bitrate: this.profile.isAdaptive ? tier.bitrate : this.profile.maxBitrate,
      // Preserve FEC for every explicit user profile. Adaptive sessions can
      // disable it only after a sustained recovery to the high-quality tiers.
      fec: this.profileKey !== 'adaptive' || isResilient,
      stereo: this.currentTier > 1,
      ptime: isLowLatency ? 10 : 20,
      dtx: false,
      cbr: this.profile.cbr,
      maxPlaybackRate: 48_000,
    }
  }

  #targetTier({ rttMs, lossPercent, jitterMs }) {
    const rtt = Number.isFinite(rttMs) ? rttMs : 10
    const loss = Number.isFinite(lossPercent) ? lossPercent : 0
    const jitter = Number.isFinite(jitterMs) ? jitterMs : 1
    for (let index = AUTO_TIERS.length - 1; index >= 0; index--) {
      const tier = AUTO_TIERS[index]
      if (rtt <= tier.maxRtt && loss <= tier.maxLoss && jitter <= tier.maxJitter) return tier.tier
    }
    return 1
  }
}

/** Applies the negotiated portion of a per-peer transport policy to Opus SDP. */
export function tuneOpusSdp(sdp, policy) {
  if (!sdp || typeof sdp !== 'string') return sdp
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/(?:1|2)/i)
  if (!opusMatch) return sdp
  const payload = opusMatch[1]
  const fmtp = [
    'minptime=10',
    `ptime=${policy.ptime}`,
    `maxptime=${policy.ptime}`,
    `useinbandfec=${policy.fec ? 1 : 0}`,
    `usedtx=${policy.dtx ? 1 : 0}`,
    `stereo=${policy.stereo ? 1 : 0}`,
    `sprop-stereo=${policy.stereo ? 1 : 0}`,
    `maxaveragebitrate=${policy.bitrate}`,
    `maxplaybackrate=${policy.maxPlaybackRate}`,
    `cbr=${policy.cbr ? 1 : 0}`,
  ].join(';')
  const existingFmtp = new RegExp(`a=fmtp:${payload}[^\\r\\n]*`, 'i')
  return existingFmtp.test(sdp)
    ? sdp.replace(existingFmtp, `a=fmtp:${payload} ${fmtp}`)
    : sdp.replace(opusMatch[0], `${opusMatch[0]}\r\na=fmtp:${payload} ${fmtp}`)
}
