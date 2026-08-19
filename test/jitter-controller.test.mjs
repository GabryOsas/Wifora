import test from 'node:test'
import assert from 'node:assert/strict'
import { AdaptiveJitterController } from '../public/jitter-controller.js'

test('AdaptiveJitterController increases its target quickly on sustained loss and slowly recovers', () => {
  const controller = new AdaptiveJitterController({ degradeSamples: 2, recoverSamples: 3 })
  assert.equal(controller.update({ jitterMs: 16 }).targetMs, 22)
  assert.deepEqual(controller.update({ jitterMs: 16 }), {
    mode: 'stable',
    targetMs: 50,
    degradationSamples: 0,
    recoverySamples: 0,
  })

  assert.equal(controller.update({}).mode, 'stable')
  assert.equal(controller.update({}).mode, 'stable')
  assert.equal(controller.update({}).mode, 'balanced')
  assert.equal(controller.update({}).targetMs, 35)
})

test('AdaptiveJitterController enters recovery immediately on an audio underflow', () => {
  const controller = new AdaptiveJitterController()
  const result = controller.update({ underruns: 1 })
  assert.equal(result.mode, 'recovery')
  assert.equal(result.targetMs, 65)
})
