import test from 'node:test'
import assert from 'node:assert/strict'
import { AudioEngine } from '../src/audio/engine.mjs'
import { AudioTransport } from '../src/transport/base.mjs'
import { WebRtcAudioTransport } from '../src/transport/webrtc/transport.mjs'
import { AirPlayAudioTransport, AirPlayState } from '../src/transport/airplay/transport.mjs'

test('AudioTransport base class manages lifecycle and tracks frame statistics', async () => {
  const transport = new AudioTransport({ name: 'test-transport' })
  assert.equal(transport.running, false)

  await transport.start()
  assert.equal(transport.running, true)

  const sent = await transport.sendFrame({ samples: new Float32Array(960) })
  assert.equal(sent, true)
  assert.equal(transport.getStats().framesSent, 1)

  await transport.stop()
  assert.equal(transport.running, false)
})

test('WebRtcAudioTransport manages peer listeners and transmits frames', async () => {
  const webrtc = new WebRtcAudioTransport()
  await webrtc.start()

  webrtc.addPeer('peer-1', {})
  webrtc.addPeer('peer-2', {})
  assert.equal(webrtc.getStats().activeClients, 2)

  const sent = await webrtc.sendFrame({ samples: new Float32Array(960) })
  assert.equal(sent, true)

  webrtc.removePeer('peer-1')
  assert.equal(webrtc.getStats().activeClients, 1)
})

test('AirPlayAudioTransport handles RTSP handshake and RTP audio packetization', async () => {
  const airplay = new AirPlayAudioTransport()
  assert.deepEqual(airplay.getCapabilities(), {
    experimental: true,
    appleDeviceCompatible: false,
    codecs: ['pcm-s16le'],
    networkServer: false,
    unsupported: ['ALAC', 'RTSP/UDP sockets', 'pairing', 'FairPlay', 'AirPlay 2'],
  })
  assert.equal(airplay.handleRtspRequest('RECORD', { CSeq: '0' }).statusCode, 455)

  // 1. ANNOUNCE
  const annRes = airplay.handleRtspRequest('ANNOUNCE', { CSeq: '1' })
  assert.equal(annRes.statusCode, 200)
  assert.equal(airplay.state, AirPlayState.ANNOUNCED)

  // 2. SETUP
  const setupRes = airplay.handleRtspRequest('SETUP', { CSeq: '2' })
  assert.equal(setupRes.statusCode, 200)
  assert.equal(airplay.state, AirPlayState.CONFIGURED)

  // 3. RECORD
  const recordRes = airplay.handleRtspRequest('RECORD', { CSeq: '3' })
  assert.equal(recordRes.statusCode, 200)
  assert.equal(airplay.state, AirPlayState.STREAMING)

  // 4. Packetize audio frame
  const pcmFrame = new Float32Array([0.5, -0.5, 0.25, -0.25])
  const rtpPacket = airplay.packageRtpAudio(pcmFrame)
  assert.ok(rtpPacket)
  assert.equal(rtpPacket[0], 0x80) // RTP v2
  assert.equal(rtpPacket[1], 0x60) // Dynamic audio payload

  // 5. TEARDOWN
  const teardownRes = airplay.handleRtspRequest('TEARDOWN', { CSeq: '4' })
  assert.equal(teardownRes.statusCode, 200)
  assert.equal(airplay.state, AirPlayState.IDLE)
  assert.equal(airplay.handleRtspRequest('OPTIONS', { CSeq: '5' }).statusCode, 501)
})

test('AudioEngine broadcasts ingested frames to registered transports', async () => {
  const engine = new AudioEngine({ channels: 2 })
  const transport = new AudioTransport({ name: 'mock-transport' })
  await transport.start()

  engine.registerTransport(transport)
  engine.ingest({ samples: new Float32Array(1920) })

  // Wait a microtask for broadcast promise
  await new Promise((r) => setTimeout(r, 10))

  assert.equal(transport.getStats().framesSent, 1)
  assert.equal(engine.snapshot().transports.length, 1)
  assert.equal(engine.snapshot().transports[0].name, 'mock-transport')

  engine.unregisterTransport(transport)
  assert.equal(engine.snapshot().transports.length, 0)
})
