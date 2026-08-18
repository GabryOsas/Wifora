// Structured Client-Side Logger for Wifora
// Supports DEBUG, INFO, WARN, ERROR levels with styled browser console badges

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
}

function getInitialLogLevel() {
  try {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('debug') === '1' || urlParams.get('debug') === 'true') {
      return LogLevel.DEBUG
    }
    const saved = localStorage.getItem('wifora_debug')
    if (saved === '1' || saved === 'true') return LogLevel.DEBUG
  } catch {}
  return LogLevel.INFO
}

export class ClientLogger {
  constructor(tag = 'Wifora') {
    this.tag = tag
    this.level = getInitialLogLevel()
  }

  setLevel(level) {
    if (typeof level === 'string' && level.toUpperCase() in LogLevel) {
      this.level = LogLevel[level.toUpperCase()]
    } else if (typeof level === 'number') {
      this.level = level
    }
  }

  _badgeStyle(bgColor, textColor = '#ffffff') {
    return `background: ${bgColor}; color: ${textColor}; padding: 2px 6px; border-radius: 3px; font-weight: bold; font-size: 10px;`
  }

  _tagStyle() {
    return 'background: #3b82f6; color: #ffffff; padding: 2px 6px; border-radius: 3px; font-weight: bold; font-size: 10px;'
  }

  _time() {
    return new Date().toISOString().substring(11, 19)
  }

  debug(message, ...args) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(
        `%c${this._time()}%c %c${this.tag}%c %cDEBUG%c ${message}`,
        'color: #888;',
        '',
        this._tagStyle(),
        '',
        this._badgeStyle('#64748b'),
        '',
        ...args
      )
    }
  }

  info(message, ...args) {
    if (this.level <= LogLevel.INFO) {
      console.info(
        `%c${this._time()}%c %c${this.tag}%c %cINFO%c ${message}`,
        'color: #888;',
        '',
        this._tagStyle(),
        '',
        this._badgeStyle('#0284c7'),
        '',
        ...args
      )
    }
  }

  warn(message, ...args) {
    if (this.level <= LogLevel.WARN) {
      console.warn(
        `%c${this._time()}%c %c${this.tag}%c %cWARN%c ${message}`,
        'color: #888;',
        '',
        this._tagStyle(),
        '',
        this._badgeStyle('#d97706'),
        '',
        ...args
      )
    }
  }

  error(message, ...args) {
    if (this.level <= LogLevel.ERROR) {
      console.error(
        `%c${this._time()}%c %c${this.tag}%c %cERROR%c ${message}`,
        'color: #888;',
        '',
        this._tagStyle(),
        '',
        this._badgeStyle('#dc2626'),
        '',
        ...args
      )
    }
  }
}

export function createLogger(tag) {
  return new ClientLogger(tag)
}
