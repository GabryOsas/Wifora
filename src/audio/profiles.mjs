/**
 * Audio transmission profiles and ANAE dynamic adaptation tiers.
 */

export const AUDIO_PROFILES = {
  adaptive: {
    maxBitrate: 256000,
    isAdaptive: true,
    cbr: false,
    labelKey: 'profileAdaptive',
  },
  lowlatency: {
    maxBitrate: 160000,
    isAdaptive: false,
    cbr: true,
    labelKey: 'profileLowLatency',
  },
  hifi: {
    maxBitrate: 384000,
    isAdaptive: false,
    cbr: false,
    labelKey: 'profileHifi',
  },
  eco: {
    maxBitrate: 96000,
    isAdaptive: false,
    cbr: false,
    labelKey: 'profileEco',
  },
}

export const AUTO_TIERS = [
  {
    tier: 1,
    name: 'Ultra-Resilient',
    bitrate: 96000,
    maxRtt: 9999,
    maxLoss: 99.0,
    maxJitter: 999,
    badge: 'badge-bad',
    labelKey: 'tierWeak',
  },
  {
    tier: 2,
    name: 'Anti-Lag Resilient',
    bitrate: 128000,
    maxRtt: 120,
    maxLoss: 4.0,
    maxJitter: 25,
    badge: 'badge-warn',
    labelKey: 'tierAntiLag',
  },
  {
    tier: 3,
    name: 'Balanced Standard',
    bitrate: 160000,
    maxRtt: 85,
    maxLoss: 1.8,
    maxJitter: 15,
    badge: 'badge-good',
    labelKey: 'tierStandard',
  },
  {
    tier: 4,
    name: 'Studio High',
    bitrate: 224000,
    maxRtt: 50,
    maxLoss: 0.8,
    maxJitter: 8,
    badge: 'badge-good',
    labelKey: 'tierHd',
  },
  {
    tier: 5,
    name: 'Studio Master',
    bitrate: 256000,
    maxRtt: 25,
    maxLoss: 0.2,
    maxJitter: 4,
    badge: 'badge-good',
    labelKey: 'tierMaster',
  },
]

export const ADAPTIVE_START_TIER = 3

/**
 * Customizes the WebRTC Session Description Protocol (SDP) fmtp parameters for Opus.
 *
 * @param {string} sdp - Raw SDP string
 * @param {string} [profileKey='adaptive'] - Active transmission profile
 * @returns {string} Tuned SDP string
 */
export function tuneOpusSdp(sdp, profileKey = 'adaptive') {
  if (!sdp || typeof sdp !== 'string') return sdp
  const prof = AUDIO_PROFILES[profileKey] || AUDIO_PROFILES.adaptive
  const maxBitrate = prof.maxBitrate || 256000
  const isCbr = Boolean(prof.cbr)

  const opusFmtpRegex = /a=fmtp:(\d+)\s+([^\r\n]+)/gi
  return sdp.replace(opusFmtpRegex, (fullMatch, payloadType, existingParams) => {
    // Only modify if payload type corresponds to Opus (or match audio stream)
    const isOpus =
      sdp.includes(`a=rtpmap:${payloadType} opus/48000`) ||
      existingParams.includes('minptime') ||
      existingParams.includes('useinbandfec')
    if (!isOpus && !sdp.includes(`opus/48000/${payloadType}`)) return fullMatch

    const params = new Map()
    existingParams.split(';').forEach((pair) => {
      const [k, v] = pair.trim().split('=')
      if (k) params.set(k.toLowerCase(), v !== undefined ? v : '')
    })

    params.set('minptime', '10')
    params.set('ptime', '20')
    params.set('maxptime', '20')
    params.set('useinbandfec', '1')
    params.set('usedtx', '0')
    params.set('stereo', '1')
    params.set('sprop-stereo', '1')
    params.set('maxaveragebitrate', String(maxBitrate))
    params.set('maxplaybackrate', '48000')
    if (isCbr) {
      params.set('cbr', '1')
    } else {
      params.delete('cbr')
    }

    const formatted = Array.from(params.entries())
      .map(([k, v]) => (v ? `${k}=${v}` : k))
      .join(';')

    return `a=fmtp:${payloadType} ${formatted}`
  })
}
