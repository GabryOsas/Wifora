import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canSendControlMessage,
  CONTROL_PROTOCOL_VERSION,
  createControlMessage,
  validateControlMessage,
} from '../src/shared/protocol.mjs'

test('control protocol creates and validates the versioned envelope', () => {
  const message = createControlMessage({
    type: 'telemetry.report',
    sessionId: 'session-1',
    deviceId: 'iphone-1',
    timestamp: 123,
    payload: { rttMs: 12, lossPercent: 0.1 },
  })
  assert.equal(message.version, CONTROL_PROTOCOL_VERSION)
  assert.deepEqual(validateControlMessage(message), { valid: true })
})

test('control protocol rejects unsupported versions and oversized payloads', () => {
  assert.deepEqual(
    validateControlMessage({
      type: 'telemetry.report',
      version: 2,
      sessionId: 's',
      deviceId: 'd',
      timestamp: 1,
      payload: {},
    }),
    { valid: false, reason: 'unsupported-version' }
  )
  assert.throws(() =>
    createControlMessage({
      type: 'telemetry.report',
      sessionId: 's',
      deviceId: 'd',
      payload: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`key${index}`, index])),
    })
  )
})

test('control protocol limits privileged audio policies to hosts and validates their shape', () => {
  assert.equal(canSendControlMessage('host', 'audio.policy'), true)
  assert.equal(canSendControlMessage('listener', 'audio.policy'), false)
  assert.deepEqual(
    validateControlMessage({
      type: 'audio.policy',
      version: 1,
      sessionId: 'listener-1',
      deviceId: 'host-1',
      timestamp: 1,
      payload: { bitrate: 160_000 },
    }),
    { valid: false, reason: 'invalid-policy' }
  )
})

test('control protocol accepts only valid clock-sync exchanges for registered roles', () => {
  assert.equal(canSendControlMessage('host', 'clock.sync'), true)
  assert.equal(canSendControlMessage('listener', 'clock.sync'), true)
  assert.deepEqual(
    validateControlMessage({
      type: 'clock.sync',
      version: 1,
      sessionId: 'listener-1',
      deviceId: 'listener-1',
      timestamp: 1,
      payload: { mode: 'probe', clientSentAt: 1 },
    }),
    { valid: true }
  )
  assert.deepEqual(
    validateControlMessage({
      type: 'clock.sync',
      version: 1,
      sessionId: 'listener-1',
      deviceId: 'listener-1',
      timestamp: 1,
      payload: {
        mode: 'report',
        rttMs: 5,
        offsetMs: 20_000,
        driftPpm: 0,
        correctionPpm: 0,
        playbackRate: 1,
        observations: 1,
      },
    }),
    { valid: false, reason: 'invalid-clock-sync' }
  )
})
