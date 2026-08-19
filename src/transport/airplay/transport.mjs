import { AudioTransport } from '../base.mjs'

export const AIRPLAY_RTSP_PORT = 7000
export const AIRPLAY_RTP_AUDIO_PORT = 6000
export const AIRPLAY_RTP_CONTROL_PORT = 6001
export const AIRPLAY_RTP_TIMING_PORT = 6002

export const AirPlayState = {
  IDLE: 'idle',
  ANNOUNCED: 'announced',
  CONFIGURED: 'configured',
  STREAMING: 'streaming',
  PAUSED: 'paused',
}

/**
 * AirPlay / RAOP (Remote Audio Output Protocol) Audio Transport backend.
 * Provides RTSP session management, timing synchronization, and RTP audio packaging.
 */
export class AirPlayAudioTransport extends AudioTransport {
  constructor({
    name = 'Wifora AirPlay',
    sampleRate = 44_100,
    channels = 2,
    rtspPort = AIRPLAY_RTSP_PORT,
    audioPort = AIRPLAY_RTP_AUDIO_PORT,
  } = {}) {
    super({ name, type: 'airplay', sampleRate, channels })
    this.rtspPort = rtspPort
    this.audioPort = audioPort
    this.state = AirPlayState.IDLE
    this.session = null
    this.rtpSequence = 0
    this.rtpTimestamp = 0
    this.ssrc = Math.floor(Math.random() * 0xffffffff)
  }

  getMdnsServiceDescriptor({ macAddress = '00:11:22:33:44:55', port = this.rtspPort } = {}) {
    const cleanMac = macAddress.replaceAll(':', '').toUpperCase()
    return {
      name: `${cleanMac}@${this.name}`,
      type: 'raop',
      protocol: 'tcp',
      port,
      txt: {
        txtvers: '1',
        ch: String(this.channels),
        cn: '0,1', // PCM, ALAC
        et: '0,1', // encryption types
        sv: 'false',
        da: 'true',
        sr: String(this.sampleRate),
        ss: '16',
        vn: '65537',
        tp: 'UDP',
        md: '0,1,2',
        am: 'Wifora,1',
      },
    }
  }

  handleRtspRequest(method, headers = {}, _body = '') {
    const cseq = headers['CSeq'] || headers['cseq'] || '1'
    const responseHeaders = {
      CSeq: cseq,
      Server: 'AirTunes/220.68',
    }

    switch (method.toUpperCase()) {
      case 'ANNOUNCE': {
        this.state = AirPlayState.ANNOUNCED
        this.session = {
          id: String(Math.floor(Math.random() * 1_000_000)),
          createdAt: Date.now(),
        }
        return { statusCode: 200, statusText: 'OK', headers: responseHeaders }
      }
      case 'SETUP': {
        this.state = AirPlayState.CONFIGURED
        responseHeaders['Transport'] =
          `RTP/AVP/UDP;unicast;mode=record;server_port=${this.audioPort};control_port=${AIRPLAY_RTP_CONTROL_PORT};timing_port=${AIRPLAY_RTP_TIMING_PORT}`
        responseHeaders['Session'] = this.session?.id || '1'
        return { statusCode: 200, statusText: 'OK', headers: responseHeaders }
      }
      case 'RECORD': {
        this.state = AirPlayState.STREAMING
        this.running = true
        this.stats.activeClients = 1
        responseHeaders['Audio-Latency'] = '2205'
        return { statusCode: 200, statusText: 'OK', headers: responseHeaders }
      }
      case 'FLUSH': {
        this.state = AirPlayState.PAUSED
        return { statusCode: 200, statusText: 'OK', headers: responseHeaders }
      }
      case 'TEARDOWN': {
        this.state = AirPlayState.IDLE
        this.running = false
        this.session = null
        this.stats.activeClients = 0
        return { statusCode: 200, statusText: 'OK', headers: responseHeaders }
      }
      default:
        return { statusCode: 200, statusText: 'OK', headers: responseHeaders }
    }
  }

  packageRtpAudio(pcmSamples) {
    if (!pcmSamples || pcmSamples.length === 0) return null
    // Build standard 12-byte RTP header
    const header = Buffer.alloc(12)
    header[0] = 0x80 // Version 2
    header[1] = 0x60 // Payload type 96 (dynamic audio)
    header.writeUInt16BE(this.rtpSequence & 0xffff, 2)
    header.writeUInt32BE(this.rtpTimestamp >>> 0, 4)
    header.writeUInt32BE(this.ssrc >>> 0, 8)

    const samplesPerChannel = Math.floor(pcmSamples.length / this.channels)
    this.rtpSequence = (this.rtpSequence + 1) & 0xffff
    this.rtpTimestamp = (this.rtpTimestamp + samplesPerChannel) >>> 0

    // Convert float samples to 16-bit signed PCM
    const payload = Buffer.alloc(pcmSamples.length * 2)
    for (let i = 0; i < pcmSamples.length; i++) {
      const sample = Math.max(-1, Math.min(1, pcmSamples[i]))
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      payload.writeInt16LE(Math.round(int16), i * 2)
    }

    return Buffer.concat([header, payload])
  }

  async sendFrame(frame) {
    if (!this.running || this.state !== AirPlayState.STREAMING) return false
    const rtpPacket = this.packageRtpAudio(frame.samples)
    if (!rtpPacket) return false
    return super.sendFrame({ ...frame, samples: rtpPacket })
  }

  getStats() {
    return {
      ...super.getStats(),
      state: this.state,
      rtspPort: this.rtspPort,
      audioPort: this.audioPort,
      rtpSequence: this.rtpSequence,
      rtpTimestamp: this.rtpTimestamp,
    }
  }
}
