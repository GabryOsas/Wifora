import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { AudioEngine } from '../src/audio/engine.mjs'
import {
  WASAPI_FRAME_HEADER_BYTES,
  WasapiCaptureSource,
  WasapiFrameDecoder,
  selectCaptureSource,
} from '../src/audio/capture/wasapi.mjs'

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

test('WasapiCaptureSource bounds queued PCM frames with a drop-oldest policy', async () => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill() {},
  })
  const source = new WasapiCaptureSource({
    helperPath: fileURLToPath(import.meta.url),
    platform: 'win32',
    maxQueuedFrames: 2,
    spawnImpl: () => child,
  })
  await source.start()
  child.stdout.emit('data', makeFrame({ timestamp: 0 }))
  child.stdout.emit('data', makeFrame({ timestamp: 2 }))
  child.stdout.emit('data', makeFrame({ timestamp: 4 }))
  assert.equal(source.getStats().queuedFrames, 2)
  assert.equal(source.getStats().droppedFrames, 1)
  assert.equal(source.frames[0].timestamp, 2)
  source.stop()
})

test('AudioEngine continuously ingests frames from a capture source and stops it cleanly', async () => {
  let rejectPendingRead
  const source = {
    deviceInfo: { backend: 'test' },
    started: false,
    stopped: false,
    frames: [{ samples: new Float32Array([0.1, -0.1]), sampleRate: 48_000, channels: 2, timestamp: 0 }],
    async start() {
      this.started = true
    },
    read() {
      const frame = this.frames.shift()
      if (frame) return Promise.resolve(frame)
      return new Promise((_, reject) => {
        rejectPendingRead = reject
      })
    },
    async stop() {
      this.stopped = true
      rejectPendingRead?.(new Error('capture stopped'))
    },
  }
  const engine = new AudioEngine()
  await engine.startCapture(source)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(engine.snapshot().capture.framesIngested, 1)
  assert.equal(engine.snapshot().capture.running, true)
  assert.equal(await engine.stopCapture(), true)
  assert.equal(source.started, true)
  assert.equal(source.stopped, true)
})
