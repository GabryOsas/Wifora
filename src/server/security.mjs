import { timingSafeEqual } from 'node:crypto'
import { KEY_PATTERN, LISTENER_TOKEN_PATTERN, DEFAULT_PORT } from '../shared/constants.mjs'
import { getLanAddresses } from './network.mjs'

/**
 * Timing-safe validation of the 43-character base64url host key.
 * Prevents side-channel timing attacks on host authorization.
 *
 * @param {string} received - Received host key from client.
 * @param {string} expected - Expected host key registered for the room.
 * @returns {boolean} True if keys match exactly.
 */
export function validHostKey(received, expected) {
  if (!KEY_PATTERN.test(received || '') || !expected) return false
  const bufA = Buffer.from(received)
  const bufB = Buffer.from(expected)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Timing-safe validation of the 22-character base64url listener token.
 * Prevents unauthorized listeners without access token.
 *
 * @param {string} received - Received listener token from client.
 * @param {string} expected - Expected listener token registered for the room.
 * @returns {boolean} True if tokens match exactly.
 */
export function validListenerToken(received, expected) {
  if (!LISTENER_TOKEN_PATTERN.test(received || '') || !expected) return false
  const bufA = Buffer.from(received)
  const bufB = Buffer.from(expected)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Applies strict HTTP security headers (CSP, CORP, Permissions-Policy, HSTS-like options).
 *
 * @param {import('node:http').ServerResponse} response
 */
export function setSecurityHeaders(response) {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; script-src 'self'; style-src 'self'; base-uri 'self'; form-action 'self'"
  )
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

/**
 * Validates request Origin header against localhost and active LAN IP addresses.
 * Supports both http and https protocols.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {number} [expectedPort=DEFAULT_PORT]
 * @returns {boolean} True if origin is legitimate local client.
 */
export function isAllowedOrigin(request, expectedPort = DEFAULT_PORT) {
  try {
    const origin = new URL(request.headers.origin || '')
    const allowedHosts = new Set(['localhost', '127.0.0.1', ...getLanAddresses()])
    const targetPort = String(expectedPort)
    const isStandardPort =
      !origin.port &&
      ((origin.protocol === 'http:' && (targetPort === '80' || targetPort === '')) ||
        (origin.protocol === 'https:' && (targetPort === '443' || targetPort === '')))
    const matchesPort = origin.port === targetPort || isStandardPort
    const isAllowedProtocol = origin.protocol === 'http:' || origin.protocol === 'https:'
    return isAllowedProtocol && matchesPort && allowedHosts.has(origin.hostname)
  } catch {
    return false
  }
}
