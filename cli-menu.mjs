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

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H')
}

function getLanAddresses() {
  const preferred = []
  const fallback = []
  const virtualAdapter = /(cloudflare|warp|vpn|virtual|loopback|tunnel|tap|wintun|tailscale|zerotier|docker|hyper-v|vmware|vbox)/i
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
  console.log(`${c.brightCyan}${c.bold}`)
  console.log('   ██╗    ██╗██╗███████╗ ██████╗ ██████╗  █████╗ ')
  console.log('   ██║    ██║██║██╔════╝██╔═══██╗██╔══██╗██╔══██╗')
  console.log('   ██║ █╗ ██║██║█████╗  ██║   ██║██████╔╝███████║')
  console.log('   ██║███╗██║██║██╔══╝  ██║   ██║██╔══██╗██╔══██║')
  console.log('   ╚███╔███╔╝██║██║     ╚██████╔╝██║  ██║██║  ██║')
  console.log('    ╚══╝╚══╝ ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝')
  console.log(`${c.reset}${c.dim}      PC Audio Streamer for iPhone & Mobile${c.reset}\n`)
}

// Interactive Arrow-Key Menu
async function showMenu() {
  const menuItems = [
    { id: 'start', label: 'Avvia Wifora Server', icon: '▶' },
    { id: 'port', label: `Cambia Porta (Attuale: ${currentPort})`, icon: '⚙' },
    { id: 'net', label: 'Visualizza Schede di Rete & Indirizzi IP', icon: '📶' },
    { id: 'kill', label: 'Libera Porta & Arresta Processi Residui', icon: '🛑' },
    { id: 'exit', label: 'Esci dal Programma', icon: '✖' },
  ]

  let selectedIndex = 0

  return new Promise((resolve) => {
    function render() {
      clearScreen()
      printBanner()
      console.log(`${c.bold}Seleziona un'opzione usando le frecce [↑ / ↓] e premi [Invio]:${c.reset}\n`)

      menuItems.forEach((item, index) => {
        const isSelected = index === selectedIndex
        if (isSelected) {
          console.log(`  ${c.brightCyan}${c.bold}❯ ${item.icon}  ${item.label}${c.reset}`)
        } else {
          console.log(`    ${c.dim}${item.icon}  ${item.label}${c.reset}`)
        }
      })

      console.log(`\n${c.dim}───────────────────────────────────────────────────${c.reset}`)
      console.log(`${c.dim}Porta configurata: ${c.brightCyan}${currentPort}${c.dim} | Premi [Q] per uscire rapido${c.reset}`)
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
  console.log(`${c.bold}${c.brightCyan}CONFIGURAZIONE PORTA SERVER${c.reset}\n`)
  console.log(`Porta corrente: ${c.bold}${currentPort}${c.reset}`)
  console.log(`Inserisci il nuovo numero di porta (es. 3975, 8080, 5000):`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`\nNuova porta [${currentPort}]: `, (input) => {
      rl.close()
      const parsed = parseInt(input.trim(), 10)
      if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
        currentPort = parsed
        console.log(`\n${c.brightGreen}✔ Porta aggiornata a ${currentPort}!${c.reset}`)
      } else if (input.trim() !== '') {
        console.log(`\n${c.red}✖ Valore non valido. Mantengo ${currentPort}.${c.reset}`)
      }
      setTimeout(resolve, 1200)
    })
  })
}

// Display Network Interfaces Info
async function showNetworkInfo() {
  clearScreen()
  printBanner()
  console.log(`${c.bold}${c.brightCyan}SCHEDE DI RETE & INDIRIZZI IP RILEVATI${c.reset}\n`)

  const addrs = getLanAddresses()
  if (addrs.length === 0) {
    console.log(`${c.yellow}⚠ Nessun indirizzo IPv4 locale rilevato. Connetti il PC al Wi-Fi o Ethernet.${c.reset}`)
  } else {
    console.log(`Trovate ${c.bold}${addrs.length}${c.reset} interfaccia/e di rete:\n`)
    addrs.forEach((item, idx) => {
      const isPrimary = idx === 0 ? ` ${c.brightGreen}[Consigliata per iPhone]${c.reset}` : ''
      console.log(`  ${c.brightCyan}● ${item.name}${c.reset}: ${c.bold}${item.ip}${c.reset}${isPrimary}`)
      console.log(`    ${c.dim}Link smartphone: http://${item.ip}:${currentPort}/listen.html${c.reset}\n`)
    })
  }

  console.log(`\n${c.dim}Premi un tasto qualsiasi per tornare al menu principale...${c.reset}`)
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
  console.log(`${c.bold}${c.yellow}LIBERAZIONE PORTA ${currentPort}${c.reset}\n`)
  console.log(`Controllo e chiusura processi attivi in corso...`)
  await killPortProcess(currentPort)
  console.log(`\n${c.brightGreen}✔ Porta ${currentPort} liberata con successo!${c.reset}`)
  await new Promise((r) => setTimeout(r, 1500))
}

// Start Server & Run Live Interactive Dashboard
async function startServerLive() {
  clearScreen()
  printBanner()

  // 1. Check if port is free
  const isFree = await checkPortFree(currentPort)
  if (!isFree) {
    console.log(`${c.yellow}⚠ La porta ${currentPort} è già occupata da un altro processo.${c.reset}`)
    console.log(`Chiusura forzata del processo precedente in corso...`)
    await killPortProcess(currentPort)
    await new Promise((r) => setTimeout(r, 800))
  }

  const lanAddrs = getLanAddresses()
  const lanIp = lanAddrs[0]?.ip || 'IP-DEL-PC'

  const hostUrl = `http://localhost:${currentPort}/host.html`
  const listenUrl = `http://${lanIp}:${currentPort}/listen.html`

  console.log(`${c.brightGreen}${c.bold}✔ Wifora Server avviato con successo!${c.reset}\n`)
  console.log(`┌─────────────────────────────────────────────────────────────┐`)
  console.log(`│ ${c.bold}INDIRIZZI DI COLLEGAMENTO${c.reset}                                   │`)
  console.log(`├─────────────────────────────────────────────────────────────┤`)
  console.log(`│ 🖥️  ${c.bold}Browser PC (Host):${c.reset}     ${c.brightCyan}${hostUrl.padEnd(31)}${c.reset}│`)
  console.log(`│ 📱 ${c.bold}iPhone / Mobile:${c.reset}       ${c.brightGreen}${listenUrl.padEnd(31)}${c.reset}│`)
  console.log(`└─────────────────────────────────────────────────────────────┘\n`)

  console.log(`${c.dim}Apertura automatica del browser sul PC in corso...${c.reset}`)
  openBrowser(hostUrl)

  // Spawn node server
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(currentPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  activeServerProcess = child

  child.stderr.on('data', (d) => {
    const err = d.toString()
    if (!err.includes('EADDRINUSE')) {
      process.stderr.write(`${c.red}${err}${c.reset}`)
    }
  })

  console.log(`\n${c.bold}Comandi rapidi da tastiera:${c.reset}`)
  console.log(`  ${c.brightCyan}[B]${c.reset} Riapri browser sul PC`)
  console.log(`  ${c.yellow}[S]${c.reset} Ferma server e torna al menu`)
  console.log(`  ${c.red}[Q]${c.reset} Chiudi tutto ed esci\n`)

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    function onKey(str, key) {
      if (!key) return
      if (key.name === 'b') {
        openBrowser(hostUrl)
        console.log(`${c.dim}Browser riaperto.${c.reset}`)
      } else if (key.name === 's') {
        cleanup()
        stopServer()
        resolve('menu')
      } else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        cleanup()
        stopServer()
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

  clearScreen()
  printBanner()
  console.log(`${c.brightCyan}Grazie per aver usato Wifora. A presto! 👋${c.reset}\n`)
  process.exit(0)
}

main()
