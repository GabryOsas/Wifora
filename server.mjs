import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'
import { WebSocketServer, WebSocket } from 'ws'
import { logger } from './logger.mjs'

export const root = fileURLToPath(new URL('.', import.meta.url))
export const publicDir = join(root, 'public')
export const defaultPort = Number(process.env.PORT || 3975)
export const ROOM_PATTERN = /^[A-Z0-9]{8}$/
export const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const DEFAULT_MAX_LISTENERS = 5
export const MAX_LISTENERS = Number(process.env.WIFORA_MAX_LISTENERS) > 0
  ? Math.min(32, Math.max(1, Math.floor(Number(process.env.WIFORA_MAX_LISTENERS))))
  : DEFAULT_MAX_LISTENERS
export const ROOM_GRACE_MS = 60_000
export const MAX_SIGNAL_BYTES = 24_000

export const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
}

export function getLanAddresses() {
  const preferred = []
  const fallback = []
  const virtualAdapter = /(cloudflare|warp|vpn|virtual|loopback|tunnel|tap|wintun|tailscale|zerotier|docker|hyper-v|vmware|vbox)/i
  for (const [name, interfaces] of Object.entries(networkInterfaces())) {
    if (virtualAdapter.test(name)) continue
    for (const item of interfaces || []) {
      if (item.family !== 'IPv4' || item.internal || item.address.startsWith('169.254.')) continue
      const isPrivateLan = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address)
      ;(isPrivateLan ? preferred : fallback).push(item.address)
    }
  }
  return [...preferred, ...fallback]
}

export function validHostKey(received, expected) {
  if (!KEY_PATTERN.test(received || '') || !expected) return false
  const bufA = Buffer.from(received)
  const bufB = Buffer.from(expected)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function setSecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; script-src 'self'; style-src 'self'; base-uri 'self'; form-action 'self'")
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

export function isAllowedOrigin(request, expectedPort = defaultPort) {
  try {
    const origin = new URL(request.headers.origin || '')
    const allowedHosts = new Set(['localhost', '127.0.0.1', ...getLanAddresses()])
    const targetPort = String(expectedPort)
    const matchesPort = origin.port === targetPort || (!origin.port && (targetPort === '80' || targetPort === ''))
    return origin.protocol === 'http:' && matchesPort && allowedHosts.has(origin.hostname)
  } catch {
    return false
  }
}

export function createWiforaServer(options = {}) {
  const log = options.logger || logger
  const serverPort = options.port !== undefined ? Number(options.port) : defaultPort
  const serverPublicDir = options.publicDir || publicDir
  const maxListeners = options.maxListeners !== undefined
    ? Math.min(32, Math.max(1, Math.floor(Number(options.maxListeners))))
    : MAX_LISTENERS
  const maxSignalBytes = options.maxSignalBytes ?? MAX_SIGNAL_BYTES
  const roomGraceMs = options.roomGraceMs ?? ROOM_GRACE_MS
  const rooms = new Map()
  let nextClientId = 1

  function send(socket, message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  function closeRoom(roomId) {
    const room = rooms.get(roomId)
    if (!room) return
    log.info(`Closing room [${roomId}]`, { listenersCount: room.listeners.size })
    clearTimeout(room.cleanupTimer)
    for (const listener of room.listeners.values()) {
      clearTimeout(listener.disconnectTimer)
      send(listener, { type: 'room-ended' })
      listener.close(1000, 'Room ended')
    }
    rooms.delete(roomId)
  }

  function scheduleRoomCleanup(roomId) {
    const room = rooms.get(roomId)
    if (!room || room.cleanupTimer) return
    log.debug(`Scheduling room cleanup for [${roomId}] in ${roomGraceMs}ms`)
    room.cleanupTimer = setTimeout(() => closeRoom(roomId), roomGraceMs)
    room.cleanupTimer.unref?.()
  }

  function removeClient(socket, closeCode) {
    const { roomId, role, clientId, sessionId } = socket
    if (!roomId || !rooms.has(roomId)) return
    const room = rooms.get(roomId)
    if (role === 'host' && room.host === socket) {
      log.info(`Host disconnected from room [${roomId}], code: ${closeCode}`)
      closeRoom(roomId)
      return
    }
    if (role === 'listener') {
      clearTimeout(socket.disconnectTimer)
      const isCleanClose = closeCode === 1000 || closeCode === 1001
      const graceMs = isCleanClose ? 0 : 5_000

      const executeRemoval = () => {
        if (room.listeners.get(sessionId) === socket) {
          room.listeners.delete(sessionId)
          log.info(`Listener [${clientId}] removed from room [${roomId}] (remaining: ${room.listeners.size})`)
          send(room.host, { type: 'listener-left', clientId, sessionId })
          if (!room.host && room.listeners.size === 0) closeRoom(roomId)
        }
      }

      if (graceMs === 0) {
        executeRemoval()
      } else {
        log.debug(`Listener [${clientId}] disconnected abnormally (code ${closeCode}), grace window ${graceMs}ms active`)
        socket.disconnectTimer = setTimeout(executeRemoval, graceMs)
        socket.disconnectTimer.unref?.()
      }
    }
  }

  const server = createServer(async (request, response) => {
    setSecurityHeaders(response)
    const activePort = server.address()?.port || serverPort
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (url.pathname === '/api/network') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate' })
      response.end(JSON.stringify({ port: activePort, addresses: getLanAddresses() }))
      return
    }
    if (url.pathname === '/api/leave' && request.method === 'POST') {
      let body = ''
      request.on('data', (chunk) => {
        if (body.length < 2048) body += chunk
      })
      request.on('end', () => {
        try {
          const data = JSON.parse(body)
          const targetRoomId = String(data.roomId || '').toUpperCase()
          const targetSessionId = String(data.sessionId || '')
          if (targetRoomId && rooms.has(targetRoomId)) {
            const room = rooms.get(targetRoomId)
            const listener = room.listeners.get(targetSessionId)
            if (listener) {
              clearTimeout(listener.disconnectTimer)
              room.listeners.delete(targetSessionId)
              send(room.host, { type: 'listener-left', clientId: listener.clientId, sessionId: targetSessionId, voluntary: true })
              try { listener.close(1000, 'Listener left') } catch {}
              if (!room.host && room.listeners.size === 0) closeRoom(targetRoomId)
            }
          }
        } catch {}
        response.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
        response.end()
      })
      return
    }
    if (url.pathname === '/qr') {
      const text = url.searchParams.get('text')
      if (!text || text.length > 2048) {
        response.writeHead(400)
        response.end('Invalid QR text')
        return
      }
      try {
        const image = await QRCode.toBuffer(text, { type: 'png', width: 420, margin: 1, errorCorrectionLevel: 'M' })
        response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store, private' })
        response.end(image)
      } catch {
        response.writeHead(400)
        response.end('QR generation failed')
      }
      return
    }

    if (url.pathname === '/') {
      const userAgent = request.headers['user-agent'] || ''
      const isMobileOrTablet = /(iphone|ipad|ipod|android|mobile|tablet|silk|kindle)/i.test(userAgent)
      const targetPage = isMobileOrTablet ? '/listen.html' : '/host.html'
      const targetUrl = targetPage + (url.search || '')
      response.writeHead(302, { 'Location': targetUrl, 'Cache-Control': 'no-cache' })
      response.end()
      return
    }

    if (request.url.includes('..') || request.url.toLowerCase().includes('%2e%2e')) {
      response.writeHead(403)
      response.end('Forbidden')
      return
    }

    let requested = url.pathname
    try { requested = decodeURIComponent(url.pathname) } catch {}
    const safePath = normalize(requested).replace(/^([/\\])+/, '')
    const target = resolve(serverPublicDir, safePath)
    const pathFromPublic = relative(serverPublicDir, target)
    if (pathFromPublic.startsWith('..') || isAbsolute(pathFromPublic) || requested.includes('..')) {
      response.writeHead(403)
      response.end('Forbidden')
      return
    }
    try {
      const file = await readFile(target)
      const ext = extname(target)
      const isHtml = ext === '.html'
      const cacheControl = isHtml ? 'no-cache, must-revalidate' : 'public, max-age=300'
      response.writeHead(200, {
        'content-type': contentTypes[ext] || 'application/octet-stream',
        'cache-control': cacheControl
      })
      response.end(file)
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: maxSignalBytes })
  server.on('upgrade', (request, socket, head) => {
    const activePort = server.address()?.port || serverPort
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (url.pathname !== '/signal' || !isAllowedOrigin(request, activePort)) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws))
  })

  wss.on('connection', (socket) => {
    socket.clientId = String(nextClientId++)
    socket.isAlive = true
    socket.on('pong', () => { socket.isAlive = true })

    socket.on('message', (raw) => {
      if (raw.length > maxSignalBytes) {
        log.warn(`Signal message exceeded max size (${raw.length} > ${maxSignalBytes} bytes), disconnecting socket [${socket.clientId}]`)
        return socket.close(1009, 'Message too large')
      }
      let message
      try { message = JSON.parse(raw) } catch {
        log.warn(`Malformed JSON received from socket [${socket.clientId}], closing connection`)
        return socket.close(1003, 'Invalid message')
      }
      if (!message || typeof message.type !== 'string') return

      if (message.type === 'ping') {
        socket.isAlive = true
        send(socket, { type: 'pong' })
        return
      }

      if (message.type === 'register') {
        const roomId = String(message.roomId || '').toUpperCase()
        const role = message.role
        if (!ROOM_PATTERN.test(roomId) || !['host', 'listener'].includes(role)) {
          log.warn(`Invalid registration attempt: roomId='${roomId}', role='${role}' from socket [${socket.clientId}]`)
          send(socket, { type: 'error', message: 'Codice stanza non valido.' })
          return
        }
        if (role === 'host') {
          const existing = rooms.get(roomId)
          if (existing && !validHostKey(message.hostKey, existing.hostKey)) {
            log.warn(`Host registration rejected for room [${roomId}]: key mismatch from socket [${socket.clientId}]`)
            send(socket, { type: 'error', message: 'Questa stanza è già in uso.' })
            return
          }
          const room = existing || { host: null, hostKey: message.hostKey, listeners: new Map(), cleanupTimer: null }
          if (!KEY_PATTERN.test(message.hostKey || '')) {
            log.warn(`Invalid hostKey format for room [${roomId}] from socket [${socket.clientId}]`)
            send(socket, { type: 'error', message: 'Chiave trasmissione non valida.' })
            return
          }
          clearTimeout(room.cleanupTimer)
          room.cleanupTimer = null
          if (room.host && room.host !== socket) {
            log.info(`Replacing previous host connection for room [${roomId}]`)
            room.host.close(1000, 'Host reconnected')
          }
          rooms.set(roomId, room)
          socket.roomId = roomId
          socket.role = role
          room.host = socket
          log.info(`Host registered for room [${roomId}] [client:${socket.clientId}]`)
          send(socket, { type: 'registered', clientId: socket.clientId })
          for (const listener of room.listeners.values()) {
            send(socket, { type: 'listener-joined', clientId: listener.clientId, sessionId: listener.sessionId, deviceName: listener.deviceName })
          }
          return
        }

        const room = rooms.get(roomId)
        if (!room) {
          log.warn(`Listener attempted joining non-existent room [${roomId}] [client:${socket.clientId}]`)
          send(socket, { type: 'error', message: 'Nessuna trasmissione attiva per questo codice.' })
          return
        }
        
        const sessionId = String(message.sessionId || socket.clientId)
        socket.roomId = roomId
        socket.role = role
        socket.sessionId = sessionId
        socket.deviceName = String(message.deviceName || 'Smartphone').replace(/[^\p{L}\p{N} .()_/"'+-]/gu, '').slice(0, 60) || 'Smartphone'
        socket.deviceType = ['phone', 'tablet', 'desktop'].includes(message.deviceType) ? message.deviceType : 'phone'

        const existingListener = room.listeners.get(sessionId)
        if (existingListener) {
          clearTimeout(existingListener.disconnectTimer)
          if (existingListener !== socket) {
            log.info(`Listener session [${sessionId}] reconnected from new socket [${socket.clientId}] in room [${roomId}]`)
            try { existingListener.close(1000, 'Replaced by new connection') } catch {}
          }
        } else if (room.listeners.size >= maxListeners) {
          log.warn(`Room [${roomId}] listener limit reached (${room.listeners.size}/${maxListeners}), rejecting socket [${socket.clientId}]`)
          send(socket, { type: 'error', message: 'La stanza ha già raggiunto il limite di ascoltatori.' })
          return
        }

        room.listeners.set(sessionId, socket)
        log.info(`Listener joined room [${roomId}] [client:${socket.clientId}, session:${sessionId}] (${socket.deviceName}, ${socket.deviceType}) [${room.listeners.size}/${maxListeners}]`)
        send(socket, { type: 'registered', clientId: socket.clientId, sessionId, hostAvailable: Boolean(room.host) })
        send(room.host, { type: 'listener-joined', clientId: socket.clientId, sessionId, deviceName: socket.deviceName, deviceType: socket.deviceType })
        return
      }

      if (message.type === 'leave' && socket.role === 'listener' && socket.roomId) {
        const room = rooms.get(socket.roomId)
        if (room) {
          clearTimeout(socket.disconnectTimer)
          room.listeners.delete(socket.sessionId || socket.clientId)
          log.info(`Listener voluntary leave from room [${socket.roomId}] [client:${socket.clientId}] (remaining: ${room.listeners.size})`)
          send(room.host, { type: 'listener-left', clientId: socket.clientId, sessionId: socket.sessionId, voluntary: true })
          if (!room.host && room.listeners.size === 0) closeRoom(socket.roomId)
        }
        try { socket.close(1000, 'Listener left') } catch {}
        return
      }

      if (message.type === 'stop-stream' && socket.role === 'host' && socket.roomId) {
        log.info(`Host requested stop-stream for room [${socket.roomId}]`)
        closeRoom(socket.roomId)
        return
      }

      if (message.type === 'kick-listener' && socket.role === 'host' && socket.roomId) {
        const room = rooms.get(socket.roomId)
        if (room) {
          const targetKey = String(message.target)
          let targetListener = room.listeners.get(targetKey)
          if (!targetListener) {
            for (const l of room.listeners.values()) {
              if (l.clientId === targetKey) { targetListener = l; break }
            }
          }
          if (targetListener) {
            clearTimeout(targetListener.disconnectTimer)
            if (!room.kicked) room.kicked = new Set()
            room.kicked.add(targetListener.sessionId || targetListener.clientId)
            log.warn(`Host kicked listener [${targetListener.clientId}, session:${targetListener.sessionId}] from room [${socket.roomId}]`)
            send(targetListener, { type: 'kicked', message: 'Sei stato disconnesso dal PC host.' })
            room.listeners.delete(targetListener.sessionId || targetListener.clientId)
            setTimeout(() => {
              try { targetListener.close(4000, 'Kicked by host') } catch {}
            }, 80)
            send(socket, { type: 'listener-left', clientId: targetListener.clientId, sessionId: targetListener.sessionId })
          }
        }
        return
      }

      if (message.type === 'listener-disconnected' && socket.role === 'host' && socket.roomId) {
        const room = rooms.get(socket.roomId)
        if (room) {
          const targetKey = String(message.sessionId || message.clientId || message.target || '')
          let targetSessionId = targetKey
          let targetListener = room.listeners.get(targetKey)
          if (!targetListener) {
            for (const [sid, l] of room.listeners.entries()) {
              if (l.clientId === targetKey || sid === targetKey) {
                targetListener = l
                targetSessionId = sid
                break
              }
            }
          }
          if (targetListener) {
            clearTimeout(targetListener.disconnectTimer)
            room.listeners.delete(targetSessionId)
            log.info(`Host reported peer disconnected for listener [${targetListener.clientId}] in room [${socket.roomId}]`)
            try { targetListener.close(1000, 'Host reported peer disconnected') } catch {}
            if (!room.host && room.listeners.size === 0) closeRoom(socket.roomId)
          }
        }
        return
      }

      if (!socket.roomId || !['offer', 'answer', 'candidate'].includes(message.type)) return
      const room = rooms.get(socket.roomId)
      let target = null
      if (socket.role === 'host') {
        const targetKey = String(message.target)
        target = room?.listeners.get(targetKey)
        if (!target) {
          for (const l of room?.listeners.values() || []) {
            if (l.clientId === targetKey) { target = l; break }
          }
        }
      } else {
        target = room?.host
      }

      if (!target) return
      if (message.type === 'candidate' && (!message.candidate || typeof message.candidate !== 'object')) return
      if ((message.type === 'offer' || message.type === 'answer') && (!message.sdp || typeof message.sdp.sdp !== 'string')) return
      send(target, { type: message.type, clientId: socket.clientId, sessionId: socket.sessionId, ...(message.type === 'candidate' ? { candidate: message.candidate } : { sdp: message.sdp }) })
    })
    socket.on('close', (code) => removeClient(socket, code))
    socket.on('error', (err) => {
      log.debug(`WebSocket error on client [${socket.clientId}]:`, err?.message || err)
      removeClient(socket, 1006)
    })
  })

  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.isAlive) {
        client.terminate()
        continue
      }
      client.isAlive = false
      client.ping()
    }
  }, options.pingIntervalMs || 10_000)
  pingInterval.unref?.()

  function close() {
    return new Promise((resolve) => {
      clearInterval(pingInterval)
      for (const client of wss.clients) {
        try { client.close(1001, 'Server shutting down') } catch {}
      }
      wss.close(() => {
        server.close(() => resolve())
      })
    })
  }

  return {
    server,
    wss,
    rooms,
    closeRoom,
    removeClient,
    scheduleRoomCleanup,
    close,
    listen: (customPort, host = '0.0.0.0') => new Promise((resolve) => {
      server.listen(customPort ?? serverPort, host, () => {
        const addr = server.address()
        log.info(`Wifora server listening on ${addr.address}:${addr.port}`)
        resolve(addr)
      })
    })
  }
}

// Auto-start standalone server if executed directly via node server.mjs
const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectExecution) {
  const instance = createWiforaServer()
  instance.listen().then((addr) => {
    const port = addr.port
    logger.info(`Wifora pronto su http://localhost:${port}/host.html`)
    const addresses = getLanAddresses()
    if (addresses.length) logger.info(`Apri sullo smartphone: http://${addresses[0]}:${port}/listen.html`)
    else logger.warn('Nessun indirizzo Wi-Fi o Ethernet rilevato.')
  })

  function gracefulShutdown() {
    logger.info('Shutting down Wifora gracefully...')
    instance.close().then(() => process.exit(0))
    setTimeout(() => process.exit(0), 800).unref()
  }

  process.on('SIGTERM', gracefulShutdown)
  process.on('SIGINT', gracefulShutdown)
}
