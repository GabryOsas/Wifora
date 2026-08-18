import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'
import { WebSocketServer, WebSocket } from 'ws'

const root = fileURLToPath(new URL('.', import.meta.url))
const publicDir = join(root, 'public')
const port = Number(process.env.PORT || 3975)
const rooms = new Map()
const ROOM_PATTERN = /^[A-Z0-9]{8}$/
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const MAX_LISTENERS = 2
const ROOM_GRACE_MS = 60_000
const MAX_SIGNAL_BYTES = 24_000
let nextClientId = 1

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
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
      ;(isPrivateLan ? preferred : fallback).push(item.address)
    }
  }
  return [...preferred, ...fallback]
}

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function closeRoom(roomId) {
  const room = rooms.get(roomId)
  if (!room) return
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
  room.cleanupTimer = setTimeout(() => closeRoom(roomId), ROOM_GRACE_MS)
  room.cleanupTimer.unref()
}

function removeClient(socket, closeCode) {
  const { roomId, role, clientId, sessionId } = socket
  if (!roomId || !rooms.has(roomId)) return
  const room = rooms.get(roomId)
  if (role === 'host' && room.host === socket) {
    closeRoom(roomId)
    return
  }
  if (role === 'listener') {
    clearTimeout(socket.disconnectTimer)
    // If closed intentionally by user (1000 = Normal, 1001 = Tab closed / navigated away), remove immediately.
    // If closed abnormally (e.g. 1006 = sudden network drop), allow a 5s grace window before cleanup.
    const isCleanClose = closeCode === 1000 || closeCode === 1001
    const graceMs = isCleanClose ? 0 : 5_000

    const executeRemoval = () => {
      if (room.listeners.get(sessionId) === socket) {
        room.listeners.delete(sessionId)
        send(room.host, { type: 'listener-left', clientId, sessionId })
        if (!room.host && room.listeners.size === 0) closeRoom(roomId)
      }
    }

    if (graceMs === 0) {
      executeRemoval()
    } else {
      socket.disconnectTimer = setTimeout(executeRemoval, graceMs)
      socket.disconnectTimer.unref?.()
    }
  }
}

function validHostKey(received, expected) {
  if (!KEY_PATTERN.test(received || '') || !expected) return false
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

function setSecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; script-src 'self'; style-src 'self'; base-uri 'self'; form-action 'self'")
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

function isAllowedOrigin(request) {
  try {
    const origin = new URL(request.headers.origin || '')
    const allowedHosts = new Set(['localhost', '127.0.0.1', ...getLanAddresses()])
    return origin.protocol === 'http:' && origin.port === String(port) && allowedHosts.has(origin.hostname)
  } catch {
    return false
  }
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(response)
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  if (url.pathname === '/api/network') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate' })
    response.end(JSON.stringify({ port, addresses: getLanAddresses() }))
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

  const requested = url.pathname
  const safePath = normalize(requested).replace(/^([/\\])+/, '')
  const target = resolve(publicDir, safePath)
  const pathFromPublic = relative(publicDir, target)
  if (pathFromPublic.startsWith('..') || isAbsolute(pathFromPublic)) {
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

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_SIGNAL_BYTES })
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  if (url.pathname !== '/signal' || !isAllowedOrigin(request)) {
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
    if (raw.length > MAX_SIGNAL_BYTES) return socket.close(1009, 'Message too large')
    let message
    try { message = JSON.parse(raw) } catch { return socket.close(1003, 'Invalid message') }
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
        send(socket, { type: 'error', message: 'Codice stanza non valido.' })
        return
      }
      if (role === 'host') {
        const existing = rooms.get(roomId)
        if (existing && !validHostKey(message.hostKey, existing.hostKey)) {
          send(socket, { type: 'error', message: 'Questa stanza è già in uso.' })
          return
        }
        const room = existing || { host: null, hostKey: message.hostKey, listeners: new Map(), cleanupTimer: null }
        if (!KEY_PATTERN.test(message.hostKey || '')) {
          send(socket, { type: 'error', message: 'Chiave trasmissione non valida.' })
          return
        }
        clearTimeout(room.cleanupTimer)
        room.cleanupTimer = null
        if (room.host && room.host !== socket) room.host.close(1000, 'Host reconnected')
        rooms.set(roomId, room)
        socket.roomId = roomId
        socket.role = role
        room.host = socket
        send(socket, { type: 'registered', clientId: socket.clientId })
        for (const listener of room.listeners.values()) {
          send(socket, { type: 'listener-joined', clientId: listener.clientId, sessionId: listener.sessionId, deviceName: listener.deviceName })
        }
        return
      }

      const room = rooms.get(roomId)
      if (!room) {
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
          try { existingListener.close(1000, 'Replaced by new connection') } catch {}
        }
      } else if (room.listeners.size >= MAX_LISTENERS) {
        send(socket, { type: 'error', message: 'La stanza ha già raggiunto il limite di ascoltatori.' })
        return
      }

      room.listeners.set(sessionId, socket)
      send(socket, { type: 'registered', clientId: socket.clientId, sessionId, hostAvailable: Boolean(room.host) })
      send(room.host, { type: 'listener-joined', clientId: socket.clientId, sessionId, deviceName: socket.deviceName, deviceType: socket.deviceType })
      return
    }

    if (message.type === 'leave' && socket.role === 'listener' && socket.roomId) {
      const room = rooms.get(socket.roomId)
      if (room) {
        clearTimeout(socket.disconnectTimer)
        room.listeners.delete(socket.sessionId || socket.clientId)
        send(room.host, { type: 'listener-left', clientId: socket.clientId, sessionId: socket.sessionId, voluntary: true })
        if (!room.host && room.listeners.size === 0) closeRoom(socket.roomId)
      }
      try { socket.close(1000, 'Listener left') } catch {}
      return
    }

    if (message.type === 'stop-stream' && socket.role === 'host' && socket.roomId) {
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
  socket.on('error', () => removeClient(socket, 1006))
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
}, 10_000)
pingInterval.unref()

server.listen(port, '0.0.0.0', () => {
  console.log(`Wifora pronto su http://localhost:${port}/host.html`)
  const addresses = getLanAddresses()
  if (addresses.length) console.log(`Apri sull'iPhone: http://${addresses[0]}:${port}/listen.html`)
  else console.log('Nessun indirizzo Wi-Fi o Ethernet rilevato.')
})

function gracefulShutdown() {
  clearInterval(pingInterval)
  for (const client of wss.clients) {
    try { client.close(1001, 'Server shutting down') } catch {}
  }
  wss.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 800).unref()
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

