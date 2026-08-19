import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionRegistry } from '../src/server/sessions.mjs'

test('SessionRegistry manages session lifecycles, device capabilities, and metadata updates', () => {
  const registry = new SessionRegistry({ sessionTimeoutMs: 10_000 })

  const session = registry.register({
    sessionId: 'sess-ios-1',
    deviceId: 'iphone-uuid-123',
    roomId: 'ROOMTEST',
    role: 'listener',
    deviceInfo: { type: 'phone', name: 'Apple iPhone 15 Pro', platform: 'iOS' },
    capabilities: { audioSession: true, wakeLock: true, jitterBufferTarget: false },
  })

  assert.equal(session.sessionId, 'sess-ios-1')
  assert.equal(session.deviceInfo.platform, 'iOS')
  assert.equal(session.capabilities.audioSession, true)
  assert.equal(session.capabilities.jitterBufferTarget, false)

  registry.touch('sess-ios-1', { syncOffsetMs: 2.5, healthScore: 95 })
  const updated = registry.get('sess-ios-1')
  assert.equal(updated.syncOffsetMs, 2.5)
  assert.equal(updated.healthScore, 95)

  const roomSessions = registry.listByRoom('ROOMTEST')
  assert.equal(roomSessions.length, 1)
  assert.equal(roomSessions[0].sessionId, 'sess-ios-1')

  assert.equal(registry.remove('sess-ios-1'), true)
  assert.equal(registry.get('sess-ios-1'), null)
})

test('SessionRegistry purges stale inactive sessions', () => {
  const registry = new SessionRegistry({ sessionTimeoutMs: 1_000 })
  const session = registry.register({
    sessionId: 'stale-sess',
    roomId: 'ROOM1',
  })
  session.lastSeenAt = Date.now() - 5_000

  const purged = registry.cleanupStale()
  assert.equal(purged, 1)
  assert.equal(registry.get('stale-sess'), null)
})
