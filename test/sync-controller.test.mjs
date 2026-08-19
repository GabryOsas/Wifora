import test from 'node:test'
import assert from 'node:assert/strict'
import { MultiDeviceSyncController } from '../src/audio/clock/sync-controller.mjs'

test('MultiDeviceSyncController tracks multiple devices and computes group sync spread', () => {
  const sync = new MultiDeviceSyncController({ targetSpreadMs: 10, maxTolerableSpreadMs: 40 })

  sync.registerDevice('iphone-1')
  sync.registerDevice('iphone-2')
  sync.registerDevice('ipad-1')

  const now = Date.now()
  sync.updateDevice('iphone-1', { offsetMs: 2.0, rttMs: 20, driftPpm: 10, timestamp: now })
  sync.updateDevice('iphone-2', { offsetMs: 4.0, rttMs: 22, driftPpm: 15, timestamp: now })
  sync.updateDevice('ipad-1', { offsetMs: 3.0, rttMs: 18, driftPpm: 5, timestamp: now })

  const group = sync.getGroupStats(now)
  assert.equal(group.activeDevices, 3)
  assert.equal(group.meanOffsetMs, 3.0)
  assert.equal(group.minOffsetMs, 2.0)
  assert.equal(group.maxOffsetMs, 4.0)
  assert.equal(group.syncSpreadMs, 2.0)
  assert.equal(group.syncStatus, 'optimal')

  const guidance1 = sync.getPlayoutGuidance('iphone-1', now)
  assert.equal(guidance1.status, 'in-sync')
  assert.equal(guidance1.groupStatus, 'optimal')
})

test('MultiDeviceSyncController identifies desynchronized outliers and gives rate advice', () => {
  const sync = new MultiDeviceSyncController({ targetSpreadMs: 10, maxTolerableSpreadMs: 40 })

  const now = Date.now()
  sync.updateDevice('peer-a', { offsetMs: 0.0, rttMs: 15, timestamp: now })
  sync.updateDevice('peer-b', { offsetMs: 50.0, rttMs: 150, timestamp: now })

  const group = sync.getGroupStats(now)
  assert.equal(group.syncSpreadMs, 50.0)
  assert.equal(group.syncStatus, 'desynchronized')

  const guidanceB = sync.getPlayoutGuidance('peer-b', now)
  assert.equal(guidanceB.status, 'lead')
  assert.ok(guidanceB.rateAdvicePpm > 0)
})

test('MultiDeviceSyncController ignores stale devices', () => {
  const sync = new MultiDeviceSyncController({ staleTimeoutMs: 5_000 })
  const oldTime = Date.now() - 10_000
  sync.updateDevice('stale-peer', { offsetMs: 1.0, timestamp: oldTime })

  const group = sync.getGroupStats(Date.now())
  assert.equal(group.activeDevices, 0)
  assert.equal(group.syncStatus, 'idle')
})
