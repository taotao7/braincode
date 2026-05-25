import { ensureBraincodeHome, readSettings, writeSettings, type BraincodeSettings } from "@braincode/config"
import { configWebHtml } from "@braincode/config-web"
import type { ApiResult, HealthResponse } from "@braincode/protocol"
import { DEFAULT_CONFIG_HOST, DEFAULT_CONFIG_PORT } from "@braincode/shared"

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

  try {
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(configWebHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
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
