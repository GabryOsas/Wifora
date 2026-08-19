import test from 'node:test'
import assert from 'node:assert/strict'
import { WASAPI_FRAME_HEADER_BYTES, WasapiFrameDecoder, selectCaptureSource } from '../src/audio/capture/wasapi.mjs'

function makeFrame({ timestamp = 960, sequence = 2, samples = new Float32Array([0.25, -0.25, 0.5, -0.5]) } = {}) {
  const header = Buffer.alloc(WASAPI_FRAME_HEADER_BYTES)
  header.write('WFR1', 0, 'ascii')
  header.writeUInt16LE(1, 4)
  header.writeUInt16LE(2, 6)
  header.writeUInt32LE(48_000, 8)
  header.writeUInt32LE(samples.length / 2, 12)
  header.writeUInt32LE(sequence, 16)
  header.writeBigUInt64LE(BigInt(timestamp), 24)
  return Buffer.concat([header, Buffer.from(samples.buffer)])
}

test('WasapiFrameDecoder accepts fragmented binary PCM frames', () => {
  const decoder = new WasapiFrameDecoder()
  const binary = makeFrame()
  assert.deepEqual(decoder.push(binary.subarray(0, 13)), [])
  const [frame] = decoder.push(binary.subarray(13))
  assert.equal(frame.timestamp, 960)
  assert.equal(frame.sequence, 2)
  assert.equal(frame.sampleRate, 48_000)
  assert.equal(frame.channels, 2)
  assert.deepEqual(Array.from(frame.samples), [0.25, -0.25, 0.5, -0.5])
})

test('WasapiFrameDecoder resynchronizes after invalid prefix bytes', () => {
  const decoder = new WasapiFrameDecoder()
  const [frame] = decoder.push(Buffer.concat([Buffer.from('invalid'), makeFrame({ timestamp: 1920 })]))
  assert.equal(frame.timestamp, 1920)
})

test('selectCaptureSource retains browser capture when the optional native helper is unavailable', async () => {
  const browserSource = { kind: 'browser' }
  const selected = await selectCaptureSource({ browserSource, wasapi: { platform: 'linux' } })
  assert.equal(selected, browserSource)
})
