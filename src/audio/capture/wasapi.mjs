import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { ROOT_DIR } from '../../shared/constants.mjs'

export const WASAPI_FRAME_MAGIC = 'WFR1'
export const WASAPI_FRAME_HEADER_BYTES = 32
export const WASAPI_SAMPLE_RATE = 48_000
export const WASAPI_CHANNELS = 2

/** Decodes the framed PCM stream emitted by wifora-audio.exe. */
export class WasapiFrameDecoder {
  constructor() {
    this.pending = Buffer.alloc(0)
  }

  push(chunk) {
    if (!Buffer.isBuffer(chunk)) throw new TypeError('chunk must be a Buffer')
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk
    const frames = []
    while (this.pending.length >= WASAPI_FRAME_HEADER_BYTES) {
      if (this.pending.subarray(0, 4).toString('ascii') !== WASAPI_FRAME_MAGIC) {
        const offset = this.pending.indexOf(WASAPI_FRAME_MAGIC, 1, 'ascii')
        this.pending = offset === -1 ? this.pending.subarray(-3) : this.pending.subarray(offset)
        continue
      }
      const version = this.pending.readUInt16LE(4)
      const channels = this.pending.readUInt16LE(6)
      const sampleRate = this.pending.readUInt32LE(8)
      const samplesPerChannel = this.pending.readUInt32LE(12)
      const sequence = this.pending.readUInt32LE(16)
      const timestampBigInt = this.pending.readBigUInt64LE(24)
      if (version !== 1 || channels < 1 || sampleRate < 1 || samplesPerChannel < 1 || samplesPerChannel > sampleRate) {
        this.pending = this.pending.subarray(4)
        continue
      }
      const payloadBytes = samplesPerChannel * channels * Float32Array.BYTES_PER_ELEMENT
      const frameBytes = WASAPI_FRAME_HEADER_BYTES + payloadBytes
      if (this.pending.length < frameBytes) break
      if (timestampBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
        this.pending = this.pending.subarray(frameBytes)
        continue
      }
      const payload = this.pending.subarray(WASAPI_FRAME_HEADER_BYTES, frameBytes)
      const samples = new Float32Array(payloadBytes / Float32Array.BYTES_PER_ELEMENT)
      Buffer.from(samples.buffer).set(payload)
      frames.push({
        samples,
        sampleRate,
        channels,
        sequence,
        timestamp: Number(timestampBigInt),
      })
      this.pending = this.pending.subarray(frameBytes)
    }
    return frames
  }
}

/**
 * Optional Windows capture backend. The browser capture path remains the
 * fallback when the helper is unavailable; the Node server never starts it by
 * itself because present WebRTC media is browser-to-browser.
 */
export class WasapiCaptureSource {
  constructor({
    helperPath = process.env.WIFORA_WASAPI_HELPER || join(ROOT_DIR, 'native', 'wasapi', 'wifora-audio.exe'),
    spawnImpl = spawn,
    platform = process.platform,
    logger = console,
  } = {}) {
    this.helperPath = helperPath
    this.spawnImpl = spawnImpl
    this.platform = platform
    this.logger = logger
    this.sampleRate = WASAPI_SAMPLE_RATE
    this.channels = WASAPI_CHANNELS
    this.deviceInfo = null
    this.decoder = new WasapiFrameDecoder()
    this.frames = []
    this.waiters = []
    this.child = null
  }

  async available() {
    if (this.platform !== 'win32' || !this.helperPath) return false
    try {
      await access(this.helperPath)
      return true
    } catch {
      return false
    }
  }

  async start({ deviceId } = {}) {
    if (this.child) return
    if (!(await this.available())) throw new Error('WASAPI helper is not available')
    const args = ['--stdout']
    if (deviceId) args.push('--device', deviceId)
    const child = this.spawnImpl(this.helperPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    this.child = child
    child.stdout.on('data', (chunk) => this.#accept(chunk))
    child.stderr.on('data', (chunk) => this.logger.debug?.(`WASAPI helper: ${chunk.toString().trim()}`))
    child.once('exit', () => this.#close(new Error('WASAPI helper exited')))
    child.once('error', (error) => this.#close(error))
  }

  read() {
    const frame = this.frames.shift()
    if (frame) return Promise.resolve(frame)
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  stop() {
    if (this.child) this.child.kill()
    this.#close(new Error('WASAPI capture stopped'))
  }

  #accept(chunk) {
    for (const frame of this.decoder.push(chunk)) {
      const waiter = this.waiters.shift()
      if (waiter) waiter.resolve(frame)
      else this.frames.push(frame)
    }
  }

  #close(error) {
    const child = this.child
    this.child = null
    if (child) child.removeAllListeners()
    for (const waiter of this.waiters.splice(0)) waiter.reject(error)
  }
}

/** Returns the native source only when the optional helper is available. */
export async function selectCaptureSource({ browserSource = null, wasapi = {} } = {}) {
  const nativeSource = new WasapiCaptureSource(wasapi)
  return (await nativeSource.available()) ? nativeSource : browserSource
}
