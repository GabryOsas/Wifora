import { AudioTransport } from '../base.mjs'

/**
 * WebRTC Audio Transport adapter.
 * Bridges AudioEngine frames to WebRTC RTP senders and coordinates per-peer policies.
 */
export class WebRtcAudioTransport extends AudioTransport {
  constructor({ sampleRate = 48_000, channels = 2 } = {}) {
    super({ name: 'webrtc-transport', type: 'webrtc', sampleRate, channels })
    this.peers = new Map()
  }

  addPeer(sessionId, peer) {
    this.peers.set(sessionId, peer)
    this.stats.activeClients = this.peers.size
    this.emit('peerAdded', sessionId)
  }

  removePeer(sessionId) {
    const removed = this.peers.delete(sessionId)
    this.stats.activeClients = this.peers.size
    if (removed) this.emit('peerRemoved', sessionId)
    return removed
  }

  async sendFrame(frame) {
    if (!this.running || this.peers.size === 0) return false
    return super.sendFrame(frame)
  }
}
