import { networkInterfaces } from 'node:os'
import readline from 'node:readline'
import {
  checkPortFree,
  killPortProcess,
  killMarkedProcesses,
  spawnManagedServer,
  stopManagedChild,
  openInBrowser as openBrowser,
} from './src/server/process-utils.mjs'
import { loadRuntimeConfig, saveRuntimeConfig } from './src/shared/runtime-config.mjs'

const CONTROL_PORT = Number(process.env.WIFORA_CONTROL_PORT) > 0 ? Number(process.env.WIFORA_CONTROL_PORT) : 3976
const DAEMON_URL = `http://127.0.0.1:${CONTROL_PORT}`
let currentPort = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3975
let activeServerProcess = null // only used in direct-manage fallback mode
let serverRunning = false

// ANSI Color Codes & Styles
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
}

function gradientText(text, start = [34, 211, 238], end = [37, 99, 235]) {
  const chars = Array.from(text)
  const lastIndex = Math.max(chars.length - 1, 1)

  return (
    chars
      .map((char, index) => {
        if (char === ' ') return char
        const ratio = index / lastIndex
        const color = start.map((value, channel) => Math.round(value + (end[channel] - value) * ratio))
        return `\x1b[38;2;${color.join(';')}m${char}`
      })
      .join('') + c.reset
  )
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H')
}

function getLanAddresses() {
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

function printBanner() {
  const banner = [
    '   ██╗    ██╗██╗███████╗ ██████╗ ██████╗  █████╗ ',
    '   ██║    ██║██║██╔════╝██╔═══██╗██╔══██╗██╔══██╗',
    '   ██║ █╗ ██║██║█████╗  ██║   ██║██████╔╝███████║',
    '   ██║███╗██║██║██╔══╝  ██║   ██║██╔══██╗██╔══██║',
    '   ╚███╔███╔╝██║██║     ╚██████╔╝██║  ██║██║  ██║',
    '    ╚══╝╚══╝ ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝',
  ]

  console.log(c.bold)
  banner.forEach((line) => console.log(gradientText(line)))
  console.log(`${c.reset}${c.dim}      PC Audio Streamer for iPhone & Mobile${c.reset}\n`)
}

// ---------------------------------------------------------------------------
// Daemon client: the Web Control Center is the SINGLE owner of the streaming
// server. The CLI never spawns it directly anymore, so starting/stopping from
// the terminal or from the browser always acts on the same process.
// ---------------------------------------------------------------------------
async function daemonUp() {
  try {
    const res = await fetch(`${DAEMON_URL}/api/status`, { signal: AbortSignal.timeout(700) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureDaemon() {
  if (await daemonUp()) return true
  console.log(`${c.dim}Starting the Wifora service manager...${c.reset}`)
  try {
    const { spawn } = await import('node:child_process')
    const child = spawn(process.execPath, ['control-center.mjs', '--wifora-control'], {
      env: { ...process.env, WIFORA_CONTROL_PORT: String(CONTROL_PORT) },
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    })
    child.unref()
  } catch {}
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 250))
    if (await daemonUp()) return true
  }
  return false
}

async function apiGet(path) {
  const res = await fetch(`${DAEMON_URL}${path}`, { signal: AbortSignal.timeout(1500) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function apiPost(path, body = {}) {
  const res = await fetch(`${DAEMON_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

/** Refreshes the shared "serverRunning" state from the daemon's view. */
async function refreshRunningState() {
  if (!(await daemonUp())) return
  try {
    const status = await apiGet('/api/status')
    serverRunning = Boolean(status.running)
    if (Number(status.configuredPort) > 0 && status.configuredPort !== currentPort && !process.env.PORT) {
      currentPort = Number(status.configuredPort)
    }
  } catch {}
}

// Interactive Arrow-Key Menu
async function showMenu() {
  const menuItems = [
    {
      id: 'start',
      label: serverRunning ? `Restart Wifora Server (running on port ${currentPort})` : 'Start Wifora Server',
      icon: '▶',
    },
    { id: 'console', label: 'Open Web Control Center (browser)', icon: '🖥' },
    { id: 'port', label: `Change Port (Current: ${currentPort})`, icon: '⚙' },
    { id: 'net', label: 'View Network Adapters & IP Addresses', icon: '📶' },
    { id: 'kill', label: `Stop Server & Free Port ${currentPort}`, icon: '🛑' },
    { id: 'exit', label: serverRunning ? 'Exit Program (stops the server)' : 'Exit Program', icon: '✖' },
  ]

  let selectedIndex = 0

  return new Promise((resolve) => {
    function render() {
      clearScreen()
      printBanner()
      console.log(`${c.bold}Select an option with the arrow keys [↑ / ↓] and press [Enter]:${c.reset}\n`)

      menuItems.forEach((item, index) => {
        const isSelected = index === selectedIndex
        if (isSelected) {
          console.log(`  ${c.brightCyan}${c.bold}❯ ${item.icon}  ${item.label}${c.reset}`)
        } else {
          console.log(`    ${c.dim}${item.icon}  ${item.label}${c.reset}`)
        }
      })

      console.log(`\n${c.dim}───────────────────────────────────────────────────${c.reset}`)
      const status = serverRunning ? `${c.brightGreen}● RUNNING on port ${currentPort}${c.dim}` : `${c.dim}○ STOPPED`
      console.log(
        `${c.dim}Server status: ${status} | Port: ${c.brightCyan}${currentPort}${c.dim} | Press [Q] to quit${c.reset}`
      )
    }

    render()

    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    function onKeypress(str, key) {
      if (!key) return

      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + menuItems.length) % menuItems.length
        render()
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % menuItems.length
        render()
      } else if (key.name === 'return') {
        cleanup()
        resolve(menuItems[selectedIndex].id)
      } else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        cleanup()
        resolve('exit')
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
    }

    process.stdin.on('keypress', onKeypress)
  })
}

// Change Port Prompt
async function promptChangePort() {
  clearScreen()
  printBanner()
  console.log(`${c.bold}${c.brightCyan}SERVER PORT CONFIGURATION${c.reset}\n`)
  console.log(`Current port: ${c.bold}${currentPort}${c.reset}`)
  console.log(`Enter the new port number (e.g. 3975, 8080, 5000):`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`\nNew port [${currentPort}]: `, async (input) => {
      rl.close()
      const parsed = parseInt(input.trim(), 10)
      if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
        currentPort = parsed
        // Persist so the Web Control Center uses the same port.
        await saveRuntimeConfig({ port: currentPort })
        // If a server is running, move it to the new port through the daemon.
        if (serverRunning && (await daemonUp())) {
          await apiPost('/api/port', { port: currentPort })
        }
        console.log(`\n${c.brightGreen}✔ Port updated to ${currentPort}!${c.reset}`)
      } else if (input.trim() !== '') {
        console.log(`\n${c.red}✖ Invalid value. Keeping ${currentPort}.${c.reset}`)
      }
      setTimeout(resolve, 1200)
    })
  })
}

// Display Network Interfaces Info
async function showNetworkInfo() {
  clearScreen()
  printBanner()
  console.log(`${c.bold}${c.brightCyan}DETECTED NETWORK ADAPTERS & IP ADDRESSES${c.reset}\n`)

  const addrs = getLanAddresses()
  if (addrs.length === 0) {
    console.log(`${c.yellow}⚠ No local IPv4 address detected. Connect the PC to Wi-Fi or Ethernet.${c.reset}`)
  } else {
    console.log(`Found ${c.bold}${addrs.length}${c.reset} network interface(s):\n`)
    addrs.forEach((item, idx) => {
      const isPrimary = idx === 0 ? ` ${c.brightGreen}[Recommended for iPhone]${c.reset}` : ''
      console.log(`  ${c.brightCyan}● ${item.name}${c.reset}: ${c.bold}${item.ip}${c.reset}${isPrimary}`)
      console.log(`    ${c.dim}Mobile link: http://${item.ip}:${currentPort}/listen.html${c.reset}\n`)
    })
  }

  console.log(`\n${c.dim}Press any key to return to the main menu...${c.reset}`)
  return new Promise((resolve) => {
    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    process.stdin.once('data', () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      resolve()
    })
  })
}

// Stop Server & Free Port Action
async function handleKillPort() {
  clearScreen()
  printBanner()
  console.log(`${c.bold}${c.yellow}STOP SERVER & FREE PORT ${currentPort}${c.reset}\n`)
  console.log(`Stopping active processes and releasing the port...`)
  const freed = await stopServer()
  if (freed) {
    console.log(`\n${c.brightGreen}✔ Verified: port ${currentPort} is now free.${c.reset}`)
  } else {
    console.log(
      `\n${c.red}✖ Port ${currentPort} is still busy. Run this option again or reboot the terminal.${c.reset}`
    )
  }
  await new Promise((r) => setTimeout(r, 1800))
}

// Start Server & Run Live Interactive Dashboard.
// The server itself belongs to the Control Center daemon; this view talks to
// its API and mirrors logs/stats, so terminal and browser can never fight.
async function startServerLive() {
  clearScreen()
  printBanner()

  const daemonReady = await ensureDaemon()
  if (!daemonReady) {
    console.log(`${c.yellow}⚠ Service manager unreachable on port ${CONTROL_PORT}.${c.reset}`)
    console.log(`${c.dim}Falling back to direct local management.${c.reset}\n`)
    return startServerDirect()
  }

  let startResult
  try {
    startResult = await apiPost('/api/server/start', { port: currentPort })
  } catch (err) {
    console.log(`${c.red}✖ Could not reach the service manager (${err.message}).${c.reset}`)
    await new Promise((r) => setTimeout(r, 1600))
    return 'menu'
  }

  if (startResult.status === 409 || startResult.data?.error === 'already-running') {
    console.log(`${c.yellow}⚠ Server already running (started from the Web Console).${c.reset}`)
    console.log(`${c.dim}Attaching this dashboard to the running server...${c.reset}`)
  } else if (!startResult.data?.ok) {
    console.log(`${c.red}✖ Failed to start the server: ${startResult.data?.error || 'unknown error'}${c.reset}`)
    if (startResult.data?.details) console.log(`${c.dim}${startResult.data.details}${c.reset}`)
    await new Promise((r) => setTimeout(r, 2200))
    return 'menu'
  }
  serverRunning = true

  const lanIp = getLanAddresses()[0]?.ip || 'IP-DEL-PC'
  const hostUrl = `http://localhost:${currentPort}/host.html`
  const listenUrl = `http://${lanIp}:${currentPort}/listen.html`

  console.log(`${c.brightGreen}${c.bold}✔ Wifora Server started successfully!${c.reset}\n`)
  console.log(`┌─────────────────────────────────────────────────────────────┐`)
  console.log(`│ ${c.bold}CONNECTION ADDRESSES${c.reset}                                   │`)
  console.log(`├─────────────────────────────────────────────────────────────┤`)
  console.log(`│ 🖥️  ${c.bold}Browser PC (Host):${c.reset}     ${c.brightCyan}${hostUrl.padEnd(31)}${c.reset}│`)
  console.log(`│ 📱 ${c.bold}iPhone / Mobile:${c.reset}       ${c.brightGreen}${listenUrl.padEnd(31)}${c.reset}│`)
  console.log(`└─────────────────────────────────────────────────────────────┘\n`)
  console.log(`${c.dim}(The server runs under the Control Center service - terminal and web stay in sync.)${c.reset}`)

  console.log(`\n${c.bold}Keyboard shortcuts:${c.reset}`)
  console.log(`  ${c.brightCyan}[B]${c.reset} Reopen browser on the PC`)
  console.log(`  ${c.brightCyan}[C]${c.reset} Open Web Control Center`)
  console.log(`  ${c.yellow}[S]${c.reset} Stop server and return to menu`)
  console.log(`  ${c.red}[Q]${c.reset} Stop everything and exit\n`)

  // Skip historical log backlog, then stream incrementally.
  let logCursor = 0
  try {
    logCursor = (await apiGet('/api/logs')).cursor
  } catch {}

  let lastListeners = null
  const pumpTimer = setInterval(async () => {
    if (!serverRunning) return
    try {
      const logs = await apiGet(`/api/logs?since=${logCursor}`)
      for (const line of logs.lines || []) {
        process.stdout.write(`${c.dim}${line}${c.reset}\n`)
      }
      logCursor = logs.cursor
      const stats = await fetch(`http://127.0.0.1:${currentPort}/api/stats`, { signal: AbortSignal.timeout(900) })
      if (stats.ok) {
        const data = await stats.json()
        if (data.totalListeners !== lastListeners) {
          lastListeners = data.totalListeners
          const names = (data.rooms || []).flatMap((r) => r.listenerNames || [])
          const label = names.length ? ` (${names.slice(0, 5).join(', ')})` : ''
          process.stdout.write(`${c.dim}👥 Connected listeners: ${data.totalListeners}${label}${c.reset}\n`)
        }
      }
    } catch {}
  }, 1200)
  pumpTimer.unref?.()

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    async function onKey(str, key) {
      if (!key) return
      if (key.name === 'b') {
        openBrowser(hostUrl)
        console.log(`${c.dim}Browser reopened.${c.reset}`)
      } else if (key.name === 'c') {
        openBrowser(`http://localhost:${CONTROL_PORT}`)
        console.log(`${c.dim}Web Control Center opened in your browser.${c.reset}`)
      } else if (key.name === 's') {
        cleanup()
        clearInterval(pumpTimer)
        console.log(`\n${c.yellow}Stopping the server...${c.reset}`)
        await stopServer()
        resolve('menu')
      } else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        cleanup()
        clearInterval(pumpTimer)
        console.log(`\n${c.red}Shutting down the server...${c.reset}`)
        await stopServer()
        resolve('exit')
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKey)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
    }

    process.stdin.on('keypress', onKey)
  })
}

// Direct-management fallback used only when the daemon cannot run at all.
async function startServerDirect() {
  const isFree = await checkPortFree(currentPort)
  if (!isFree) {
    console.log(`${c.yellow}⚠ Port ${currentPort} is already in use by another process.${c.reset}`)
    console.log(`Stopping the previous process...`)
    await stopServerLocal()
    await new Promise((r) => setTimeout(r, 500))
  }

  activeServerProcess = spawnManagedServer(currentPort)
  serverRunning = true
  activeServerProcess.stdout.on('data', (d) => process.stdout.write(d.toString()))
  activeServerProcess.stderr.on('data', (d) => {
    if (!d.toString().includes('EADDRINUSE')) process.stderr.write(`${c.red}${d.toString()}${c.reset}`)
  })

  console.log(`\n${c.yellow}[Direct mode] Press [S] to stop and return to the menu.${c.reset}`)
  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    function onKey(str, key) {
      if (!key) return
      if (key.name === 's' || key.name === 'q' || (key.ctrl && key.name === 'c')) {
        cleanup()
        resolve(key.name === 's' ? 'menu' : 'exit')
      }
    }
    function cleanup() {
      process.stdin.removeListener('keypress', onKey)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
    }
    process.stdin.on('keypress', onKey)
    activeServerProcess.on('close', () => {
      activeServerProcess = null
      serverRunning = false
      cleanup()
      resolve('menu')
    })
  }).then(async (result) => {
    await stopServerLocal()
    return result
  })
}

/**
 * Stops the streaming server ONCE, no matter which front-end started it:
 * goes through the daemon when available (single owner), otherwise falls
 * back to local sweep. Verifies the port is actually free afterwards.
 */
async function stopServer() {
  if (await ensureDaemon()) {
    try {
      const res = await apiPost('/api/server/stop')
      serverRunning = false
      if (typeof res.data?.portFree === 'boolean') {
        await new Promise((r) => setTimeout(r, 200))
        return res.data.portFree ? await checkPortFree(currentPort) : false
      }
    } catch {}
  }
  return stopServerLocal()
}

// Legacy local path (daemon unavailable): graceful IPC -> hard kill -> sweep.
async function stopServerLocal() {
  const child = activeServerProcess
  activeServerProcess = null
  serverRunning = false

  await stopManagedChild(child)
  await killMarkedProcesses(['wifora-managed'])
  await killPortProcess(currentPort)
  await new Promise((r) => setTimeout(r, 300))

  let freed = await checkPortFree(currentPort)
  if (!freed) {
    await killMarkedProcesses(['wifora-managed'])
    await killPortProcess(currentPort)
    await new Promise((r) => setTimeout(r, 600))
    freed = await checkPortFree(currentPort)
  }
  return freed
}

// Opens (or reuses) the local Web Control Center and navigates the browser to it.
async function handleOpenConsole() {
  clearScreen()
  printBanner()
  console.log(`${c.bold}${c.brightCyan}WEB CONTROL CENTER${c.reset}\n`)

  const ok = await ensureDaemon()
  if (!ok) {
    console.log(`${c.red}✖ Could not start the Web Control Center on port ${CONTROL_PORT}.${c.reset}`)
    await new Promise((r) => setTimeout(r, 1800))
    return
  }

  console.log(
    `${c.brightGreen}✔ Opening ${c.bold}http://localhost:${CONTROL_PORT}${c.brightGreen} in your browser...${c.reset}`
  )
  openBrowser(`http://localhost:${CONTROL_PORT}`)
  await new Promise((r) => setTimeout(r, 1200))
}

// Main CLI Loop
async function main() {
  // Adopt the persisted port unless explicitly overridden by the environment.
  if (!process.env.PORT) {
    const config = await loadRuntimeConfig()
    currentPort = config.port
  }

  process.on('SIGINT', async () => {
    await stopServer()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await stopServer()
    process.exit(0)
  })

  let running = true
  while (running) {
    await refreshRunningState()
    const action = await showMenu()
    if (action === 'start') {
      const next = await startServerLive()
      if (next === 'exit') running = false
    } else if (action === 'console') {
      await handleOpenConsole()
    } else if (action === 'port') {
      await promptChangePort()
    } else if (action === 'net') {
      await showNetworkInfo()
    } else if (action === 'kill') {
      await handleKillPort()
    } else if (action === 'exit') {
      running = false
    }
  }

  await stopServer()
  clearScreen()
  printBanner()
  console.log(`${c.brightCyan}Thanks for using Wifora. See you soon! 👋${c.reset}\n`)
  process.exit(0)
}

main()
