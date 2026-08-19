/** Lightweight, serialisable counters shared by capture and transport layers. */
export class AudioMetrics {
  constructor() {
    this.framesCaptured = 0
    this.framesEmitted = 0
    this.silenceFrames = 0
    this.lateFrames = 0
  }

  recordCaptured({ late = false } = {}) {
    this.framesCaptured++
    if (late) this.lateFrames++
  }

  recordEmitted({ silent = false } = {}) {
    this.framesEmitted++
    if (silent) this.silenceFrames++
  }

  snapshot(buffer = null) {
    return {
      framesCaptured: this.framesCaptured,
      framesEmitted: this.framesEmitted,
      silenceFrames: this.silenceFrames,
      lateFrames: this.lateFrames,
      ...(buffer ? buffer.snapshot() : {}),
    }
  }
}
