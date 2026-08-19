import test from 'node:test'
import assert from 'node:assert/strict'
import { ClockSyncController } from '../public/clock-sync.js'

test('ClockSyncController estimates a bounded host offset from a four-timestamp exchange', () => {
  const controller = new ClockSyncController({ smoothing: 1, maxCorrectionPpm: 100 })
  const first = controller.observeReply({
    clientSentAt: 1_000,
    hostReceivedAt: 1_020,
    hostSentAt: 1_022,
    clientReceivedAt: 1_042,
  })
  assert.equal(first.rttMs, 40)
  assert.equal(first.offsetMs, 0)

  const second = controller.observeReply({
    clientSentAt: 11_000,
    hostReceivedAt: 11_025,
    hostSentAt: 11_027,
    clientReceivedAt: 11_043,
  })
  assert.equal(second.offsetMs, 4.5)
  assert.equal(second.correctionPpm, 100)
  assert.equal(second.playbackRate, 1.0001)
})

test('ClockSyncController rejects delayed or malformed clock exchanges', () => {
  const controller = new ClockSyncController({ maxRttMs: 100 })
  const rejected = controller.observeReply({
    clientSentAt: 1_000,
    hostReceivedAt: 1_200,
    hostSentAt: 1_201,
    clientReceivedAt: 1_501,
  })
  assert.equal(rejected.observations, 0)
  assert.equal(rejected.rejectedObservations, 1)
  assert.throws(() =>
    controller.observeReply({ clientSentAt: -1, hostReceivedAt: 0, hostSentAt: 0, clientReceivedAt: 1 })
  )
})
