/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class WiforaNativePcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pendingFrames = []
    this.activeFrame = null
    this.sourceOffset = 0
    // Two 10-ms native packets absorb normal WebSocket/worklet scheduling
    // variance. Six is a hard latency ceiling: on overload we discard stale
    // audio instead of turning a short stall into half a second of delay.
    this.minBufferedFrames = 2
    this.maxPendingFrames = 5
    this.playing = false
    this.inputSampleRate = 48000
    this.sourceFramesPerOutputFrame = this.inputSampleRate / sampleRate
    this.port.onmessage = ({ data }) => {
      if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength % 8 !== 0) return
      if (this.pendingFrames.length >= this.maxPendingFrames) this.pendingFrames.shift()
      this.pendingFrames.push(new Float32Array(data))
    }
  }

  bufferedFrameCount() {
    return this.pendingFrames.length + (this.activeFrame ? 1 : 0)
  }

  ensureActiveFrame() {
    if (!this.activeFrame && this.pendingFrames.length) {
      this.activeFrame = this.pendingFrames.shift()
      this.sourceOffset = 0
    }
    return this.activeFrame
  }

  advanceSource() {
    this.sourceOffset += this.sourceFramesPerOutputFrame
    while (this.activeFrame && this.sourceOffset >= this.activeFrame.length / 2) {
      this.sourceOffset -= this.activeFrame.length / 2
      this.activeFrame = this.pendingFrames.shift() || null
    }
  }

  sample(channel) {
    const frame = this.ensureActiveFrame()
    if (!frame) return 0
    const frameCount = frame.length / 2
    const lower = Math.min(frameCount - 1, Math.floor(this.sourceOffset))
    const upper = Math.min(frameCount - 1, lower + 1)
    const fraction = this.sourceOffset - lower
    const first = frame[lower * 2 + channel]
    const second = frame[upper * 2 + channel]
    return first + (second - first) * fraction
  }

  process(_inputs, outputs) {
    const output = outputs[0]
    const left = output[0]
    const right = output[1] || left
    left.fill(0)
    if (right !== left) right.fill(0)

    if (!this.playing && this.bufferedFrameCount() >= this.minBufferedFrames) this.playing = true

    for (let index = 0; this.playing && index < left.length; index++) {
      if (!this.ensureActiveFrame()) {
        // Rebuffer after an actual underrun. Silence is intentional here;
        // resuming only after the short target prevents repeated crackles.
        this.playing = false
        break
      }
      left[index] = this.sample(0)
      right[index] = this.sample(1)
      this.advanceSource()
    }
    return true
  }
}

registerProcessor('wifora-native-pcm', WiforaNativePcmProcessor)
