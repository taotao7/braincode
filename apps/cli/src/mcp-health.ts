import { spawn } from "node:child_process"

export type McpHealthStatus = "ok" | "error" | "skipped"

export type McpHealthResult = {
  status: McpHealthStatus
  latencyMs?: number
  toolCount?: number
  serverInfo?: { name?: string; version?: string }
  protocolVersion?: string
  error?: string
}

export type McpHealthInput = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  type?: string
  httpHeaders?: Record<string, string>
}

const DEFAULT_TIMEOUT_MS = 8000
const PROTOCOL_VERSION = "2024-11-05"

export async function checkMcpHealth(server: McpHealthInput, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<McpHealthResult> {
  if (server.url || server.type === "http" || server.type === "sse") {
    if (!server.url) return { status: "error", error: "no URL configured" }
    if (server.type === "sse") {
      return checkSseMcpHealth(server.url, server.httpHeaders ?? {}, timeoutMs)
    }
    return checkHttpMcpHealth(server.url, server.httpHeaders ?? {}, timeoutMs)
  }
  if (!server.command) {
    return { status: "error", error: "no command configured" }
  }
  return checkStdioMcpHealth(server.command, server.args ?? [], server.env ?? {}, timeoutMs)
}

async function checkHttpMcpHealth(url: string, headers: Record<string, string>, timeoutMs: number): Promise<McpHealthResult> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let sessionId: string | undefined

  const postJsonRpc = async (payload: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: `${JSON.stringify(payload)}\n`,
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${text.trim() ? `: ${text.slice(0, 200).trim()}` : ""}`)
    }
    sessionId = response.headers.get("mcp-session-id") ?? sessionId
    return parseJsonRpcMessage(text)
  }

  try {
    const init = await postJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "braincode", version: "0.1" },
      },
    }) as { result?: { serverInfo?: { name?: string; version?: string }; protocolVersion?: string }; error?: unknown }
    if (init.error) {
      return { status: "error", error: stringifyJsonRpcError(init.error) }
    }
    const serverInfo = init.result?.serverInfo
    const protocolVersion = init.result?.protocolVersion

    await postHttpNotification(url, headers, sessionId, controller.signal)

    try {
      const tools = await postJsonRpc({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }) as { result?: { tools?: unknown[] }; error?: unknown }
      if (tools.error) {
        return {
          status: "ok",
          latencyMs: Date.now() - started,
          serverInfo,
          protocolVersion,
          error: `tools/list failed: ${stringifyJsonRpcError(tools.error)}`,
        }
      }
      return {
        status: "ok",
        latencyMs: Date.now() - started,
        toolCount: Array.isArray(tools.result?.tools) ? tools.result.tools.length : 0,
        serverInfo,
        protocolVersion,
      }
    } catch (error) {
      return {
        status: "ok",
        latencyMs: Date.now() - started,
        serverInfo,
        protocolVersion,
        error: `tools/list failed: ${formatHealthError(error)}`,
      }
    }
  } catch (error) {
    return { status: "error", error: formatHealthError(error) }
  } finally {
    clearTimeout(timer)
  }
}

async function postHttpNotification(
  url: string,
  headers: Record<string, string>,
  sessionId: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
      signal,
    })
  } catch {
    // Some HTTP MCP servers do not require the initialized notification.
  }
}

async function checkSseMcpHealth(url: string, headers: Record<string, string>, timeoutMs: number): Promise<McpHealthResult> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...headers,
        accept: "text/event-stream",
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      return { status: "error", error: `HTTP ${response.status}${text.trim() ? `: ${text.slice(0, 200).trim()}` : ""}` }
    }
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().includes("text/event-stream")) {
      return { status: "error", error: `expected text/event-stream, got ${contentType || "unknown content type"}` }
    }
    return { status: "ok", latencyMs: Date.now() - started }
  } catch (error) {
    return { status: "error", error: formatHealthError(error) }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

function checkStdioMcpHealth(command: string, args: string[], env: Record<string, string>, timeoutMs: number): Promise<McpHealthResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    let resolved = false
    let serverInfo: McpHealthResult["serverInfo"]
    let protocolVersion: string | undefined
    let toolCount: number | undefined
    let stderrTail = ""
    let buffer = ""
    const initId = 1
    const toolsId = 2

    let child
    try {
      child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...env },
      })
    } catch (error) {
      return resolve({ status: "error", error: error instanceof Error ? error.message : String(error) })
    }

    const settle = (result: McpHealthResult) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      try {
        child.stdin?.end()
      } catch {
        // ignore
      }
      try {
        child.kill("SIGTERM")
      } catch {
        // ignore
      }
      resolve(result)
    }

    const timer = setTimeout(() => {
      settle({
        status: "error",
        error: `timeout after ${timeoutMs}ms${stderrTail ? `: ${stderrTail.slice(-200).trim()}` : ""}`,
      })
    }, timeoutMs)

    child.on("error", (err) => settle({ status: "error", error: err.message }))
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail += chunk.toString()
      if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-2000)
    })

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString()
      let nlIndex = buffer.indexOf("\n")
      while (nlIndex !== -1) {
        const line = buffer.slice(0, nlIndex).trim()
        buffer = buffer.slice(nlIndex + 1)
        nlIndex = buffer.indexOf("\n")
        if (!line) continue
        let message: unknown
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }
        const record = message as { id?: unknown; result?: unknown; error?: unknown }
        if (record.id === initId) {
          if (record.error) {
            settle({ status: "error", error: stringifyJsonRpcError(record.error) })
            return
          }
          const result = (record.result ?? {}) as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string }
          serverInfo = result.serverInfo
          protocolVersion = result.protocolVersion
          try {
            child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
            child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: toolsId, method: "tools/list" })}\n`)
          } catch (error) {
            settle({ status: "error", error: error instanceof Error ? error.message : String(error) })
          }
          continue
        }
        if (record.id === toolsId) {
          if (record.error) {
            settle({
              status: "ok",
              latencyMs: Date.now() - started,
              serverInfo,
              protocolVersion,
              error: `tools/list failed: ${stringifyJsonRpcError(record.error)}`,
            })
            return
          }
          const result = (record.result ?? {}) as { tools?: unknown[] }
          toolCount = Array.isArray(result.tools) ? result.tools.length : 0
          settle({
            status: "ok",
            latencyMs: Date.now() - started,
            toolCount,
            serverInfo,
            protocolVersion,
          })
          return
        }
      }
    })

    child.on("close", (code, signal) => {
      if (resolved) return
      settle({
        status: "error",
        error: `process exited (code=${code ?? "?"}${signal ? `, signal=${signal}` : ""})${stderrTail ? `: ${stderrTail.slice(-200).trim()}` : ""}`,
      })
    })

    try {
      child.stdin?.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: initId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "braincode", version: "0.1" },
        },
      })}\n`)
    } catch (error) {
      settle({ status: "error", error: error instanceof Error ? error.message : String(error) })
    }
  })
}

function parseJsonRpcMessage(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("empty JSON-RPC response")
  try {
    return JSON.parse(trimmed)
  } catch {
    const events = trimmed.split(/\r?\n\r?\n/)
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n")
      if (!data) continue
      try {
        return JSON.parse(data)
      } catch {
        // Try the next event.
      }
    }
  }
  throw new Error(`invalid JSON-RPC response: ${trimmed.slice(0, 200)}`)
}

function formatHealthError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "timeout"
  return error instanceof Error ? error.message : String(error)
}

function stringifyJsonRpcError(value: unknown): string {
  if (!value || typeof value !== "object") return String(value)
  const record = value as { code?: unknown; message?: unknown; data?: unknown }
  const parts: string[] = []
  if (typeof record.code === "number") parts.push(`code=${record.code}`)
  if (typeof record.message === "string") parts.push(record.message)
  if (record.data !== undefined) parts.push(JSON.stringify(record.data))
  return parts.join(" · ") || JSON.stringify(value)
}
