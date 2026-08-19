import { readFile } from 'node:fs/promises'
import { extname, normalize, relative, resolve, isAbsolute } from 'node:path'
import QRCode from 'qrcode'
import { contentTypes, DEFAULT_PORT, PUBLIC_DIR } from '../shared/constants.mjs'
import { getLanAddresses } from './network.mjs'
import { setSecurityHeaders } from './security.mjs'

/**
 * Creates the HTTP request listener for Wifora.
 *
 * @param {Object} options
 * @param {import('./rooms.mjs').createRoomManager} options.roomManager - Active RoomManager instance
 * @param {string} [options.publicDir] - Path to public static directory
 * @param {number} [options.port] - Default/bound server port
 * @param {Object} [options.logger] - Logger instance
 * @returns {import('node:http').RequestListener} HTTP request handler
 */
export function createHttpHandler(options = {}) {
  const { roomManager, publicDir = PUBLIC_DIR, port = DEFAULT_PORT, discovery, logger: _logger = console } = options
  const rooms = roomManager?.rooms || new Map()

  return async function requestListener(request, response) {
    setSecurityHeaders(response)
    const hostHeader = request.headers.host || 'localhost'
    const activePort = request.socket?.localPort || port
    const url = new URL(request.url, `http://${hostHeader}`)

    if (url.pathname === '/api/network') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      })
      response.end(JSON.stringify({ port: activePort, addresses: getLanAddresses() }))
      return
    }

    if (url.pathname === '/api/capabilities') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      })
      response.end(
        JSON.stringify({
          protocolVersion: 1,
          transports: ['webrtc'],
          discovery: discovery?.snapshot?.() || { enabled: false, published: false },
          browserDiscovery: false,
          browserDiscoveryNote:
            'Safari and other browsers cannot browse LAN mDNS services directly; use QR or the LAN URL.',
        })
      )
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
              roomManager?.send(room.host, {
                type: 'listener-left',
                clientId: listener.clientId,
                sessionId: targetSessionId,
                voluntary: true,
              })
              try {
                listener.close(1000, 'Listener left')
              } catch {}
              if (!room.host && room.listeners.size === 0) roomManager?.closeRoom(targetRoomId)
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
      response.writeHead(302, { Location: targetUrl, 'Cache-Control': 'no-cache' })
      response.end()
      return
    }

    if (request.url.includes('..') || request.url.toLowerCase().includes('%2e%2e')) {
      response.writeHead(403)
      response.end('Forbidden')
      return
    }

    let requested = url.pathname
    try {
      requested = decodeURIComponent(url.pathname)
    } catch {}
    const safePath = normalize(requested).replace(/^([/\\])+/, '')
    const target = resolve(publicDir, safePath)
    const pathFromPublic = relative(publicDir, target)

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
        'cache-control': cacheControl,
      })
      response.end(file)
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
  }
}
