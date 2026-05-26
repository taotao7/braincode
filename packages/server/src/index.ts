import {
  defaultBrains,
  defaultModels,
  ensureBraincodeHome,
  readProviderApiKey,
  readAuthStatus,
  readBrains,
  readModels,
  readSettings,
  readTools,
  writeBrains,
  writeModels,
  writeProviderApiKey,
  writeSettings,
  writeTools,
  type BraincodeBrains,
  type BraincodeModels,
  type BraincodeSettings,
  type BraincodeTools,
} from "@braincode/config"
import { configWebHtml } from "@braincode/config-web"
import { listBuiltInModelCatalog, listOpenAICompatibleModels, testModelConnection, type BraincodeModel } from "@braincode/llm"
import type { ApiResult, HealthResponse } from "@braincode/protocol"
import { debugLog, DEFAULT_CONFIG_HOST, DEFAULT_CONFIG_PORT } from "@braincode/shared"

export type ConfigServerOptions = {
  host?: string
  port?: number
}

export type ConfigServerHandle = {
  server: Bun.Server<unknown>
  url: string
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
      const logo = Bun.file("resources/logo.png")
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

    if (request.method === "POST" && url.pathname === "/api/provider-models") {
      const body = (await request.json()) as { provider?: string; baseUrl?: string; apiKey?: string }
      const provider = body.provider?.trim() ?? ""
      const apiKey = body.apiKey?.trim() || (provider ? await readProviderApiKey(provider) : undefined)
      debugLog("server", "loading provider models", { provider, baseUrl: body.baseUrl, hasApiKey: Boolean(apiKey) })
      const models = await listOpenAICompatibleModels({ provider, baseUrl: body.baseUrl ?? "", apiKey })
      const savedModels = await readModels()
      const providers = [
        { provider, baseUrl: models[0]?.baseUrl ?? body.baseUrl },
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
      const apiKey = await readProviderApiKey(model.provider)
      const thinkingLevel = body.thinkingLevel?.trim() || undefined
      debugLog("server", "testing model connection", { modelId: model.id, provider: model.provider, hasApiKey: Boolean(apiKey), thinkingLevel })
      return json(ok(await testModelConnection(model, apiKey, thinkingLevel as never)))
    }

    if (request.method === "POST" && url.pathname === "/api/models/test-config") {
      const body = (await request.json()) as { model?: BraincodeModel; apiKey?: string; thinkingLevel?: string }
      if (!body.model) throw new Error("model is required")
      const apiKey = body.apiKey?.trim() || (body.model.provider ? await readProviderApiKey(body.model.provider) : undefined)
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
