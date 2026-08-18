/**
 * In-memory sliding window rate limiter for IP address throttling.
 *
 * @param {Object} [options]
 * @param {number} [options.windowMs=60000] - Window duration in milliseconds.
 * @param {number} [options.maxHits=30] - Max allowed requests per window.
 * @param {number} [options.cleanupIntervalMs=60000] - Interval for purging expired entries.
 * @returns {Object} RateLimiter instance
 */
export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60_000
  const maxHits = options.maxHits || 30
  const cleanupIntervalMs = options.cleanupIntervalMs || 60_000

  const store = new Map()

  function check(ip) {
    if (!ip) return true
    const now = Date.now()
    const entry = store.get(ip)

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs })
      return true
    }

    if (entry.count < maxHits) {
      entry.count += 1
      return true
    }

    return false
  }

  function reset(ip) {
    if (ip) store.delete(ip)
  }

  function cleanup() {
    const now = Date.now()
    for (const [ip, entry] of store.entries()) {
      if (now > entry.resetAt) {
        store.delete(ip)
      }
    }
  }

  const cleanupTimer = setInterval(cleanup, cleanupIntervalMs)
  cleanupTimer.unref?.()

  function close() {
    clearInterval(cleanupTimer)
    store.clear()
  }

  return {
    check,
    reset,
    cleanup,
    close,
    get size() {
      return store.size
    },
  }
}
