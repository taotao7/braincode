import {
  defaultBrains,
  defaultModels,
  configureTavilyMcpServer,
  ensureBraincodeHome,
  readAuth,
  readAuthStatus,
  readBrains,
  readProjectSupport,
  readUserMcpConfig,
  readModels,
  readSettings,
  readTools,
  readUsageStats,
  writeBrains,
  writeModels,
  writeProviderOAuthCredentials,
  writeProviderApiKey,
  writeSettings,
  writeTools,
  type BraincodeOAuthCredentials,
  type BraincodeBrains,
  type BraincodeModels,
  type BraincodeSettings,
  type BraincodeTools,
} from "@braincode/config"
import { configWebHtml } from "@braincode/config-web"
import { getBraincodeOAuthProvider, isImageGenerationModel, listBuiltInModelCatalog, listOAuthProviderSummaries, listProviderModels, readProviderRuntimeApiKey, testModelConnection, type BraincodeModel } from "@braincode/llm"
import { collectMcpToolServers, McpToolHub } from "@braincode/agent-runtime"
import { evaluateToolPermissionPolicy, normalizePermissionPolicy, summarizePermissionPolicyEvaluation } from "@braincode/tools"
import type { ApiResult, HealthResponse } from "@braincode/protocol"
import { debugLog, DEFAULT_CONFIG_HOST, DEFAULT_CONFIG_PORT } from "@braincode/shared"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import logoPath from "../../../resources/logo.png" with { type: "file" }

export type ConfigServerOptions = {
  host?: string
  port?: number
}

export type ConfigServerHandle = {
  server: Bun.Server<unknown>
  url: string
}

type OAuthLoginStatus = "starting" | "pending" | "completed" | "failed" | "cancelled"

type OAuthLoginSession = {
  id: string
  provider: string
  oauthProviderId: string
  status: OAuthLoginStatus
  auth?: { url: string; instructions?: string }
  deviceCode?: { userCode: string; verificationUri: string; intervalSeconds?: number; expiresInSeconds?: number }
  progress: string[]
  error?: string
  expires?: number
  createdAt: number
  updatedAt: number
  manualInput?: string
  manualWaiters: Array<(value: string) => void>
  abortController: AbortController
  promise?: Promise<void>
}

type PublicOAuthLoginSession = Omit<OAuthLoginSession, "abortController" | "manualInput" | "manualWaiters" | "promise">

const oauthLoginSessions = new Map<string, OAuthLoginSession>()

// Finished login sessions are kept briefly so the UI can poll their final
// state, then pruned so a long-lived config server does not accumulate them.
const OAUTH_LOGIN_SESSION_TTL_MS = 30 * 60_000

function pruneOAuthLoginSessions(now = Date.now()): void {
  for (const [id, session] of oauthLoginSessions) {
    const finished = session.status === "completed" || session.status === "failed" || session.status === "cancelled"
    if (finished && now - session.updatedAt > OAUTH_LOGIN_SESSION_TTL_MS) {
      oauthLoginSessions.delete(id)
    }
  }
}

function json<T>(value: T, status = 200): Response {
  return Response.json(value, { status })
}

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

function fail(error: unknown, status = 500): Response {
  const message = error instanceof Error ? error.message : String(error)
  return json<ApiResult<never>>({ ok: false, error: message }, status)
}

function publicOAuthLoginSession(session: OAuthLoginSession): PublicOAuthLoginSession {
  const { abortController: _abortController, manualInput: _manualInput, manualWaiters: _manualWaiters, promise: _promise, ...publicSession } = session
  return publicSession
}

function markOAuthLoginSession(session: OAuthLoginSession, status: OAuthLoginStatus): void {
  if (session.status !== "completed" && session.status !== "failed" && session.status !== "cancelled") {
    session.status = status
  }
  session.updatedAt = Date.now()
}

function addOAuthProgress(session: OAuthLoginSession, message: string): void {
  if (message.trim()) {
    session.progress = [...session.progress.slice(-9), message.trim()]
  }
  markOAuthLoginSession(session, session.status === "starting" ? "pending" : session.status)
}

function waitForManualOAuthInput(session: OAuthLoginSession): Promise<string> {
  if (session.manualInput !== undefined) {
    const value = session.manualInput
    session.manualInput = undefined
    return Promise.resolve(value)
  }
  return new Promise((resolve) => {
    session.manualWaiters.push(resolve)
  })
}

function submitManualOAuthInput(session: OAuthLoginSession, value: string): void {
  const waiter = session.manualWaiters.shift()
  if (waiter) {
    waiter(value)
    return
  }
  session.manualInput = value
}

function cancelOAuthLoginSession(session: OAuthLoginSession): void {
  session.abortController.abort()
  markOAuthLoginSession(session, "cancelled")
  for (const waiter of session.manualWaiters.splice(0)) waiter("")
}

function toBraincodeOAuthCredentials(credentials: { refresh: string; access: string; expires: number; [key: string]: unknown }): BraincodeOAuthCredentials {
  return {
    ...credentials,
    refresh: credentials.refresh,
    access: credentials.access,
    expires: credentials.expires,
  }
}

function isGitHubCopilotEnterprisePrompt(oauthProviderId: string, prompt: { message?: string; allowEmpty?: boolean }): boolean {
  if (oauthProviderId !== "github-copilot") return false
  if (prompt.allowEmpty === true) return true
  return /github enterprise|github\.com|url\/domain|enterprise.*domain|domain/i.test(prompt.message ?? "")
}

async function startOAuthLoginSession(input: { provider?: string; oauthProviderId?: string; enterpriseDomain?: string }): Promise<OAuthLoginSession> {
  const oauthProviderId = input.oauthProviderId?.trim() ?? ""
  if (!oauthProviderId) throw new Error("oauthProviderId is required")
  const oauthProvider = getBraincodeOAuthProvider(oauthProviderId)
  if (!oauthProvider) throw new Error(`Unknown OAuth provider: ${oauthProviderId}`)

  pruneOAuthLoginSessions()
  const provider = input.provider?.trim() || oauthProviderId
  const session: OAuthLoginSession = {
    id: crypto.randomUUID(),
    provider,
    oauthProviderId,
    status: "starting",
    progress: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    manualWaiters: [],
    abortController: new AbortController(),
  }
  oauthLoginSessions.set(session.id, session)

  session.promise = (async () => {
    try {
      const credentials = await oauthProvider.login({
        onAuth: (info) => {
          session.auth = info
          markOAuthLoginSession(session, "pending")
        },
        onDeviceCode: (info) => {
          session.deviceCode = info
          markOAuthLoginSession(session, "pending")
        },
        onPrompt: async (prompt) => {
          if (isGitHubCopilotEnterprisePrompt(oauthProviderId, prompt)) {
            const enterpriseDomain = input.enterpriseDomain?.trim() ?? ""
            addOAuthProgress(session, enterpriseDomain ? `Using GitHub Enterprise domain: ${enterpriseDomain}` : "Using github.com for GitHub Copilot OAuth.")
            return enterpriseDomain
          }
          addOAuthProgress(session, prompt.message)
          return waitForManualOAuthInput(session)
        },
        onProgress: (message) => addOAuthProgress(session, message),
        onManualCodeInput: oauthProvider.usesCallbackServer ? () => waitForManualOAuthInput(session) : undefined,
        onSelect: async (prompt) => prompt.options[0]?.id,
        signal: session.abortController.signal,
      })
      await writeProviderOAuthCredentials(provider, oauthProviderId, toBraincodeOAuthCredentials(credentials))
      session.expires = credentials.expires
      markOAuthLoginSession(session, "completed")
    } catch (error) {
      if (session.status !== "cancelled") {
        session.error = error instanceof Error ? error.message : String(error)
        markOAuthLoginSession(session, "failed")
      }
    } finally {
      for (const waiter of session.manualWaiters.splice(0)) waiter("")
    }
  })()

  await waitForOAuthLoginInitialState(session)
  return session
}

async function waitForOAuthLoginInitialState(session: OAuthLoginSession): Promise<void> {
  if (session.status !== "starting" || session.auth || session.deviceCode || session.error) return
  await new Promise<void>((resolve) => {
    const startedAt = Date.now()
    const interval = setInterval(() => {
      if (session.status !== "starting" || session.auth || session.deviceCode || session.error || Date.now() - startedAt > 5000) {
        clearInterval(interval)
        resolve()
      }
    }, 50)
  })
}

function getOAuthLoginSessionFromPath(pathname: string, suffix = ""): OAuthLoginSession | undefined {
  const prefix = "/api/oauth/login/"
  if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) return undefined
  const id = pathname.slice(prefix.length, suffix ? -suffix.length : undefined)
  if (!id || id.includes("/")) return undefined
  return oauthLoginSessions.get(id)
}

function detectProjectPackageManager(projectRoot: string): { name: string; lockfile: string | null; detected: boolean } {
  const candidates: Array<{ name: string; lockfile: string }> = [
    { name: "bun", lockfile: "bun.lock" },
    { name: "bun", lockfile: "bun.lockb" },
    { name: "pnpm", lockfile: "pnpm-lock.yaml" },
    { name: "yarn", lockfile: "yarn.lock" },
    { name: "npm", lockfile: "package-lock.json" },
  ]
  for (const candidate of candidates) {
    if (existsSync(resolve(projectRoot, candidate.lockfile))) {
      return { name: candidate.name, lockfile: candidate.lockfile, detected: true }
    }
  }
  return { name: "npm", lockfile: null, detected: false }
}

type ProviderKeyStatus = {
  provider: string
  kind: "api-key" | "oauth" | "unknown" | "none"
  modelCount: number
  hasCredential: boolean
}

async function buildHealthCheck(projectRoot: string): Promise<{
  providers: ProviderKeyStatus[]
  models: Array<{ id: string; provider: string; name: string; supportsTools: boolean; supportsVision: boolean; supportsImageGeneration: boolean; hasCredential: boolean }>
  packageManager: { name: string; lockfile: string | null; detected: boolean }
}> {
  const [models, authStatus] = await Promise.all([readModels(), readAuthStatus()])
  const authByProvider = new Map(authStatus.providerAuth.map((entry) => [entry.provider, entry]))
  const modelList = (models.models as BraincodeModel[]) ?? []
  const providerSet = new Set<string>()
  for (const model of modelList) providerSet.add(model.provider)
  for (const entry of authStatus.providerAuth) providerSet.add(entry.provider)

  const providers: ProviderKeyStatus[] = [...providerSet].sort().map((provider) => {
    const auth = authByProvider.get(provider)
    return {
      provider,
      kind: auth?.kind ?? "none",
      hasCredential: Boolean(auth),
      modelCount: modelList.filter((model) => model.provider === provider).length,
    }
  })

  const modelRows = modelList.map((model) => ({
    id: model.id,
    provider: model.provider,
    name: model.name,
    supportsTools: model.supportsTools === true,
    supportsVision: model.supportsVision === true,
    supportsImageGeneration: isImageGenerationModel(model),
    hasCredential: authByProvider.has(model.provider),
  }))

  return { providers, models: modelRows, packageManager: detectProjectPackageManager(projectRoot) }
}

async function runMcpHealthCheck(): Promise<{
  connected: Array<{ scope: "user" | "project"; name: string; toolCount: number }>
  failed: Array<{ scope: "user" | "project"; name: string; error: string }>
  skipped: Array<{ scope: "user" | "project"; name: string; reason: string }>
}> {
  const [userMcp, projectSupport, auth] = await Promise.all([
    readUserMcpConfig(),
    readProjectSupport(),
    readAuth(),
  ])
  const { servers, skipped } = collectMcpToolServers({
    userMcp,
    projectMcp: projectSupport.mcp,
    auth,
  })
  const hub = new McpToolHub()
  try {
    const report = await hub.connect(servers, { perServerConnectTimeoutMs: 8000 })
    return { connected: report.connected, failed: report.failed, skipped: [...skipped, ...report.skipped] }
  } finally {
    hub.shutdown()
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  debugLog("server", "request", { method: request.method, path: url.pathname })

  try {
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(configWebHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }

    if (request.method === "GET" && url.pathname === "/resources/logo.png") {
      const logo = Bun.file(logoPath)
      if (!(await logo.exists())) return json<ApiResult<never>>({ ok: false, error: "Logo not found" }, 404)
      return new Response(logo, {
        headers: { "content-type": "image/png" },
      })
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json<HealthResponse>({ name: "braincode", status: "ok" })
    }

    if (request.method === "GET" && url.pathname === "/api/settings") {
      const settings = await readSettings()
      return json(ok(settings))
    }

    if (request.method === "PUT" && url.pathname === "/api/settings") {
      const settings = (await request.json()) as BraincodeSettings
      await writeSettings(settings)
      return json(ok(settings))
    }

    if (request.method === "GET" && url.pathname === "/api/brains") {
      const brains = await readBrains()
      if (brains.brains.length === 0) {
        await writeBrains(defaultBrains)
        return json(ok(defaultBrains))
      }
      return json(ok(brains))
    }

    if (request.method === "PUT" && url.pathname === "/api/brains") {
      const brains = (await request.json()) as BraincodeBrains
      await writeBrains(brains)
      return json(ok(brains))
    }

    if (request.method === "GET" && url.pathname === "/api/models") {
      const models = await readModels()
      if (models.models.length === 0) {
        await writeModels(defaultModels)
        return json(ok(defaultModels))
      }
      return json(ok(models))
    }

    if (request.method === "GET" && url.pathname === "/api/model-catalog") {
      return json(ok({ providers: listBuiltInModelCatalog() }))
    }

    if (request.method === "GET" && url.pathname === "/api/oauth/providers") {
      return json(ok({ providers: listOAuthProviderSummaries() }))
    }

    if (request.method === "POST" && url.pathname === "/api/oauth/login") {
      const body = (await request.json()) as { provider?: string; oauthProviderId?: string; enterpriseDomain?: string }
      const session = await startOAuthLoginSession(body)
      return json(ok(publicOAuthLoginSession(session)))
    }

    if (request.method === "GET") {
      const session = getOAuthLoginSessionFromPath(url.pathname)
      if (session) return json(ok(publicOAuthLoginSession(session)))
    }

    if (request.method === "POST") {
      const session = getOAuthLoginSessionFromPath(url.pathname, "/manual-code")
      if (session) {
        const body = (await request.json()) as { code?: string }
        submitManualOAuthInput(session, body.code?.trim() ?? "")
        markOAuthLoginSession(session, "pending")
        return json(ok(publicOAuthLoginSession(session)))
      }
    }

    if (request.method === "POST") {
      const session = getOAuthLoginSessionFromPath(url.pathname, "/cancel")
      if (session) {
        cancelOAuthLoginSession(session)
        return json(ok(publicOAuthLoginSession(session)))
      }
    }

    if (request.method === "POST" && url.pathname === "/api/provider-models") {
      const body = (await request.json()) as { provider?: string; baseUrl?: string; apiKey?: string; api?: string }
      const provider = body.provider?.trim() ?? ""
      const apiKey = body.apiKey?.trim() || (provider ? await readProviderRuntimeApiKey(provider) : undefined)
      const api = body.api === "anthropic" || body.api === "anthropic-messages" ? "anthropic" : body.api === "openai-images" ? "openai-images" : "openai"
      debugLog("server", "loading provider models", { provider, baseUrl: body.baseUrl, api, hasApiKey: Boolean(apiKey) })
      const models = await listProviderModels({ provider, baseUrl: body.baseUrl ?? "", apiKey, api })
      const savedModels = await readModels()
      const providers = [
        { provider, baseUrl: models[0]?.baseUrl ?? body.baseUrl, api },
        ...((savedModels.providers ?? []) as Array<{ provider?: unknown }>).filter((entry) => entry.provider !== provider),
      ]
      await writeModels({ ...savedModels, providers })
      if (body.apiKey?.trim()) await writeProviderApiKey(provider, body.apiKey)
      return json(ok({ models, providers }))
    }

    if (request.method === "POST" && url.pathname === "/api/provider-api-key") {
      const body = (await request.json()) as { provider?: string; apiKey?: string }
      const provider = body.provider?.trim() ?? ""
      const apiKey = body.apiKey?.trim() ?? ""
      if (!provider) throw new Error("provider is required")
      if (!apiKey) throw new Error("apiKey is required")
      await writeProviderApiKey(provider, apiKey)
      return json(ok(await readAuthStatus()))
    }

    if (request.method === "POST" && url.pathname === "/api/models/test") {
      const body = (await request.json()) as { modelId?: string; thinkingLevel?: string }
      const modelId = body.modelId?.trim() ?? ""
      const savedModels = await readModels()
      const model = (savedModels.models as BraincodeModel[]).find((candidate) => candidate.id === modelId)
      if (!model) throw new Error(`Unknown configured model id: ${modelId}`)
      const apiKey = await readProviderRuntimeApiKey(model.provider)
      const thinkingLevel = body.thinkingLevel?.trim() || undefined
      debugLog("server", "testing model connection", { modelId: model.id, provider: model.provider, hasApiKey: Boolean(apiKey), thinkingLevel })
      return json(ok(await testModelConnection(model, apiKey, thinkingLevel as never)))
    }

    if (request.method === "POST" && url.pathname === "/api/models/test-config") {
      const body = (await request.json()) as { model?: BraincodeModel; apiKey?: string; thinkingLevel?: string }
      if (!body.model) throw new Error("model is required")
      const apiKey = body.apiKey?.trim() || (body.model.provider ? await readProviderRuntimeApiKey(body.model.provider) : undefined)
      const thinkingLevel = body.thinkingLevel?.trim() || undefined
      debugLog("server", "testing model config", { modelId: body.model.id, provider: body.model.provider, hasApiKey: Boolean(apiKey), thinkingLevel })
      return json(ok(await testModelConnection(body.model, apiKey, thinkingLevel as never)))
    }

    if (request.method === "PUT" && url.pathname === "/api/models") {
      const models = (await request.json()) as BraincodeModels
      await writeModels(models)
      return json(ok(models))
    }

    if (request.method === "GET" && url.pathname === "/api/tools") {
      const tools = await readTools()
      return json(ok(tools))
    }

    if (request.method === "PUT" && url.pathname === "/api/tools") {
      const tools = (await request.json()) as BraincodeTools
      await writeTools(tools)
      return json(ok(tools))
    }

    if (request.method === "GET" && url.pathname === "/api/auth/status") {
      const authStatus = await readAuthStatus()
      return json(ok(authStatus))
    }

    if (request.method === "GET" && url.pathname === "/api/mcp/user") {
      return json(ok({ mcp: await readUserMcpConfig() }))
    }

    if (request.method === "POST" && url.pathname === "/api/mcp/tavily") {
      const body = (await request.json()) as { apiKey?: string }
      const mcp = await configureTavilyMcpServer({ apiKey: body.apiKey })
      return json(ok({ mcp, authStatus: await readAuthStatus() }))
    }

    if (request.method === "GET" && url.pathname === "/api/usage-stats") {
      return json(ok(await readUsageStats(undefined, { detailLimit: 1000, sessionLimit: 500 })))
    }

    if (request.method === "GET" && url.pathname === "/api/health-check") {
      return json(ok(await buildHealthCheck(process.cwd())))
    }

    if (request.method === "POST" && url.pathname === "/api/mcp/health") {
      return json(ok(await runMcpHealthCheck()))
    }

    if (request.method === "POST" && url.pathname === "/api/permission-preview") {
      const body = (await request.json()) as { toolName?: string; path?: string; command?: string }
      const toolName = body.toolName?.trim() || "edit_file"
      const args: Record<string, unknown> = {}
      if (body.path?.trim()) args.path = body.path.trim()
      if (body.command?.trim()) args.cmd = body.command.trim()
      const tools = await readTools()
      const policy = normalizePermissionPolicy((tools as { permissions?: unknown }).permissions)
      const evaluation = evaluateToolPermissionPolicy(toolName, args, policy)
      return json(ok(summarizePermissionPolicyEvaluation(evaluation)))
    }

    return json<ApiResult<never>>({ ok: false, error: "Not found" }, 404)
  } catch (error) {
    return fail(error)
  }
}

export async function startConfigServer(options: ConfigServerOptions = {}): Promise<ConfigServerHandle> {
  const settings = await readSettings()
  await ensureBraincodeHome()

  const host = options.host ?? settings.configServer.host ?? DEFAULT_CONFIG_HOST
  const port = options.port ?? settings.configServer.port ?? DEFAULT_CONFIG_PORT
  debugLog("server", "starting config server", { host, port })

  const server = Bun.serve({
    hostname: host,
    port,
    fetch: handleRequest,
  })

  return {
    server,
    url: `http://${server.hostname}:${server.port}`,
  }
}
