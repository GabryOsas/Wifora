import test from 'node:test'
import assert from 'node:assert/strict'
import { TransportPolicy, tuneOpusSdp } from '../public/transport-policy.js'

test('TransportPolicy adapts each peer independently with asymmetric hysteresis', () => {
  const policy = new TransportPolicy({ degradeSamples: 2, recoverSamples: 3 })
  assert.equal(policy.snapshot().bitrate, 160_000)

  assert.equal(policy.update({ rttMs: 130, lossPercent: 0, jitterMs: 1 }).changed, false)
  const degraded = policy.update({ rttMs: 130, lossPercent: 0, jitterMs: 1 })
  assert.equal(degraded.currentTier, 1)
  assert.equal(degraded.bitrate, 96_000)
  assert.equal(degraded.fec, true)
  assert.equal(degraded.stereo, false)

  policy.update({ rttMs: 10, lossPercent: 0, jitterMs: 1 })
  policy.update({ rttMs: 10, lossPercent: 0, jitterMs: 1 })
  const recovering = policy.update({ rttMs: 10, lossPercent: 0, jitterMs: 1 })
  assert.equal(recovering.currentTier, 2)
  assert.equal(recovering.bitrate, 128_000)
})

test('TransportPolicy preserves explicit profile constraints in Opus SDP', () => {
  const policy = new TransportPolicy({ profileKey: 'lowlatency' }).snapshot()
  const input = 'v=0\r\na=rtpmap:111 opus/48000/2\r\n'
  const output = tuneOpusSdp(input, policy)
  assert.match(output, /ptime=10/)
  assert.match(output, /maxaveragebitrate=160000/)
  assert.match(output, /useinbandfec=1/)
  assert.match(output, /cbr=1/)
})
