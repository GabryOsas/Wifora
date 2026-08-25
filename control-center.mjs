import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { DEFAULT_PORT } from './src/shared/constants.mjs'
import { loadRuntimeConfig, saveRuntimeConfig } from './src/shared/runtime-config.mjs'
import { getLanAddresses } from './src/server/network.mjs'
import {
  checkPortFree,
  killPortProcess,
  killMarkedProcesses,
  stopManagedChild,
  openInBrowser,
} from './src/server/process-utils.mjs'

const ROOT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const PUBLIC_DIR = join(ROOT_DIR, 'public')
const CONTROL_PORT = Number(process.env.WIFORA_CONTROL_PORT) > 0 ? Number(process.env.WIFORA_CONTROL_PORT) : 3976

// Same filtering rules as src/server/network.mjs but keeps adapter names.
function getDetailedAdapters() {
  const preferred = []
  const fallback = []
  const virtualAdapter =
    /(cloudflare|warp|vpn|virtual|loopback|tunnel|tap|wintun|tailscale|zerotier|docker|hyper-v|vmware|vbox)/i
  for (const [name, interfaces] of Object.entries(networkInterfaces())) {
    if (virtualAdapter.test(name)) continue
    for (const item of interfaces || []) {
      if (item.family !== 'IPv4' || item.internal || item.address.startsWith('169.254.')) continue
      const isPrivateLan = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address)
      ;(isPrivateLan ? preferred : fallback).push({ name, ip: item.address })
    }
  }
  return [...preferred, ...fallback]
}

// ---------------------------------------------------------------------------
// Managed streaming server lifecycle
// ---------------------------------------------------------------------------
const LOG_BUFFER_LIMIT = 400
const logBuffer = []

function pushLogLine(stream, text) {
  for (const rawLine of String(text).split(/\r?\n/)) {
    if (!rawLine.trim()) continue
    logBuffer.push({ stream, line: rawLine })
    if (logBuffer.length > LOG_BUFFER_LIMIT) logBuffer.shift()
  }
}

function createServerManager({ config }) {
  let child = null
  let startedAt = null

  function isRunning() {
    return Boolean(child && child.exitCode === null && child.signalCode === null)
  }

  async function fetchStats(timeoutMs = 1200) {
    try {
      const res = await fetch(`http://127.0.0.1:${config.port}/api/stats`, {
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  function start() {
    if (isRunning()) return Promise.resolve({ ok: false, error: 'already-running' })
    child = spawn(process.execPath, ['server.mjs', '--wifora-managed'], {
      cwd: ROOT_DIR,
      env: { ...process.env, PORT: String(config.port) },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    startedAt = Date.now()
    child.stdout.on('data', (d) => pushLogLine('out', d))
    let stderrTail = ''
    child.stderr.on('data', (d) => {
      pushLogLine('err', d)
      stderrTail = (stderrTail + d.toString()).slice(-4000)
    })
    child.once('exit', () => {
      startedAt = null
      logBuffer.push({ stream: 'sys', line: '[Wifora Console] Server process exited.' })
    })

    // Wait until the HTTP surface of the managed server answers.
    const deadline = Date.now() + 6000
    return new Promise((resolvePromise) => {
      const tick = async () => {
        if (!isRunning()) {
          resolvePromise({ ok: false, error: 'exited', details: stderrTail.slice(-500) })
          return
        }
        if (await fetchStats(800)) {
          resolvePromise({ ok: true })
          return
        }
        if (Date.now() > deadline) {
          resolvePromise({ ok: false, error: 'timeout' })
          return
        }
        setTimeout(tick, 250)
      }
      setTimeout(tick, 300)
    })
  }

  async function stop() {
    const wasRunning = isRunning()
    await stopManagedChild(child)
    child = null
    startedAt = null
    await killMarkedProcesses(['wifora-managed'])
    await killPortProcess(config.port)
    await new Promise((r) => setTimeout(r, 250))
    const freed = await checkPortFree(config.port)
    if (!freed) {
      await killMarkedProcesses(['wifora-managed'])
      await killPortProcess(config.port)
      await new Promise((r) => setTimeout(r, 500))
    }
    return { ok: true, wasRunning, portFree: await checkPortFree(config.port) }
  }

  return {
    isRunning,
    get pid() {
      return child?.pid ?? null
    },
    get uptimeSec() {
      return startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0
    },
    start,
    stop,
    restart: async () => {
      await stop()
      return start()
    },
    fetchStats,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(response, code, payload) {
  response.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
  })
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request, limit = 4096) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > limit) throw new Error('body too large')
  }
  return body ? JSON.parse(body) : {}
}

/** Mutating endpoints are restricted to same-origin requests on loopback. */
function sameOriginGuard(request) {
  const origin = request.headers.origin
  if (!origin) return true // direct tools / curl from localhost
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

const STATIC_FILES = new Map([
  ['/', ['control.html', 'text/html; charset=utf-8']],
  ['/index.html', ['control.html', 'text/html; charset=utf-8']],
  ['/control.js', ['control.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/i18n.js', ['i18n.js', 'text/javascript; charset=utf-8']],
  ['/logger.js', ['logger.js', 'text/javascript; charset=utf-8']],
  ['/wifora-logo.png', ['wifora-logo.png', 'image/png']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
])

// ---------------------------------------------------------------------------
// Control Center server
// ---------------------------------------------------------------------------
export function createControlCenter(options = {}) {
  const config = options.config || { port: DEFAULT_PORT }
  const manager = options.manager || createServerManager({ config })

  return createHttpServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    const path = url.pathname

    try {
      // ---- status ----
      if (path === '/api/status') {
        // "reachable" reflects what is ACTUALLY serving on the port, even if
        // the process was started outside this console (e.g. by an older CLI).
        const stats = await manager.fetchStats()
        const ownChild = manager.isRunning()
        const reachable = Boolean(stats)
        return json(response, 200, {
          running: ownChild || reachable,
          owner: ownChild ? 'console' : reachable ? 'external' : 'none',
          pid: manager.pid,
          uptimeSec: manager.uptimeSec,
          configuredPort: config.port,
          reachable,
          totalListeners: stats?.totalListeners ?? 0,
          rooms: stats?.rooms ?? [],
          lanAddresses: getLanAddresses(),
          adapters: getDetailedAdapters(),
          controlPort: CONTROL_PORT,
        })
      }

      // ---- server logs (ring buffer, incremental cursor) ----
      if (path === '/api/logs') {
        const since = Math.max(0, Number(url.searchParams.get('since')) || 0)
        const total = logBuffer.length
        const lines = since >= total ? [] : logBuffer.slice(since).map((entry) => entry.line)
        return json(response, 200, { cursor: total, lines })
      }

      // ---- lifecycle ----
      if (path === '/api/server/start' && request.method === 'POST') {
        if (!sameOriginGuard(request)) return json(response, 403, { error: 'cross-origin forbidden' })
        if (manager.isRunning()) return json(response, 409, { error: 'already-running' })
        const free = await checkPortFree(config.port)
        let tookOver = false
        if (!free) {
          // Take over: a server on our port that we do not own (external or
          // orphaned) must go before ours can bind.
          await killMarkedProcesses(['wifora-managed'])
          await killPortProcess(config.port)
          await new Promise((r) => setTimeout(r, 400))
          tookOver = true
        }
        const result = await manager.start()
        return json(response, result.ok ? 200 : 500, { ...result, tookOver })
      }

      if (path === '/api/server/stop' && request.method === 'POST') {
        if (!sameOriginGuard(request)) return json(response, 403, { error: 'cross-origin forbidden' })
        return json(response, 200, await manager.stop())
      }

      if (path === '/api/server/restart' && request.method === 'POST') {
        if (!sameOriginGuard(request)) return json(response, 403, { error: 'cross-origin forbidden' })
        await manager.stop()
        const result = await manager.start()
        return json(response, result.ok ? 200 : 500, result)
      }

      // ---- port configuration ----
      if (path === '/api/port' && request.method === 'POST') {
        if (!sameOriginGuard(request)) return json(response, 403, { error: 'cross-origin forbidden' })
        const body = await readJsonBody(request)
        const port = Number(body?.port)
        if (!Number.isInteger(port) || port < 1024 || port > 65535) {
          return json(response, 400, { error: 'invalid-port' })
        }
        const previous = config.port
        config.port = port
        await saveRuntimeConfig(config)
        // Restart when the server is running no matter who owns it: the new
        // port must take effect immediately for every front-end.
        const reachable = Boolean(await manager.fetchStats(800))
        const shouldRestart = body.restart !== false && (manager.isRunning() || reachable)
        let restartResult = null
        if (shouldRestart && port !== previous) {
          await manager.stop()
          restartResult = await manager.start()
        }
        return json(response, 200, { ok: true, port: config.port, restarted: shouldRestart, restartResult })
      }

      if (path === '/api/port/free' && request.method === 'POST') {
        if (!sameOriginGuard(request)) return json(response, 403, { error: 'cross-origin forbidden' })
        if (manager.isRunning()) await manager.stop()
        await killMarkedProcesses(['wifora-managed'])
        await killPortProcess(config.port)
        await new Promise((r) => setTimeout(r, 300))
        return json(response, 200, { portFree: await checkPortFree(config.port), port: config.port })
      }

      // ---- QR ----
      if (path === '/qr') {
        const text = url.searchParams.get('text')
        if (!text || text.length > 2048) {
          response.writeHead(400)
          return response.end('Invalid QR text')
        }
        try {
          const image = await QRCode.toBuffer(text, { type: 'png', width: 420, margin: 1, errorCorrectionLevel: 'M' })
          response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store, private' })
          return response.end(image)
        } catch {
          response.writeHead(400)
          return response.end('QR generation failed')
        }
      }

      // ---- static whitelist ----
      const entry = STATIC_FILES.get(path)
      if (entry) {
        const [fileName, contentType] = entry
        try {
          const file = await readFile(join(PUBLIC_DIR, fileName))
          const cacheControl = fileName.endsWith('.html') ? 'no-cache, must-revalidate' : 'public, max-age=60'
          response.writeHead(200, { 'content-type': contentType, 'cache-control': cacheControl })
          return response.end(file)
        } catch {}
      }

      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    } catch (err) {
      if (!response.headersSent) json(response, 500, { error: err?.message || 'internal error' })
      else response.end()
    }
  })
}

// Standalone execution
const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectExecution) {
  const config = await loadRuntimeConfig()
  const manager = createServerManager({ config })
  const app = createControlCenter({ config, manager })

  await new Promise((resolvePromise, rejectPromise) => {
    app.once('error', rejectPromise)
    app.listen(CONTROL_PORT, '127.0.0.1', resolvePromise)
  }).catch((err) => {
    console.error(`[Wifora Console] Port ${CONTROL_PORT} unavailable (${err?.code || err?.message}).`)
    process.exit(1)
  })

  console.log(`[Wifora Console] Control Center ready at http://localhost:${CONTROL_PORT}`)
  console.log('[Wifora Console] Loopback only - it is not reachable from other devices.')

  if (process.argv.includes('--open')) openInBrowser(`http://localhost:${CONTROL_PORT}`)

  const shutdown = async () => {
    await manager.stop().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
