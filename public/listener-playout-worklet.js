/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentFrame */

import { ElasticPlayoutBuffer } from './playout-core.js'

/**
 * Listener-side elastic playout. Decoded WebRTC audio is buffered behind a
 * safety margin, micro-rate corrected against clock drift, and concealed
 * with hold-and-decay ramps instead of hard clicks when the network stalls.
 */
class WiforaPlayoutProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const config = options?.processorOptions || {}
    this.buffer = new ElasticPlayoutBuffer({
      sampleRate,
      targetMs: config.targetMs,
      primeMs: config.primeMs,
      capacityMs: config.capacityMs,
      fadeMs: config.fadeMs,
      holdMs: config.holdMs,
    })
    this.telemetryDivider = Math.max(1, Math.round(sampleRate / 128 / 4))
    this.telemetryCounter = 0
    this.lastRenderedFrame = 0
    this.port.onmessage = ({ data }) => {
      if (!data || typeof data !== 'object') return
      if (data.type === 'push' && data.samples instanceof Float32Array) {
        this.buffer.push(data.samples)
      } else if (data.type === 'drift' && Number.isFinite(data.ppm)) {
        this.buffer.setDriftPpm(data.ppm)
      } else if (data.type === 'reset') {
        this.buffer.reset()
      }
    }
  }

  process(inputs, outputs) {
    const input = inputs[0]
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      const inputLeft = input[0]
      const inputRight = input[1] || input[0]
      const interleaved = new Float32Array(inputLeft.length * 2)
      for (let index = 0; index < inputLeft.length; index++) {
        interleaved[index * 2] = inputLeft[index]
        interleaved[index * 2 + 1] = inputRight[index]
      }
      this.buffer.push(interleaved)
    }

    const left = outputs[0][0]
    const right = outputs[0][1] || outputs[0][0]
    const clean = this.buffer.read(left, right)

    if (++this.telemetryCounter >= this.telemetryDivider) {
      this.telemetryCounter = 0
      const snapshot = this.buffer.snapshot()
      snapshot.lateFrames = clean ? 0 : 1
      if (typeof currentFrame === 'number') {
        snapshot.gapFrames = Math.max(0, currentFrame - this.lastRenderedFrame - 128)
        this.lastRenderedFrame = currentFrame
      }
      this.port.postMessage({ type: 'telemetry', ...snapshot })
    }
    return true
  }
}

registerProcessor('wifora-playout', WiforaPlayoutProcessor)
