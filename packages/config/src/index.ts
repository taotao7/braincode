import { chmod, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { BRAINCODE_HOME_DIR_NAME, DEFAULT_CONFIG_HOST, DEFAULT_CONFIG_PORT } from "@braincode/shared"

export type BraincodeMode = "auto" | "radical"

export type BraincodeSettings = {
  version: 1
  mode: BraincodeMode
  configServer: {
    host: string
    port: number
  }
  defaultBrainId: string
}

export type BraincodeAuth = {
  providers: Record<string, unknown>
}

export type BraincodeBrains = {
  brains: unknown[]
}

export type BraincodeModels = {
  models: unknown[]
}

export type BraincodeTools = {
  tools: unknown[]
}

export type AuthStatus = {
  configuredProviders: string[]
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
  mode: "auto",
  configServer: {
    host: DEFAULT_CONFIG_HOST,
    port: DEFAULT_CONFIG_PORT,
  },
  defaultBrainId: "default",
}

export const defaultAuth: BraincodeAuth = { providers: {} }
export const defaultBrains: BraincodeBrains = {
  brains: [
    {
      id: "default",
      name: "Default Brain",
      description: "Default Braincode routing profile for early development.",
      planner: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
      roles: {
        coding: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
        research: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
        review: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
        summarize: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
        fastReply: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "minimal" },
      },
      routing: {
        maxParallelAgents: 2,
        preferCheapModelForSimpleTasks: true,
        escalateOnUncertainty: true,
        requireReviewForFileEdits: true,
      },
      context: {
        maxInputTokens: 120000,
        compaction: "auto",
        isolation: "strict",
      },
    },
  ],
}
export const defaultModels: BraincodeModels = {
  models: [
    {
      id: "anthropic/claude-sonnet-4-5-20250929",
      provider: "anthropic",
      modelId: "claude-sonnet-4-5-20250929",
      name: "Claude Sonnet 4.5",
      contextWindow: 200000,
      supportsTools: true,
      defaultThinkingLevel: "medium",
    },
  ],
}
export const defaultTools: BraincodeTools = { tools: [] }

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

function assertSettings(value: BraincodeSettings) {
  if (value.version !== 1) {
    throw new Error("Unsupported settings version")
  }
  if (value.mode !== "auto" && value.mode !== "radical") {
    throw new Error("settings.mode must be either auto or radical")
  }
  if (!value.configServer || typeof value.configServer.host !== "string") {
    throw new Error("settings.configServer.host must be a string")
  }
  if (!Number.isInteger(value.configServer.port) || value.configServer.port <= 0 || value.configServer.port > 65535) {
    throw new Error("settings.configServer.port must be an integer from 1 to 65535")
  }
  if (typeof value.defaultBrainId !== "string" || !value.defaultBrainId.trim()) {
    throw new Error("settings.defaultBrainId must be a non-empty string")
  }
}

function assertDocumentArray(value: unknown, key: "brains" | "models" | "tools") {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>)[key])) {
    throw new Error(`${key}.json must contain a ${key} array`)
  }
}

function normalizeSettings(value: Partial<BraincodeSettings>): BraincodeSettings {
  return {
    ...defaultSettings,
    ...value,
    configServer: {
      ...defaultSettings.configServer,
      ...value.configServer,
    },
  }
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
  await ensureJsonFile(paths.auth, defaultAuth, 0o600)
  await ensureJsonFile(paths.brains, defaultBrains)
  await ensureJsonFile(paths.models, defaultModels)
  await ensureJsonFile(paths.tools, defaultTools)

  return paths
}

export async function readSettings(home = getBraincodeHome()): Promise<BraincodeSettings> {
  const paths = await ensureBraincodeHome(home)
  const settings = await readJsonFile<Partial<BraincodeSettings>>(paths.settings, defaultSettings)
  return normalizeSettings(settings)
}

export async function writeSettings(settings: BraincodeSettings, home = getBraincodeHome()): Promise<void> {
  assertSettings(settings)
  const paths = await ensureBraincodeHome(home)
  await writeJsonFile(paths.settings, settings)
}

export async function readAuth(home = getBraincodeHome()): Promise<BraincodeAuth> {
  const paths = await ensureBraincodeHome(home)
  return readJsonFile(paths.auth, defaultAuth)
}

export async function readAuthStatus(home = getBraincodeHome()): Promise<AuthStatus> {
  const auth = await readAuth(home)
  return {
    configuredProviders: Object.keys(auth.providers),
  }
}

export async function readBrains(home = getBraincodeHome()): Promise<BraincodeBrains> {
  const paths = await ensureBraincodeHome(home)
  return readJsonFile(paths.brains, defaultBrains)
}

export async function writeBrains(brains: BraincodeBrains, home = getBraincodeHome()): Promise<void> {
  assertDocumentArray(brains, "brains")
  const paths = await ensureBraincodeHome(home)
  await writeJsonFile(paths.brains, brains)
}

export async function readModels(home = getBraincodeHome()): Promise<BraincodeModels> {
  const paths = await ensureBraincodeHome(home)
  return readJsonFile(paths.models, defaultModels)
}

export async function writeModels(models: BraincodeModels, home = getBraincodeHome()): Promise<void> {
  assertDocumentArray(models, "models")
  const paths = await ensureBraincodeHome(home)
  await writeJsonFile(paths.models, models)
}

export async function readTools(home = getBraincodeHome()): Promise<BraincodeTools> {
  const paths = await ensureBraincodeHome(home)
  return readJsonFile(paths.tools, defaultTools)
}

export async function writeTools(tools: BraincodeTools, home = getBraincodeHome()): Promise<void> {
  assertDocumentArray(tools, "tools")
  const paths = await ensureBraincodeHome(home)
  await writeJsonFile(paths.tools, tools)
}
