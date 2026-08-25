import { applyTranslations, initI18n, t } from './i18n.js'

// --- Theme (same behavior as host/listen pages) ---
function initTheme() {
  const saved = localStorage.getItem('wifora_theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'))
  syncThemeIcons()
}

function syncThemeIcons() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  document.getElementById('sunIcon').hidden = isDark
  document.getElementById('moonIcon').hidden = !isDark
}

document.getElementById('themeToggleBtn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem('wifora_theme', next)
  syncThemeIcons()
})

// --- Elements ---
const els = {
  statusPill: document.getElementById('statusPill'),
  statusBanner: document.getElementById('statusBanner'),
  statusBannerText: document.getElementById('statusBannerText'),
  metricPort: document.getElementById('metricPort'),
  metricUptime: document.getElementById('metricUptime'),
  metricListeners: document.getElementById('metricListeners'),
  deviceList: document.getElementById('deviceList'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  restartBtn: document.getElementById('restartBtn'),
  openHostLink: document.getElementById('openHostLink'),
  qrImage: document.getElementById('qrImage'),
  listenUrl: document.getElementById('listenUrl'),
  copyUrlBtn: document.getElementById('copyUrlBtn'),
  portInput: document.getElementById('portInput'),
  savePortBtn: document.getElementById('savePortBtn'),
  freePortBtn: document.getElementById('freePortBtn'),
  networkList: document.getElementById('networkList'),
}

let busy = false

// If the QR endpoint fails, show a placeholder instead of a broken image.
document.getElementById('qrImage').addEventListener('error', () => {
  els.qrImage.removeAttribute('src')
  els.qrImage.alt = t('controlNoNetwork')
})

function showBanner(message, type = 'info') {
  if (!message) {
    els.statusBanner.hidden = true
    return
  }
  els.statusBanner.hidden = false
  els.statusBanner.dataset.type = type
  els.statusBannerText.textContent = message
}

function formatUptime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

function renderStatus(status) {
  const running = Boolean(status.running)

  els.statusPill.textContent = running ? t('controlStatusRunning') : t('controlStatusStopped')
  els.statusPill.classList.toggle('status-connected', running)
  els.statusPill.classList.toggle('status-disconnected', !running)

  els.metricPort.textContent = status.configuredPort ?? '—'
  els.metricUptime.textContent = running ? formatUptime(status.uptimeSec) : '—'
  els.metricListeners.textContent = String(status.totalListeners ?? 0)

  els.startBtn.disabled = busy || running
  els.stopBtn.disabled = busy || !running
  els.restartBtn.disabled = busy || !running
  els.openHostLink.hidden = !running
  if (running) {
    els.openHostLink.href = `http://${location.hostname}:${status.configuredPort}/host.html`
  }

  // Connected device names (from the managed server's loopback stats)
  const deviceNames = (status.rooms || []).flatMap((room) => room.listenerNames || [])
  els.deviceList.hidden = deviceNames.length === 0
  els.deviceList.innerHTML = deviceNames.map((name) => `<li>🎧 ${escapeHtml(name)}</li>`).join('')

  // Phone link + QR from the first recommended LAN address.
  // lanAddresses is a plain array of IP strings; adapters carries the names.
  const ips = Array.isArray(status.lanAddresses) ? status.lanAddresses : []
  const adapters = Array.isArray(status.adapters) ? status.adapters : []
  const primaryIp = ips[0]
  if (primaryIp) {
    const url = `http://${primaryIp}:${status.configuredPort}/listen.html`
    if (els.listenUrl.value !== url) {
      els.listenUrl.value = url
      els.qrImage.alt = t('controlQrTitle')
      els.qrImage.src = `/qr?text=${encodeURIComponent(url)}&v=${Date.now()}`
    }
    renderNetwork(adapters.length ? adapters : ips.map((ip) => ({ name: 'LAN', ip })), status.configuredPort)
  } else {
    els.listenUrl.value = ''
    els.qrImage.removeAttribute('src')
    els.networkList.innerHTML = `<span class="empty-state">${t('controlNoNetwork')}</span>`
  }
}

function renderNetwork(adapters, port) {
  els.networkList.innerHTML = adapters
    .map(
      (item, idx) =>
        `<div class="control-network-item"><strong>${escapeHtml(item.name)}</strong>` +
        `<span>${escapeHtml(item.ip)}${idx === 0 ? ` — ${t('controlRecommended')}` : ''}</span>` +
        `<code>http://${escapeHtml(item.ip)}:${port}/listen.html</code></div>`
    )
    .join('')
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  )
}

async function refresh() {
  try {
    const res = await fetch('/api/status')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    renderStatus(await res.json())
  } catch {
    showBanner(t('controlConsoleOffline'), 'error')
  }
}

async function post(path, body = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && data?.error) throw new Error(data.error)
  return data
}

async function withBusy(action, startingMessage, doneMessageKey) {
  if (busy) return
  busy = true
  showBanner(startingMessage)
  try {
    const result = await action()
    showBanner(doneMessageKey ? t(doneMessageKey) : '', 'success')
    return result
  } catch (err) {
    showBanner(`${t('controlErrorGeneric')} (${err.message})`, 'error')
  } finally {
    busy = false
    await refresh()
  }
}

els.startBtn.addEventListener('click', () => withBusy(() => post('/api/server/start'), t('controlServerStarting')))
els.stopBtn.addEventListener('click', () =>
  withBusy(() => post('/api/server/stop'), t('controlServerStopping'), 'controlServerStopped')
)
els.restartBtn.addEventListener('click', () =>
  withBusy(() => post('/api/server/restart'), t('controlServerRestarting'), 'controlServerStarted')
)

els.savePortBtn.addEventListener('click', () => {
  const port = parseInt(els.portInput.value, 10)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    showBanner(t('controlInvalidPort'), 'error')
    return
  }
  withBusy(() => post('/api/port', { port }), t('controlSavingPort'), 'controlPortSaved')
})

els.freePortBtn.addEventListener('click', () =>
  withBusy(() => post('/api/port/free'), t('controlFreeingPort'), 'controlFreePortDone')
)

const COPY_LABEL_KEY = 'copyBtn'
let copyLabelTimer = null

els.copyUrlBtn.addEventListener('click', async () => {
  if (!els.listenUrl.value) return
  try {
    await navigator.clipboard.writeText(els.listenUrl.value)
  } catch {
    // Fallback for browsers where the async clipboard is unavailable
    const temp = document.createElement('textarea')
    temp.value = els.listenUrl.value
    document.body.appendChild(temp)
    temp.select()
    try {
      document.execCommand('copy')
    } catch {
      showBanner(t('toastManualCopy'), 'error')
    }
    temp.remove()
  }
  els.copyUrlBtn.textContent = t('toastCopied')
  clearTimeout(copyLabelTimer)
  copyLabelTimer = setTimeout(() => {
    els.copyUrlBtn.textContent = t(COPY_LABEL_KEY)
  }, 1600)
})

initTheme()
initI18n()
els.portInput.value = ''
refresh()
setInterval(refresh, 2000)
applyTranslations()
