/* ==========================================================================
   WIFORA DEVICE DETECTOR & HARDWARE PROFILER
   Accurate Real Device Name, Model Identification and Classification
   ========================================================================== */

/**
 * Detects device info including classification ('phone' | 'tablet' | 'desktop')
 * and a human-readable real model name (e.g. "Apple iPhone 15 Pro (iOS 18)", "Samsung Galaxy S24 (SM-S928B)", "Apple iPad Pro", "Tablet Android (Galaxy Tab S9)").
 */
export async function getDeviceInfo() {
  const ua = navigator.userAgent || ''
  const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
  const maxTouch = navigator.maxTouchPoints || 0
  const width = Math.min(window.screen.width, window.screen.height)
  const height = Math.max(window.screen.width, window.screen.height)
  const ratio = window.devicePixelRatio || 1

  // 1. Check for Modern iPad (iPadOS 13+ reports as Macintosh with multi-touch)
  const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouch > 1)
  if (isIPad) {
    let ipadModel = 'Apple iPad'
    if (height >= 1366 || width >= 1024) ipadModel = 'Apple iPad Pro 12.9"'
    else if (height >= 1194 || (width >= 834 && ratio >= 2)) ipadModel = 'Apple iPad Pro 11"'
    else if (height >= 1180 || width >= 820) ipadModel = 'Apple iPad Air'
    else if (height <= 1133 && width <= 744) ipadModel = 'Apple iPad mini'
    
    const iosMatch = ua.match(/OS (\d+[_\.]\d+)/i)
    const osVer = iosMatch ? ` (iPadOS ${iosMatch[1].replace('_', '.')})` : ''
    return {
      type: 'tablet',
      name: `${ipadModel}${osVer}`,
      platform: 'iPadOS'
    }
  }

  // 2. Check for iPhone / iPod
  if (/iPhone|iPod/i.test(ua)) {
    let iphoneModel = 'Apple iPhone'
    // Screen dimension matching for known iPhone series (points at 1x)
    if (height === 932 && width === 430) iphoneModel = 'Apple iPhone 15/16 Pro Max'
    else if (height === 852 && width === 393) iphoneModel = 'Apple iPhone 15/16 Pro'
    else if (height === 926 && width === 428) iphoneModel = 'Apple iPhone 14/13 Plus/Pro Max'
    else if (height === 844 && width === 390) iphoneModel = 'Apple iPhone 14/13/12'
    else if (height === 896 && width === 414) iphoneModel = ratio >= 3 ? 'Apple iPhone 11 Pro Max / XS Max' : 'Apple iPhone 11 / XR'
    else if (height === 812 && width === 375) iphoneModel = 'Apple iPhone 13/12 mini / X'
    else if (height === 667 && width === 375) iphoneModel = 'Apple iPhone SE'

    const iosMatch = ua.match(/OS (\d+[_\.]\d+)/i)
    const osVer = iosMatch ? ` (iOS ${iosMatch[1].replace('_', '.')})` : ''
    return {
      type: 'phone',
      name: `${iphoneModel}${osVer}`,
      platform: 'iOS'
    }
  }

  // 3. Check for Android Devices
  if (/Android/i.test(ua)) {
    const isMobilePhone = /Mobile/i.test(ua)
    const type = isMobilePhone ? 'phone' : 'tablet'
    let rawModel = ''

    // Try Client Hints API (Chrome / Edge on Android)
    if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
      try {
        const hints = await navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion'])
        if (hints.model) rawModel = hints.model.trim()
      } catch (err) {
        // High entropy client hints not allowed or blocked by permission policy
      }
    }

    // Fallback: extract model from User-Agent string
    if (!rawModel) {
      const match = ua.match(/Android[^;]+;\s*([^;\)]+)(?:;\s*Build|\))/i)
      if (match && match[1]) {
        rawModel = match[1].replace(/Build\/.*$/i, '').trim()
      }
    }

    let parsedName = formatAndroidModel(rawModel, type)
    return {
      type,
      name: parsedName,
      platform: 'Android'
    }
  }

  // 4. Desktop / PC classification
  if (/Windows/i.test(ua)) {
    let winVer = 'PC Windows'
    if (/Windows NT 10.0/i.test(ua)) winVer = 'PC Windows 10/11'
    return { type: 'desktop', name: winVer, platform: 'Windows' }
  }

  if (/Macintosh|Mac OS X/i.test(ua) && maxTouch === 0) {
    return { type: 'desktop', name: 'Apple Mac', platform: 'macOS' }
  }

  if (/Linux/i.test(ua)) {
    return { type: 'desktop', name: 'PC Linux', platform: 'Linux' }
  }

  return {
    type: touch ? 'phone' : 'desktop',
    name: touch ? 'Smartphone' : 'Computer PC',
    platform: 'Unknown'
  }
}

/**
 * Parses raw Android device codes and manufacturer strings into recognizable marketing names.
 */
function formatAndroidModel(raw, type) {
  if (!raw || raw.toLowerCase() === 'k' || raw.length < 2) {
    return type === 'tablet' ? 'Tablet Android' : 'Smartphone Android'
  }

  const clean = raw.trim()

  // Google Pixel
  if (/Pixel/i.test(clean)) {
    return `Google ${clean}`
  }

  // Samsung Galaxy Models (SM-S, SM-G, SM-A, SM-F, SM-N, SM-X, SM-T)
  if (/^SM-S\d/i.test(clean)) {
    if (/SM-S928/i.test(clean)) return 'Samsung Galaxy S24 Ultra'
    if (/SM-S926/i.test(clean)) return 'Samsung Galaxy S24+'
    if (/SM-S921/i.test(clean)) return 'Samsung Galaxy S24'
    if (/SM-S918/i.test(clean)) return 'Samsung Galaxy S23 Ultra'
    if (/SM-S916/i.test(clean)) return 'Samsung Galaxy S23+'
    if (/SM-S911/i.test(clean)) return 'Samsung Galaxy S23'
    if (/SM-S908/i.test(clean)) return 'Samsung Galaxy S22 Ultra'
    if (/SM-S901/i.test(clean)) return 'Samsung Galaxy S22'
    return `Samsung Galaxy S (${clean})`
  }
  if (/^SM-A\d/i.test(clean)) {
    if (/SM-A556/i.test(clean)) return 'Samsung Galaxy A55 5G'
    if (/SM-A546/i.test(clean)) return 'Samsung Galaxy A54 5G'
    if (/SM-A346/i.test(clean)) return 'Samsung Galaxy A34 5G'
    return `Samsung Galaxy A (${clean})`
  }
  if (/^SM-F\d/i.test(clean)) {
    if (/SM-F946/i.test(clean)) return 'Samsung Galaxy Z Fold5'
    if (/SM-F731/i.test(clean)) return 'Samsung Galaxy Z Flip5'
    return `Samsung Galaxy Z (${clean})`
  }
  if (/^SM-(X|T)\d/i.test(clean)) {
    if (/SM-X9/i.test(clean)) return `Samsung Galaxy Tab S Ultra (${clean})`
    if (/SM-X8/i.test(clean)) return `Samsung Galaxy Tab S+ (${clean})`
    if (/SM-X7/i.test(clean)) return `Samsung Galaxy Tab S (${clean})`
    return `Samsung Galaxy Tab (${clean})`
  }
  if (/^SM-/i.test(clean) || /SAMSUNG/i.test(clean)) {
    return `Samsung Galaxy (${clean.replace(/^SAMSUNG\s*/i, '')})`
  }

  // Xiaomi, Redmi & POCO
  if (/Xiaomi/i.test(clean) || /Redmi/i.test(clean) || /POCO/i.test(clean) || /2\d{3}\d{2}/.test(clean)) {
    if (/Redmi/i.test(clean)) return `Xiaomi ${clean}`
    if (/POCO/i.test(clean)) return `${clean}`
    return `Xiaomi (${clean})`
  }

  // OnePlus
  if (/OnePlus|CPH\d{4}|NE221/i.test(clean)) {
    return `OnePlus (${clean})`
  }

  // Huawei & Honor
  if (/HUAWEI|HONOR/i.test(clean)) {
    return clean
  }

  // Motorola
  if (/moto/i.test(clean) || /motorola/i.test(clean)) {
    return `Motorola ${clean.replace(/motorola\s*/i, '')}`
  }

  // Sony Xperia
  if (/XQ-|SO-/i.test(clean)) {
    return `Sony Xperia (${clean})`
  }

  // Generic fallback with device type prefix
  const prefix = type === 'tablet' ? 'Tablet Android' : 'Smartphone Android'
  return `${prefix} (${clean})`
}
