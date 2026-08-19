import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from './logger.mjs'
import {
  ROOT_DIR,
  PUBLIC_DIR,
  DEFAULT_PORT,
  DEFAULT_MAX_LISTENERS,
  ROOM_GRACE_MS,
  MAX_SIGNAL_BYTES,
  ROOM_PATTERN,
  KEY_PATTERN,
  LISTENER_TOKEN_PATTERN,
  contentTypes,
} from './src/shared/constants.mjs'
import { getLanAddresses } from './src/server/network.mjs'
import { validHostKey, validListenerToken, setSecurityHeaders, isAllowedOrigin } from './src/server/security.mjs'
import { createRoomManager } from './src/server/rooms.mjs'
import { createHttpHandler } from './src/server/http.mjs'
import { createSignalingServer } from './src/server/websocket.mjs'
import { createDiscoveryPublisher } from './src/server/discovery.mjs'

// Backward-compatible re-exports
export const root = ROOT_DIR
export const publicDir = PUBLIC_DIR
export const defaultPort = Number(process.env.PORT || DEFAULT_PORT)
export {
  ROOM_PATTERN,
  KEY_PATTERN,
  LISTENER_TOKEN_PATTERN,
  DEFAULT_MAX_LISTENERS,
  ROOM_GRACE_MS,
  MAX_SIGNAL_BYTES,
  contentTypes,
}
export const MAX_LISTENERS =
  Number(process.env.WIFORA_MAX_LISTENERS) > 0
    ? Math.min(32, Math.max(1, Math.floor(Number(process.env.WIFORA_MAX_LISTENERS))))
    : DEFAULT_MAX_LISTENERS

export { getLanAddresses, validHostKey, validListenerToken, setSecurityHeaders, isAllowedOrigin }

/**
 * Loads TLS certificate and key from files or options.
 *
 * @param {Object} [tlsOptions]
 * @returns {Object|null} TLS configuration with cert and key buffers
 */
function resolveTlsConfig(tlsOptions = {}) {
  const certPath = tlsOptions.certPath || process.env.WIFORA_TLS_CERT
  const keyPath = tlsOptions.keyPath || process.env.WIFORA_TLS_KEY

  if (tlsOptions.cert && tlsOptions.key) {
    return { cert: tlsOptions.cert, key: tlsOptions.key }
  }

  if (certPath && keyPath) {
    try {
      const cert = readFileSync(resolve(certPath))
      const key = readFileSync(resolve(keyPath))
      return { cert, key }
    } catch (err) {
      logger.error('Failed to load TLS certificate or private key files:', err?.message || err)
      return null
    }
  }

  return null
}

/**
 * Creates and configures the complete Wifora streaming server instance.
 * Supports both HTTP/WS (LAN default) and HTTPS/WSS (hardened TLS mode).
 *
 * @param {Object} [options]
 * @param {number} [options.port]
 * @param {string} [options.publicDir]
 * @param {number} [options.maxListeners]
 * @param {number} [options.maxSignalBytes]
 * @param {number} [options.roomGraceMs]
 * @param {number} [options.pingIntervalMs]
 * @param {Object} [options.tls] - Optional TLS options { cert, key, certPath, keyPath }
 * @param {Object} [options.rateLimiters] - Optional custom rate limiters
 * @param {Object} [options.logger]
 * @param {boolean} [options.enableDiscovery] - Publish _wifora._tcp via mDNS/Bonjour
 * @param {Object} [options.discoveryPublisher] - Optional mDNS publisher, primarily for embedding/testing
 * @returns {Object} Server instance controller
 */
export function createWiforaServer(options = {}) {
  const log = options.logger || logger
  const serverPort = options.port !== undefined ? Number(options.port) : defaultPort
  const serverPublicDir = options.publicDir || publicDir
  const maxListeners =
    options.maxListeners !== undefined
      ? Math.min(32, Math.max(1, Math.floor(Number(options.maxListeners))))
      : MAX_LISTENERS
  const maxSignalBytes = options.maxSignalBytes ?? MAX_SIGNAL_BYTES
  const roomGraceMs = options.roomGraceMs ?? ROOM_GRACE_MS
  const pingIntervalMs = options.pingIntervalMs || 10_000
  const isTestRuntime = process.argv.includes('--test') || process.execArgv.includes('--test')
  const enableDiscovery = options.enableDiscovery ?? !isTestRuntime
  const discovery = options.discoveryPublisher || createDiscoveryPublisher({ logger: log })

  // 1. Initialize Room State Manager
  const roomManager = createRoomManager({
    logger: log,
    roomGraceMs,
  })

  // 2. Initialize HTTP Request Handler
  const httpHandler = createHttpHandler({
    roomManager,
    publicDir: serverPublicDir,
    port: serverPort,
    discovery,
    logger: log,
  })

  const tlsConfig = resolveTlsConfig(options.tls)
  const isHttps = Boolean(tlsConfig)
  const server = isHttps ? createHttpsServer(tlsConfig, httpHandler) : createHttpServer(httpHandler)

  // 3. Initialize WebSocket Signaling Server
  const signaling = createSignalingServer({
    server,
    roomManager,
    port: serverPort,
    maxListeners,
    maxSignalBytes,
    pingIntervalMs,
    rateLimiters: options.rateLimiters,
    logger: log,
  })

  async function close() {
    await discovery.close()
    await signaling.close()
    return new Promise((res) => {
      server.close(() => res())
    })
  }

  return {
    server,
    wss: signaling.wss,
    rooms: roomManager.rooms,
    closeRoom: roomManager.closeRoom,
    removeClient: roomManager.removeClient,
    scheduleRoomCleanup: roomManager.scheduleRoomCleanup,
    isHttps,
    discovery,
    close,
    listen: (customPort, host = '0.0.0.0') =>
      new Promise((res) => {
        server.listen(customPort ?? serverPort, host, () => {
          const addr = server.address()
          const scheme = isHttps ? 'https' : 'http'
          if (enableDiscovery) {
            try {
              discovery.publish({ port: addr.port, secure: isHttps })
            } catch (error) {
              log.warn(`mDNS discovery unavailable: ${error?.message || error}`)
            }
          }
          log.info(`Wifora (${scheme.toUpperCase()} mode) listening on ${addr.address}:${addr.port}`)
          res(addr)
        })
      }),
  }
}

// Auto-start standalone server if executed directly via node server.mjs
const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectExecution) {
  const instance = createWiforaServer()
  instance.listen().then((addr) => {
    const port = addr.port
    const scheme = instance.isHttps ? 'https' : 'http'
    logger.info(`Wifora ready at ${scheme}://localhost:${port}/host.html`)
    const addresses = getLanAddresses()
    if (addresses.length) logger.info(`Open on your smartphone: ${scheme}://${addresses[0]}:${port}/listen.html`)
    else logger.warn('No Wi-Fi or Ethernet address detected.')
  })

  function gracefulShutdown() {
    logger.info('Shutting down Wifora gracefully...')
    instance.close().then(() => process.exit(0))
    setTimeout(() => process.exit(0), 800).unref()
  }

  process.on('SIGTERM', gracefulShutdown)
  process.on('SIGINT', gracefulShutdown)
}
