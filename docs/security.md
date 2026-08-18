# Wifora Security Model & Privacy Architecture

This document describes the security controls, authentication mechanisms, network boundaries, and hardening policies implemented in Wifora.

---

## 1. Zero-Cloud & Local-Only Architecture

Wifora is engineered with strict **zero-cloud privacy**:
- **No Cloud Signaling Servers**: WebRTC signaling is negotiated entirely over the host's local Node.js server within the home or office LAN subnet.
- **No External STUN / TURN Relays**: ICE servers are explicitly configured with an empty array (`iceServers: []`). Media packets never traverse external internet relays or third-party cloud infrastructure.
- **No Telemetry / Analytics / Tracking**: Wifora contains zero third-party tracking scripts, cookies, or remote analytics endpoints.

---

## 2. Authentication & Room Protection

### Constant-Time Host Key Validation
When a host creates or re-attaches to a room, authentication is verified using cryptographic timing-safe comparisons via `crypto.timingSafeEqual`:

```javascript
export function validHostKey(received, expected) {
  if (!KEY_PATTERN.test(received || '') || !expected) return false
  const bufA = Buffer.from(received)
  const bufB = Buffer.from(expected)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
```

This prevents side-channel timing attacks from discovering room keys.

### Strict Input Sanitization & RegEx Validation
All signaling parameters are strictly validated against restrictive regular expressions:
- **Room IDs**: `^[A-Z0-9]{8}$` (8 uppercase alphanumeric characters)
- **Host Keys**: `^[A-Za-z0-9_-]{43}$` (43 URL-safe base64 characters)
- **Device Names**: Sanitized to Unicode alphanumeric and safe punctuation with a 60-character maximum length.
- **Device Types**: Whitelisted to `['phone', 'tablet', 'desktop']`.

---

## 3. HTTP Hardening & Content Security Policy (CSP)

All HTTP responses served by Wifora include strict security headers:

```http
Content-Security-Policy: default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; script-src 'self'; style-src 'self'; base-uri 'self'; form-action 'self'
Cross-Origin-Resource-Policy: same-origin
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Path Traversal Defense
The static file server normalizes requested paths, strips leading slashes, and verifies that the resolved file path strictly resides within the `public/` directory:
- Rejects requests containing `..` or `%2e%2e` with `403 Forbidden`.
- Restricts served MIME types to a strict whitelist (`.html`, `.js`, `.css`, `.png`).

---

## 4. Origin Verification & WebSocket Upgrade Filtering

WebSocket upgrade requests are verified against allowed origins (localhost, 127.0.0.1, and detected active LAN IPv4 addresses on the designated port):

```javascript
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
```

Cross-site WebSocket hijacking (CSWSH) attempts from malicious external web pages opened in the user's browser are immediately rejected and destroyed.

---

## 5. Rate Limiting & Resource Protection

- **Maximum Payload Size**: WebSocket signal messages exceeding `24,000` bytes trigger immediate socket termination (`1009 Message Too Large`).
- **QR Code Endpoint**: Input string length is capped at 2,048 characters.
- **Listener Room Limits**: Rooms enforce a strict configurable capacity (`MAX_LISTENERS`, default 5, max 32) to prevent denial of service and Wi-Fi airtime saturation.
- **Graceful Cleanup Timers**: Orphaned rooms and disconnected peers are automatically reclaimed after defined grace periods (5s for abnormal peer disconnects, 60s for host room cleanup).
