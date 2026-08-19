import test from 'node:test'
import assert from 'node:assert/strict'
import { RingBuffer } from '../src/audio/buffer/ring-buffer.mjs'
import { MediaClock } from '../src/audio/clock/media-clock.mjs'
import { DriftController } from '../src/audio/clock/drift-controller.mjs'
import { AudioEngine } from '../src/audio/engine.mjs'

test('RingBuffer drops the oldest frame instead of accumulating latency', () => {
  const buffer = new RingBuffer({ capacity: 2 })
  buffer.push('first')
  buffer.push('second')
  const result = buffer.push('third')
  assert.equal(result.dropped, 'first')
  assert.equal(buffer.read(), 'second')
  assert.equal(buffer.read(), 'third')
  assert.equal(buffer.read(), null)
  assert.deepEqual(buffer.snapshot(), { capacity: 2, occupancy: 0, occupancyRatio: 0, overruns: 1, underruns: 1 })
})

test('MediaClock is monotonic and schedules silence deterministically', () => {
  const clock = new MediaClock({ sampleRate: 48_000, startTimestamp: 960 })
  assert.deepEqual(clock.next(960), { timestamp: 960, sequence: 0 })
  assert.deepEqual(clock.insertSilence(960), { timestamp: 1920, sequence: 1, silent: true })
  assert.equal(clock.reanchor(100), 2880)
  assert.equal(clock.reanchor(4800), 4800)
  assert.deepEqual(clock.snapshot(), { sampleRate: 48_000, timestamp: 4800, sequence: 2, reanchors: 1 })
})

test('DriftController smooths valid clock drift and bounds playout correction', () => {
  const controller = new DriftController({ smoothing: 0.5, maxPpm: 500, maxCorrectionPpm: 100 })
  assert.equal(controller.observe({ remoteTimestamp: 0, localTimestamp: 0 }).observations, 0)

  const estimate = controller.observe({ remoteTimestamp: 48_010, localTimestamp: 48_000 })
  assert.equal(estimate.observations, 1)
  assert.ok(Math.abs(estimate.estimatedPpm - 208.333333333) < 0.001)
  assert.equal(estimate.correctionPpm, 100)
  assert.equal(estimate.playbackRate, 1.0001)

  const rejected = controller.observe({ remoteTimestamp: 48_000, localTimestamp: 96_000 })
  assert.equal(rejected.rejectedObservations, 1)
  assert.equal(rejected.observations, 1)
})

test('AudioEngine emits silence on underflow and reports bounded-buffer metrics', () => {
  const engine = new AudioEngine({ channels: 2, bufferCapacity: 1 })
  const silent = engine.read(960)
  assert.equal(silent.silent, true)
  assert.equal(silent.samples.length, 1920)

  engine.ingest({ samples: new Float32Array(1920) })
  engine.ingest({ samples: new Float32Array(1920) })
  const frame = engine.read(960)
  assert.equal(frame.silent, undefined)
  assert.equal(frame.sequence, 2)
  assert.deepEqual(engine.snapshot(), {
    framesCaptured: 2,
    framesEmitted: 2,
    silenceFrames: 1,
    lateFrames: 1,
    capacity: 1,
    occupancy: 0,
    occupancyRatio: 0,
    overruns: 1,
    underruns: 1,
    clock: { sampleRate: 48_000, timestamp: 2880, sequence: 3, reanchors: 0 },
    drift: {
      sampleRate: 48_000,
      estimatedPpm: 0,
      correctionPpm: 0,
      playbackRate: 1,
      observations: 0,
      rejectedObservations: 0,
    },
    transports: [],
  })
})

test('AudioEngine exposes clock-drift observations without coupling capture to transport', () => {
  const engine = new AudioEngine({ drift: { maxCorrectionPpm: 50 } })
  engine.observeClockDrift({ remoteTimestamp: 0, localTimestamp: 0 })
  const estimate = engine.observeClockDrift({ remoteTimestamp: 48_005, localTimestamp: 48_000 })
  assert.equal(estimate.correctionPpm, 50)
  assert.equal(engine.snapshot().drift.observations, 1)
})
