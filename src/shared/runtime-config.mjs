import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PORT } from './constants.mjs'

const ROOT_DIR = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const CONFIG_PATH = join(ROOT_DIR, 'wifora.config.json')

export const runtimeConfigPath = CONFIG_PATH

/**
 * Single source of truth for the streaming server port, shared by the CLI
 * menu and the Web Control Center. This prevents the two front-ends from
 * managing servers on different ports.
 */
export async function loadRuntimeConfig() {
  const config = { port: DEFAULT_PORT }
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (Number(parsed.port) >= 1024 && Number(parsed.port) <= 65535) {
      config.port = Number(parsed.port)
    }
  } catch {}
  return config
}

export async function saveRuntimeConfig(config) {
  try {
    await writeFile(CONFIG_PATH, JSON.stringify({ port: Number(config.port) || DEFAULT_PORT }, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}
