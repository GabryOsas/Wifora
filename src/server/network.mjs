import { networkInterfaces } from 'node:os'

/**
 * Discovers and prioritizes IPv4 LAN network interfaces, filtering out
 * virtual adapters, VPNs, tunnels, and loopback addresses.
 *
 * @returns {string[]} Ordered array of private LAN IP addresses.
 */
export function getLanAddresses() {
  const preferred = []
  const fallback = []
  const virtualAdapter =
    /(cloudflare|warp|vpn|virtual|loopback|tunnel|tap|wintun|tailscale|zerotier|docker|hyper-v|vmware|vbox)/i

  for (const [name, interfaces] of Object.entries(networkInterfaces())) {
    if (virtualAdapter.test(name)) continue
    for (const item of interfaces || []) {
      if (item.family !== 'IPv4' || item.internal || item.address.startsWith('169.254.')) continue
      const isPrivateLan = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address)
      ;(isPrivateLan ? preferred : fallback).push(item.address)
    }
  }

  return [...preferred, ...fallback]
}
