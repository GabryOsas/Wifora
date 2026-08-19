import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createDiscoveryPublisher } from '../src/server/discovery.mjs'
import { createWiforaServer } from '../server.mjs'

test('mDNS publisher advertises Wifora capabilities and cleans up its service', async () => {
  const calls = []
  class FakeBonjour {
    publish(options) {
      calls.push(['publish', options])
      return new EventEmitter()
    }
    destroy(done) {
      calls.push(['destroy'])
      done()
    }
  }
  const publisher = createDiscoveryPublisher({ BonjourImpl: FakeBonjour, hostname: 'Studio-PC' })
  const snapshot = publisher.publish({ port: 3975, secure: false })
  assert.equal(snapshot.published, true)
  assert.equal(snapshot.serviceType, '_wifora._tcp.local')
  assert.equal(calls[0][1].name, 'Wifora (Studio-PC:3975)')
  assert.deepEqual(calls[0][1].txt, {
    version: '1',
    path: '/listen.html',
    transport: 'http',
    capabilities: 'webrtc,opus,qr',
  })

  await publisher.close()
  assert.equal(publisher.snapshot().published, false)
  assert.deepEqual(calls.at(-1), ['destroy'])
})

test('Wifora starts and stops the injected discovery publisher with its HTTP server', async () => {
  const calls = []
  const discoveryPublisher = {
    publish(options) {
      calls.push(['publish', options])
    },
    close: async () => calls.push(['close']),
    snapshot: () => ({ enabled: true, published: calls.some(([type]) => type === 'publish') }),
  }
  const app = createWiforaServer({ port: 0, enableDiscovery: true, discoveryPublisher })
  const address = await app.listen(0, '127.0.0.1')
  assert.deepEqual(calls[0], ['publish', { port: address.port, secure: false }])
  await app.close()
  assert.deepEqual(calls.at(-1), ['close'])
})
