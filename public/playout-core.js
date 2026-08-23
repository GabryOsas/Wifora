/**
 * Transport-independent elastic playout buffer for the listener side.
 *
 * Decoded audio arrives in real-time bursts that jitter around the network
 * playout rate. This ring buffer absorbs that variance behind a configurable
 * safety margin, applies a bounded micro-rate correction so the occupancy
 * converges on its target without growing latency forever, and conceals
 * starvation gaps with a short hold-and-decay ramp instead of a hard click.
 *
 * Pure JavaScript with no DOM or AudioContext dependency so it can be unit
 * tested directly and imported by an AudioWorkletProcessor.
 */
export class ElasticPlayoutBuffer {
  constructor({
    sampleRate = 48_000,
    targetMs = 80,
    primeMs = 40,
    capacityMs = 240,
    fadeMs = 8,
    holdMs = 20,
    maxCorrectionPpm = 400,
    correctionGain = 12,
    catchUpMs = 120,
  } = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192_000) {
      throw new RangeError('sampleRate must be between 8000 and 192000')
    }
    if (!Number.isFinite(targetMs) || targetMs < 0) throw new RangeError('targetMs must be non-negative')
    if (!Number.isFinite(primeMs) || primeMs < 0) throw new RangeError('primeMs must be non-negative')
    if (!Number.isFinite(capacityMs) || capacityMs <= targetMs) {
      throw new RangeError('capacityMs must be greater than targetMs')
    }
    if (!Number.isFinite(fadeMs) || fadeMs < 1) throw new RangeError('fadeMs must be at least 1')
    if (!Number.isFinite(holdMs) || holdMs < 1) throw new RangeError('holdMs must be at least 1')
    if (!Number.isFinite(maxCorrectionPpm) || maxCorrectionPpm < 1) {
      throw new RangeError('maxCorrectionPpm must be positive')
    }

    this.sampleRate = sampleRate
    this.channels = 2
    this.framesPerMs = sampleRate / 1000
    this.targetFrames = Math.round(targetMs * this.framesPerMs)
    this.primeFrames = Math.min(Math.round(primeMs * this.framesPerMs), this.targetFrames)
    this.capacityFrames = Math.ceil(capacityMs * this.framesPerMs)
    this.fadeInTotal = Math.max(1, Math.round(fadeMs * this.framesPerMs))
    this.holdDecayPerFrame = 1 / Math.max(1, holdMs * this.framesPerMs)
    this.maxCorrectionPpm = maxCorrectionPpm
    this.correctionGain = Number.isFinite(correctionGain) ? correctionGain : 12
    this.catchUpFrames = Math.round(
      Math.min(Math.max(Number.isFinite(catchUpMs) ? catchUpMs : 120, 0), capacityMs - targetMs) * this.framesPerMs
    )

    this.ring = new Float32Array(this.capacityFrames * 2)
    this.writeCount = 0
    this.readPosition = 0
    this.producing = false
    this.correctionPpm = 0
    this.externalDriftPpm = 0
    this.fadeInRemaining = 0
    this.holdLevel = 0
    this.holds = [0, 0]

    this.stats = {
      underruns: 0,
      starvedFrames: 0,
      droppedFrames: 0,
      pushedFrames: 0,
      consumedFrames: 0,
    }
  }

  get bufferedFrames() {
    return Math.max(0, this.writeCount - this.readPosition)
  }

  get bufferedMs() {
    return (this.bufferedFrames / this.framesPerMs) | 0
  }

  /** External clock-drift estimate in parts per million (positive: consume faster). */
  setDriftPpm(ppm) {
    const bounded = Number.isFinite(ppm) ? Math.max(-150, Math.min(150, ppm)) : 0
    this.externalDriftPpm = bounded
    return bounded
  }

  push(interleaved) {
    if (!(interleaved instanceof Float32Array)) throw new TypeError('interleaved must be a Float32Array')
    const incomingFrames = (interleaved.length / 2) | 0
    if (incomingFrames === 0) return 0

    const overflow = this.bufferedFrames + incomingFrames - this.capacityFrames
    if (overflow > 0) {
      this.readPosition += overflow
      this.stats.droppedFrames += overflow
    }

    let slot = ((this.writeCount % this.capacityFrames) + this.capacityFrames) % this.capacityFrames
    for (let index = 0; index < incomingFrames; index++) {
      const offset = index * 2
      this.ring[slot * 2] = interleaved[offset]
      this.ring[slot * 2 + 1] = interleaved[offset + 1]
      slot++
      if (slot === this.capacityFrames) slot = 0
    }
    this.writeCount += incomingFrames
    this.stats.pushedFrames += incomingFrames
    return incomingFrames
  }

  /**
   * Fills one render quantum of deinterleaved channel output.
   * Returns true when every requested frame carried live audio.
   */
  read(leftOut, rightOut) {
    const count = leftOut.length
    let clean = true

    if (!this.producing && this.bufferedFrames >= this.primeFrames) {
      this.producing = true
      this.fadeInRemaining = this.fadeInTotal
      this.holdLevel = 1
    }

    if (!this.producing) {
      leftOut.fill(0)
      rightOut.fill(0)
      return false
    }

    this.#catchUp()
    const rate = 1 + this.#correction() * 1e-6
    for (let index = 0; index < count; index++) {
      const lower = Math.floor(this.readPosition)
      if (lower + 1 >= this.writeCount) {
        this.producing = false
        this.stats.underruns++
        clean = false
        this.#concealRest(leftOut, rightOut, index)
        return false
      }

      const fraction = this.readPosition - lower
      const slotA = (lower % this.capacityFrames) * 2
      const slotB = ((lower + 1) % this.capacityFrames) * 2
      let gain = 1
      if (this.fadeInRemaining > 0) {
        gain = 1 - this.fadeInRemaining / this.fadeInTotal
        this.fadeInRemaining--
      }

      leftOut[index] = gain * (this.ring[slotA] + (this.ring[slotB] - this.ring[slotA]) * fraction)
      rightOut[index] = gain * (this.ring[slotA + 1] + (this.ring[slotB + 1] - this.ring[slotA + 1]) * fraction)
      this.holds[0] = leftOut[index]
      this.holds[1] = rightOut[index]

      this.readPosition += rate
    }

    this.stats.consumedFrames += count
    return clean
  }

  snapshot() {
    return {
      primed: this.producing,
      bufferedMs: this.bufferedMs,
      targetMs: Math.round(this.targetFrames / this.framesPerMs),
      underruns: this.stats.underruns,
      starvedFrames: this.stats.starvedFrames,
      droppedFrames: this.stats.droppedFrames,
      pushedFrames: this.stats.pushedFrames,
      consumedFrames: this.stats.consumedFrames,
      correctionPpm: Math.round(this.correctionPpm),
      driftPpm: Math.round(this.externalDriftPpm),
    }
  }

  reset() {
    this.writeCount = 0
    this.readPosition = 0
    this.producing = false
    this.correctionPpm = 0
    this.externalDriftPpm = 0
    this.fadeInRemaining = 0
    this.holdLevel = 1
    this.holds[0] = 0
    this.holds[1] = 0
    this.ring.fill(0)
    this.stats.underruns = 0
    this.stats.starvedFrames = 0
    this.stats.droppedFrames = 0
    this.stats.pushedFrames = 0
    this.stats.consumedFrames = 0
  }

  #correction() {
    const errorMs = (this.bufferedFrames - this.targetFrames) / this.framesPerMs
    const desired = errorMs * this.correctionGain + this.externalDriftPpm
    const bounded = Math.max(-this.maxCorrectionPpm, Math.min(this.maxCorrectionPpm, desired))
    this.correctionPpm += 0.1 * (bounded - this.correctionPpm)
    return this.correctionPpm
  }

  /** A live stream must not bank latency: excess beyond catchUpMs is skipped. */
  #catchUp() {
    const errorFrames = this.bufferedFrames - this.targetFrames
    if (errorFrames > this.catchUpFrames) {
      const skip = errorFrames - this.catchUpFrames
      this.readPosition += skip
      this.stats.droppedFrames += skip
    }
  }

  #concealRest(leftOut, rightOut, fromIndex) {
    for (let index = fromIndex; index < leftOut.length; index++) {
      this.holdLevel = Math.max(0, this.holdLevel - this.holdDecayPerFrame)
      leftOut[index] = this.holds[0] * this.holdLevel
      rightOut[index] = this.holds[1] * this.holdLevel
      this.stats.starvedFrames++
    }
  }
}
