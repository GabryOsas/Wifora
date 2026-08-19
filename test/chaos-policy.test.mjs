import test from 'node:test'
import assert from 'node:assert/strict'
import { AdaptiveJitterController } from '../public/jitter-controller.js'
import { TransportPolicy } from '../public/transport-policy.js'
import { AudioEngine } from '../src/audio/engine.mjs'
import { ClockSyncController } from '../public/clock-sync.js'

test('chaos: a packet-loss burst switches quickly to a resilient transport and recovery buffer', () => {
  const jitter = new AdaptiveJitterController({ degradeSamples: 2, recoverSamples: 3 })
  const transport = new TransportPolicy({ degradeSamples: 2, recoverSamples: 3 })

  const burst = { rttMs: 240, jitterMs: 42, lossPercent: 8, lateFrames: 3 }
  const jitterState = jitter.update(burst)
  const transportState = transport.update({ ...burst, severe: true })

  assert.equal(jitterState.mode, 'recovery')
  assert.equal(jitterState.targetMs, 65)
  assert.equal(transportState.currentTier, 1)
  assert.equal(transportState.bitrate, 96_000)
  assert.equal(transportState.fec, true)
  assert.equal(transportState.stereo, false)
})

test('chaos: a single jitter spike does not flap policy, then a clean network recovers gradually', () => {
  const jitter = new AdaptiveJitterController({ degradeSamples: 2, recoverSamples: 3 })
  const transport = new TransportPolicy({ degradeSamples: 2, recoverSamples: 3 })
  const spike = { rttMs: 100, jitterMs: 16, lossPercent: 1.9 }

  assert.equal(jitter.update(spike).mode, 'ultraLow')
  assert.equal(transport.update(spike).currentTier, 3)

  jitter.update(spike)
  transport.update(spike)
  assert.equal(jitter.snapshot().mode, 'stable')
  assert.equal(transport.snapshot().currentTier, 2)

  const clean = { rttMs: 10, jitterMs: 1, lossPercent: 0 }
  jitter.update(clean)
  jitter.update(clean)
  assert.equal(jitter.update(clean).mode, 'balanced')

  transport.update(clean)
  transport.update(clean)
  const recovered = transport.update(clean)
  assert.equal(recovered.currentTier, 3)
  assert.equal(recovered.bitrate, 160_000)
})

test('chaos: multi-step loss escalation (1%, 3%, 5%, 10%) adapts tier and keeps FEC enabled', () => {
  const transport = new TransportPolicy({ degradeSamples: 2, recoverSamples: 3 })
  const jitter = new AdaptiveJitterController({ degradeSamples: 2, recoverSamples: 3 })

  // 1% loss: Moderate, maintains balanced/tier 3
  const loss1 = { rttMs: 40, jitterMs: 5, lossPercent: 1.0 }
  transport.update(loss1)
  transport.update(loss1)
  assert.equal(transport.snapshot().currentTier, 3)
  assert.equal(transport.snapshot().fec, true)

  // 3% loss: Drops to Tier 2 (Resilient)
  const loss3 = { rttMs: 70, jitterMs: 12, lossPercent: 3.2 }
  transport.update(loss3)
  transport.update(loss3)
  assert.equal(transport.snapshot().currentTier, 2)
  assert.equal(transport.snapshot().bitrate, 128_000)
  assert.equal(transport.snapshot().fec, true)

  // 5% loss & late frames: Jitter controller escalates to recovery mode (65 ms)
  const loss5 = { rttMs: 120, jitterMs: 25, lossPercent: 5.5, lateFrames: 2 }
  jitter.update(loss5)
  jitter.update(loss5)
  assert.equal(jitter.snapshot().mode, 'recovery')
  assert.equal(jitter.snapshot().targetMs, 65)

  // 10% severe loss: Immediate fallback to tier 1
  const loss10 = { rttMs: 250, jitterMs: 60, lossPercent: 12.0, severe: true }
  const severe = transport.update(loss10)
  assert.equal(severe.currentTier, 1)
  assert.equal(severe.bitrate, 96_000)
})

test('chaos: audio engine survives severe starvation, burst ingest, and maintains monotonic timestamps', () => {
  const engine = new AudioEngine({ channels: 2, bufferCapacity: 10 })

  // Simulate total capture stall: reader attempts 5 consecutive reads
  for (let i = 0; i < 5; i++) {
    const frame = engine.read(960)
    assert.equal(frame.silent, true)
    assert.equal(frame.samples.length, 1920)
  }

  const snapshotAfterStall = engine.snapshot()
  assert.equal(snapshotAfterStall.silenceFrames, 5)
  assert.equal(snapshotAfterStall.underruns, 5)

  // Simulate sudden burst of 15 frames ingested at once (exceeding capacity 10)
  for (let i = 0; i < 15; i++) {
    engine.ingest({ samples: new Float32Array(1920) })
  }

  const snapshotAfterBurst = engine.snapshot()
  assert.equal(snapshotAfterBurst.capacity, 10)
  assert.equal(snapshotAfterBurst.occupancy, 10)
  assert.equal(snapshotAfterBurst.overruns, 5)

  // Verify next frame emitted is not silent and sequence continues monotonically
  const frame = engine.read(960)
  assert.equal(frame.silent, undefined)
  assert.ok(frame.timestamp > 0)
  assert.ok(frame.sequence >= 6)
})

test('chaos: clock sync controller handles network asymmetric delay spikes without runaway drift', () => {
  const clock = new ClockSyncController({ smoothing: 0.2, maxRttMs: 300, maxCorrectionPpm: 100 })

  let baseTime = 10_000
  // 10 baseline samples
  for (let i = 0; i < 10; i++) {
    baseTime += 1000
    clock.observeReply({
      clientSentAt: baseTime,
      hostReceivedAt: baseTime + 10,
      hostSentAt: baseTime + 11,
      clientReceivedAt: baseTime + 21,
    })
  }

  const baselineSnapshot = clock.snapshot()
  assert.equal(baselineSnapshot.rejectedObservations, 0)
  assert.ok(Math.abs(baselineSnapshot.driftPpm) <= 10)

  // Asymmetric spike (huge delay on response)
  baseTime += 1000
  const spikeSnapshot = clock.observeReply({
    clientSentAt: baseTime,
    hostReceivedAt: baseTime + 10,
    hostSentAt: baseTime + 11,
    clientReceivedAt: baseTime + 450, // > 300ms maxRttMs -> rejected
  })

  assert.equal(spikeSnapshot.rejectedObservations, 1)
  assert.ok(Math.abs(spikeSnapshot.correctionPpm) <= 100)
  assert.ok(spikeSnapshot.playbackRate >= 0.999 && spikeSnapshot.playbackRate <= 1.001)
})
