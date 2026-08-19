/**
 * Coordinates multi-device clock synchronization across multiple active listeners.
 * Calculates group sync spread, relative skew, and per-device playout correction guidance.
 */
export class MultiDeviceSyncController {
  constructor({ targetSpreadMs = 10, maxTolerableSpreadMs = 40, staleTimeoutMs = 15_000 } = {}) {
    this.targetSpreadMs = targetSpreadMs
    this.maxTolerableSpreadMs = maxTolerableSpreadMs
    this.staleTimeoutMs = staleTimeoutMs
    this.devices = new Map()
  }

  registerDevice(sessionId, metadata = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId must be a non-empty string')
    }
    this.devices.set(sessionId, {
      sessionId,
      metadata,
      offsetMs: null,
      rttMs: null,
      driftPpm: 0,
      correctionPpm: 0,
      updatedAt: 0,
    })
  }

  updateDevice(sessionId, { offsetMs, rttMs, driftPpm = 0, correctionPpm = 0, timestamp = Date.now() } = {}) {
    let device = this.devices.get(sessionId)
    if (!device) {
      this.registerDevice(sessionId)
      device = this.devices.get(sessionId)
    }

    if (Number.isFinite(offsetMs)) device.offsetMs = offsetMs
    if (Number.isFinite(rttMs)) device.rttMs = rttMs
    if (Number.isFinite(driftPpm)) device.driftPpm = driftPpm
    if (Number.isFinite(correctionPpm)) device.correctionPpm = correctionPpm
    device.updatedAt = timestamp

    return this.getPlayoutGuidance(sessionId)
  }

  removeDevice(sessionId) {
    return this.devices.delete(sessionId)
  }

  getGroupStats(now = Date.now()) {
    const active = []
    for (const device of this.devices.values()) {
      if (device.offsetMs !== null && now - device.updatedAt <= this.staleTimeoutMs) {
        active.push(device)
      }
    }

    if (active.length === 0) {
      return {
        totalDevices: this.devices.size,
        activeDevices: 0,
        meanOffsetMs: 0,
        syncSpreadMs: 0,
        syncStatus: 'idle',
        devices: [],
      }
    }

    const offsets = active.map((d) => d.offsetMs)
    const minOffset = Math.min(...offsets)
    const maxOffset = Math.max(...offsets)
    const sumOffset = offsets.reduce((acc, v) => acc + v, 0)
    const meanOffset = sumOffset / active.length
    const syncSpreadMs = active.length > 1 ? maxOffset - minOffset : 0

    let syncStatus = 'optimal'
    if (syncSpreadMs > this.maxTolerableSpreadMs) {
      syncStatus = 'desynchronized'
    } else if (syncSpreadMs > this.targetSpreadMs) {
      syncStatus = 'acceptable'
    }

    const deviceReports = active.map((d) => {
      const relativeToMeanMs = d.offsetMs - meanOffset
      return {
        sessionId: d.sessionId,
        offsetMs: d.offsetMs,
        relativeToMeanMs,
        rttMs: d.rttMs,
        driftPpm: d.driftPpm,
        correctionPpm: d.correctionPpm,
        inSync: Math.abs(relativeToMeanMs) <= this.targetSpreadMs / 2,
        updatedAt: d.updatedAt,
      }
    })

    return {
      totalDevices: this.devices.size,
      activeDevices: active.length,
      meanOffsetMs: meanOffset,
      minOffsetMs: minOffset,
      maxOffsetMs: maxOffset,
      syncSpreadMs,
      syncStatus,
      devices: deviceReports,
    }
  }

  getPlayoutGuidance(sessionId, now = Date.now()) {
    const group = this.getGroupStats(now)
    const target = group.devices.find((d) => d.sessionId === sessionId)
    if (!target) {
      return {
        sessionId,
        status: 'unknown',
        relativeOffsetMs: 0,
        rateAdvicePpm: 0,
      }
    }

    let rateAdvicePpm = 0
    if (Math.abs(target.relativeToMeanMs) > 1.0) {
      rateAdvicePpm = Math.max(-100, Math.min(100, Math.round(target.relativeToMeanMs * 10)))
    }

    return {
      sessionId,
      status: target.inSync ? 'in-sync' : target.relativeToMeanMs > 0 ? 'lead' : 'lag',
      relativeOffsetMs: target.relativeToMeanMs,
      rateAdvicePpm,
      groupStatus: group.syncStatus,
      groupSpreadMs: group.syncSpreadMs,
    }
  }
}
