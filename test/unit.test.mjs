import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROOM_PATTERN,
  KEY_PATTERN,
  LISTENER_TOKEN_PATTERN,
  validHostKey,
  validListenerToken,
  isAllowedOrigin,
  getLanAddresses,
  setSecurityHeaders,
  DEFAULT_MAX_LISTENERS,
  MAX_LISTENERS,
  MAX_SIGNAL_BYTES,
  ROOM_GRACE_MS,
} from '../server.mjs'
import { createRateLimiter } from '../src/server/rate-limiter.mjs'

test('Constants & Patterns', async (t) => {
  await t.test('Room code pattern validation', () => {
    // Valid room codes: 8 characters, uppercase alphanumeric
    assert.strictEqual(ROOM_PATTERN.test('ABCD1234'), true)
    assert.strictEqual(ROOM_PATTERN.test('12345678'), true)
    assert.strictEqual(ROOM_PATTERN.test('XXXXXXXX'), true)

    // Invalid room codes
    assert.strictEqual(ROOM_PATTERN.test('abcd1234'), false, 'Lowercase should be rejected')
    assert.strictEqual(ROOM_PATTERN.test('ABC12'), false, 'Too short')
    assert.strictEqual(ROOM_PATTERN.test('ABCD12345'), false, 'Too long')
    assert.strictEqual(ROOM_PATTERN.test('ABCD-123'), false, 'Hyphen rejected')
    assert.strictEqual(ROOM_PATTERN.test(''), false, 'Empty string rejected')
  })

  await t.test('Host key pattern validation', () => {
    const validKey = 'a'.repeat(43)
    const validKeyUrlSafe = 'A1_b2-c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u'
    assert.strictEqual(validKeyUrlSafe.length, 43)
    assert.strictEqual(KEY_PATTERN.test(validKey), true)
    assert.strictEqual(KEY_PATTERN.test(validKeyUrlSafe), true)

    assert.strictEqual(KEY_PATTERN.test('a'.repeat(42)), false, '42 chars is too short')
    assert.strictEqual(KEY_PATTERN.test('a'.repeat(44)), false, '44 chars is too long')
    assert.strictEqual(KEY_PATTERN.test('a'.repeat(42) + '!'), false, 'Special character ! rejected')
    assert.strictEqual(KEY_PATTERN.test(''), false, 'Empty key rejected')
  })

  await t.test('Listener token pattern validation', () => {
    const validToken = 'a'.repeat(22)
    const validTokenUrlSafe = 'A1_b2-c3d4e5f6g7h8i9j0'
    assert.strictEqual(validTokenUrlSafe.length, 22)
    assert.strictEqual(LISTENER_TOKEN_PATTERN.test(validToken), true)
    assert.strictEqual(LISTENER_TOKEN_PATTERN.test(validTokenUrlSafe), true)

    assert.strictEqual(LISTENER_TOKEN_PATTERN.test('a'.repeat(21)), false, '21 chars is too short')
    assert.strictEqual(LISTENER_TOKEN_PATTERN.test('a'.repeat(23)), false, '23 chars is too long')
    assert.strictEqual(LISTENER_TOKEN_PATTERN.test('a'.repeat(21) + '!'), false, 'Special character ! rejected')
    assert.strictEqual(LISTENER_TOKEN_PATTERN.test(''), false, 'Empty token rejected')
  })

  await t.test('Default configuration constants', () => {
    assert.strictEqual(DEFAULT_MAX_LISTENERS, 5, 'Default max listeners should be 5')
    assert.strictEqual(MAX_LISTENERS, 5, 'MAX_LISTENERS should default to 5')
    assert.strictEqual(MAX_SIGNAL_BYTES, 24_000, 'Max signal bytes should be 24KB')
    assert.strictEqual(ROOM_GRACE_MS, 60_000, 'Room grace MS should be 60 seconds')
  })
})

test('validHostKey timing-safe verification', async (t) => {
  const keyA = 'K'.repeat(43)
  const keyB = 'K'.repeat(42) + 'Z'

  await t.test('Correct host key matches', () => {
    assert.strictEqual(validHostKey(keyA, keyA), true)
  })

  await t.test('Mismatched host key fails', () => {
    assert.strictEqual(validHostKey(keyB, keyA), false)
  })

  await t.test('Invalid pattern or empty keys fail', () => {
    assert.strictEqual(validHostKey('', keyA), false)
    assert.strictEqual(validHostKey(null, keyA), false)
    assert.strictEqual(validHostKey(undefined, keyA), false)
    assert.strictEqual(validHostKey('short', 'short'), false)
  })
})

test('validListenerToken timing-safe verification', async (t) => {
  const tokenA = 'T'.repeat(22)
  const tokenB = 'T'.repeat(21) + 'X'

  await t.test('Correct listener token matches', () => {
    assert.strictEqual(validListenerToken(tokenA, tokenA), true)
  })

  await t.test('Mismatched listener token fails', () => {
    assert.strictEqual(validListenerToken(tokenB, tokenA), false)
  })

  await t.test('Invalid pattern or empty tokens fail', () => {
    assert.strictEqual(validListenerToken('', tokenA), false)
    assert.strictEqual(validListenerToken(null, tokenA), false)
    assert.strictEqual(validListenerToken(undefined, tokenA), false)
    assert.strictEqual(validListenerToken('short', 'short'), false)
  })
})

test('createRateLimiter functionality', async (t) => {
  await t.test('Allows requests within limit and blocks on limit reached', () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxHits: 3 })
    const ip = '192.168.1.50'

    assert.strictEqual(limiter.check(ip), true)
    assert.strictEqual(limiter.check(ip), true)
    assert.strictEqual(limiter.check(ip), true)
    assert.strictEqual(limiter.check(ip), false, '4th request should be blocked')

    limiter.reset(ip)
    assert.strictEqual(limiter.check(ip), true, 'Should allow after reset')
    limiter.close()
  })

  await t.test('Allows requests from different IPs independently', () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxHits: 2 })
    const ip1 = '192.168.1.10'
    const ip2 = '192.168.1.20'

    assert.strictEqual(limiter.check(ip1), true)
    assert.strictEqual(limiter.check(ip1), true)
    assert.strictEqual(limiter.check(ip1), false)

    assert.strictEqual(limiter.check(ip2), true)
    assert.strictEqual(limiter.check(ip2), true)
    limiter.close()
  })
})

test('isAllowedOrigin verification', async (t) => {
  const testPort = 3975

  await t.test('Localhost and 127.0.0.1 on target port are allowed for http and https', () => {
    const reqHttpLocalhost = { headers: { origin: `http://localhost:${testPort}` } }
    const reqHttpsLocalhost = { headers: { origin: `https://localhost:${testPort}` } }
    const reqHttpLoopback = { headers: { origin: `http://127.0.0.1:${testPort}` } }

    assert.strictEqual(isAllowedOrigin(reqHttpLocalhost, testPort), true)
    assert.strictEqual(isAllowedOrigin(reqHttpsLocalhost, testPort), true)
    assert.strictEqual(isAllowedOrigin(reqHttpLoopback, testPort), true)
  })

  await t.test('LAN IP on target port is allowed if detected', () => {
    const lan = getLanAddresses()
    if (lan.length > 0) {
      const reqLan = { headers: { origin: `http://${lan[0]}:${testPort}` } }
      assert.strictEqual(isAllowedOrigin(reqLan, testPort), true)
    }
  })

  await t.test('Wrong port is rejected', () => {
    const reqWrongPort = { headers: { origin: 'http://localhost:8080' } }
    assert.strictEqual(isAllowedOrigin(reqWrongPort, testPort), false)
  })

  await t.test('Unauthorized domain is rejected', () => {
    const reqEvil = { headers: { origin: `http://attacker-site.com:${testPort}` } }
    assert.strictEqual(isAllowedOrigin(reqEvil, testPort), false)
  })

  await t.test('Malformed or missing origin header is rejected', () => {
    assert.strictEqual(isAllowedOrigin({ headers: {} }, testPort), false)
    assert.strictEqual(isAllowedOrigin({ headers: { origin: 'invalid-url' } }, testPort), false)
  })
})

test('getLanAddresses interface filtering', () => {
  const addresses = getLanAddresses()
  assert.ok(Array.isArray(addresses))
  for (const addr of addresses) {
    assert.ok(!addr.startsWith('127.'), 'Should not contain loopback 127.x')
    assert.ok(!addr.startsWith('169.254.'), 'Should not contain link-local 169.254.x')
    assert.match(addr, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'Must be IPv4 formatted')
  }
})

test('setSecurityHeaders applies strict HTTP security headers', () => {
  const headers = {}
  const mockRes = {
    setHeader(name, val) {
      headers[name.toLowerCase()] = val
    },
  }

  setSecurityHeaders(mockRes)

  assert.ok(headers['content-security-policy'], 'CSP must be set')
  assert.strictEqual(headers['x-content-type-options'], 'nosniff')
  assert.strictEqual(headers['x-frame-options'], 'DENY')
  assert.strictEqual(headers['cross-origin-resource-policy'], 'same-origin')
  assert.strictEqual(headers['referrer-policy'], 'no-referrer')
  assert.strictEqual(headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()')
})
