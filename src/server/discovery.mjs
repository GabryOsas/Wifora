import { hostname as getHostname } from 'node:os'
import { Bonjour } from 'bonjour-service'

export const WIFORA_SERVICE_TYPE = 'wifora'
export const WIFORA_PROTOCOL_VERSION = '1'

/** Publishes the Wifora host on the local multicast-DNS/Bonjour domain. */
export function createDiscoveryPublisher({ BonjourImpl = Bonjour, logger = console, hostname = getHostname() } = {}) {
  let bonjour = null
  let service = null
  let state = { enabled: false, published: false }

  function publish({ port, secure = false, capabilities = ['webrtc', 'opus', 'qr'] } = {}) {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new RangeError('port must be a valid TCP port')
    if (service) return snapshot()
    bonjour = new BonjourImpl({}, (error) => logger.warn?.(`mDNS unavailable: ${error?.message || error}`))
    // Include the bound port so a second Wifora host on the same PC does not
    // collide with an existing Bonjour record during development or testing.
    const name = `Wifora (${hostname}:${port})`
    service = bonjour.publish({
      name,
      type: WIFORA_SERVICE_TYPE,
      protocol: 'tcp',
      port,
      txt: {
        version: WIFORA_PROTOCOL_VERSION,
        path: '/listen.html',
        transport: secure ? 'https' : 'http',
        capabilities: capabilities.join(','),
      },
    })
    service.on?.('error', (error) => logger.warn?.(`mDNS publication failed: ${error?.message || error}`))
    state = { enabled: true, published: true, name, port, secure, capabilities: [...capabilities] }
    return snapshot()
  }

  async function close() {
    const activeService = service
    const activeBonjour = bonjour
    service = null
    bonjour = null
    state = { enabled: state.enabled, published: false }
    if (activeService?.stop) {
      await new Promise((resolve) => activeService.stop(resolve))
    }
    if (activeBonjour?.destroy) {
      await new Promise((resolve) => activeBonjour.destroy(resolve))
    }
  }

  function snapshot() {
    return { ...state, serviceType: `_${WIFORA_SERVICE_TYPE}._tcp.local` }
  }

  return { publish, close, snapshot }
}
