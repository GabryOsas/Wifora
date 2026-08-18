import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url))
export const PUBLIC_DIR = join(ROOT_DIR, 'public')

export const DEFAULT_PORT = 3975
export const DEFAULT_MAX_LISTENERS = 5
export const ROOM_GRACE_MS = 60_000
export const MAX_SIGNAL_BYTES = 24_000

export const ROOM_PATTERN = /^[A-Z0-9]{8}$/
export const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const LISTENER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

export const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
}
