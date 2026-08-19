/**
 * Device and Session Registry for Wifora.
 * Manages device fingerprints, capabilities, platform profiles, and session persistence.
 */
export class SessionRegistry {
  constructor({ sessionTimeoutMs = 60_000 } = {}) {
    this.sessionTimeoutMs = sessionTimeoutMs
    this.sessions = new Map()
  }

  register({
    sessionId,
    deviceId = sessionId,
    roomId,
    role = 'listener',
    deviceInfo = {},
    capabilities = {},
    ip = '127.0.0.1',
  } = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId must be a non-empty string')
    }

    const now = Date.now()
    const session = {
      sessionId,
      deviceId,
      roomId,
      role,
      deviceInfo: {
        type: deviceInfo.type || 'phone',
        name: deviceInfo.name || 'Unknown Device',
        platform: deviceInfo.platform || 'Unknown',
        ...deviceInfo,
      },
      capabilities: {
        jitterBufferTarget: Boolean(capabilities.jitterBufferTarget),
        audioSession: Boolean(capabilities.audioSession),
        wakeLock: Boolean(capabilities.wakeLock),
        webAudio: Boolean(capabilities.webAudio),
        opus48k: capabilities.opus48k !== false,
        ...capabilities,
      },
      ip,
      joinedAt: now,
      lastSeenAt: now,
      syncOffsetMs: null,
      healthScore: 100,
    }

    this.sessions.set(sessionId, session)
    return session
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null
  }

  touch(sessionId, updates = {}) {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    session.lastSeenAt = Date.now()
    if (Number.isFinite(updates.syncOffsetMs)) session.syncOffsetMs = updates.syncOffsetMs
    if (Number.isFinite(updates.healthScore)) session.healthScore = updates.healthScore
    if (updates.capabilities) Object.assign(session.capabilities, updates.capabilities)
    if (updates.deviceInfo) Object.assign(session.deviceInfo, updates.deviceInfo)
    return session
  }

  remove(sessionId) {
    return this.sessions.delete(sessionId)
  }

  listByRoom(roomId) {
    const results = []
    for (const session of this.sessions.values()) {
      if (session.roomId === roomId) {
        results.push(session)
      }
    }
    return results
  }

  cleanupStale(now = Date.now()) {
    let purged = 0
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastSeenAt > this.sessionTimeoutMs) {
        this.sessions.delete(sessionId)
        purged++
      }
    }
    return purged
  }
}
