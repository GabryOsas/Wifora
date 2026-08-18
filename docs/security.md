# Wifora Security Model & Privacy Architecture

This document describes the security controls, authentication mechanisms, network boundaries, and hardening policies implemented in Wifora.

---

## 1. Transport Security Model & Network Boundaries

Wifora distinguishes clearly between **Media Transport** and **Signaling Transport**:

```
┌────────────────────────────────────────────────────────┐
│                   MEDIA LAYER (Audio)                  │
│  - WebRTC DTLS-SRTP Mandatory End-to-End Encryption    │
│  - Direct Peer-to-Peer over Local LAN Subnet           │
│  - Empty ICE Relays (iceServers: [])                   │
└────────────────────────────────────────────────────────┘
                           ▲
                           │
┌────────────────────────────────────────────────────────┐
│                 SIGNALING & HTTP LAYER                 │
│  - Standard Mode: Local HTTP & ws:// over LAN Subnet   │
│  - Hardened Mode: Optional HTTPS & wss:// with TLS     │
│  - Origin Header Verification & Rate Limiting          │
└────────────────────────────────────────────────────────┘
```

- **WebRTC Media Transport**: The Opus audio stream is always encrypted end-to-end between the host PC and each connected receiver using **DTLS 1.2 / 1.3** and **SRTP** (AES-GCM / AES-CTR) in compliance with the W3C WebRTC security specifications.
- **Signaling Transport**: Signaling messages (SDP offer/answer and ICE candidate exchange) are transferred over the local network via HTTP and WebSockets.
  - **Standard LAN Mode (Default)**: Uses `http://` and `ws://` for zero-configuration, plug-and-play local streaming.
  - **Hardened TLS Mode (Optional)**: Can be activated with `WIFORA_TLS_CERT` and `WIFORA_TLS_KEY` to provide full transport-layer encryption (`https://` and `wss://`).
- **Zero-Cloud & No Relays**: `iceServers: []` guarantees no audio packets traverse public STUN/TURN servers or cloud intermediaries.
- **Zero Telemetry / Tracking**: Wifora contains zero analytics trackers, third-party beacons, or telemetry endpoints.

---

## 2. Authentication & Room Protection

### Constant-Time Host Key Verification

When a host creates a streaming room, a 43-character URL-safe cryptographic key (`hostKey`) is generated. When reconnecting or managing the room, the key is verified in constant time via `crypto.timingSafeEqual`:

```javascript
export function validHostKey(received, expected) {
  if (!KEY_PATTERN.test(received || '') || !expected) return false
  const bufA = Buffer.from(received)
  const bufB = Buffer.from(expected)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
```

This prevents side-channel timing attacks from discovering room credentials.

### Listener Token Authentication

To prevent unauthorized devices on the local LAN from eavesdropping on active rooms by guessing the 8-character room code, Wifora generates a cryptographically secure 22-character `listenerToken` (16 random bytes):

1. The token is embedded directly in the listener URL and QR code (`?room=ABCD1234&token=...`).
2. The listener client sends this token in its `register` message.
3. The server validates the token against the room's secret token via constant-time comparison (`validListenerToken`).

```javascript
export function validListenerToken(received, expected) {
  if (!LISTENER_TOKEN_PATTERN.test(received || '') || !expected) return false
  const bufA = Buffer.from(received)
  const bufB = Buffer.from(expected)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
```

### Strict Input Sanitization & RegEx Validation

All signaling parameters are strictly validated against restrictive regular expressions:

- **Room IDs**: `^[A-Z0-9]{8}$` (8 uppercase alphanumeric characters)
- **Host Keys**: `^[A-Za-z0-9_-]{43}$` (43 URL-safe base64 characters)
- **Listener Tokens**: `^[A-Za-z0-9_-]{22}$` (22 URL-safe base64 characters)
- **Device Names**: Sanitized to Unicode alphanumeric and safe punctuation with a 60-character maximum length.
- **Device Types**: Whitelisted to `['phone', 'tablet', 'desktop']`.

---

## 3. IP Rate Limiting & Resource Protection

Wifora incorporates in-memory sliding-window rate limiters per IP to guard against denial of service and brute-force attempts:

- **WebSocket Connection Rate Limiter**: Limits connection upgrade requests per IP (default max 30 per 10-second window).
- **Room Miss Rate Limiter**: Detects and throttles consecutive join attempts targeting non-existent rooms (default max 8 misses per 30 seconds). Exceeding this closes the connection with code `1008`.
- **Authentication Failure Limiter**: Throttles repeated failed host key or listener token attempts (default max 10 per 30 seconds).
- **Maximum Payload Size**: Messages exceeding `24,000` bytes trigger immediate socket termination (`1009 Message Too Large`).
- **Listener Room Limits**: Rooms enforce a strict configurable capacity (`MAX_LISTENERS`, default 5, max 32) to prevent Wi-Fi airtime saturation.
- **Graceful Cleanup Timers**: Orphaned rooms and disconnected peers are automatically reclaimed after defined grace periods.

---

## 4. HTTP Hardening & Content Security Policy (CSP)

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
- Restricts served MIME types to a strict whitelist (`.html`, `.js`, `.css`, `.png`, `.json`, `.svg`, `.ico`).

---

## 5. Origin Verification & WebSocket Upgrade Filtering

WebSocket upgrade requests are verified against allowed origins (localhost, 127.0.0.1, and detected active LAN IPv4 addresses on the designated port for both `http:` and `https:`):

```javascript
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
```

Cross-site WebSocket hijacking (CSWSH) attempts from malicious external web pages opened in the user's browser are immediately rejected and destroyed.

---

## 6. Privacy & Data Minimization in Logging

Wifora enforces strict privacy boundaries in its client and server loggers:

- **No Secret Leakage**: `hostKey` and `listenerToken` values are never logged in console or debug logs.
- **No Full SDP / ICE Credential Dumps**: WebRTC session descriptions (SDP) and raw ICE credentials are never printed to logs.
- **Minimized Device Metadata**: Device telemetry is kept strictly in-memory for the duration of the session and never persisted to disk.
