import { initI18n, t, setLanguage } from './i18n.js'
import { getDeviceInfo } from './device-detector.js'
import { createLogger } from './logger.js'

const logger = createLogger('Listener')

// --- DOM Elements ---
const desktopNotice = document.querySelector('#desktopNotice')
const joinSection = document.querySelector('#joinSection')
const liveSection = document.querySelector('#liveSection')
const themeToggleBtn = document.querySelector('#themeToggleBtn')
const sunIcon = document.querySelector('#sunIcon')
const moonIcon = document.querySelector('#moonIcon')

const roomInput = document.querySelector('#roomInput')
const listenBtn = document.querySelector('#listenBtn')
const joinStatus = document.querySelector('#joinStatus')
const joinStatusText = document.querySelector('#joinStatusText')

const liveStatusText = document.querySelector('#liveStatusText')
const resumeBox = document.querySelector('#resumeBox')
const resumeBtn = document.querySelector('#resumeBtn')
const disconnectBtn = document.querySelector('#disconnectBtn')

const hudSignal = document.querySelector('#hudSignal')
const hudPing = document.querySelector('#hudPing')
const hudLoss = document.querySelector('#hudLoss')

const volSlider = document.querySelector('#volSlider')
const volValue = document.querySelector('#volValue')
const muteBtn = document.querySelector('#muteBtn')
const levelBar = document.querySelector('#levelBar')
const wakeLockToggle = document.querySelector('#wakeLockToggle')
const remoteAudio = document.querySelector('#remoteAudio')

// --- Persistent Tab-Scoped Listener Session ID ---
function getOrCreateSessionId() {
  try {
    let id = sessionStorage.getItem('wifora_listener_session_id')
    if (!id) {
      id = 'ls_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36)
      sessionStorage.setItem('wifora_listener_session_id', id)
    }
    return id
  } catch (err) {
    logger.debug('sessionStorage not available, using ephemeral session ID:', err)
    return 'ls_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36)
  }
}
const listenerSessionId = getOrCreateSessionId()

// --- State ---
const roomFromUrl = new URLSearchParams(location.search).get('room')?.toUpperCase() || ''
let roomId = roomFromUrl
let socket = null
let peer = null
let currentReceiver = null
let pendingCandidates = []
let shouldListen = false
let reconnectTimer = null
let telemetryTimer = null
let pingTimer = null
let wakeLockSentinel = null
let isMuted = false
let currentVol = 1

let lastPacketsReceived = null
let lastPacketsLost = null
let smoothedRtt = null
let smoothedJitter = null
let smoothedLoss = null
let displayedQuality = 'good'
let pendingQuality = null
let pendingQualitySamples = 0
let currentJitterBufferTarget = null

let audioContext = null
let analyserNode = null
let animFrameId = null

// Configure iOS AudioSession for Dedicated Media Playback (prevents low-volume / earpiece routing)
function setupAudioSession() {
  if ('audioSession' in navigator && navigator.audioSession) {
    try {
      navigator.audioSession.type = 'playback'
      logger.debug('iOS AudioSession set to playback')
    } catch (err) {
      logger.debug('navigator.audioSession set error:', err?.message || err)
    }
  }
}

// --- Theme Management ---
function initTheme() {
  try {
    const saved = localStorage.getItem('wifora_theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const theme = saved || (prefersDark ? 'dark' : 'light')
    setTheme(theme)
  } catch (err) {
    logger.debug('Error accessing localStorage for theme:', err)
    setTheme('dark')
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem('wifora_theme', theme)
  } catch (err) {
    logger.debug('Error setting theme in localStorage:', err)
  }
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

// --- Advisory Desktop Check (Non-blocking) ---
async function checkDesktopAdvisory() {
  try {
    const info = await getDeviceInfo()
    if (info.type === 'desktop') {
      desktopNotice.hidden = false
    } else {
      desktopNotice.hidden = true
    }
  } catch (err) {
    logger.debug('Device info check fallback:', err)
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
    desktopNotice.hidden = isMobileUA || isTouchDevice
  }
}

// --- Utilities ---
function validRoom(val) {
  return /^[A-Z0-9]{8}$/.test(val)
}

function setStatus(msg, type = '') {
  if (!msg) {
    joinStatus.hidden = true
    return
  }
  joinStatus.hidden = false
  joinStatus.dataset.type = type
  joinStatusText.textContent = msg
}

function updateListenButton() {
  const val = roomInput.value.trim().toUpperCase()
  listenBtn.disabled = !validRoom(val)
}

// --- Screen Wake Lock API ---
async function applyWakeLock() {
  if (!wakeLockToggle.checked) {
    releaseWakeLock()
    return
  }
  if ('wakeLock' in navigator && shouldListen && !wakeLockSentinel) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen')
      logger.debug('Screen WakeLock acquired')
      wakeLockSentinel.addEventListener('release', () => {
        logger.debug('Screen WakeLock released by OS')
        wakeLockSentinel = null
      })
    } catch (err) {
      logger.debug('WakeLock request failed or disallowed:', err?.message || err)
    }
  }
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release()
      logger.debug('Screen WakeLock released explicitly')
    } catch (err) {
      logger.debug('Error releasing wake lock:', err)
    }
    wakeLockSentinel = null
  }
}

wakeLockToggle.addEventListener('change', applyWakeLock)

// Sleep / Wake & Standby Recovery
function handleWakeRecovery() {
  if (shouldListen) {
    logger.info('Wake / visibility recovery triggered')
    setupAudioSession()
    applyWakeLock()
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        logger.debug('AudioContext resumed on wake recovery')
      }).catch((err) => {
        logger.warn('AudioContext resume failed on wake recovery:', err)
      })
    }
    if (remoteAudio.paused && remoteAudio.srcObject) {
      remoteAudio.play().then(() => {
        resumeBox.hidden = true
        liveStatusText.textContent = t('liveStatusConnected')
      }).catch((err) => {
        logger.debug('Autoplay policy requires tap on wake recovery:', err?.message || err)
        resumeBox.hidden = false
        liveStatusText.textContent = t('liveStatusWaitingTap')
      })
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      logger.info('Reconnecting signaling socket on wake recovery')
      connectSignal()
    }
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    handleWakeRecovery()
  }
})
window.addEventListener('focus', handleWakeRecovery)
window.addEventListener('pageshow', (event) => {
  logger.debug('pageshow event, persisted:', event.persisted)
  handleWakeRecovery()
})
window.addEventListener('online', () => {
  logger.info('Network back online, restoring stream...')
  handleWakeRecovery()
})
window.addEventListener('offline', () => {
  logger.warn('Device went offline')
  if (shouldListen) {
    liveStatusText.textContent = t('telemetryReconnecting')
  }
})

// --- Parallel Level Meter Visualization ---
function setupVisualizer(stream) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioCtx({ latencyHint: 0 })
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        logger.debug('Visualizer audioContext resume deferred:', err?.message || err)
      })
    }
    const source = audioContext.createMediaStreamSource(stream)
    analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 64
    analyserNode.smoothingTimeConstant = 0.5
    source.connect(analyserNode)

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
  } catch (err) {
    logger.debug('Visualizer setup not supported or disabled:', err)
  }
}

// --- Volume & Mute ---
function applyVolume() {
  const val = isMuted ? 0 : currentVol
  remoteAudio.volume = val
  remoteAudio.muted = isMuted
}

volSlider.addEventListener('input', (e) => {
  currentVol = Number(e.target.value) / 100
  volValue.textContent = `${e.target.value}%`
  applyVolume()
})

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted
  muteBtn.textContent = isMuted ? t('muteActiveBtn') : t('muteBtn')
  muteBtn.classList.toggle('btn-danger', isMuted)
  applyVolume()
})

// --- Diagnostic Telemetry & Dynamic Jitter Buffer Management ---
function resetReceiverTelemetry() {
  lastPacketsReceived = null
  lastPacketsLost = null
  smoothedRtt = null
  smoothedJitter = null
  smoothedLoss = null
  displayedQuality = 'good'
  pendingQuality = null
  pendingQualitySamples = 0
  currentJitterBufferTarget = null
}

function setJitterBufferTarget(target) {
  if (!currentReceiver || !('jitterBufferTarget' in currentReceiver)) return
  if (currentJitterBufferTarget === target) return
  try {
    currentReceiver.jitterBufferTarget = target
    currentJitterBufferTarget = target
    logger.debug(`Dynamic JitterBuffer target adjusted to ${target}ms`)
  } catch (err) {
    logger.debug('jitterBufferTarget property not writable:', err?.message || err)
  }
}

function updateSignalBadge(targetQuality, severe = false) {
  if (targetQuality !== displayedQuality) {
    if (severe) {
      pendingQualitySamples = 2
      pendingQuality = targetQuality
    } else if (pendingQuality === targetQuality) {
      pendingQualitySamples++
    } else {
      pendingQuality = targetQuality
      pendingQualitySamples = 1
    }

    if (pendingQualitySamples >= 2) {
      displayedQuality = targetQuality
      pendingQuality = null
      pendingQualitySamples = 0
    }
  } else {
    pendingQuality = null
    pendingQualitySamples = 0
  }

  if (!hudSignal) return
  if (displayedQuality === 'bad') {
    hudSignal.className = 'telemetry-badge badge-bad'
    hudSignal.textContent = t('wifiUnstable')
  } else if (displayedQuality === 'warn') {
    hudSignal.className = 'telemetry-badge badge-warn'
    hudSignal.textContent = t('wifiGood')
  } else {
    hudSignal.className = 'telemetry-badge badge-good'
    hudSignal.textContent = t('wifiExcellent')
  }
}

async function pollReceiverTelemetry() {
  if (!peer || peer.connectionState !== 'connected') return
  try {
    const stats = await peer.getStats()
    let rtt = null
    let jitter = null
    let packetsLost = 0
    let packetsReceived = 0

    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime != null) {
        rtt = Math.round(report.currentRoundTripTime * 1000)
      }
      if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
        if (report.packetsLost != null) packetsLost = report.packetsLost
        if (report.packetsReceived != null) packetsReceived = report.packetsReceived
        if (report.jitter != null) jitter = Math.round(report.jitter * 1000)
        if (report.roundTripTime != null && rtt == null) rtt = Math.round(report.roundTripTime * 1000)
      }
    })

    const dReceived = lastPacketsReceived != null ? Math.max(0, packetsReceived - lastPacketsReceived) : null
    const dLost = lastPacketsLost != null ? Math.max(0, packetsLost - lastPacketsLost) : null
    const dTotal = dReceived + dLost
    const instantLoss = dTotal > 0 ? (dLost / dTotal) * 100 : null

    lastPacketsReceived = packetsReceived
    lastPacketsLost = packetsLost

    const smooth = (previous, sample, weight = 0.3) => sample == null
      ? previous
      : previous == null ? sample : previous + (sample - previous) * weight
    smoothedRtt = smooth(smoothedRtt, rtt)
    smoothedJitter = smooth(smoothedJitter, jitter)
    smoothedLoss = smooth(smoothedLoss, instantLoss, 0.4)

    // Dynamic Receiver Jitter Buffer Target Adjustment
    if (smoothedJitter != null && (smoothedJitter > 15 || (smoothedLoss ?? 0) > 2.0)) {
      setJitterBufferTarget(50)
    } else if (smoothedJitter != null && (smoothedJitter > 8 || (smoothedLoss ?? 0) > 0.7)) {
      setJitterBufferTarget(35)
    } else {
      setJitterBufferTarget(22)
    }

    if (hudPing) hudPing.textContent = smoothedRtt != null ? `${Math.round(smoothedRtt)} ms` : t('liveBadge')
    if (hudLoss) hudLoss.textContent = `${(smoothedLoss ?? 0).toFixed(1)}%`

    const severe = (rtt != null && rtt > 220) || (instantLoss != null && instantLoss > 10)
    const quality = severe || (smoothedRtt != null && (smoothedRtt > 120 || (smoothedLoss ?? 0) > 3.0))
      ? 'bad'
      : smoothedRtt != null && (smoothedRtt > 70 || (smoothedLoss ?? 0) > 1.2)
        ? 'warn'
        : 'good'
    updateSignalBadge(quality, severe)
  } catch (err) {
    logger.debug('Error polling receiver stats:', err?.message || err)
  }
}

// --- Signaling & WebRTC ---
function signal(msg) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
}

async function connectSignal() {
  if (!shouldListen) return
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${location.host}/signal`)
  socket = ws

  let deviceInfo = { name: 'Smartphone', type: 'phone' }
  try {
    deviceInfo = await getDeviceInfo()
  } catch (err) {
    logger.debug('Device info lookup fallback:', err)
  }

  ws.addEventListener('open', () => {
    logger.info(`Signaling opened, registering listener in room [${roomId}] (session: ${listenerSessionId})`)
    signal({
      type: 'register',
      role: 'listener',
      roomId,
      deviceName: deviceInfo.name,
      deviceType: deviceInfo.type,
      sessionId: listenerSessionId,
    })

    clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) signal({ type: 'ping' })
    }, 6000)
  })

  ws.addEventListener('message', async ({ data }) => {
    let msg
    try {
      msg = JSON.parse(data)
    } catch (err) {
      logger.warn('Malformed JSON received from signaling server:', err)
      return
    }

    if (msg.type === 'pong') return

    if (msg.type === 'registered') {
      logger.info(`Registered successfully: clientId=${msg.clientId}, hostAvailable=${msg.hostAvailable}`)
      liveStatusText.textContent = msg.hostAvailable ? t('liveStatusConnected') : t('liveStatusWaitingHost')
    }

    if (msg.type === 'kicked') {
      logger.warn('Kicked by host')
      stopListening(t('toastKickedByHost'), true)
      return
    }

    if (msg.type === 'room-ended' || msg.type === 'host-left') {
      logger.info('Room broadcast ended by host')
      stopListening(t('toastRoomEnded'), true)
      return
    }

    if (msg.type === 'offer') {
      logger.info('WebRTC offer received from host')
      await acceptOffer(msg)
    }

    if (msg.type === 'candidate') {
      if (peer?.remoteDescription) {
        try {
          await peer.addIceCandidate(msg.candidate)
        } catch (err) {
          logger.debug('Ignored ICE candidate addition error:', err?.message || err)
        }
      } else {
        pendingCandidates.push(msg.candidate)
      }
    }

    if (msg.type === 'error') {
      logger.error('Signaling error received:', msg.message)
      stopListening(msg.message, true)
    }
  })

  ws.addEventListener('close', (event) => {
    clearInterval(pingTimer)
    logger.info(`Signaling closed (code: ${event.code}, reason: ${event.reason})`)
    if (event.code === 4000 || event.reason === 'Kicked by host') {
      stopListening(t('toastKickedByHost'), true)
      return
    }
    // If WebRTC is still active and connected, attempt graceful signaling reconnection in background
    if (shouldListen) {
      if (peer && peer.connectionState === 'connected') {
        logger.info('WebRTC media peer is still live, reconnecting signaling in 2s...')
        setTimeout(connectSignal, 2000)
      } else {
        stopListening(t('toastRoomEnded'), true)
      }
    }
  })
}

async function acceptOffer(msg) {
  if (peer && peer.connectionState === 'connected') {
    logger.debug('Reusing connected WebRTC peer for renegotiation')
  } else if (peer) {
    peer.onconnectionstatechange = null
    peer.oniceconnectionstatechange = null
    peer.ontrack = null
    try {
      peer.close()
    } catch (err) {
      logger.debug('Error closing previous peer:', err)
    }
    peer = null
  }
  pendingCandidates = []

  setupAudioSession()

  if (!peer) {
    logger.info('Creating new RTCPeerConnection for listener')
    peer = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' })

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) signal({ type: 'candidate', target: msg.clientId, candidate })
    }

    peer.ontrack = (event) => {
      logger.info('WebRTC media track received')
      const stream = event.streams[0] || new MediaStream([event.track])
      remoteAudio.srcObject = stream
      remoteAudio.volume = isMuted ? 0 : currentVol
      remoteAudio.muted = isMuted

      currentReceiver = event.receiver
      setJitterBufferTarget(22)

      event.track.onended = () => {
        logger.info('Remote audio track ended')
        stopListening(t('toastRoomEnded'), true)
      }

      setupVisualizer(stream)

      const playPromise = remoteAudio.play()
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            logger.info('Audio playback started smoothly')
            resumeBox.hidden = true
            liveStatusText.textContent = t('liveStatusConnected')
          })
          .catch((err) => {
            logger.info('Autoplay requires user touch interaction:', err?.message || err)
            resumeBox.hidden = false
            liveStatusText.textContent = t('liveStatusWaitingTap')
          })
      }
    }

    const handlePeerDisconnect = () => {
      const connState = peer?.connectionState
      const iceState = peer?.iceConnectionState
      logger.debug(`Peer connection state: ${connState}, ICE: ${iceState}`)
      if (['failed', 'closed'].includes(connState) || ['failed', 'closed'].includes(iceState)) {
        logger.warn('WebRTC peer connection failed or closed')
        stopListening(t('toastRoomEnded'), true)
      } else if (connState === 'connected' && (iceState === 'connected' || iceState === 'completed')) {
        liveStatusText.textContent = t('liveStatusConnected')
      }
    }

    peer.onconnectionstatechange = handlePeerDisconnect
    peer.oniceconnectionstatechange = handlePeerDisconnect
  }

  try {
    await peer.setRemoteDescription(msg.sdp)
    logger.debug('Remote SDP description set')
  } catch (err) {
    logger.error('Failed to setRemoteDescription:', err)
    stopListening(t('toastRoomEnded'), true)
    return
  }

  for (const c of pendingCandidates) {
    try {
      await peer.addIceCandidate(c)
    } catch (err) {
      logger.debug('Error adding pending candidate:', err?.message || err)
    }
  }
  pendingCandidates = []

  try {
    const answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)
    signal({ type: 'answer', target: msg.clientId, sdp: peer.localDescription })
    logger.debug('Local SDP answer sent to host')
  } catch (err) {
    logger.error('Failed to create or send SDP answer:', err)
    stopListening(t('toastRoomEnded'), true)
  }
}

// --- Lifecycle Actions ---
function startListening() {
  roomId = roomInput.value.trim().toUpperCase()
  if (!validRoom(roomId)) {
    setStatus(t('joinSubtitle'), 'error')
    return
  }

  logger.info(`Starting listener for room [${roomId}]`)
  shouldListen = true
  listenBtn.disabled = true

  joinSection.hidden = true
  liveSection.hidden = false
  liveStatusText.textContent = t('liveStatusConnecting')

  setupAudioSession()
  applyWakeLock()
  connectSignal()

  resetReceiverTelemetry()

  clearInterval(telemetryTimer)
  telemetryTimer = setInterval(pollReceiverTelemetry, 1000)
}

function stopListening(message = '', showForm = false) {
  logger.info('Stopping listener...', { message, showForm })
  if (shouldListen) {
    try {
      if (socket?.readyState === WebSocket.OPEN) {
        signal({ type: 'leave', roomId, sessionId: listenerSessionId })
      }
    } catch (err) {
      logger.debug('Error sending leave signal:', err)
    }
    try {
      navigator.sendBeacon?.('/api/leave', JSON.stringify({ roomId, sessionId: listenerSessionId }))
    } catch (err) {
      logger.debug('Error sending leave beacon:', err)
    }
  }

  shouldListen = false
  clearTimeout(reconnectTimer)
  clearInterval(telemetryTimer)
  clearInterval(pingTimer)
  cancelAnimationFrame(animFrameId)
  releaseWakeLock()

  currentReceiver = null
  resetReceiverTelemetry()

  if (audioContext) {
    try {
      audioContext.close()
    } catch (err) {
      logger.debug('Error closing audioContext:', err)
    }
    audioContext = null
  }
  analyserNode = null

  if (peer) {
    peer.onconnectionstatechange = null
    peer.oniceconnectionstatechange = null
    peer.onicecandidate = null
    peer.ontrack = null
    try {
      peer.close()
    } catch (err) {
      logger.debug('Error closing peer:', err)
    }
    peer = null
  }
  if (socket) {
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    try {
      socket.close()
    } catch (err) {
      logger.debug('Error closing socket:', err)
    }
    socket = null
  }

  try {
    remoteAudio.pause()
    remoteAudio.srcObject = null
  } catch (err) {
    logger.debug('Error pausing remote audio:', err)
  }
  resumeBox.hidden = true

  if (levelBar) levelBar.style.width = '0%'

  if (showForm) {
    liveSection.hidden = true
    joinSection.hidden = false
    listenBtn.disabled = false
    setStatus(message || t('toastRoomEnded'), 'error')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

// --- Event Listeners ---
checkDesktopAdvisory()
roomInput.value = roomFromUrl
updateListenButton()

roomInput.addEventListener('input', () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  updateListenButton()
})

listenBtn.addEventListener('click', () => {
  setupAudioSession()
  startListening()
})

resumeBtn.addEventListener('click', () => {
  setupAudioSession()
  remoteAudio.play().then(() => {
    resumeBox.hidden = true
    liveStatusText.textContent = t('liveStatusConnected')
  }).catch((err) => {
    logger.warn('Resume play failed on user click:', err)
  })
})

disconnectBtn.addEventListener('click', () => {
  stopListening(t('toastRoomEnded'), true)
})

function handlePageExit() {
  if (shouldListen) {
    try {
      if (socket?.readyState === WebSocket.OPEN) {
        signal({ type: 'leave', roomId, sessionId: listenerSessionId })
      }
    } catch (err) {
      logger.debug('PageExit signal error:', err)
    }
    try {
      navigator.sendBeacon?.('/api/leave', JSON.stringify({ roomId, sessionId: listenerSessionId }))
    } catch (err) {
      logger.debug('PageExit beacon error:', err)
    }
  }
}

window.addEventListener('pagehide', handlePageExit)
window.addEventListener('beforeunload', handlePageExit)

// Initialize
initTheme()
initI18n()
