// Structured Server Logger for Wifora
// Supports DEBUG, INFO, WARN, ERROR levels with ISO timestamps and ANSI color coding

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
}

export const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR']
const LEVEL_COLORS = {
  DEBUG: '\x1b[90m', // Gray
  INFO: '\x1b[36m', // Cyan
  WARN: '\x1b[33m', // Yellow
  ERROR: '\x1b[31m', // Red
}
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'

function parseLogLevel(val) {
  if (!val) return LogLevel.INFO
  const str = String(val).trim().toUpperCase()
  if (str in LogLevel) return LogLevel[str]
  const num = Number(val)
  if (!Number.isNaN(num) && num >= 0 && num <= 4) return num
  return LogLevel.INFO
}

export class Logger {
  constructor(options = {}) {
    this.level = parseLogLevel(options.level ?? process.env.LOG_LEVEL)
    this.tag = options.tag || 'Server'
    this.isTty = options.isTty ?? Boolean(process.stdout?.isTTY)
  }

  child(tag) {
    const combinedTag = this.tag ? `${this.tag}:${tag}` : tag
    return new Logger({ level: this.level, tag: combinedTag, isTty: this.isTty })
  }

  setLevel(level) {
    this.level = parseLogLevel(level)
  }

  _format(levelName, message, meta) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const metaStr = meta !== undefined ? (typeof meta === 'object' ? ` ${JSON.stringify(meta)}` : ` ${meta}`) : ''

    if (this.isTty) {
      const color = LEVEL_COLORS[levelName] || ''
      return `${DIM}[${ts}]${RESET} ${color}${BOLD}[${levelName}]${RESET} ${DIM}[${this.tag}]${RESET} ${message}${metaStr}`
    }
    return `[${ts}] [${levelName}] [${this.tag}] ${message}${metaStr}`
  }

  debug(message, meta) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this._format('DEBUG', message, meta))
    }
  }

  info(message, meta) {
    if (this.level <= LogLevel.INFO) {
      console.log(this._format('INFO', message, meta))
    }
  }

  warn(message, meta) {
    if (this.level <= LogLevel.WARN) {
      console.warn(this._format('WARN', message, meta))
    }
  }

  error(message, meta) {
    if (this.level <= LogLevel.ERROR) {
      console.error(this._format('ERROR', message, meta))
    }
  }
}

export const logger = new Logger()
