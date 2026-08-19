export const CONTROL_PROTOCOL_VERSION = 1
export const CONTROL_MESSAGE_TYPES = new Set([
  'session.start',
  'session.stop',
  'device.announce',
  'audio.policy',
  'telemetry.report',
  'network.degraded',
  'network.recovered',
  'ice.restart',
  'clock.sync',
  'server.capabilities',
])

const LISTENER_CONTROL_TYPES = new Set([
  'session.stop',
  'device.announce',
  'telemetry.report',
  'network.degraded',
  'network.recovered',
  'ice.restart',
  'clock.sync',
  'server.capabilities',
])

const HOST_CONTROL_TYPES = new Set([
  'session.start',
  'session.stop',
  'audio.policy',
  'network.degraded',
  'network.recovered',
  'ice.restart',
  'clock.sync',
  'server.capabilities',
])

/** Validates the bounded, versioned control-message envelope. */
export function validateControlMessage(message) {
  if (!message || !CONTROL_MESSAGE_TYPES.has(message.type)) return { valid: false, reason: 'unknown-type' }
  if (message.version !== CONTROL_PROTOCOL_VERSION) return { valid: false, reason: 'unsupported-version' }
  if (!validIdentifier(message.sessionId) || !validIdentifier(message.deviceId))
    return { valid: false, reason: 'invalid-identity' }
  if (!Number.isSafeInteger(message.timestamp) || message.timestamp < 0)
    return { valid: false, reason: 'invalid-timestamp' }
  if (!isBoundedPayload(message.payload)) return { valid: false, reason: 'invalid-payload' }
  if (message.type === 'audio.policy' && !isAudioPolicy(message.payload))
    return { valid: false, reason: 'invalid-policy' }
  if (message.type === 'clock.sync' && !isClockSync(message.payload))
    return { valid: false, reason: 'invalid-clock-sync' }
  return { valid: true }
}

export function createControlMessage({ type, sessionId, deviceId, timestamp = Date.now(), payload = {} } = {}) {
  const message = { type, version: CONTROL_PROTOCOL_VERSION, sessionId, deviceId, timestamp, payload }
  const validation = validateControlMessage(message)
  if (!validation.valid) throw new TypeError(`Invalid control message: ${validation.reason}`)
  return message
}

/** Returns whether a registered role may originate a control message type. */
export function canSendControlMessage(role, type) {
  if (role === 'listener') return LISTENER_CONTROL_TYPES.has(type)
  if (role === 'host') return HOST_CONTROL_TYPES.has(type)
  return false
}

function validIdentifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 80
}

function isBoundedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length > 16)
    return false
  return Object.entries(payload).every(([key, value]) => {
    if (key.length > 64) return false
    return (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= 256)
    )
  })
}

function isAudioPolicy(payload) {
  return (
    Number.isInteger(payload.bitrate) &&
    payload.bitrate >= 6_000 &&
    payload.bitrate <= 512_000 &&
    Number.isInteger(payload.currentTier) &&
    payload.currentTier >= 1 &&
    payload.currentTier <= 5 &&
    typeof payload.fec === 'boolean' &&
    typeof payload.stereo === 'boolean' &&
    typeof payload.dtx === 'boolean' &&
    typeof payload.cbr === 'boolean' &&
    [10, 20, 40, 60].includes(payload.ptime) &&
    typeof payload.profileKey === 'string' &&
    payload.profileKey.length <= 32 &&
    Number.isInteger(payload.maxPlaybackRate) &&
    payload.maxPlaybackRate > 0
  )
}

function isClockSync(payload) {
  const nonNegative = (...fields) => fields.every((field) => Number.isFinite(payload[field]) && payload[field] >= 0)
  const finite = (...fields) => fields.every((field) => Number.isFinite(payload[field]))
  if (payload.mode === 'probe') return nonNegative('clientSentAt')
  if (payload.mode === 'reply') return nonNegative('clientSentAt', 'hostReceivedAt', 'hostSentAt')
  if (payload.mode === 'report') {
    return (
      nonNegative('rttMs', 'observations') &&
      finite('offsetMs', 'driftPpm', 'correctionPpm', 'playbackRate') &&
      Math.abs(payload.offsetMs) <= 10_000 &&
      Math.abs(payload.driftPpm) <= 1_000 &&
      Math.abs(payload.correctionPpm) <= 200 &&
      payload.playbackRate >= 0.999 &&
      payload.playbackRate <= 1.001 &&
      Number.isInteger(payload.observations)
    )
  }
  return false
}
