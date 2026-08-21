import { WebSocket, WebSocketServer } from 'ws'
import { AudioEngine } from '../engine.mjs'
import { AudioTransport } from '../../transport/base.mjs'
import { ROOM_PATTERN } from '../../shared/constants.mjs'
import { isAllowedOrigin, validHostKey } from '../../server/security.mjs'
import { WasapiCaptureSource } from './wasapi.mjs'

// Raw Float32 PCM is used only on localhost between the helper and host tab.
// Keep its queue short: old PCM is worse than a dropped packet for a live
// stream, and a large WebSocket backlog silently becomes audible latency.
const MAX_BUFFERED_BYTES = 48 * 1024

class NativeAudioWebSocketTransport extends AudioTransport {
  constructor(relay) {
    super({ name: 'native-audio-websocket', type: 'native-pcm' })
    this.relay = relay
  }

  async sendFrame(frame) {
    if (!this.running) return false
    const delivered = this.relay.broadcast(frame)
    if (!delivered) return false
    return super.sendFrame(frame)
  }
}

/**
 * Authenticated, host-only relay from a native PCM capture source to the
 * browser audio graph. It does not expose raw PCM to listeners: WebRTC remains
 * responsible for the network media hop.
 */
export class NativeAudioRelay {
  constructor({
    rooms,
    logger = console,
    sourceFactory = () => new WasapiCaptureSource(),
    engineFactory = () => new AudioEngine({ bufferCapacity: 8 }),
  } = {}) {
    if (!rooms || typeof rooms.get !== 'function') throw new TypeError('rooms must be a Map-like object')
    this.rooms = rooms
    this.logger = logger
    this.sourceFactory = sourceFactory
    this.engineFactory = engineFactory
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 1_024 })
    this.clients = new Map()
    this.source = null
    this.engine = null
    this.transport = null
    this.stopping = null
    this.stats = { framesRelayed: 0, bytesRelayed: 0, droppedFrames: 0, startFailures: 0 }

    this.wss.on('connection', (socket, _request, metadata) => {
      const { roomId } = metadata
      const previous = this.clients.get(roomId)
      if (previous && previous !== socket) {
        try {
          previous.close(1000, 'Replaced by a newer host connection')
        } catch {}
      }
      this.clients.set(roomId, socket)
      socket.on('close', () => {
        if (this.clients.get(roomId) === socket) {
          this.clients.delete(roomId)
          this.#stopWhenUnused()
        }
      })
      socket.on('error', (error) => this.logger.debug?.(`Native audio socket error: ${error?.message || error}`))
      this.#start().catch((error) => {
        this.logger.warn?.(`Native capture unavailable: ${error?.message || error}`)
        try {
          socket.close(1011, 'Native audio capture unavailable')
        } catch {}
      })
    })
  }

  /** Returns true only when this relay handled the upgrade request. */
  handleUpgrade(request, socket, head, { activePort } = {}) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (url.pathname !== '/native-audio') return false

    if (!isAllowedOrigin(request, activePort)) {
      socket.destroy()
      return true
    }
    const roomId = String(url.searchParams.get('room') || '').toUpperCase()
    const hostKey = String(url.searchParams.get('key') || '')
    const room = this.rooms.get(roomId)
    if (!ROOM_PATTERN.test(roomId) || !room || !validHostKey(hostKey, room.hostKey)) {
      socket.destroy()
      return true
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit('connection', ws, request, { roomId }))
    return true
  }

  broadcast(frame) {
    const payload = Buffer.from(frame.samples.buffer, frame.samples.byteOffset, frame.samples.byteLength)
    let delivered = false
    for (const socket of this.clients.values()) {
      if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        this.stats.droppedFrames++
        continue
      }
      socket.send(payload, { binary: true })
      delivered = true
    }
    if (delivered) {
      this.stats.framesRelayed++
      this.stats.bytesRelayed += payload.length
    }
    return delivered
  }

  snapshot() {
    return {
      available: Boolean(this.source),
      clients: this.clients.size,
      source: this.source?.getStats?.() || null,
      ...this.stats,
    }
  }

  async close() {
    for (const client of this.clients.values()) {
      try {
        client.close(1001, 'Server shutting down')
      } catch {}
    }
    this.clients.clear()
    await this.#stop()
    return new Promise((resolve) => this.wss.close(() => resolve()))
  }

  async #start() {
    if (this.stopping) await this.stopping
    if (this.source) return
    const source = this.sourceFactory()
    const engine = this.engineFactory()
    const transport = new NativeAudioWebSocketTransport(this)
    await transport.start()
    engine.registerTransport(transport)
    try {
      await engine.startCapture(source)
    } catch (error) {
      this.stats.startFailures++
      await transport.stop()
      throw error
    }
    this.source = source
    this.engine = engine
    this.transport = transport
  }

  #stopWhenUnused() {
    if (this.clients.size === 0)
      this.#stop().catch((error) => this.logger.debug?.(`Native capture stop failed: ${error}`))
  }

  async #stop() {
    if (this.stopping) return this.stopping
    if (!this.source && !this.transport) return
    const source = this.source
    const engine = this.engine
    const transport = this.transport
    this.source = null
    this.engine = null
    this.transport = null
    this.stopping = (async () => {
      try {
        if (engine && source) await engine.stopCapture()
      } finally {
        if (transport) await transport.stop()
      }
    })()
    try {
      await this.stopping
    } finally {
      this.stopping = null
    }
  }
}
