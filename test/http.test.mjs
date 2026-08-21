import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createWiforaServer } from '../server.mjs'

function request(baseUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(baseUrl)
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: path,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks)
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: bodyBuffer.toString('utf8'),
            rawBody: bodyBuffer,
          })
        })
      }
    )
    req.on('error', reject)
    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

test('HTTP API Endpoints & Static Serving', async (t) => {
  const app = createWiforaServer({ port: 0 })
  const addr = await app.listen(0, '127.0.0.1')
  const baseUrl = `http://127.0.0.1:${addr.port}`

  t.after(async () => {
    await app.close()
  })

  await t.test('GET /api/network returns current port and network interfaces', async () => {
    const res = await request(baseUrl, '/api/network')
    assert.strictEqual(res.statusCode, 200)
    assert.match(res.headers['content-type'], /application\/json/)

    const data = JSON.parse(res.body)
    assert.strictEqual(data.port, addr.port)
    assert.ok(Array.isArray(data.addresses))
  })

  await t.test('GET /api/capabilities reports discovery and browser fallback accurately', async () => {
    const res = await request(baseUrl, '/api/capabilities')
    assert.strictEqual(res.statusCode, 200)
    const data = JSON.parse(res.body)
    assert.deepEqual(data.transports, ['webrtc'])
    assert.equal(data.browserDiscovery, false)
    assert.equal(data.discovery.published, true)
  })

  await t.test('GET /qr generates PNG QR code for valid text', async () => {
    const res = await request(baseUrl, '/qr?text=http%3A%2F%2Flocalhost%3A3975%2Flisten.html')
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['content-type'], 'image/png')
    assert.ok(res.rawBody.length > 50, 'QR image buffer should not be empty')
    // Check PNG signature: 0x89, 0x50, 0x4E, 0x47
    assert.strictEqual(res.rawBody[0], 0x89)
    assert.strictEqual(res.rawBody[1], 0x50)
    assert.strictEqual(res.rawBody[2], 0x4e)
    assert.strictEqual(res.rawBody[3], 0x47)
  })

  await t.test('GET /qr rejects missing or excessive text length', async () => {
    const missingRes = await request(baseUrl, '/qr')
    assert.strictEqual(missingRes.statusCode, 400)

    const longText = 'x'.repeat(2049)
    const longRes = await request(baseUrl, `/qr?text=${longText}`)
    assert.strictEqual(longRes.statusCode, 400)
  })

  await t.test('POST /api/leave handles voluntary leave beacon', async () => {
    const res = await request(baseUrl, '/api/leave', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: 'TEST1234', sessionId: 'sess-1' }),
    })
    assert.strictEqual(res.statusCode, 204)
  })

  await t.test('POST /api/leave handles malformed JSON without crashing', async () => {
    const res = await request(baseUrl, '/api/leave', {
      method: 'POST',
      body: 'invalid-json-payload',
    })
    assert.strictEqual(res.statusCode, 204)
  })

  await t.test('GET / redirects desktop browsers to /host.html', async () => {
    const res = await request(baseUrl, '/', {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
    })
    assert.strictEqual(res.statusCode, 302)
    assert.match(res.headers.location, /\/host\.html/)
  })

  await t.test('GET / redirects mobile browsers to /listen.html', async () => {
    const res = await request(baseUrl, '/', {
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      },
    })
    assert.strictEqual(res.statusCode, 302)
    assert.match(res.headers.location, /\/listen\.html/)
  })

  await t.test('Static files are served with correct MIME types and security headers', async () => {
    const resHost = await request(baseUrl, '/host.html')
    assert.strictEqual(resHost.statusCode, 200)
    assert.match(resHost.headers['content-type'], /text\/html/)
    assert.strictEqual(resHost.headers['x-frame-options'], 'DENY')
    assert.strictEqual(resHost.headers['x-content-type-options'], 'nosniff')
    assert.doesNotMatch(resHost.body, /\sstyle\s*=/i, 'Host markup must not require inline styles under the CSP')

    const resListen = await request(baseUrl, '/listen.html')
    assert.strictEqual(resListen.statusCode, 200)
    assert.doesNotMatch(resListen.body, /\sstyle\s*=/i, 'Listener markup must not require inline styles under the CSP')

    const resCss = await request(baseUrl, '/styles.css')
    assert.strictEqual(resCss.statusCode, 200)
    assert.match(resCss.headers['content-type'], /text\/css/)

    const resTransportPolicy = await request(baseUrl, '/transport-policy.js')
    assert.strictEqual(resTransportPolicy.statusCode, 200)
    assert.match(resTransportPolicy.headers['content-type'], /text\/javascript/)
    assert.match(resTransportPolicy.body, /export class TransportPolicy/)

    const resNativeWorklet = await request(baseUrl, '/native-audio-worklet.js')
    assert.strictEqual(resNativeWorklet.statusCode, 200)
    assert.match(resNativeWorklet.body, /registerProcessor\('wifora-native-pcm'/)

    const resNotFound = await request(baseUrl, '/nonexistent.file')
    assert.strictEqual(resNotFound.statusCode, 404)
  })

  await t.test('Directory traversal attempts return 403 Forbidden', async () => {
    const res = await request(baseUrl, '/%2e%2e/package.json')
    assert.strictEqual(res.statusCode, 403)
  })
})
