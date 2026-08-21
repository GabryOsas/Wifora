/* global AudioWorkletNode */

import { initI18n, t } from './i18n.js'
import { getDeviceInfo } from './device-detector.js'
import { createLogger } from './logger.js'
import { AUDIO_PROFILES as profiles, TransportPolicy, tuneOpusSdp } from './transport-policy.js'

const logger = createLogger('Host')

// --- DOM Elements ---
const homeSection = document.querySelector('#homeSection')
const activeDashboardSection = document.querySelector('#activeDashboardSection')
const mobileAdvisory = document.querySelector('#mobileAdvisory')
const themeToggleBtn = document.querySelector('#themeToggleBtn')
const sunIcon = document.querySelector('#sunIcon')
const moonIcon = document.querySelector('#moonIcon')

const startBroadcastBtn = document.querySelector('#startBroadcastBtn')
const startNativeBroadcastBtn = document.querySelector('#startNativeBroadcastBtn')
const homeStatusBanner = document.querySelector('#homeStatusBanner')
const homeStatusText = document.querySelector('#homeStatusText')

const stopBroadcastBtn = document.querySelector('#stopBroadcastBtn')
const qrImage = document.querySelector('#qrImage')
const roomCodeText = document.querySelector('#roomCodeText')
const lanUrlDisplay = document.querySelector('#lanUrlDisplay')
const copyUrlBtn = document.querySelector('#copyUrlBtn')

const liveQualitySelect = document.querySelector('#liveQualitySelect')
const liveDspSelect = document.querySelector('#liveDspSelect')
const volSlider = document.querySelector('#volSlider')
const volValue = document.querySelector('#volValue')
const muteBtn = document.querySelector('#muteBtn')
const levelBar = document.querySelector('#levelBar')
const devicesCount = document.querySelector('#devicesCount')
const devicesList = document.querySelector('#devicesList')
const noDevicesMsg = document.querySelector('#noDevicesMsg')
const toast = document.querySelector('#toast')
const a11yAnnouncer = document.querySelector('#a11yAnnouncer')

const mainWebRtcStatus = document.querySelector('#mainWebRtcStatus')
const mainWebRtcStatusText = document.querySelector('#mainWebRtcStatusText')

function announceA11y(text) {
  if (a11yAnnouncer) {
    a11yAnnouncer.textContent = ''
    setTimeout(() => {
      a11yAnnouncer.textContent = text
    }, 50)
  }
}

const peers = new Map()
let socket = null
let captureStream = null
let outputStream = null
let audioContext = null
let highPassFilter = null
let clarityFilter = null
let limiterNode = null
let gainNode = null
let analyserNode = null
let animFrameId = null
let nativeAudioSocket = null
let nativeAudioNode = null
let startNativeAfterRegistration = false
let nativeAudioReconnectTimer = null
let nativeAudioReconnectAttempts = 0
let signalReconnectTimer = null

let roomId = ''
let hostKey = ''
let listenerToken = ''
let listenerUrl = ''
let telemetryTimer = null
let stoppedByUser = false
let isMuted = false
let currentVol = 1

// --- Theme Management ---
function initTheme() {
  const saved = localStorage.getItem('wifora_theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = saved || (prefersDark ? 'dark' : 'light')
  setTheme(theme)
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('wifora_theme', theme)
  if (theme === 'dark') {
    sunIcon.hidden = false
    moonIcon.hidden = true
  } else {
    sunIcon.hidden = true
    moonIcon.hidden = false
  }
}

themeToggleBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme')
  setTheme(current === 'dark' ? 'light' : 'dark')
})

// --- Utilities ---
function showToast(msg) {
  toast.textContent = msg
  toast.classList.add('visible')
  setTimeout(() => toast.classList.remove('visible'), 2200)
}

function randomCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (n) => chars[n % chars.length]).join('')
}

function generateKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function generateListenerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function setHomeStatus(msg, type = '') {
  if (!msg) {
    homeStatusBanner.hidden = true
    return
  }
  homeStatusBanner.hidden = false
  homeStatusBanner.dataset.type = type
  homeStatusText.textContent = msg
}

// --- Modular DSP & Real-Time Studio Audio Graph ---
async function initAudio(track) {
  return initAudioFromSource((context) => context.createMediaStreamSource(new MediaStream([track])))
}

async function initNativeAudio() {
  return initAudioFromSource(async (context) => {
    if (!context.audioWorklet) throw new Error('AudioWorklet non è supportato da questo browser.')
    await context.audioWorklet.addModule('/native-audio-worklet.js')
    nativeAudioNode = new AudioWorkletNode(context, 'wifora-native-pcm', { outputChannelCount: [2] })
    return nativeAudioNode
  })
}

async function initAudioFromSource(createSource) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  audioContext = new AudioCtx({ latencyHint: 0, sampleRate: 48000 })
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  const source = await createSource(audioContext)

  // 1. High-Pass Sub-Bass Filter (Stops inaudible DC/sub-rumble < 20Hz without affecting audible punch)
  highPassFilter = audioContext.createBiquadFilter()
  highPassFilter.type = 'highpass'
  highPassFilter.frequency.value = 20
  highPassFilter.Q.value = 0.707

  // 2. Peaking Speech/Clarity Parametric Filter
  clarityFilter = audioContext.createBiquadFilter()
  clarityFilter.type = 'peaking'
  clarityFilter.frequency.value = 3200
  clarityFilter.Q.value = 1.0
  clarityFilter.gain.value = 0

  // 3. Transparent Studio Peak Limiter (Catches digital overs without audible pumping)
  limiterNode = audioContext.createDynamicsCompressor()
  limiterNode.threshold.value = -1.0
  limiterNode.knee.value = 3.0
  limiterNode.ratio.value = 12.0
  limiterNode.attack.value = 0.001
  limiterNode.release.value = 0.04

  // 4. Output Gain Node
  gainNode = audioContext.createGain()
  gainNode.gain.value = currentVol

  // 5. Non-blocking Parallel Level Analyser
  analyserNode = audioContext.createAnalyser()
  analyserNode.fftSize = 128
  analyserNode.smoothingTimeConstant = 0.45

  const destination = audioContext.createMediaStreamDestination()

  // Audio Pipeline
  source.connect(highPassFilter)
  highPassFilter.connect(clarityFilter)
  clarityFilter.connect(limiterNode)
  limiterNode.connect(gainNode)
  gainNode.connect(destination)

  // Non-intrusive parallel tap for level meter (0ms delay to stream)
  gainNode.connect(analyserNode)

  applyDspSettings()
  startLevelMeter()
  return destination.stream
}

function applyDspSettings() {
  if (!audioContext || audioContext.state === 'closed' || !highPassFilter) return
  const mode = liveDspSelect.value
  const t = audioContext.currentTime

  if (mode === 'pure') {
    // 0ms delay Direct / DSP Bypass (Bypasses Web Audio filters & compression, pristine raw Web Audio output to Opus encoder)
    highPassFilter.frequency.setTargetAtTime(1, t, 0.02)
    clarityFilter.gain.setTargetAtTime(0, t, 0.02)
    limiterNode.threshold.setTargetAtTime(0, t, 0.02)
    limiterNode.ratio.setTargetAtTime(1, t, 0.02)
  } else if (mode === 'clarity') {
    // Studio Clarity & Anti-Clipping: 20Hz Sub Cut + Fast Transparent Peak Protection
    highPassFilter.frequency.setTargetAtTime(20, t, 0.02)
    clarityFilter.gain.setTargetAtTime(0, t, 0.02)
    limiterNode.threshold.setTargetAtTime(-1.0, t, 0.02)
    limiterNode.knee.setTargetAtTime(3.0, t, 0.02)
    limiterNode.ratio.setTargetAtTime(12.0, t, 0.02)
    limiterNode.attack.setTargetAtTime(0.001, t, 0.02)
    limiterNode.release.setTargetAtTime(0.04, t, 0.02)
  } else if (mode === 'voice') {
    // Dialogue Booster: 80Hz Low Cut + 3.2kHz Speech Lift + Peak Limiter
    highPassFilter.frequency.setTargetAtTime(80, t, 0.02)
    clarityFilter.frequency.setTargetAtTime(3200, t, 0.02)
    clarityFilter.gain.setTargetAtTime(3.5, t, 0.02)
    limiterNode.threshold.setTargetAtTime(-1.5, t, 0.02)
    limiterNode.knee.setTargetAtTime(2.5, t, 0.02)
    limiterNode.ratio.setTargetAtTime(8.0, t, 0.02)
    limiterNode.attack.setTargetAtTime(0.001, t, 0.02)
    limiterNode.release.setTargetAtTime(0.05, t, 0.02)
  }
}

function startLevelMeter() {
  const data = new Uint8Array(analyserNode.frequencyBinCount)

  function update() {
    if (!audioContext || audioContext.state === 'closed' || !analyserNode) return
    analyserNode.getByteFrequencyData(data)
    let max = 0
    for (let i = 0; i < data.length; i++) {
      if (data[i] > max) max = data[i]
    }
    const percent = Math.min(100, Math.round((max / 255) * 100))
    if (levelBar) levelBar.value = percent
    animFrameId = requestAnimationFrame(update)
  }

  update()
}

// --- Live Audio Settings (Adjustable during stream) ---
liveQualitySelect.addEventListener('change', async () => {
  const profKey = liveQualitySelect.value
  const prof = profiles[profKey]
  if (!prof) return

  for (const session of peers.values()) {
    const policy = session.transportPolicy.setProfile(profKey)
    session.bitrate = policy.bitrate
    const sender = session.peer.getSenders().find((s) => s.track?.kind === 'audio')
    if (sender) await configureSender(sender, policy.bitrate)
    sendPeerPolicy(session)
  }
  showToast(t(prof.labelKey))
})

liveDspSelect.addEventListener('change', () => {
  applyDspSettings()
  const mode = liveDspSelect.value
  const key = mode === 'pure' ? 'toastDspPure' : mode === 'voice' ? 'toastDspVoice' : 'toastDspClarity'
  showToast(t(key))
})

function applyVolume() {
  if (gainNode && audioContext) {
    const val = isMuted ? 0 : currentVol
    gainNode.gain.setTargetAtTime(val, audioContext.currentTime, 0.02)
  }
}

volSlider.addEventListener('input', (e) => {
  currentVol = Number(e.target.value) / 100
  volValue.textContent = `${e.target.value}%`
  volSlider.setAttribute('aria-valuenow', e.target.value)
  volSlider.setAttribute('aria-valuetext', `${e.target.value}%`)
  applyVolume()
})

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted
  muteBtn.textContent = isMuted ? t('muteActiveBtn') : t('muteBtn')
  muteBtn.classList.toggle('btn-danger', isMuted)
  muteBtn.setAttribute('aria-pressed', String(isMuted))
  applyVolume()
  updateSubsystemsStatus()
})

// --- WebRTC & Subsystem Diagnostics & Status Indicators ---
function updateSubsystemsStatus() {
  if (!activeDashboardSection || activeDashboardSection.hidden) return

  // 1. WebRTC & Overall Status
  let connectedPeers = 0
  let degradedPeers = 0
  let maxLoss = 0
  let maxRtt = 0

  for (const session of peers.values()) {
    if (
      session.peer &&
      (session.peer.connectionState === 'connected' || session.peer.iceConnectionState === 'connected')
    ) {
      connectedPeers++
      const loss = session.smoothedLoss ?? 0
      const rtt = session.smoothedRtt ?? 0
      if (loss > maxLoss) maxLoss = loss
      if (rtt > maxRtt) maxRtt = rtt
      if (loss > 4.0 || rtt > 120) {
        degradedPeers++
      }
    }
  }

  let overallStatusKey = 'statusConnecting'
  let overallClass = 'status-connecting'

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    overallStatusKey = 'statusDisconnected'
    overallClass = 'status-disconnected'
  } else if (connectedPeers > 0) {
    if (degradedPeers > 0 || maxLoss > 4.0) {
      overallStatusKey = 'statusDegraded'
      overallClass = 'status-degraded'
    } else {
      overallStatusKey = 'statusConnected'
      overallClass = 'status-connected'
    }
  } else {
    overallStatusKey = 'statusConnecting'
    overallClass = 'status-connecting'
  }

  if (mainWebRtcStatus && mainWebRtcStatusText) {
    mainWebRtcStatus.className = `status-pill ${overallClass}`
    mainWebRtcStatusText.textContent = t(overallStatusKey)
  }
}

// --- Devices UI (In-Place Updates without Flickering) ---
function updateDeviceCountBadge() {
  const count = peers.size
  const lang = document.documentElement.getAttribute('lang') || 'it'
  const suffix = lang === 'it' ? (count === 1 ? 'o' : 'i') : ''
  devicesCount.textContent = t('devicesConnectedCount', { count: String(count), suffix })
  noDevicesMsg.hidden = count > 0
  updateSubsystemsStatus()
}

function getDeviceIconSvg(type) {
  if (type === 'tablet') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>'
  }
  if (type === 'desktop') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>'
  }
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>'
}

function addDeviceElement(sessionKey, deviceName, deviceType = 'phone') {
  const safeId = String(sessionKey).replace(/[^a-zA-Z0-9_-]/g, '_')
  const existing = document.querySelector(`#device-${safeId}`)
  if (existing) {
    const nameEl = existing.querySelector('.device-name-text')
    if (nameEl && deviceName) nameEl.textContent = deviceName
    return
  }

  const item = document.createElement('div')
  item.className = 'device-item'
  item.id = `device-${safeId}`

  const iconSvg = getDeviceIconSvg(deviceType)

  item.innerHTML = `
    <div class="device-info-left">
      <div class="device-icon-box" aria-hidden="true">
        ${iconSvg}
      </div>
      <div class="device-meta">
        <span class="device-name-text">${deviceName}</span>
        <div id="stat-${safeId}" class="device-telemetry-row">
          <span>${t('badgePending')}</span>
        </div>
      </div>
    </div>
    <button class="btn btn-secondary btn-sm kick-btn" type="button" aria-label="${t('disconnectDeviceBtn')} ${deviceName}">${t('disconnectDeviceBtn')}</button>
  `

  item.querySelector('.kick-btn').addEventListener('click', () => {
    kickDevice(sessionKey)
  })

  devicesList.appendChild(item)
  updateDeviceCountBadge()
  announceA11y(t('srDeviceJoined', { name: deviceName }))
}

function removeDeviceElement(sessionKey) {
  const safeId = String(sessionKey).replace(/[^a-zA-Z0-9_-]/g, '_')
  const elem = document.querySelector(`#device-${safeId}`)
  if (elem) elem.remove()
  updateDeviceCountBadge()
}

function cleanupPeerSession(sessionKey, reason = '') {
  const session = peers.get(sessionKey)
  if (!session) return
  logger.info(`Cleaning up peer session [${sessionKey}]`, { reason })
  clearTimeout(session.disconnectTimeout)
  clearTimeout(session.restartTimeout)
  session.disconnectTimeout = null
  if (session.peer) {
    session.peer.onconnectionstatechange = null
    session.peer.oniceconnectionstatechange = null
    session.peer.onicecandidate = null
    try {
      session.peer.close()
    } catch (err) {
      logger.debug('Error closing peer connection:', err)
    }
  }
  peers.delete(sessionKey)
  removeDeviceElement(sessionKey)
  signal({
    type: 'listener-disconnected',
    clientId: session.clientId,
    sessionId: session.sessionKey || sessionKey,
    reason,
  })
}

/** Retry ICE before destroying an established WebRTC session. */
async function restartIceSession(session, reason) {
  const peer = session?.peer
  if (
    !peer ||
    session.renegotiating ||
    session.restartAttempts >= 2 ||
    peer.connectionState === 'closed' ||
    !socket ||
    socket.readyState !== WebSocket.OPEN
  )
    return false

  session.renegotiating = true
  session.restartAttempts++
  logger.info(`Restarting ICE for peer [${session.sessionKey}]`, { reason, attempt: session.restartAttempts })
  try {
    if (typeof peer.restartIce === 'function') peer.restartIce()
    const offer = await peer.createOffer({ iceRestart: true })
    offer.sdp = tuneOpusSdp(offer.sdp, session.transportPolicy.snapshot())
    await peer.setLocalDescription(offer)
    signal({ type: 'offer', target: session.clientId, sdp: peer.localDescription })
    return true
  } catch (err) {
    logger.warn(`ICE restart failed for peer [${session.sessionKey}]:`, err?.message || err)
    return false
  } finally {
    session.renegotiating = false
  }
}

function kickDevice(sessionKey) {
  const session = peers.get(sessionKey)
  if (!session) return
  logger.warn(`Kicking listener [${sessionKey}]`)
  signal({ type: 'kick-listener', target: session.clientId || sessionKey })
  cleanupPeerSession(sessionKey, 'kicked-by-host')
  showToast(t('toastKicked'))
}

// --- WebRTC & Advanced Opus 20ms / FEC Tuning ---
function signal(msg) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
}

async function fetchLanUrl() {
  const res = await fetch('/api/network', { cache: 'no-store' })
  if (!res.ok) throw new Error("Impossibile ottenere l'indirizzo di rete locale")
  const data = await res.json()
  const ip = data.addresses?.[0]
  if (!ip) throw new Error('Nessun indirizzo Wi-Fi o Ethernet rilevato sul PC.')
  const tokenParam = listenerToken ? `&token=${listenerToken}` : ''
  return `${location.protocol}//${ip}:${data.port}/listen.html?room=${roomId}${tokenParam}`
}

async function configureSender(sender, maxBitrate) {
  if (!sender) return
  try {
    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}]
    }
    const encoding = params.encodings[0]
    encoding.maxBitrate = maxBitrate
    if ('priority' in encoding) encoding.priority = 'high'
    if ('networkPriority' in encoding) encoding.networkPriority = 'high'
    await sender.setParameters(params)
  } catch (err) {
    logger.debug('Sender setParameters not fully supported by browser:', err?.message || err)
  }
}

async function makeOffer(sessionKey, clientId, deviceName = 'Smartphone', deviceType = 'phone') {
  if (!outputStream?.getAudioTracks().length) return

  // Check if active peer connection already exists and is healthy
  const existing = peers.get(sessionKey)
  if (existing && existing.peer && existing.peer.connectionState === 'connected') {
    existing.clientId = clientId
    existing.deviceName = deviceName
    existing.deviceType = deviceType
    addDeviceElement(sessionKey, deviceName, deviceType)
    return
  }

  // A listener re-registering after an ICE/signaling interruption keeps its
  // session key. Tear down an unhealthy predecessor before replacing it so
  // that only one peer and one set of state timers can survive per device.
  if (existing) {
    clearTimeout(existing.disconnectTimeout)
    clearTimeout(existing.restartTimeout)
    if (existing.peer) {
      existing.peer.onconnectionstatechange = null
      existing.peer.oniceconnectionstatechange = null
      existing.peer.onicecandidate = null
      try {
        existing.peer.close()
      } catch (err) {
        logger.debug(`Error closing stale peer [${sessionKey}]:`, err)
      }
    }
    peers.delete(sessionKey)
  }

  const peer = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' })
  const selectedProfile = liveQualitySelect.value
  const transportPolicy = new TransportPolicy({ profileKey: selectedProfile })
  const initialPolicy = transportPolicy.snapshot()

  const session = {
    peer,
    clientId,
    sessionKey,
    deviceName,
    deviceType,
    lastPacketsSent: null,
    lastPacketsLost: null,
    lastRemoteRtcpTimestamp: null,
    lastCandidateReceived: null,
    lastActiveTime: Date.now(),
    smoothedRtt: null,
    smoothedJitter: null,
    smoothedLoss: null,
    listenerTelemetry: null,
    listenerTelemetryAt: 0,
    clockSync: null,
    transportPolicy,
    bitrate: initialPolicy.bitrate,
    disconnectTimeout: null,
    restartTimeout: null,
    restartAttempts: 0,
    renegotiating: false,
    pendingCandidates: [],
  }
  peers.set(sessionKey, session)
  addDeviceElement(sessionKey, deviceName, deviceType)

  peer.onicecandidate = ({ candidate }) => {
    if (candidate) signal({ type: 'candidate', target: session.clientId, candidate })
  }

  const handleConnectionChange = () => {
    const connState = peer.connectionState
    const iceState = peer.iceConnectionState

    if (connState === 'connected' && (iceState === 'connected' || iceState === 'completed')) {
      clearTimeout(session.disconnectTimeout)
      clearTimeout(session.restartTimeout)
      session.disconnectTimeout = null
      session.restartTimeout = null
      session.restartAttempts = 0
      session.lastActiveTime = Date.now()
      addDeviceElement(sessionKey, session.deviceName, session.deviceType)
      return
    }

    if (connState === 'closed' || iceState === 'closed') {
      clearTimeout(session.disconnectTimeout)
      session.disconnectTimeout = null
      cleanupPeerSession(sessionKey, 'connection-failed')
      return
    }

    if (
      connState === 'failed' ||
      iceState === 'failed' ||
      connState === 'disconnected' ||
      iceState === 'disconnected'
    ) {
      if (!session.disconnectTimeout) {
        session.disconnectTimeout = setTimeout(() => {
          restartIceSession(session, 'connection-state').then((started) => {
            if (!started && ['failed', 'closed'].includes(peer.connectionState)) {
              cleanupPeerSession(sessionKey, 'connection-lost')
            }
          })
        }, 750)
        session.restartTimeout = setTimeout(() => {
          if (['disconnected', 'closed', 'failed'].includes(peer.connectionState)) {
            cleanupPeerSession(sessionKey, 'ice-recovery-timeout')
          }
        }, 6_000)
      }
    }
  }

  peer.onconnectionstatechange = handleConnectionChange
  peer.oniceconnectionstatechange = handleConnectionChange

  const sender = peer.addTrack(outputStream.getAudioTracks()[0], outputStream)
  await configureSender(sender, session.bitrate)

  const offer = await peer.createOffer()
  // SDP advertises the profile ceiling; setParameters above still starts the
  // actual sender at the conservative tier and allows it to rise later.
  offer.sdp = tuneOpusSdp(offer.sdp, initialPolicy)
  await peer.setLocalDescription(offer)

  signal({ type: 'offer', target: clientId, sdp: peer.localDescription })
  sendPeerPolicy(session)
}

function sendPeerPolicy(session) {
  if (!session?.sessionKey || !roomId) return
  const policy = session.transportPolicy.snapshot()
  signal({
    type: 'audio.policy',
    version: 1,
    sessionId: session.sessionKey,
    deviceId: `host-${roomId}`,
    timestamp: Date.now(),
    payload: policy,
  })
}

function connectSignal() {
  if (stoppedByUser || (socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState))) return
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${location.host}/signal`)
  socket = ws

  ws.addEventListener('open', () => {
    clearTimeout(signalReconnectTimer)
    signalReconnectTimer = null
    logger.info(`Host signaling connected, registering room [${roomId}]`)
    signal({ type: 'register', role: 'host', roomId, hostKey, listenerToken })
  })

  ws.addEventListener('message', async ({ data }) => {
    let msg
    try {
      msg = JSON.parse(data)
    } catch (err) {
      logger.warn('Malformed JSON received from signaling server:', err)
      return
    }

    if (msg.type === 'error') {
      logger.error(`Signaling error received: ${msg.message}`)
      showToast(msg.message)
      return
    }

    if (msg.type === 'registered' && startNativeAfterRegistration) {
      startNativeAfterRegistration = false
      openNativeAudioSocket()
      return
    }

    if (msg.type === 'listener-joined') {
      const sessionKey = msg.sessionId || msg.clientId
      logger.info(`Listener joined signal received [session:${sessionKey}, client:${msg.clientId}]`)
      await makeOffer(sessionKey, msg.clientId, msg.deviceName, msg.deviceType)
    }

    if (msg.type === 'telemetry.report') {
      const sessionKey = msg.sessionId || msg.clientId
      let session = peers.get(sessionKey)
      if (!session) {
        session = [...peers.values()].find((candidate) => candidate.clientId === msg.clientId)
      }
      if (session) {
        session.listenerTelemetry = msg.payload
        session.listenerTelemetryAt = Date.now()
      }
      return
    }

    if (msg.type === 'clock.sync') {
      const sessionKey = msg.sessionId || msg.clientId
      let session = peers.get(sessionKey)
      if (!session) {
        session = [...peers.values()].find((candidate) => candidate.clientId === msg.clientId)
      }
      if (!session) return

      if (msg.payload.mode === 'probe') {
        const hostReceivedAt = Date.now()
        signal({
          type: 'clock.sync',
          version: 1,
          sessionId: session.sessionKey,
          deviceId: `host-${roomId}`,
          timestamp: hostReceivedAt,
          payload: {
            mode: 'reply',
            clientSentAt: msg.payload.clientSentAt,
            hostReceivedAt,
            hostSentAt: Date.now(),
          },
        })
      } else if (msg.payload.mode === 'report') {
        session.clockSync = { ...msg.payload, receivedAt: Date.now() }
      }
      return
    }

    if (msg.type === 'answer') {
      const sessionKey = msg.sessionId || msg.clientId
      let session = peers.get(sessionKey)
      if (!session) {
        for (const s of peers.values()) {
          if (s.clientId === msg.clientId) {
            session = s
            break
          }
        }
      }
      if (session) {
        try {
          await session.peer.setRemoteDescription(msg.sdp)
          for (const candidate of session.pendingCandidates.splice(0)) {
            await session.peer.addIceCandidate(candidate)
          }
          logger.debug(`Remote description set for peer [${sessionKey}]`)
        } catch (err) {
          logger.error(`Failed to set remote description for [${sessionKey}]:`, err)
        }
      }
    }

    if (msg.type === 'candidate') {
      const sessionKey = msg.sessionId || msg.clientId
      let session = peers.get(sessionKey)
      if (!session) {
        for (const s of peers.values()) {
          if (s.clientId === msg.clientId) {
            session = s
            break
          }
        }
      }
      if (session && msg.candidate) {
        if (session.peer.remoteDescription) {
          try {
            await session.peer.addIceCandidate(msg.candidate)
          } catch (err) {
            logger.debug(`Ignored candidate error for [${sessionKey}]:`, err?.message || err)
          }
        } else {
          session.pendingCandidates.push(msg.candidate)
        }
      }
    }

    if (msg.type === 'listener-left') {
      const sessionKey = msg.sessionId || msg.clientId
      let session = peers.get(sessionKey)
      let foundKey = sessionKey
      if (!session) {
        for (const [k, s] of peers.entries()) {
          if (s.clientId === msg.clientId || s.sessionKey === sessionKey) {
            session = s
            foundKey = k
            break
          }
        }
      }
      if (session) {
        logger.info(`Listener left signal received for [${foundKey}]`)
        clearTimeout(session.disconnectTimeout)
        session.disconnectTimeout = null
        if (session.peer) {
          session.peer.onconnectionstatechange = null
          session.peer.oniceconnectionstatechange = null
          session.peer.onicecandidate = null
          try {
            session.peer.close()
          } catch (err) {
            logger.debug('Error closing peer on listener-left:', err)
          }
        }
        peers.delete(foundKey)
        peers.delete(sessionKey)
        removeDeviceElement(foundKey)
        removeDeviceElement(sessionKey)
      }
    }
  })

  ws.addEventListener('close', () => {
    if (socket !== ws || stoppedByUser) return
    socket = null
    scheduleSignalReconnect()
  })
}

function scheduleSignalReconnect() {
  if (stoppedByUser || signalReconnectTimer) return
  signalReconnectTimer = setTimeout(() => {
    signalReconnectTimer = null
    connectSignal()
  }, 500)
}

function openNativeAudioSocket() {
  if (!nativeAudioNode) return
  if (nativeAudioSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(nativeAudioSocket.readyState)) return
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(
    `${protocol}//${location.host}/native-audio?room=${encodeURIComponent(roomId)}&key=${encodeURIComponent(hostKey)}`
  )
  nativeAudioSocket = ws
  ws.binaryType = 'arraybuffer'
  ws.addEventListener('open', () => {
    nativeAudioReconnectAttempts = 0
    logger.info('Native WASAPI audio relay connected')
  })
  ws.addEventListener('message', ({ data }) => {
    if (data instanceof ArrayBuffer) {
      nativeAudioNode?.port.postMessage(data, [data])
    }
  })
  ws.addEventListener('close', (event) => {
    if (nativeAudioSocket === ws) nativeAudioSocket = null
    if (!stoppedByUser && event.code !== 1000) {
      logger.warn(`Native WASAPI audio relay closed (code ${event.code}); retrying`)
      scheduleNativeAudioReconnect()
    }
  })
  ws.addEventListener('error', () => logger.warn('Native WASAPI audio relay connection error'))
}

function scheduleNativeAudioReconnect() {
  if (stoppedByUser || !nativeAudioNode || nativeAudioReconnectTimer) return
  const delay = Math.min(5_000, 250 * 2 ** nativeAudioReconnectAttempts)
  nativeAudioReconnectAttempts = Math.min(nativeAudioReconnectAttempts + 1, 5)
  nativeAudioReconnectTimer = setTimeout(() => {
    nativeAudioReconnectTimer = null
    openNativeAudioSocket()
  }, delay)
}

// --- Real-time Adaptive Network & Audio Engine (ANAE) ---
function freshTelemetry(session, now) {
  if (!session.listenerTelemetry || now - session.listenerTelemetryAt > 4_000) return null
  return session.listenerTelemetry
}

function worstMetric(hostValue, listenerValue) {
  const host = Number.isFinite(hostValue) ? hostValue : null
  const listener = Number.isFinite(listenerValue) ? listenerValue : null
  if (host == null) return listener
  if (listener == null) return host
  return Math.max(host, listener)
}

async function pollTelemetryAndAdapt() {
  const now = Date.now()

  for (const [sessionKey, session] of peers.entries()) {
    if (!session.peer) continue
    const connState = session.peer.connectionState
    const iceState = session.peer.iceConnectionState

    if (connState === 'closed' || iceState === 'closed') {
      cleanupPeerSession(sessionKey, 'connection-failed')
      continue
    }

    if (connState !== 'connected' && iceState !== 'connected' && iceState !== 'completed') {
      continue
    }

    try {
      const stats = await session.peer.getStats()
      let rtt = null
      let jitter = null
      let packetsLost = 0
      let packetsSent = null
      let remoteRtcpTimestamp = null
      let candidateLastReceived = null

      stats.forEach((report) => {
        if (report.type === 'remote-inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
          if (report.roundTripTime != null) rtt = Math.round(report.roundTripTime * 1000)
          if (report.jitter != null) jitter = Math.round(report.jitter * 1000)
          if (report.packetsLost != null) packetsLost = report.packetsLost
          if (report.timestamp != null) remoteRtcpTimestamp = report.timestamp
        } else if (report.type === 'outbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
          if (report.packetsSent != null) packetsSent = report.packetsSent
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (rtt == null && report.currentRoundTripTime != null) {
            rtt = Math.round(report.currentRoundTripTime * 1000)
          }
          if (report.lastPacketReceivedTimestamp != null) {
            candidateLastReceived = report.lastPacketReceivedTimestamp
          }
        }
      })

      // Check if remote listener is actually sending RTCP or STUN responses
      let hasNewActivity = false
      if (remoteRtcpTimestamp != null && remoteRtcpTimestamp !== session.lastRemoteRtcpTimestamp) {
        session.lastRemoteRtcpTimestamp = remoteRtcpTimestamp
        hasNewActivity = true
      }
      if (candidateLastReceived != null && candidateLastReceived !== session.lastCandidateReceived) {
        session.lastCandidateReceived = candidateLastReceived
        hasNewActivity = true
      }

      if (hasNewActivity) {
        session.lastActiveTime = now
      }

      const timeSinceActive = now - (session.lastActiveTime || now)

      // If no activity from listener for > 7.5 seconds, client is dead/disconnected
      if (timeSinceActive > 7500) {
        cleanupPeerSession(sessionKey, 'inactivity-timeout')
        continue
      }

      // If inactive for > 3.5 seconds, display signal lost warning and do not calculate fake 0% loss
      const isStale = timeSinceActive > 3500

      const dSent =
        packetsSent != null && session.lastPacketsSent != null
          ? Math.max(0, packetsSent - session.lastPacketsSent)
          : null
      const dLost =
        hasNewActivity && session.lastPacketsLost != null ? Math.max(0, packetsLost - session.lastPacketsLost) : null

      const instantLossRate = hasNewActivity && dSent && dLost != null ? (dLost / dSent) * 100 : isStale ? 100 : null

      session.lastPacketsSent = packetsSent
      if (hasNewActivity) {
        session.lastPacketsLost = packetsLost
      }

      const smooth = (previous, sample, weight = 0.3) =>
        sample == null ? previous : previous == null ? sample : previous + (sample - previous) * weight

      if (!isStale) {
        session.smoothedRtt = smooth(session.smoothedRtt, rtt)
        session.smoothedJitter = smooth(session.smoothedJitter, jitter)
        session.smoothedLoss = smooth(session.smoothedLoss, instantLossRate, 0.4)
      } else {
        session.smoothedLoss = 100
      }

      const safeId = String(sessionKey).replace(/[^a-zA-Z0-9_-]/g, '_')
      const statElem = document.querySelector(`#stat-${safeId}`)

      if (isStale) {
        if (statElem) {
          statElem.innerHTML = `
            <span class="device-warn-text">${t('wifiLost')}</span>
            <span class="telemetry-separator" aria-hidden="true">•</span>
            <span>${t('telemetryReconnecting')}</span>
          `
        }
        continue
      }

      const receiverTelemetry = freshTelemetry(session, now)
      const effectiveRtt = worstMetric(session.smoothedRtt, receiverTelemetry?.rttMs)
      const effectiveLoss = worstMetric(session.smoothedLoss, receiverTelemetry?.lossPercent)
      const effectiveJitter = worstMetric(session.smoothedJitter, receiverTelemetry?.jitterMs)
      const transport = session.transportPolicy.update({
        rttMs: effectiveRtt,
        lossPercent: effectiveLoss,
        jitterMs: effectiveJitter,
        severe: (rtt != null && rtt >= 200) || (instantLossRate != null && instantLossRate >= 10),
      })
      session.bitrate = transport.bitrate
      if (transport.changed) {
        const sender = session.peer.getSenders().find((s) => s.track?.kind === 'audio')
        if (sender) configureSender(sender, transport.bitrate)
        sendPeerPolicy(session)
      }

      // Update Device Item Telemetry UI
      if (statElem) {
        const pingDisplay = effectiveRtt != null ? `${Math.round(effectiveRtt)} ms` : null
        const jitterDisplay = effectiveJitter != null ? `Jitter ${Math.round(effectiveJitter)} ms` : null
        const playoutDisplay = Number.isFinite(receiverTelemetry?.playoutDelayMs)
          ? `Buffer ${Math.round(receiverTelemetry.playoutDelayMs)} ms`
          : null
        const syncDisplay = Number.isFinite(session.clockSync?.offsetMs)
          ? `Sync ${session.clockSync.offsetMs >= 0 ? '+' : ''}${session.clockSync.offsetMs.toFixed(1)} ms`
          : null
        const bitrateKbps = Math.round((session.bitrate || 160000) / 1000)
        const loss = effectiveLoss ?? 0
        const isDegraded = loss > 4.0 || (effectiveRtt ?? 0) > 120

        const parts = []
        if (pingDisplay) {
          parts.push(`<span>${pingDisplay}</span>`)
        }
        if (jitterDisplay) {
          parts.push(`<span>${jitterDisplay}</span>`)
        }
        if (playoutDisplay) {
          parts.push(`<span>${playoutDisplay}</span>`)
        }
        if (syncDisplay) {
          parts.push(`<span>${syncDisplay}</span>`)
        }
        parts.push(`<span>${bitrateKbps} kbps</span>`)
        if (loss > 0.1) {
          parts.push(`<span>${loss.toFixed(1)}% ${t('telemetryLoss').toLowerCase()}</span>`)
        }
        if (isDegraded) {
          parts.push(
            `<span class="device-warn-text">${t('statusDegraded')} (${loss.toFixed(0)}% ${t('telemetryLoss').toLowerCase()})</span>`
          )
        }

        statElem.innerHTML = parts.join('<span class="telemetry-separator" aria-hidden="true">•</span>')
      }
    } catch (err) {
      logger.debug('Error polling telemetry for peer:', err?.message || err)
    }
  }

  updateSubsystemsStatus()
}

// --- Lifecycle Actions ---
async function startTransmission() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    logger.error('getDisplayMedia not supported in this browser')
    setHomeStatus(t('statusBrowserUnsupported'), 'error')
    return
  }

  try {
    stoppedByUser = false
    setHomeStatus(t('statusSelectPrompt'))

    const capture = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor' },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        highpassFilter: false,
        channelCount: 2,
        sampleRate: 48000,
        latency: 0,
        googEchoCancellation: false,
        googAutoGainControl: false,
        googNoiseSuppression: false,
        googHighpassFilter: false,
        googAudioMirroring: false,
      },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
    })

    const audioTrack = capture.getAudioTracks()[0]
    if (!audioTrack) {
      capture.getTracks().forEach((t) => t.stop())
      logger.warn('User did not check "Share system audio"')
      setHomeStatus(t('statusNoAudio'), 'error')
      return
    }

    captureStream = capture
    audioTrack.addEventListener('ended', () => {
      logger.info('System audio track ended by OS/user')
      stopTransmission()
    })
    capture.getVideoTracks().forEach((t) => {
      t.addEventListener('ended', () => stopTransmission())
      t.stop() // Immediately stop video to conserve 100% bandwidth and CPU for pure audio
    })

    await activateBroadcast(await initAudio(audioTrack))
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      logger.info('Screen capture permission cancelled by user')
      setHomeStatus(t('statusPermissionDenied'))
    } else {
      logger.error('startTransmission error:', err)
      setHomeStatus(t('statusError', { msg: err.message }), 'error')
    }
  }
}

async function startNativeTransmission() {
  try {
    stoppedByUser = false
    setHomeStatus('Avvio della cattura WASAPI nativa…')
    await activateBroadcast(await initNativeAudio(), { native: true })
  } catch (err) {
    logger.error('startNativeTransmission error:', err)
    stopTransmission()
    setHomeStatus(`Cattura WASAPI nativa non disponibile: ${err.message}`, 'error')
  }
}

async function activateBroadcast(stream, { native = false } = {}) {
  outputStream = stream
  roomId = randomCode(8)
  hostKey = generateKey()
  listenerToken = generateListenerToken()
  listenerUrl = await fetchLanUrl()

  logger.info(`Broadcast initialized: Room [${roomId}]${native ? ' (native WASAPI)' : ''}`)
  roomCodeText.textContent = roomId
  lanUrlDisplay.textContent = listenerUrl
  qrImage.src = `/qr?text=${encodeURIComponent(listenerUrl)}`
  homeSection.hidden = true
  activeDashboardSection.hidden = false
  setHomeStatus('')

  startNativeAfterRegistration = native
  connectSignal()
  clearInterval(telemetryTimer)
  telemetryTimer = setInterval(pollTelemetryAndAdapt, 1000)
  updateDeviceCountBadge()
}

function stopTransmission() {
  logger.info('Stopping broadcast...')
  stoppedByUser = true
  clearInterval(telemetryTimer)
  clearTimeout(signalReconnectTimer)
  signalReconnectTimer = null
  cancelAnimationFrame(animFrameId)

  if (socket?.readyState === WebSocket.OPEN) {
    signal({ type: 'stop-stream' })
  }

  for (const session of peers.values()) {
    clearTimeout(session.disconnectTimeout)
    try {
      session.peer.close()
    } catch (err) {
      logger.debug('Error closing peer during stopTransmission:', err)
    }
  }
  peers.clear()

  document.querySelectorAll('.device-item').forEach((el) => el.remove())

  captureStream?.getTracks().forEach((t) => t.stop())
  startNativeAfterRegistration = false
  clearTimeout(nativeAudioReconnectTimer)
  nativeAudioReconnectTimer = null
  nativeAudioReconnectAttempts = 0
  if (nativeAudioSocket) {
    try {
      nativeAudioSocket.close(1000, 'Broadcast stopped')
    } catch (err) {
      logger.debug('Error closing native audio socket:', err)
    }
  }
  nativeAudioSocket = null
  outputStream?.getTracks().forEach((t) => t.stop())
  if (audioContext) {
    try {
      audioContext.close()
    } catch (err) {
      logger.debug('Error closing audioContext during stopTransmission:', err)
    }
  }

  captureStream = null
  outputStream = null
  audioContext = null
  highPassFilter = null
  clarityFilter = null
  limiterNode = null
  gainNode = null
  analyserNode = null
  nativeAudioNode = null

  if (socket) {
    try {
      socket.close()
    } catch (err) {
      logger.debug('Error closing socket during stopTransmission:', err)
    }
  }
  socket = null

  homeSection.hidden = false
  activeDashboardSection.hidden = true
  if (levelBar) levelBar.value = 0
  setHomeStatus(t('statusEnded'))
}

// --- Event Listeners ---
startBroadcastBtn.addEventListener('click', startTransmission)
startNativeBroadcastBtn?.addEventListener('click', startNativeTransmission)
stopBroadcastBtn.addEventListener('click', stopTransmission)

copyUrlBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(listenerUrl)
    showToast(t('toastCopied'))
  } catch {
    showToast(t('toastManualCopy'))
  }
})

async function checkMobileAdvisory() {
  if (!mobileAdvisory) return
  try {
    const info = await getDeviceInfo()
    if (info.type === 'phone' || info.type === 'tablet') {
      mobileAdvisory.hidden = false
    } else {
      mobileAdvisory.hidden = true
    }
  } catch {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
    mobileAdvisory.hidden = !(isMobileUA || isTouchDevice)
  }
}

// Initialize
initTheme()
initI18n()
checkMobileAdvisory()
