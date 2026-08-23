import test from 'node:test'
import assert from 'node:assert/strict'
import { ElasticPlayoutBuffer } from '../public/playout-core.js'

const QUANTUM = 128

function sineInterleaved(frames, sampleRate = 48_000, amplitude = 0.5) {
  const data = new Float32Array(frames * 2)
  for (let index = 0; index < frames; index++) {
    const value = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * amplitude
    data[index * 2] = value
    data[index * 2 + 1] = value
  }
  return data
}

test('ElasticPlayoutBuffer validates its configuration', () => {
  assert.throws(() => new ElasticPlayoutBuffer({ sampleRate: 1000 }), RangeError)
  assert.throws(() => new ElasticPlayoutBuffer({ targetMs: -1 }), RangeError)
  assert.throws(() => new ElasticPlayoutBuffer({ capacityMs: 10, targetMs: 80 }), RangeError)
})

test('buffers silently until primed then plays pushed audio', () => {
  const buffer = new ElasticPlayoutBuffer({ targetMs: 40, primeMs: 20 })
  const leftOut = new Float32Array(QUANTUM)
  const rightOut = new Float32Array(QUANTUM)

  assert.equal(buffer.read(leftOut, rightOut), false)
  assert.equal(Math.max(...leftOut), 0)

  buffer.push(new Float32Array(QUANTUM * 2))
  assert.equal(buffer.read(leftOut, rightOut), false)
  assert.equal(Math.max(...leftOut), 0)

  buffer.push(sineInterleaved(20 * QUANTUM))
  assert.equal(buffer.read(leftOut, rightOut), true)

  let peak = 0
  for (let call = 0; call < 20 && peak <= 0.1; call++) {
    buffer.read(leftOut, rightOut)
    peak = leftOut.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
  }
  assert.ok(peak > 0.1, 'audio should flow once past the startup fade')
})

test('counts an underrun and conceals with decaying silence instead of NaN', () => {
  const buffer = new ElasticPlayoutBuffer({ targetMs: 10, primeMs: 5, holdMs: 10 })
  const leftOut = new Float32Array(QUANTUM)
  const rightOut = new Float32Array(QUANTUM)

  buffer.push(sineInterleaved(6 * QUANTUM))
  buffer.read(leftOut, rightOut)
  const before = buffer.stats.underruns

  let starvedReads = 0
  for (let call = 0; call < 50; call++) {
    if (!buffer.read(leftOut, rightOut)) starvedReads++
    for (const sample of leftOut) assert.ok(Number.isFinite(sample))
  }
  assert.ok(buffer.stats.underruns > before || starvedReads >= 0)
  assert.equal(buffer.snapshot().primed, false)

  const tailPeak = leftOut.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
  assert.ok(tailPeak < 0.01, 'concealment must decay towards silence')
})

test('fade-in ramps after starvation recovery', () => {
  const buffer = new ElasticPlayoutBuffer({ targetMs: 10, primeMs: 5, fadeMs: 8, holdMs: 5 })
  const leftOut = new Float32Array(QUANTUM)
  const rightOut = new Float32Array(QUANTUM)

  const flat = new Float32Array(4 * QUANTUM * 2).fill(0.5)
  buffer.push(flat)
  for (let call = 0; call < 5; call++) buffer.read(leftOut, rightOut)
  assert.equal(buffer.snapshot().primed, false)

  buffer.push(flat)
  assert.equal(buffer.read(leftOut, rightOut), true)
  const headPeak = leftOut.subarray(0, 16).reduce((max, v) => Math.max(max, Math.abs(v)), 0)
  const tailPeak = leftOut.subarray(112).reduce((max, v) => Math.max(max, Math.abs(v)), 0)
  assert.ok(tailPeak > headPeak * 2, `resume should ramp up: head=${headPeak} tail=${tailPeak}`)
})

test('micro-rate correction drains a backlog instead of growing latency forever', () => {
  const buffer = new ElasticPlayoutBuffer({ targetMs: 40, primeMs: 20, capacityMs: 240, catchUpMs: 100 })
  const leftOut = new Float32Array(QUANTUM)
  const rightOut = new Float32Array(QUANTUM)

  buffer.push(sineInterleaved(120 * QUANTUM))

  let pushed = QUANTUM * 120
  for (let call = 0; call < 400; call++) {
    buffer.read(leftOut, rightOut)
    buffer.push(sineInterleaved(QUANTUM))
    pushed += QUANTUM
  }

  assert.ok(buffer.readPosition <= pushed + 1, 'consumed input must never exceed pushed input')
  const bufferedMs = buffer.bufferedMs
  assert.ok(bufferedMs < 140, `occupancy should converge near target, got ${bufferedMs}ms`)
})

test('external drift is clamped and folded into the correction', () => {
  const buffer = new ElasticPlayoutBuffer({ maxCorrectionPpm: 300 })
  assert.equal(buffer.setDriftPpm(5000), 150)
  assert.equal(buffer.setDriftPpm(Number.NaN), 0)
  assert.equal(buffer.snapshot().driftPpm, 0)
  buffer.setDriftPpm(-150)
  assert.equal(buffer.snapshot().driftPpm, -150)
})

test('overflow drops the oldest samples to stay bounded', () => {
  const buffer = new ElasticPlayoutBuffer({ targetMs: 10, primeMs: 5, capacityMs: 60 })
  const leftOut = new Float32Array(QUANTUM)
  const rightOut = new Float32Array(QUANTUM)

  buffer.push(sineInterleaved(100 * QUANTUM))
  assert.ok(buffer.bufferedMs <= 62)
  assert.ok(buffer.stats.droppedFrames > 0)
  assert.equal(buffer.read(leftOut, rightOut), true)
})

test('reset clears counters and ring contents', () => {
  const buffer = new ElasticPlayoutBuffer({ targetMs: 10, primeMs: 5 })
  buffer.push(sineInterleaved(4 * QUANTUM))
  buffer.read(new Float32Array(QUANTUM), new Float32Array(QUANTUM))
  buffer.reset()

  const snapshot = buffer.snapshot()
  assert.equal(snapshot.primed, false)
  assert.equal(snapshot.bufferedMs, 0)
  assert.equal(snapshot.pushedFrames, 0)
  assert.equal(snapshot.consumedFrames, 0)
})
