import { initI18n, t } from './i18n.js'
import { getDeviceInfo } from './device-detector.js'
import { createLogger } from './logger.js'

const logger = createLogger('Host')

// --- DOM Elements ---
const homeSection = document.querySelector('#homeSection')
const activeDashboardSection = document.querySelector('#activeDashboardSection')
const mobileAdvisory = document.querySelector('#mobileAdvisory')
const themeToggleBtn = document.querySelector('#themeToggleBtn')
const sunIcon = document.querySelector('#sunIcon')
const moonIcon = document.querySelector('#moonIcon')

const startBroadcastBtn = document.querySelector('#startBroadcastBtn')
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
const subWebrtcCard = document.querySelector('#subWebrtcCard')
const subWebrtcState = document.querySelector('#subWebrtcState')
const subWebrtcMeta = document.querySelector('#subWebrtcMeta')
const subSignalCard = document.querySelector('#subSignalCard')
const subSignalState = document.querySelector('#subSignalState')
const subSignalMeta = document.querySelector('#subSignalMeta')
const subAudioCard = document.querySelector('#subAudioCard')
const subAudioState = document.querySelector('#subAudioState')
const subAudioMeta = document.querySelector('#subAudioMeta')
const subNetworkCard = document.querySelector('#subNetworkCard')
const subNetworkState = document.querySelector('#subNetworkState')
const subNetworkMeta = document.querySelector('#subNetworkMeta')

function announceA11y(text) {
  if (a11yAnnouncer) {
    a11yAnnouncer.textContent = ''
    setTimeout(() => {
      a11yAnnouncer.textContent = text
    }, 50)
  }
}

// --- Audio Transmission Profiles & Adaptation Tiers ---
const profiles = {
  adaptive: {
    // Opus reaches transparent stereo quality well below 384 kbps. Leaving some
    // headroom is important on Wi-Fi, especially when several listeners join.
    maxBitrate: 256000,
    isAdaptive: true,
    cbr: false,
    labelKey: 'profileAdaptive',
  },
  lowlatency: {
    maxBitrate: 160000,
    isAdaptive: false,
    cbr: true,
    labelKey: 'profileLowLatency',
  },
  hifi: {
    maxBitrate: 384000,
    isAdaptive: false,
    cbr: false,
    labelKey: 'profileHifi',
  },
  eco: {
    maxBitrate: 96000,
    isAdaptive: false,
    cbr: false,
    labelKey: 'profileEco',
  },
}

// Multi-Tier Quality Levels for Real-Time ANAE Auto-Adaptation
const AUTO_TIERS = [
  {
    tier: 1,
    name: 'Ultra-Resilient',
    bitrate: 96000,
    maxRtt: 9999,
    maxLoss: 99.0,
    maxJitter: 999,
    badge: 'badge-bad',
    labelKey: 'tierWeak',
  },
  {
    tier: 2,
    name: 'Anti-Lag Resilient',
    bitrate: 128000,
    maxRtt: 120,
    maxLoss: 4.0,
    maxJitter: 25,
    badge: 'badge-warn',
    labelKey: 'tierAntiLag',
  },
  {
    tier: 3,
    name: 'Balanced Standard',
    bitrate: 160000,
    maxRtt: 85,
    maxLoss: 1.8,
    maxJitter: 15,
    badge: 'badge-good',
    labelKey: 'tierStandard',
  },
  {
    tier: 4,
    name: 'Studio High',
    bitrate: 224000,
    maxRtt: 50,
    maxLoss: 0.8,
    maxJitter: 8,
    badge: 'badge-good',
    labelKey: 'tierHd',
  },
  {
    tier: 5,
    name: 'Studio Master',
    bitrate: 256000,
    maxRtt: 25,
    maxLoss: 0.2,
    maxJitter: 4,
    badge: 'badge-good',
    labelKey: 'tierMaster',
  },
]

// Start in the balanced tier. It prevents the first seconds of playback from
// saturating a Wi-Fi uplink, then quality rises only after the link is proven good.
const ADAPTIVE_START_TIER = 3

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
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  audioContext = new AudioCtx({ latencyHint: 0, sampleRate: 48000 })
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  const source = audioContext.createMediaStreamSource(new MediaStream([track]))

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
    if (levelBar) levelBar.style.width = `${percent}%`
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
    session.currentTier = prof.isAdaptive ? ADAPTIVE_START_TIER : 5
    session.consecutiveGood = 0
    session.pendingDowngradeTier = null
    session.pendingDowngradeSamples = 0
    session.bitrate = prof.isAdaptive ? AUTO_TIERS[ADAPTIVE_START_TIER - 1].bitrate : prof.maxBitrate
    const sender = session.peer.getSenders().find((s) => s.track?.kind === 'audio')
    if (sender) await configureSender(sender, prof.maxBitrate)
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
  const totalPeers = peers.size
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

  let overallStatus = 'CONNECTING'
  let overallClass = 'status-connecting'

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    overallStatus = 'DISCONNECTED'
    overallClass = 'status-disconnected'
  } else if (connectedPeers > 0) {
    if (degradedPeers > 0 || maxLoss > 4.0) {
      overallStatus = 'DEGRADED'
      overallClass = 'status-degraded'
    } else {
      overallStatus = 'CONNECTED'
      overallClass = 'status-connected'
    }
  } else {
    overallStatus = 'CONNECTING'
    overallClass = 'status-connecting'
  }

  if (mainWebRtcStatus && mainWebRtcStatusText) {
    mainWebRtcStatus.className = `status-pill ${overallClass}`
    mainWebRtcStatusText.textContent = overallStatus
  }

  // WebRTC Card
  if (subWebrtcCard && subWebrtcState && subWebrtcMeta) {
    if (connectedPeers > 0) {
      subWebrtcCard.className = degradedPeers > 0 ? 'subsystem-card status-degraded' : 'subsystem-card status-ok'
      const lang = document.documentElement.getAttribute('lang') || 'it'
      const suffix = lang === 'it' ? (connectedPeers === 1 ? 'o' : 'i') : connectedPeers > 1 ? 's' : ''
      subWebrtcState.textContent = t('subsystemWebrtcPeers', { count: String(connectedPeers), suffix })
      subWebrtcMeta.textContent = degradedPeers > 0 ? `Loss: ${maxLoss.toFixed(1)}%` : `RTT: ${Math.round(maxRtt)}ms`
    } else {
      subWebrtcCard.className = 'subsystem-card status-warn'
      subWebrtcState.textContent = t('subsystemWebrtcIdle')
      subWebrtcMeta.textContent = `${totalPeers} in negotiation`
    }
  }

  // Signal Card
  if (subSignalCard && subSignalState && subSignalMeta) {
    if (socket?.readyState === WebSocket.OPEN) {
      subSignalCard.className = 'subsystem-card status-ok'
      subSignalState.textContent = t('subsystemSignalWsLive')
      subSignalMeta.textContent = `ws://${location.host}/signal`
    } else if (socket?.readyState === WebSocket.CONNECTING) {
      subSignalCard.className = 'subsystem-card status-warn'
      subSignalState.textContent = t('subsystemSignalWsReconnecting')
      subSignalMeta.textContent = 'Retrying...'
    } else {
      subSignalCard.className = 'subsystem-card status-bad'
      subSignalState.textContent = t('subsystemSignalWsOffline')
      subSignalMeta.textContent = 'Disconnected'
    }
  }

  // Audio Card
  if (subAudioCard && subAudioState && subAudioMeta) {
    if (isMuted) {
      subAudioCard.className = 'subsystem-card status-warn'
      subAudioState.textContent = t('subsystemAudioMuted')
      subAudioMeta.textContent = 'Mute Active'
    } else if (outputStream && outputStream.active) {
      subAudioCard.className = 'subsystem-card status-ok'
      subAudioState.textContent = t('subsystemAudioActive')
      subAudioMeta.textContent = 'Opus 20ms'
    } else {
      subAudioCard.className = 'subsystem-card status-bad'
      subAudioState.textContent = t('subsystemAudioInactive')
      subAudioMeta.textContent = 'No stream'
    }
  }

  // Network Card
  if (subNetworkCard && subNetworkState && subNetworkMeta) {
    const isLan = listenerUrl && !listenerUrl.includes('localhost') && !listenerUrl.includes('127.0.0.1')
    subNetworkCard.className = isLan ? 'subsystem-card status-ok' : 'subsystem-card status-warn'
    subNetworkState.textContent = isLan ? t('subsystemNetworkLan') : 'Localhost Only'
    subNetworkMeta.textContent = isLan ? 'Wi-Fi / LAN' : '127.0.0.1'
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
          <span class="telemetry-badge badge-pending"><span class="status-dot"></span> CONNECTING</span>
          <span class="telemetry-badge badge-pending">${t('badgePending')}</span>
        </div>
      </div>
    </div>
    <button class="btn btn-danger btn-sm kick-btn" type="button" aria-label="${t('disconnectDeviceBtn')} ${deviceName}">${t('disconnectDeviceBtn')}</button>
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

function tuneOpusSdp(sdp, profileKey, maxBitrate) {
  const prof = profiles[profileKey] || profiles.adaptive
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i)
  if (!opusMatch) return sdp
  const payload = opusMatch[1]

  // 20 ms packets retain low latency while halving packet-rate overhead versus
  // forced 10 ms packets. FEC is kept enabled to recover isolated Wi-Fi loss.
  const isCbr = Boolean(prof.cbr)
  let options = `minptime=10;ptime=20;maxptime=20;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=${maxBitrate ?? prof.maxBitrate};maxplaybackrate=48000`
  if (isCbr) {
    options += ';cbr=1'
  } else {
    options += ';cbr=0'
  }

  const fmtp = new RegExp(`a=fmtp:${payload}[^\\r\\n]*`, 'i')
  return fmtp.test(sdp)
    ? sdp.replace(fmtp, `a=fmtp:${payload} ${options}`)
    : sdp.replace(opusMatch[0], `${opusMatch[0]}\r\na=fmtp:${payload} ${options}`)
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

  const peer = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' })
  const selectedProfile = liveQualitySelect.value
  const prof = profiles[selectedProfile] || profiles.adaptive

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
    pendingDowngradeTier: null,
    pendingDowngradeSamples: 0,
    bitrate: prof.isAdaptive ? AUTO_TIERS[ADAPTIVE_START_TIER - 1].bitrate : prof.maxBitrate,
    currentTier: prof.isAdaptive ? ADAPTIVE_START_TIER : 5,
    consecutiveGood: 0,
    disconnectTimeout: null,
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
      session.disconnectTimeout = null
      session.lastActiveTime = Date.now()
      addDeviceElement(sessionKey, session.deviceName, session.deviceType)
      return
    }

    if (['failed', 'closed'].includes(connState) || ['failed', 'closed'].includes(iceState)) {
      clearTimeout(session.disconnectTimeout)
      session.disconnectTimeout = null
      cleanupPeerSession(sessionKey, 'connection-failed')
      return
    }

    if (connState === 'disconnected' || iceState === 'disconnected') {
      if (!session.disconnectTimeout) {
        session.disconnectTimeout = setTimeout(() => {
          if (
            ['disconnected', 'closed', 'failed'].includes(peer.connectionState) ||
            ['disconnected', 'closed', 'failed'].includes(peer.iceConnectionState)
          ) {
            cleanupPeerSession(sessionKey, 'connection-lost')
          }
        }, 3500)
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
  offer.sdp = tuneOpusSdp(offer.sdp, selectedProfile)
  await peer.setLocalDescription(offer)

  signal({ type: 'offer', target: clientId, sdp: peer.localDescription })
}

function connectSignal() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${location.host}/signal`)
  socket = ws

  ws.addEventListener('open', () => {
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

    if (msg.type === 'listener-joined') {
      const sessionKey = msg.sessionId || msg.clientId
      logger.info(`Listener joined signal received [session:${sessionKey}, client:${msg.clientId}]`)
      await makeOffer(sessionKey, msg.clientId, msg.deviceName, msg.deviceType)
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
        try {
          await session.peer.addIceCandidate(msg.candidate)
        } catch (err) {
          logger.debug(`Ignored candidate error for [${sessionKey}]:`, err?.message || err)
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
    if (socket === ws && !stoppedByUser) {
      setTimeout(connectSignal, 1500)
    }
  })
}

// --- Real-time Adaptive Network & Audio Engine (ANAE) ---
async function pollTelemetryAndAdapt() {
  const isAdaptiveMode = profiles[liveQualitySelect.value]?.isAdaptive ?? true
  const now = Date.now()

  for (const [sessionKey, session] of peers.entries()) {
    if (!session.peer) continue
    const connState = session.peer.connectionState
    const iceState = session.peer.iceConnectionState

    if (['failed', 'closed'].includes(connState) || ['failed', 'closed'].includes(iceState)) {
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
            <span class="telemetry-badge badge-bad">${t('wifiLost')}</span>
            <span class="telemetry-item">${t('telemetryReconnecting')}</span>
          `
        }
        continue
      }

      // Determine Target Tier when in Auto-Adaptive mode
      let activeTierObj = AUTO_TIERS[4] // Default Tier 5 (Master)

      if (isAdaptiveMode) {
        const evalRtt = session.smoothedRtt ?? 10
        const evalLoss = session.smoothedLoss ?? 0
        const evalJitter = session.smoothedJitter ?? 1

        let targetTier = 1
        for (let i = AUTO_TIERS.length - 1; i >= 0; i--) {
          const tObj = AUTO_TIERS[i]
          if (evalRtt <= tObj.maxRtt && evalLoss <= tObj.maxLoss && evalJitter <= tObj.maxJitter) {
            targetTier = tObj.tier
            break
          }
        }

        // A serious collapse drops immediately; ordinary one-sample spikes must
        // repeat before changing the codec target. Recovery is deliberately slow.
        const isSevere = (rtt != null && rtt >= 200) || (instantLossRate != null && instantLossRate >= 10)
        if (targetTier < session.currentTier) {
          if (isSevere || session.pendingDowngradeTier === targetTier) {
            session.pendingDowngradeSamples++
          } else {
            session.pendingDowngradeTier = targetTier
            session.pendingDowngradeSamples = 1
          }
          if (isSevere || session.pendingDowngradeSamples >= 2) {
            session.currentTier = targetTier
            session.consecutiveGood = 0
            session.pendingDowngradeTier = null
            session.pendingDowngradeSamples = 0
            session.bitrate = AUTO_TIERS[targetTier - 1].bitrate
            const sender = session.peer.getSenders().find((s) => s.track?.kind === 'audio')
            if (sender) configureSender(sender, session.bitrate)
          }
        } else if (targetTier > session.currentTier) {
          session.pendingDowngradeTier = null
          session.pendingDowngradeSamples = 0
          session.consecutiveGood++
          if (session.consecutiveGood >= 5) {
            session.currentTier = Math.min(session.currentTier + 1, targetTier)
            session.consecutiveGood = 0
            session.bitrate = AUTO_TIERS[session.currentTier - 1].bitrate
            const sender = session.peer.getSenders().find((s) => s.track?.kind === 'audio')
            if (sender) configureSender(sender, session.bitrate)
          }
        } else {
          session.pendingDowngradeTier = null
          session.pendingDowngradeSamples = 0
          session.consecutiveGood = Math.min(session.consecutiveGood + 1, 5)
        }

        activeTierObj = AUTO_TIERS[session.currentTier - 1]
      } else {
        const fixedBitrate = profiles[liveQualitySelect.value]?.maxBitrate || 384000
        session.bitrate = fixedBitrate
        activeTierObj = {
          badge: rtt != null && rtt > 80 ? 'badge-bad' : 'badge-good',
          labelKey: null,
          customLabel: `${Math.round(fixedBitrate / 1000)}k`,
        }
      }

      // Update Device Item Telemetry UI
      if (statElem) {
        const pingDisplay = session.smoothedRtt != null ? `${Math.round(session.smoothedRtt)} ms` : t('liveBadge')
        const lossDisplay = `${(session.smoothedLoss ?? 0).toFixed(1)}%`
        const bitrateDisplay = `${Math.round(session.bitrate / 1000)} kbps`
        const badgeLabel = activeTierObj.labelKey ? t(activeTierObj.labelKey) : activeTierObj.customLabel

        const isDegraded =
          (session.smoothedLoss ?? 0) > 4 || (session.smoothedRtt ?? 0) > 100 || (session.currentTier ?? 5) <= 2
        const statusBadgeClass = isDegraded ? 'badge-warn' : 'badge-good'
        const statusBadgeText = isDegraded ? 'DEGRADED' : 'CONNECTED'

        statElem.innerHTML = `
          <span class="telemetry-badge ${statusBadgeClass}"><span class="status-dot"></span> ${statusBadgeText}</span>
          <span class="telemetry-badge ${activeTierObj.badge}">${badgeLabel}</span>
          <span class="telemetry-item">Ping: <strong>${pingDisplay}</strong></span>
          <span class="telemetry-item">Bitrate: <strong>${bitrateDisplay}</strong></span>
          <span class="telemetry-item">Loss: <strong>${lossDisplay}</strong></span>
        `
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

    outputStream = await initAudio(audioTrack)
    roomId = randomCode(8)
    hostKey = generateKey()
    listenerToken = generateListenerToken()
    listenerUrl = await fetchLanUrl()

    logger.info(`Broadcast initialized: Room [${roomId}]`)

    roomCodeText.textContent = roomId
    lanUrlDisplay.textContent = listenerUrl
    qrImage.src = `/qr?text=${encodeURIComponent(listenerUrl)}`

    homeSection.hidden = true
    activeDashboardSection.hidden = false
    setHomeStatus('')

    connectSignal()
    clearInterval(telemetryTimer)
    telemetryTimer = setInterval(pollTelemetryAndAdapt, 1000)
    updateDeviceCountBadge()
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

function stopTransmission() {
  logger.info('Stopping broadcast...')
  stoppedByUser = true
  clearInterval(telemetryTimer)
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
  levelBar.style.width = '0%'
  setHomeStatus(t('statusEnded'))
}

// --- Event Listeners ---
startBroadcastBtn.addEventListener('click', startTransmission)
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
