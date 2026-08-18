import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { createServer } from 'node:net'
import readline from 'node:readline'

const isWindows = process.platform === 'win32'
let currentPort = Number(process.env.PORT || 3975)
let activeServerProcess = null

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

function checkPortFree(port) {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true))
      })
      .listen(port, '0.0.0.0')
  })
}

function killPortProcess(port) {
  return new Promise((resolve) => {
    if (!isWindows) return resolve(false)
    const cmd = `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`
    const proc = spawn('powershell', ['-NoProfile', '-Command', cmd], { stdio: 'ignore' })
    proc.on('close', () => resolve(true))
    proc.on('error', () => resolve(false))
  })
}

function openBrowser(url) {
  if (isWindows) {
    spawn('cmd.exe', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
  }
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

// Interactive Arrow-Key Menu
async function showMenu() {
  const menuItems = [
    { id: 'start', label: 'Start Wifora Server', icon: '▶' },
    { id: 'port', label: `Change Port (Current: ${currentPort})`, icon: '⚙' },
    { id: 'net', label: 'View Network Adapters & IP Addresses', icon: '📶' },
    { id: 'kill', label: 'Free Port & Stop Leftover Processes', icon: '🛑' },
    { id: 'exit', label: 'Exit Program', icon: '✖' },
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
      console.log(
        `${c.dim}Configured port: ${c.brightCyan}${currentPort}${c.dim} | Press [Q] to quit${c.reset}`
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
    rl.question(`\nNew port [${currentPort}]: `, (input) => {
      rl.close()
      const parsed = parseInt(input.trim(), 10)
      if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
        currentPort = parsed
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

// Kill Port Action
async function handleKillPort() {
  clearScreen()
  printBanner()
  console.log(`${c.bold}${c.yellow}FREEING PORT ${currentPort}${c.reset}\n`)
  console.log(`Checking for and stopping active processes...`)
  await killPortProcess(currentPort)
  console.log(`\n${c.brightGreen}✔ Port ${currentPort} freed successfully!${c.reset}`)
  await new Promise((r) => setTimeout(r, 1500))
}

// Start Server & Run Live Interactive Dashboard
async function startServerLive() {
  clearScreen()
  printBanner()

  // 1. Check if port is free
  const isFree = await checkPortFree(currentPort)
  if (!isFree) {
    console.log(`${c.yellow}⚠ Port ${currentPort} is already in use by another process.${c.reset}`)
    console.log(`Stopping the previous process...`)
    await killPortProcess(currentPort)
    await new Promise((r) => setTimeout(r, 800))
  }

  const lanAddrs = getLanAddresses()
  const lanIp = lanAddrs[0]?.ip || 'IP-DEL-PC'

  const hostUrl = `http://localhost:${currentPort}/host.html`
  const listenUrl = `http://${lanIp}:${currentPort}/listen.html`

  console.log(`${c.brightGreen}${c.bold}✔ Wifora Server started successfully!${c.reset}\n`)
  console.log(`┌─────────────────────────────────────────────────────────────┐`)
  console.log(`│ ${c.bold}CONNECTION ADDRESSES${c.reset}                                   │`)
  console.log(`├─────────────────────────────────────────────────────────────┤`)
  console.log(`│ 🖥️  ${c.bold}Browser PC (Host):${c.reset}     ${c.brightCyan}${hostUrl.padEnd(31)}${c.reset}│`)
  console.log(`│ 📱 ${c.bold}iPhone / Mobile:${c.reset}       ${c.brightGreen}${listenUrl.padEnd(31)}${c.reset}│`)
  console.log(`└─────────────────────────────────────────────────────────────┘\n`)

  console.log(`${c.dim}Opening the browser on the PC...${c.reset}`)
  openBrowser(hostUrl)

  // Spawn node server
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(currentPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  activeServerProcess = child

  child.stdout.on('data', (d) => {
    process.stdout.write(d.toString())
  })

  child.stderr.on('data', (d) => {
    const err = d.toString()
    if (!err.includes('EADDRINUSE')) {
      process.stderr.write(`${c.red}${err}${c.reset}`)
    }
  })

  console.log(`\n${c.bold}Keyboard shortcuts:${c.reset}`)
  console.log(`  ${c.brightCyan}[B]${c.reset} Reopen browser on the PC`)
  console.log(`  ${c.yellow}[S]${c.reset} Stop server and return to menu`)
  console.log(`  ${c.red}[Q]${c.reset} Stop everything and exit\n`)

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    async function onKey(str, key) {
      if (!key) return
      if (key.name === 'b') {
        openBrowser(hostUrl)
        console.log(`${c.dim}Browser reopened.${c.reset}`)
      } else if (key.name === 's') {
        cleanup()
        console.log(`\n${c.yellow}Stopping the server...${c.reset}`)
        await stopServer()
        resolve('menu')
      } else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        cleanup()
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

    child.on('close', () => {
      cleanup()
      resolve('menu')
    })
  })
}

function stopServer() {
  if (activeServerProcess) {
    try {
      activeServerProcess.kill('SIGTERM')
    } catch {}
    activeServerProcess = null
  }
}

// Main CLI Loop
async function main() {
  process.on('SIGINT', () => {
    stopServer()
    process.exit(0)
  })

  let running = true
  while (running) {
    const action = await showMenu()
    if (action === 'start') {
      const next = await startServerLive()
      if (next === 'exit') running = false
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
