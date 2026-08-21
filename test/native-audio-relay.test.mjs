import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { createWiforaServer } from '../server.mjs'

function waitFor(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 2_000)
    socket.once(event, (...args) => {
      clearTimeout(timer)
      resolve(args)
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

test('native audio relay authenticates the host and forwards bounded PCM only to it', async (t) => {
  let rejectRead
  const source = {
    started: false,
    stopped: false,
    deviceInfo: { backend: 'test-native' },
    frames: [{ samples: new Float32Array([0.25, -0.25]), sampleRate: 48_000, channels: 2, timestamp: 0 }],
    async start() {
      this.started = true
    },
    read() {
      const frame = this.frames.shift()
      if (frame) return Promise.resolve(frame)
      return new Promise((_, reject) => {
        rejectRead = reject
      })
    },
    async stop() {
      this.stopped = true
      rejectRead?.(new Error('test capture stopped'))
    },
  }
  const app = createWiforaServer({ port: 0, nativeSourceFactory: () => source })
  const address = await app.listen(0, '127.0.0.1')
  const httpUrl = `http://127.0.0.1:${address.port}`
  const wsUrl = `ws://127.0.0.1:${address.port}`
  const roomId = 'NATIVE01'
  const hostKey = 'a'.repeat(43)

  t.after(async () => {
    await app.close()
  })

  const signal = new WebSocket(`${wsUrl}/signal`, { origin: httpUrl })
  await waitFor(signal, 'open')
  signal.send(JSON.stringify({ type: 'register', role: 'host', roomId, hostKey }))
  const [registration] = await waitFor(signal, 'message')
  assert.equal(JSON.parse(registration.toString()).type, 'registered')

  const nativeAudio = new WebSocket(`${wsUrl}/native-audio?room=${roomId}&key=${hostKey}`, { origin: httpUrl })
  const [payload] = await waitFor(nativeAudio, 'message')
  assert.equal(payload.readFloatLE(0), 0.25)
  assert.equal(payload.readFloatLE(4), -0.25)
  assert.equal(source.started, true)
  assert.equal(app.nativeAudio.snapshot().framesRelayed, 1)

  nativeAudio.close()
  await waitFor(nativeAudio, 'close')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(source.stopped, true)
  signal.close()
})
