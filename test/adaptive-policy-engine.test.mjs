import test from 'node:test'
import assert from 'node:assert/strict'
import { AdaptivePolicyEngine } from '../src/audio/policy/adaptive-policy-engine.mjs'
import { ClientAdaptivePolicyEngine } from '../public/adaptive-policy-engine.js'

test('AdaptivePolicyEngine calculates health scores and coordinates transport, jitter, and drift', () => {
  const engine = new AdaptivePolicyEngine({ sampleRate: 48_000 })

  // Perfect link: Health score 97
  const perfect = engine.update({ rttMs: 10, jitterMs: 1, lossPercent: 0 })
  assert.equal(perfect.healthScore, 97)
  assert.equal(perfect.transport.currentTier, 3)
  assert.equal(perfect.jitter.mode, 'ultraLow')

  // Initial drift baseline observation
  engine.update({
    remoteTimestamp: 0,
    localTimestamp: 0,
  })

  // Degraded link with second drift observation
  const degraded = engine.update({
    rttMs: 180,
    jitterMs: 30,
    lossPercent: 8,
    lateFrames: 2,
    underruns: 1,
    remoteTimestamp: 48_010,
    localTimestamp: 48_000,
  })

  assert.ok(degraded.healthScore < 40)
  assert.equal(degraded.transport.currentTier, 1) // severe fallback triggered
  assert.equal(degraded.jitter.mode, 'recovery')
  assert.equal(degraded.drift.observations, 1)
})

test('ClientAdaptivePolicyEngine coordinates clock sync replies and updates client policy', () => {
  const clientEngine = new ClientAdaptivePolicyEngine()

  clientEngine.observeClockReply({
    clientSentAt: 1_000,
    hostReceivedAt: 1_010,
    hostSentAt: 1_012,
    clientReceivedAt: 1_022,
  })

  const state = clientEngine.update({ rttMs: 20, jitterMs: 2, lossPercent: 0 })
  assert.equal(state.clockSync.observations, 1)
  assert.equal(state.clockSync.rttMs, 20)
  assert.ok(state.healthScore > 85)
})
