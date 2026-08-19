import { WebSocketServer } from 'ws'
import { ROOM_PATTERN, KEY_PATTERN, LISTENER_TOKEN_PATTERN, MAX_SIGNAL_BYTES } from '../shared/constants.mjs'
import {
  canSendControlMessage,
  CONTROL_MESSAGE_TYPES,
  CONTROL_PROTOCOL_VERSION,
  validateControlMessage,
} from '../shared/protocol.mjs'
import { isAllowedOrigin, validHostKey, validListenerToken } from './security.mjs'
import { createRateLimiter } from './rate-limiter.mjs'

/**
 * Creates and attaches the WebSocket signaling server for WebRTC session negotiation.
 *
 * @param {Object} options
 * @param {import('node:http').Server} options.server - Node.js HTTP/HTTPS server instance
 * @param {import('./rooms.mjs').createRoomManager} options.roomManager - Room manager instance
 * @param {number} [options.port] - Server port
 * @param {number} [options.maxListeners] - Max listeners limit
 * @param {number} [options.maxSignalBytes] - Max allowed signal payload size
 * @param {number} [options.pingIntervalMs] - Heartbeat check interval
 * @param {Object} [options.rateLimiters] - Optional custom rate limiters
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Signaling server controller
 */
export function createSignalingServer(options = {}) {
  const {
    server,
    roomManager,
    port,
    maxListeners = 5,
    maxSignalBytes = MAX_SIGNAL_BYTES,
    pingIntervalMs = 10_000,
    logger = console,
  } = options

  const rooms = roomManager.rooms
  const send = roomManager.send
  let nextClientId = 1

  // Rate limiters per IP
  const connectionLimiter =
    options.rateLimiters?.connectionLimiter || createRateLimiter({ windowMs: 10_000, maxHits: 30 })
  const roomMissLimiter = options.rateLimiters?.roomMissLimiter || createRateLimiter({ windowMs: 30_000, maxHits: 8 })
  const authFailLimiter = options.rateLimiters?.authFailLimiter || createRateLimiter({ windowMs: 30_000, maxHits: 10 })

  const wss = new WebSocketServer({ noServer: true, maxPayload: maxSignalBytes })

  server.on('upgrade', (request, socket, head) => {
    const remoteIp = request.socket?.remoteAddress || 'unknown'

    if (!connectionLimiter.check(remoteIp)) {
      logger.warn?.(`WebSocket connection rate limit exceeded for IP: ${remoteIp}`)
      socket.destroy()
      return
    }

    const activePort = server.address()?.port || port
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (url.pathname !== '/signal' || !isAllowedOrigin(request, activePort)) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.remoteIp = remoteIp
      wss.emit('connection', ws)
    })
  })

  wss.on('connection', (socket) => {
    socket.clientId = String(nextClientId++)
    socket.isAlive = true
    socket.on('pong', () => {
      socket.isAlive = true
    })

    socket.on('message', (raw) => {
      if (raw.length > maxSignalBytes) {
        logger.warn?.(
          `Signal message exceeded max size (${raw.length} > ${maxSignalBytes} bytes), disconnecting socket [${socket.clientId}]`
        )
        return socket.close(1009, 'Message too large')
      }
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        logger.warn?.(`Malformed JSON received from socket [${socket.clientId}], closing connection`)
        return socket.close(1003, 'Invalid message')
      }
      if (!message || typeof message.type !== 'string') return

      if (message.type === 'ping') {
        socket.isAlive = true
        send(socket, { type: 'pong' })
        return
      }

      if (CONTROL_MESSAGE_TYPES.has(message.type)) {
        const validation = validateControlMessage(message)
        if (!validation.valid) {
          send(socket, { type: 'error', message: `Messaggio di controllo non valido: ${validation.reason}.` })
          return
        }
        if (!socket.roomId || !socket.role) {
          send(socket, { type: 'error', message: 'Registrazione richiesta prima dei messaggi di controllo.' })
          return
        }
        if (!canSendControlMessage(socket.role, message.type)) {
          send(socket, { type: 'error', message: 'Questo ruolo non può inviare il messaggio di controllo richiesto.' })
          return
        }
        if (socket.role === 'listener' && message.sessionId !== socket.sessionId) {
          send(socket, { type: 'error', message: 'Sessione di controllo non autorizzata.' })
          return
        }
        const room = rooms.get(socket.roomId)
        if (!room) return
        if (message.type === 'server.capabilities') {
          send(socket, {
            type: 'server.capabilities',
            version: CONTROL_PROTOCOL_VERSION,
            sessionId: socket.sessionId || socket.clientId,
            deviceId: socket.clientId,
            timestamp: Date.now(),
            payload: { webrtc: true, controlProtocol: CONTROL_PROTOCOL_VERSION, perClientPolicy: true },
          })
          return
        }
        if (message.type === 'audio.policy' || (message.type === 'clock.sync' && socket.role === 'host')) {
          const listener = room.listeners.get(message.sessionId)
          if (!listener) {
            send(socket, { type: 'error', message: 'Destinatario della policy audio non disponibile.' })
            return
          }
          send(listener, { ...message, clientId: socket.clientId })
          return
        }
        if (message.type === 'telemetry.report' && socket.role === 'listener') {
          socket.telemetry = message.payload
          send(room.host, { ...message, clientId: socket.clientId })
          return
        }
        const isHostBroadcast = socket.role === 'host'
        const recipients = isHostBroadcast ? room.listeners.values() : [room.host]
        for (const recipient of recipients) send(recipient, { ...message, clientId: socket.clientId })
        return
      }

      if (message.type === 'register') {
        const roomId = String(message.roomId || '').toUpperCase()
        const role = message.role
        const remoteIp = socket.remoteIp || 'unknown'

        if (!ROOM_PATTERN.test(roomId) || !['host', 'listener'].includes(role)) {
          logger.warn?.(
            `Invalid registration attempt: roomId='${roomId}', role='${role}' from socket [${socket.clientId}]`
          )
          send(socket, { type: 'error', message: 'Codice stanza non valido.' })
          return
        }

        if (role === 'host') {
          const existing = rooms.get(roomId)
          if (existing && !validHostKey(message.hostKey, existing.hostKey)) {
            authFailLimiter.check(remoteIp)
            logger.warn?.(
              `Host registration rejected for room [${roomId}]: key mismatch from socket [${socket.clientId}]`
            )
            send(socket, { type: 'error', message: 'Questa stanza è già in uso.' })
            return
          }
          if (!KEY_PATTERN.test(message.hostKey || '')) {
            authFailLimiter.check(remoteIp)
            logger.warn?.(`Invalid hostKey format for room [${roomId}] from socket [${socket.clientId}]`)
            send(socket, { type: 'error', message: 'Chiave trasmissione non valida.' })
            return
          }

          let listenerToken = null
          if (message.listenerToken) {
            if (LISTENER_TOKEN_PATTERN.test(message.listenerToken)) {
              listenerToken = message.listenerToken
            } else {
              logger.warn?.(`Invalid listenerToken format for room [${roomId}] from socket [${socket.clientId}]`)
            }
          }

          const room = existing || {
            host: null,
            hostKey: message.hostKey,
            listenerToken: listenerToken,
            listeners: new Map(),
            cleanupTimer: null,
          }

          if (listenerToken) {
            room.listenerToken = listenerToken
          }

          clearTimeout(room.cleanupTimer)
          room.cleanupTimer = null
          if (room.host && room.host !== socket) {
            logger.info?.(`Replacing previous host connection for room [${roomId}]`)
            try {
              room.host.close(1000, 'Host reconnected')
            } catch {}
          }
          rooms.set(roomId, room)
          socket.roomId = roomId
          socket.role = role
          room.host = socket
          logger.info?.(`Host registered for room [${roomId}] [client:${socket.clientId}]`)
          send(socket, { type: 'registered', clientId: socket.clientId })
          for (const listener of room.listeners.values()) {
            send(socket, {
              type: 'listener-joined',
              clientId: listener.clientId,
              sessionId: listener.sessionId,
              deviceName: listener.deviceName,
            })
          }
          return
        }

        const room = rooms.get(roomId)
        if (!room) {
          const allowed = roomMissLimiter.check(remoteIp)
          logger.warn?.(`Listener attempted joining non-existent room [${roomId}] [client:${socket.clientId}]`)
          send(socket, { type: 'error', message: 'Nessuna trasmissione attiva per questo codice.' })
          if (!allowed) {
            logger.warn?.(`Room miss limit reached for IP ${remoteIp}, terminating socket [${socket.clientId}]`)
            socket.close(1008, 'Too many invalid room attempts')
          }
          return
        }

        // Listener token validation if configured on the room
        if (room.listenerToken && !validListenerToken(message.listenerToken, room.listenerToken)) {
          const allowed = authFailLimiter.check(remoteIp)
          logger.warn?.(
            `Listener rejected for room [${roomId}]: invalid or missing listener token from socket [${socket.clientId}]`
          )
          send(socket, { type: 'error', message: 'Token di ascolto non valido o mancante.' })
          if (!allowed) {
            logger.warn?.(`Auth failure limit reached for IP ${remoteIp}, terminating socket [${socket.clientId}]`)
            socket.close(1008, 'Too many auth failures')
          }
          return
        }

        const sessionId = String(message.sessionId || socket.clientId)
        socket.roomId = roomId
        socket.role = role
        socket.sessionId = sessionId
        socket.deviceName =
          String(message.deviceName || 'Smartphone')
            .replace(/[^\p{L}\p{N} .()_/"'+-]/gu, '')
            .slice(0, 60) || 'Smartphone'
        socket.deviceType = ['phone', 'tablet', 'desktop'].includes(message.deviceType) ? message.deviceType : 'phone'

        const existingListener = room.listeners.get(sessionId)
        if (existingListener) {
          clearTimeout(existingListener.disconnectTimer)
          if (existingListener !== socket) {
            logger.info?.(
              `Listener session [${sessionId}] reconnected from new socket [${socket.clientId}] in room [${roomId}]`
            )
            try {
              existingListener.close(1000, 'Replaced by new connection')
            } catch {}
          }
        } else if (room.listeners.size >= maxListeners) {
          logger.warn?.(
            `Room [${roomId}] listener limit reached (${room.listeners.size}/${maxListeners}), rejecting socket [${socket.clientId}]`
          )
          send(socket, { type: 'error', message: 'La stanza ha già raggiunto il limite di ascoltatori.' })
          return
        }

        room.listeners.set(sessionId, socket)
        logger.info?.(
          `Listener joined room [${roomId}] [client:${socket.clientId}, session:${sessionId}] (${socket.deviceName}, ${socket.deviceType}) [${room.listeners.size}/${maxListeners}]`
        )
        send(socket, { type: 'registered', clientId: socket.clientId, sessionId, hostAvailable: Boolean(room.host) })
        send(room.host, {
          type: 'listener-joined',
          clientId: socket.clientId,
          sessionId,
          deviceName: socket.deviceName,
          deviceType: socket.deviceType,
        })
        return
      }

      if (message.type === 'leave' && socket.role === 'listener' && socket.roomId) {
        const room = rooms.get(socket.roomId)
        if (room) {
          clearTimeout(socket.disconnectTimer)
          room.listeners.delete(socket.sessionId || socket.clientId)
          logger.info?.(
            `Listener voluntary leave from room [${socket.roomId}] [client:${socket.clientId}] (remaining: ${room.listeners.size})`
          )
          send(room.host, {
            type: 'listener-left',
            clientId: socket.clientId,
            sessionId: socket.sessionId,
            voluntary: true,
          })
          if (!room.host && room.listeners.size === 0) roomManager.closeRoom(socket.roomId)
        }
        try {
          socket.close(1000, 'Listener left')
        } catch {}
        return
      }

      if (message.type === 'stop-stream' && socket.role === 'host' && socket.roomId) {
        logger.info?.(`Host requested stop-stream for room [${socket.roomId}]`)
        roomManager.closeRoom(socket.roomId)
        return
      }

      if (message.type === 'kick-listener' && socket.role === 'host' && socket.roomId) {
        const room = rooms.get(socket.roomId)
        if (room) {
          const targetKey = String(message.target)
          let targetListener = room.listeners.get(targetKey)
          if (!targetListener) {
            for (const l of room.listeners.values()) {
              if (l.clientId === targetKey) {
                targetListener = l
                break
              }
            }
          }
          if (targetListener) {
            clearTimeout(targetListener.disconnectTimer)
            if (!room.kicked) room.kicked = new Set()
            room.kicked.add(targetListener.sessionId || targetListener.clientId)
            logger.warn?.(
              `Host kicked listener [${targetListener.clientId}, session:${targetListener.sessionId}] from room [${socket.roomId}]`
            )
            send(targetListener, { type: 'kicked', message: 'Sei stato disconnesso dal PC host.' })
            room.listeners.delete(targetListener.sessionId || targetListener.clientId)
            setTimeout(() => {
              try {
                targetListener.close(4000, 'Kicked by host')
              } catch {}
            }, 80)
            send(socket, {
              type: 'listener-left',
              clientId: targetListener.clientId,
              sessionId: targetListener.sessionId,
            })
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
            logger.info?.(
              `Host reported peer disconnected for listener [${targetListener.clientId}] in room [${socket.roomId}]`
            )
            try {
              targetListener.close(1000, 'Host reported peer disconnected')
            } catch {}
            if (!room.host && room.listeners.size === 0) roomManager.closeRoom(socket.roomId)
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
            if (l.clientId === targetKey) {
              target = l
              break
            }
          }
        }
      } else {
        target = room?.host
      }

      if (!target) return
      if (message.type === 'candidate' && (!message.candidate || typeof message.candidate !== 'object')) return
      if (
        (message.type === 'offer' || message.type === 'answer') &&
        (!message.sdp || typeof message.sdp.sdp !== 'string')
      )
        return
      send(target, {
        type: message.type,
        clientId: socket.clientId,
        sessionId: socket.sessionId,
        ...(message.type === 'candidate' ? { candidate: message.candidate } : { sdp: message.sdp }),
      })
    })

    socket.on('close', (code) => roomManager.removeClient(socket, code))
    socket.on('error', (err) => {
      logger.debug?.(`WebSocket error on client [${socket.clientId}]:`, err?.message || err)
      roomManager.removeClient(socket, 1006)
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
  }, pingIntervalMs)
  pingInterval.unref?.()

  function close() {
    return new Promise((resolve) => {
      clearInterval(pingInterval)
      connectionLimiter.close()
      roomMissLimiter.close()
      authFailLimiter.close()
      for (const client of wss.clients) {
        try {
          client.close(1001, 'Server shutting down')
        } catch {}
      }
      wss.close(() => resolve())
    })
  }

  return {
    wss,
    close,
  }
}
