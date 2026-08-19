/**
 * A bounded FIFO for audio frames.  When a producer is ahead of playback it
 * deliberately drops the oldest frame: retaining it would turn a short spike
 * into permanently growing end-to-end latency.
 */
export class RingBuffer {
  constructor({ capacity = 50 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError('capacity must be a positive integer')
    }
    this.capacity = capacity
    this.items = new Array(capacity)
    this.head = 0
    this.length = 0
    this.overruns = 0
    this.underruns = 0
  }

  get occupancy() {
    return this.length
  }

  get isEmpty() {
    return this.length === 0
  }

  push(frame) {
    let dropped = null
    if (this.length === this.capacity) {
      dropped = this.items[this.head]
      this.head = (this.head + 1) % this.capacity
      this.length--
      this.overruns++
    }

    const tail = (this.head + this.length) % this.capacity
    this.items[tail] = frame
    this.length++
    return { accepted: frame, dropped }
  }

  read() {
    if (this.length === 0) {
      this.underruns++
      return null
    }
    const frame = this.items[this.head]
    this.items[this.head] = undefined
    this.head = (this.head + 1) % this.capacity
    this.length--
    return frame
  }

  clear() {
    this.items.fill(undefined)
    this.head = 0
    this.length = 0
  }

  snapshot() {
    return {
      capacity: this.capacity,
      occupancy: this.length,
      occupancyRatio: this.length / this.capacity,
      overruns: this.overruns,
      underruns: this.underruns,
    }
  }
}
