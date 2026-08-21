import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { createWiforaServer } from '../server.mjs'

function connectClient(port, options = {}) {
  const origin = options.origin ?? `http://127.0.0.1:${port}`
  const ws = new WebSocket(`ws://127.0.0.1:${port}/signal`, {
    headers: { origin },
  })

  const queue = []
  const waiters = []

  ws.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString())
      const waiterIdx = waiters.findIndex((w) => w.predicate(parsed))
      if (waiterIdx !== -1) {
        const waiter = waiters.splice(waiterIdx, 1)[0]
        clearTimeout(waiter.timer)
        waiter.resolve(parsed)
      } else {
        queue.push(parsed)
      }
    } catch {}
  })

  return {
    ws,
    ready: () =>
      new Promise((resolve, reject) => {
        ws.once('open', resolve)
        ws.once('error', reject)
      }),
    waitForMessage: (predicate, timeoutMs = 3000) =>
      new Promise((resolve, reject) => {
        const queueIdx = queue.findIndex(predicate)
        if (queueIdx !== -1) {
          return resolve(queue.splice(queueIdx, 1)[0])
        }
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.resolve === resolve)
          if (idx !== -1) waiters.splice(idx, 1)
          reject(new Error(`Timeout waiting for WS message matching predicate after ${timeoutMs}ms`))
        }, timeoutMs)
        waiters.push({ predicate, resolve, reject, timer })
      }),
    send: (obj) => ws.send(JSON.stringify(obj)),
    close: (code, reason) => ws.close(code, reason),
  }
}

test('WebSocket Signaling & Lifecycle', async (t) => {
  let app
  let port
  const validHostKeyA = 'A'.repeat(43)
  const validHostKeyB = 'B'.repeat(43)

  t.beforeEach(async () => {
    app = createWiforaServer({ port: 0 })
    const addr = await app.listen(0, '127.0.0.1')
    port = addr.port
  })

  t.afterEach(async () => {
    if (app) await app.close()
  })

  await t.test('Host registration with valid and invalid room codes / keys', async () => {
    const host = connectClient(port)
    await host.ready()

    // Invalid room code
    host.send({ type: 'register', role: 'host', roomId: 'invalid', hostKey: validHostKeyA })
    let msg = await host.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(msg.message, 'Codice stanza non valido.')

    // Invalid host key
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: 'short' })
    msg = await host.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(msg.message, 'Chiave trasmissione non valida.')

    // Valid registration
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    msg = await host.waitForMessage((m) => m.type === 'registered')
    assert.ok(msg.clientId)

    // Hijack attempt with different key on same room
    const rogue = connectClient(port)
    await rogue.ready()
    rogue.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyB })
    msg = await rogue.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(msg.message, 'Questa stanza è già in uso.')

    host.close()
    rogue.close()
  })

  await t.test('Listener registration and joining notifications', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const listener = connectClient(port)
    await listener.ready()

    // Listener trying to join a non-existent room
    listener.send({ type: 'register', role: 'listener', roomId: 'NONE9999', sessionId: 'sess-1' })
    let msg = await listener.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(msg.message, 'Nessuna trasmissione attiva per questo codice.')

    // Listener joining valid room
    listener.send({
      type: 'register',
      role: 'listener',
      roomId: 'ROOM1234',
      sessionId: 'sess-1',
      deviceName: 'iPhone 15 Pro',
      deviceType: 'phone',
    })

    const listenerReg = await listener.waitForMessage((m) => m.type === 'registered')
    assert.strictEqual(listenerReg.sessionId, 'sess-1')
    assert.strictEqual(listenerReg.hostAvailable, true)

    const hostNotif = await host.waitForMessage((m) => m.type === 'listener-joined')
    assert.strictEqual(hostNotif.sessionId, 'sess-1')
    assert.strictEqual(hostNotif.deviceName, 'iPhone 15 Pro')
    assert.strictEqual(hostNotif.deviceType, 'phone')

    host.close()
    listener.close()
  })

  await t.test('Max listeners limit enforcement (configurable maxListeners)', async () => {
    // Create server with explicit maxListeners: 2 to test enforcement
    const customApp = createWiforaServer({ port: 0, maxListeners: 2 })
    const customAddr = await customApp.listen(0, '127.0.0.1')
    const customPort = customAddr.port

    const host = connectClient(customPort)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const l1 = connectClient(customPort)
    await l1.ready()
    l1.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 's1' })
    await l1.waitForMessage((m) => m.type === 'registered')

    const l2 = connectClient(customPort)
    await l2.ready()
    l2.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 's2' })
    await l2.waitForMessage((m) => m.type === 'registered')

    // 3rd listener should be rejected because maxListeners = 2
    const l3 = connectClient(customPort)
    await l3.ready()
    l3.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 's3' })
    const err = await l3.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(err.message, 'La stanza ha già raggiunto il limite di ascoltatori.')

    host.close()
    l1.close()
    l2.close()
    l3.close()
    await customApp.close()
  })

  await t.test('Listener reconnection with same sessionId replaces previous socket', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const l1 = connectClient(port)
    await l1.ready()
    l1.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 'persistent-session' })
    await l1.waitForMessage((m) => m.type === 'registered')

    // Reconnecting with same sessionId
    const l1Reconnected = connectClient(port)
    await l1Reconnected.ready()
    l1Reconnected.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 'persistent-session' })
    const reg = await l1Reconnected.waitForMessage((m) => m.type === 'registered')
    assert.strictEqual(reg.sessionId, 'persistent-session')

    // Room should still have exactly 1 listener, allowing another to join
    const l2 = connectClient(port)
    await l2.ready()
    l2.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 's2' })
    const l2Reg = await l2.waitForMessage((m) => m.type === 'registered')
    assert.strictEqual(l2Reg.sessionId, 's2')

    host.close()
    l1.close()
    l1Reconnected.close()
    l2.close()
  })

  await t.test('Host can re-register after an abnormal signaling disconnect without ending the room', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'RECOVR01', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const closed = new Promise((resolve) => host.ws.once('close', resolve))
    host.ws.terminate()
    await closed
    assert.equal(app.rooms.has('RECOVR01'), true)

    const reconnectedHost = connectClient(port)
    await reconnectedHost.ready()
    reconnectedHost.send({ type: 'register', role: 'host', roomId: 'RECOVR01', hostKey: validHostKeyA })
    await reconnectedHost.waitForMessage((m) => m.type === 'registered')
    assert.equal(app.rooms.get('RECOVR01').host.clientId !== undefined, true)

    reconnectedHost.close(1000, 'Test complete')
  })

  await t.test('Listener voluntary leave & kick from host', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const listener = connectClient(port)
    await listener.ready()
    listener.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 'sess-kick' })
    await listener.waitForMessage((m) => m.type === 'registered')

    // Host kicks listener
    host.send({ type: 'kick-listener', target: 'sess-kick' })
    const kickedMsg = await listener.waitForMessage((m) => m.type === 'kicked')
    assert.strictEqual(kickedMsg.message, 'Sei stato disconnesso dal PC host.')

    const hostLeftNotif = await host.waitForMessage((m) => m.type === 'listener-left')
    assert.strictEqual(hostLeftNotif.sessionId, 'sess-kick')

    host.close()
    listener.close()
  })

  await t.test('Host stop-stream closes room and informs listeners', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const listener = connectClient(port)
    await listener.ready()
    listener.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 's-stop' })
    await listener.waitForMessage((m) => m.type === 'registered')

    host.send({ type: 'stop-stream' })
    const endMsg = await listener.waitForMessage((m) => m.type === 'room-ended')
    assert.ok(endMsg)

    host.close()
    listener.close()
  })

  await t.test('WebRTC signaling offer / answer / candidate exchange', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const listener = connectClient(port)
    await listener.ready()
    listener.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 'sess-rtc' })
    const lReg = await listener.waitForMessage((m) => m.type === 'registered')

    // Host sends offer to listener
    const mockOfferSdp = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }
    host.send({ type: 'offer', target: lReg.clientId, sdp: mockOfferSdp })
    const receivedOffer = await listener.waitForMessage((m) => m.type === 'offer')
    assert.deepStrictEqual(receivedOffer.sdp, mockOfferSdp)

    // Listener sends answer to host
    const mockAnswerSdp = { type: 'answer', sdp: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }
    listener.send({ type: 'answer', sdp: mockAnswerSdp })
    const receivedAnswer = await host.waitForMessage((m) => m.type === 'answer')
    assert.deepStrictEqual(receivedAnswer.sdp, mockAnswerSdp)

    // ICE candidates exchange
    const mockCandidate = {
      candidate: 'candidate:1 1 UDP 2122260223 127.0.0.1 5000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    }
    listener.send({ type: 'candidate', candidate: mockCandidate })
    const receivedCand = await host.waitForMessage((m) => m.type === 'candidate')
    assert.deepStrictEqual(receivedCand.candidate, mockCandidate)

    host.close()
    listener.close()
  })

  await t.test('Versioned listener telemetry is validated and relayed only to its room host', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')
    const listener = connectClient(port)
    await listener.ready()
    listener.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 'telemetry-session' })
    await listener.waitForMessage((m) => m.type === 'registered')
    await host.waitForMessage((m) => m.type === 'listener-joined')

    listener.send({
      type: 'telemetry.report',
      version: 1,
      sessionId: 'telemetry-session',
      deviceId: 'iphone-1',
      timestamp: 123,
      payload: { rttMs: 12, lossPercent: 0.2 },
    })
    const telemetry = await host.waitForMessage((m) => m.type === 'telemetry.report')
    assert.equal(telemetry.sessionId, 'telemetry-session')
    assert.deepEqual(telemetry.payload, { rttMs: 12, lossPercent: 0.2 })

    listener.send({
      type: 'telemetry.report',
      version: 2,
      sessionId: 'telemetry-session',
      deviceId: 'iphone-1',
      timestamp: 1,
      payload: {},
    })
    const error = await listener.waitForMessage((m) => m.type === 'error')
    assert.match(error.message, /unsupported-version/)
    host.close()
    listener.close()
  })

  await t.test('Host transport policies are validated and delivered only to their target listener', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const listener = connectClient(port)
    await listener.ready()
    listener.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 'policy-session' })
    await listener.waitForMessage((m) => m.type === 'registered')

    const policy = {
      profileKey: 'adaptive',
      currentTier: 3,
      bitrate: 160_000,
      fec: true,
      stereo: true,
      ptime: 20,
      dtx: false,
      cbr: false,
      maxPlaybackRate: 48_000,
    }
    host.send({
      type: 'audio.policy',
      version: 1,
      sessionId: 'policy-session',
      deviceId: 'host-ROOM1234',
      timestamp: 123,
      payload: policy,
    })
    const delivered = await listener.waitForMessage((m) => m.type === 'audio.policy')
    assert.equal(delivered.sessionId, 'policy-session')
    assert.deepEqual(delivered.payload, policy)

    listener.send({
      type: 'audio.policy',
      version: 1,
      sessionId: 'policy-session',
      deviceId: 'listener-1',
      timestamp: 123,
      payload: policy,
    })
    const error = await listener.waitForMessage((m) => m.type === 'error')
    assert.match(error.message, /non può inviare/)
    host.close()
    listener.close()
  })

  await t.test('Clock-sync probes, replies and reports stay scoped to one listener session', async () => {
    const host = connectClient(port)
    await host.ready()
    host.send({ type: 'register', role: 'host', roomId: 'ROOM1234', hostKey: validHostKeyA })
    await host.waitForMessage((m) => m.type === 'registered')

    const listener = connectClient(port)
    await listener.ready()
    listener.send({ type: 'register', role: 'listener', roomId: 'ROOM1234', sessionId: 'clock-session' })
    await listener.waitForMessage((m) => m.type === 'registered')

    listener.send({
      type: 'clock.sync',
      version: 1,
      sessionId: 'clock-session',
      deviceId: 'clock-listener',
      timestamp: 1_000,
      payload: { mode: 'probe', clientSentAt: 1_000 },
    })
    const probe = await host.waitForMessage((m) => m.type === 'clock.sync' && m.payload.mode === 'probe')
    assert.equal(probe.sessionId, 'clock-session')

    host.send({
      type: 'clock.sync',
      version: 1,
      sessionId: 'clock-session',
      deviceId: 'clock-host',
      timestamp: 1_020,
      payload: { mode: 'reply', clientSentAt: 1_000, hostReceivedAt: 1_010, hostSentAt: 1_012 },
    })
    const reply = await listener.waitForMessage((m) => m.type === 'clock.sync' && m.payload.mode === 'reply')
    assert.equal(reply.payload.hostSentAt, 1_012)

    listener.send({
      type: 'clock.sync',
      version: 1,
      sessionId: 'clock-session',
      deviceId: 'clock-listener',
      timestamp: 1_030,
      payload: {
        mode: 'report',
        rttMs: 20,
        offsetMs: -1,
        driftPpm: 5,
        correctionPpm: 5,
        playbackRate: 1.000005,
        observations: 1,
      },
    })
    const report = await host.waitForMessage((m) => m.type === 'clock.sync' && m.payload.mode === 'report')
    assert.equal(report.payload.offsetMs, -1)
    host.close()
    listener.close()
  })

  await t.test('WebSocket ping / pong heartbeat and malformed messages handling', async () => {
    const client = connectClient(port)
    await client.ready()

    client.send({ type: 'ping' })
    const pong = await client.waitForMessage((m) => m.type === 'pong')
    assert.ok(pong)

    // Send malformed non-JSON string -> server closes with code 1003
    const closePromise = new Promise((resolve) => {
      client.ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })
    client.ws.send('NOT_VALID_JSON{:::')
    const closeInfo = await closePromise
    assert.strictEqual(closeInfo.code, 1003)
  })

  await t.test('Payload exceeding MAX_SIGNAL_BYTES triggers socket closure', async () => {
    const client = connectClient(port)
    await client.ready()

    const closePromise = new Promise((resolve) => {
      client.ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })

    // Send payload > 24,000 bytes
    const largeMessage = JSON.stringify({ type: 'offer', sdp: { sdp: 'x'.repeat(25_000) } })
    client.ws.send(largeMessage)

    const closeInfo = await closePromise
    assert.ok([1009, 1006].includes(closeInfo.code), `Expected 1009/1006 on oversize message, got ${closeInfo.code}`)
  })

  await t.test('Listener registration with listenerToken authentication', async () => {
    const validListenerToken = 'T'.repeat(22)
    const invalidListenerToken = 'X'.repeat(22)

    const host = connectClient(port)
    await host.ready()
    host.send({
      type: 'register',
      role: 'host',
      roomId: 'ROOM5678',
      hostKey: validHostKeyA,
      listenerToken: validListenerToken,
    })
    await host.waitForMessage((m) => m.type === 'registered')

    // 1. Listener with missing token
    const lMissing = connectClient(port)
    await lMissing.ready()
    lMissing.send({
      type: 'register',
      role: 'listener',
      roomId: 'ROOM5678',
      sessionId: 'sess-missing',
    })
    let errMsg = await lMissing.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(errMsg.message, 'Token di ascolto non valido o mancante.')

    // 2. Listener with invalid token
    const lInvalid = connectClient(port)
    await lInvalid.ready()
    lInvalid.send({
      type: 'register',
      role: 'listener',
      roomId: 'ROOM5678',
      sessionId: 'sess-invalid',
      listenerToken: invalidListenerToken,
    })
    errMsg = await lInvalid.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(errMsg.message, 'Token di ascolto non valido o mancante.')

    // 3. Listener with valid token
    const lValid = connectClient(port)
    await lValid.ready()
    lValid.send({
      type: 'register',
      role: 'listener',
      roomId: 'ROOM5678',
      sessionId: 'sess-valid',
      listenerToken: validListenerToken,
      deviceName: 'Pixel 8',
      deviceType: 'phone',
    })
    const regMsg = await lValid.waitForMessage((m) => m.type === 'registered')
    assert.strictEqual(regMsg.sessionId, 'sess-valid')
    assert.strictEqual(regMsg.hostAvailable, true)

    host.close()
    lMissing.close()
    lInvalid.close()
    lValid.close()
  })

  await t.test('Rate limiting on consecutive room misses', async () => {
    let missCount = 0
    const rlApp = createWiforaServer({
      port: 0,
      rateLimiters: {
        roomMissLimiter: {
          check: () => {
            missCount++
            return missCount <= 2
          },
          close: () => {},
        },
      },
    })
    const rlAddr = await rlApp.listen(0, '127.0.0.1')
    const rlPort = rlAddr.port

    const l1 = connectClient(rlPort)
    await l1.ready()
    l1.send({ type: 'register', role: 'listener', roomId: 'NONE0001', sessionId: 's1' })
    const msg1 = await l1.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(msg1.message, 'Nessuna trasmissione attiva per questo codice.')

    const l2 = connectClient(rlPort)
    await l2.ready()
    l2.send({ type: 'register', role: 'listener', roomId: 'NONE0002', sessionId: 's2' })
    const msg2 = await l2.waitForMessage((m) => m.type === 'error')
    assert.strictEqual(msg2.message, 'Nessuna trasmissione attiva per questo codice.')

    // 3rd attempt exceeds limit -> server triggers close with 1008
    const l3 = connectClient(rlPort)
    await l3.ready()
    const closePromise = new Promise((resolve) => {
      l3.ws.once('close', (code) => resolve(code))
    })
    l3.send({ type: 'register', role: 'listener', roomId: 'NONE0003', sessionId: 's3' })
    const closeCode = await closePromise
    assert.strictEqual(closeCode, 1008)

    l1.close()
    l2.close()
    await rlApp.close()
  })

  await t.test('Unauthorized origin is rejected on WebSocket upgrade', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/signal`, {
      headers: { origin: 'http://malicious-external-site.com:3975' },
    })

    const result = await new Promise((resolve) => {
      ws.once('open', () => resolve('opened'))
      ws.once('error', () => resolve('error'))
      ws.once('close', () => resolve('closed'))
    })

    assert.notStrictEqual(result, 'opened', 'WebSocket should not allow connection with unauthorized origin')
  })
})
