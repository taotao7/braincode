import { chmod, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { BRAINCODE_HOME_DIR_NAME, DEFAULT_CONFIG_HOST, DEFAULT_CONFIG_PORT } from "@braincode/shared"

export type BraincodeSettings = {
  version: 1
  configServer: {
    host: string
    port: number
  }
  defaultBrainId: string
}

export type BraincodeAuth = {
  providers: Record<string, unknown>
}

export type BraincodePaths = {
  home: string
  settings: string
  auth: string
  brains: string
  models: string
  tools: string
  sessions: string
  logs: string
  cache: string
}

export const defaultSettings: BraincodeSettings = {
  version: 1,
  configServer: {
    host: DEFAULT_CONFIG_HOST,
    port: DEFAULT_CONFIG_PORT,
  },
  defaultBrainId: "default",
}

export function getBraincodeHome(): string {
  return join(homedir(), BRAINCODE_HOME_DIR_NAME)
}

export function getBraincodePaths(home = getBraincodeHome()): BraincodePaths {
  return {
    home,
    settings: join(home, "settings.json"),
    auth: join(home, "auth.json"),
    brains: join(home, "brains.json"),
    models: join(home, "models.json"),
    tools: join(home, "tools.json"),
    sessions: join(home, "sessions"),
    logs: join(home, "logs"),
    cache: join(home, "cache"),
  }
}

async function writeJsonFile(path: string, value: unknown) {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  const file = Bun.file(path)
  if (!(await file.exists())) return fallback

  const text = await file.text()
  if (!text.trim()) return fallback

  return JSON.parse(text) as T
}

async function ensureJsonFile(path: string, value: unknown, mode?: number) {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    await writeJsonFile(path, value)
  }
  if (mode !== undefined) {
    await chmod(path, mode)
  }
}

export async function ensureBraincodeHome(home = getBraincodeHome()): Promise<BraincodePaths> {
  const paths = getBraincodePaths(home)

  await mkdir(paths.home, { recursive: true })
  await mkdir(paths.sessions, { recursive: true })
  await mkdir(paths.logs, { recursive: true })
  await mkdir(paths.cache, { recursive: true })

  await ensureJsonFile(paths.settings, defaultSettings)
  await ensureJsonFile(paths.auth, { providers: {} } satisfies BraincodeAuth, 0o600)
  await ensureJsonFile(paths.brains, { brains: [] })
  await ensureJsonFile(paths.models, { models: [] })
  await ensureJsonFile(paths.tools, { tools: [] })

  return paths
}

export async function readSettings(home = getBraincodeHome()): Promise<BraincodeSettings> {
  const paths = await ensureBraincodeHome(home)
  return readJsonFile(paths.settings, defaultSettings)
}

export async function writeSettings(settings: BraincodeSettings, home = getBraincodeHome()): Promise<void> {
  const paths = await ensureBraincodeHome(home)
  await writeJsonFile(paths.settings, settings)
}
