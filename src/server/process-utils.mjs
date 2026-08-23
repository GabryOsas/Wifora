import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

export const isWindows = process.platform === 'win32'

/** Resolves true when the TCP port is bindable (nothing listening on it). */
export function checkPortFree(port) {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true))
      })
      .listen(port, '0.0.0.0')
  })
}

/** Force-kills every process holding a TCP port. */
export function killPortProcess(port) {
  return new Promise((resolve) => {
    if (!isWindows) return resolve(false)
    const cmd = `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`
    const proc = spawn('powershell', ['-NoProfile', '-Command', cmd], { stdio: 'ignore', windowsHide: true })
    proc.on('close', () => resolve(true))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Sweeps orphaned Wifora helper processes left over from crashed sessions.
 * Only processes started with one of the given --wifora-* markers are targeted.
 */
export function killMarkedProcesses(markers = ['wifora-managed']) {
  return new Promise((resolve) => {
    if (!isWindows) return resolve(false)
    const alternation = markers.join('|')
    const cmd =
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
      `Where-Object { $_.CommandLine -match '--(${alternation})' } | ` +
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
    const proc = spawn('powershell', ['-NoProfile', '-Command', cmd], { stdio: 'ignore', windowsHide: true })
    proc.on('close', () => resolve(true))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Stops a managed child server: graceful IPC shutdown first so connected
 * browsers receive the "server-shutdown" notice, hard kill as fallback.
 * Returns true once the child has exited.
 */
export async function stopManagedChild(child, { graceMs = 2500 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode) return true

  const exited = new Promise((resolve) => child.once('exit', () => resolve(true)))
  try {
    child.send({ type: 'wifora:shutdown' })
  } catch {}

  const graceful = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve(false), graceMs))])
  if (graceful) return true

  try {
    if (isWindows) {
      spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true })
    } else {
      child.kill('SIGKILL')
    }
  } catch {}
  await exited
  return true
}

/**
 * Spawns the streaming server as a managed child (--wifora-managed marker
 * makes orphan sweeps able to identify it; IPC carries graceful shutdown).
 */
export function spawnManagedServer(port) {
  return spawn(process.execPath, ['server.mjs', '--wifora-managed'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
}

/** Opens a URL in the default browser. */
export function openInBrowser(url) {
  if (isWindows) {
    spawn('cmd.exe', ['/c', 'start', '', url], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
  }
}
