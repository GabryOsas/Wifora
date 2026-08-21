import { WebSocket } from 'ws'
import { ROOM_GRACE_MS } from '../shared/constants.mjs'

const HOST_RECONNECT_GRACE_MS = 8_000

/**
 * Creates and manages active Wifora streaming rooms, host sessions,
 * listener connections, and automatic cleanup timers.
 *
 * @param {Object} options
 * @param {Object} options.logger - Logger instance
 * @param {number} [options.roomGraceMs] - Milliseconds before empty room is purged
 * @returns {Object} RoomManager instance
 */
export function createRoomManager(options = {}) {
  const log = options.logger || console
  const roomGraceMs = options.roomGraceMs ?? ROOM_GRACE_MS
  const rooms = new Map()

  function send(socket, message) {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message))
      } catch (err) {
        log.debug?.('Error sending message to socket:', err?.message || err)
      }
    }
  }

  function closeRoom(roomId) {
    const room = rooms.get(roomId)
    if (!room) return
    log.info(`Closing room [${roomId}]`, { listenersCount: room.listeners.size })
    clearTimeout(room.cleanupTimer)
    for (const listener of room.listeners.values()) {
      clearTimeout(listener.disconnectTimer)
      send(listener, { type: 'room-ended' })
      try {
        listener.close(1000, 'Room ended')
      } catch {}
    }
    rooms.delete(roomId)
  }

  function scheduleRoomCleanup(roomId) {
    const room = rooms.get(roomId)
    if (!room || room.cleanupTimer) return
    log.debug?.(`Scheduling room cleanup for [${roomId}] in ${roomGraceMs}ms`)
    room.cleanupTimer = setTimeout(() => closeRoom(roomId), roomGraceMs)
    room.cleanupTimer.unref?.()
  }

  function removeClient(socket, closeCode) {
    const { roomId, role, clientId, sessionId } = socket
    if (!roomId || !rooms.has(roomId)) return
    const room = rooms.get(roomId)

    if (role === 'host' && room.host === socket) {
      // A short Wi-Fi/browser interruption should not terminate every
      // listener. A new socket is still authenticated by the same host key.
      const isCleanClose = closeCode === 1000 || closeCode === 1001
      if (isCleanClose) {
        log.info(`Host disconnected from room [${roomId}], code: ${closeCode}`)
        closeRoom(roomId)
        return
      }
      log.debug?.(`Host signaling lost for room [${roomId}], grace window ${HOST_RECONNECT_GRACE_MS}ms active`)
      socket.disconnectTimer = setTimeout(() => {
        if (room.host === socket) {
          log.info(`Host reconnection grace expired for room [${roomId}]`)
          closeRoom(roomId)
        }
      }, HOST_RECONNECT_GRACE_MS)
      socket.disconnectTimer.unref?.()
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
        log.debug?.(
          `Listener [${clientId}] disconnected abnormally (code ${closeCode}), grace window ${graceMs}ms active`
        )
        socket.disconnectTimer = setTimeout(executeRemoval, graceMs)
        socket.disconnectTimer.unref?.()
      }
    }
  }

  return {
    rooms,
    send,
    closeRoom,
    scheduleRoomCleanup,
    removeClient,
  }
}
