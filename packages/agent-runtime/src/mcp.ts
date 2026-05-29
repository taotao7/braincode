import { spawn, type ChildProcess } from "node:child_process"
import { Type } from "typebox"
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
import { extractMcpServerEntries, resolveMcpServerEnv, type BraincodeAuth, type McpServerEntry, type ProjectMcpConfig } from "@braincode/config"
import { debugLog } from "@braincode/shared"

const PROTOCOL_VERSION = "2024-11-05"
const REQUEST_TIMEOUT_MS = 30000
const CONNECT_TIMEOUT_MS = 15000

export type McpToolServerInput = {
  name: string
  scope: "user" | "project"
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type McpHubConnectReport = {
  connected: Array<{ scope: "user" | "project"; name: string; toolCount: number }>
  failed: Array<{ scope: "user" | "project"; name: string; error: string }>
  skipped: Array<{ scope: "user" | "project"; name: string; reason: string }>
  toolCount: number
}

type PendingHandler = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

class McpConnection {
  private buffer = ""
  private idCounter = 0
  private pending = new Map<number, PendingHandler>()
  private closed = false
  private stderrTail = ""
  child: ChildProcess

  constructor(public info: McpToolServerInput) {
    this.child = spawn(info.command, info.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(info.env ?? {}) },
    })
    this.child.stdout?.on("data", (chunk: Buffer) => this.onStdout(chunk))
    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.stderrTail += chunk.toString()
      if (this.stderrTail.length > 4000) this.stderrTail = this.stderrTail.slice(-2000)
    })
    this.child.on("close", () => this.abortPending("MCP server closed unexpectedly"))
    this.child.on("error", (error) => this.abortPending(error.message))
  }

  private abortPending(reason: string) {
    this.closed = true
    for (const [, handler] of this.pending) {
      clearTimeout(handler.timer)
      handler.reject(new Error(this.stderrTail ? `${reason} — ${this.stderrTail.slice(-200).trim()}` : reason))
    }
    this.pending.clear()
  }

  private onStdout(chunk: Buffer) {
    this.buffer += chunk.toString()
    let nl = this.buffer.indexOf("\n")
    while (nl !== -1) {
      const line = this.buffer.slice(0, nl).trim()
      this.buffer = this.buffer.slice(nl + 1)
      nl = this.buffer.indexOf("\n")
      if (!line) continue
      let message: unknown
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      const record = message as { id?: unknown; result?: unknown; error?: unknown }
      if (typeof record.id === "number") {
        const handler = this.pending.get(record.id)
        if (!handler) continue
        this.pending.delete(record.id)
        clearTimeout(handler.timer)
        if (record.error) handler.reject(new Error(stringifyJsonRpcError(record.error)))
        else handler.resolve(record.result)
      }
    }
  }

  async request<T>(method: string, params?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    if (this.closed) throw new Error("MCP server is closed")
    const id = ++this.idCounter
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`MCP ${method} timeout after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      const payload: Record<string, unknown> = { jsonrpc: "2.0", id, method }
      if (params !== undefined) payload.params = params
      try {
        this.child.stdin?.write(`${JSON.stringify(payload)}\n`)
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  notify(method: string, params?: unknown) {
    if (this.closed) return
    const payload: Record<string, unknown> = { jsonrpc: "2.0", method }
    if (params !== undefined) payload.params = params
    try {
      this.child.stdin?.write(`${JSON.stringify(payload)}\n`)
    } catch {
      // ignore
    }
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "braincode", version: "0.1" },
    }, CONNECT_TIMEOUT_MS)
    this.notify("notifications/initialized")
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    const result = await this.request<{ tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> }>("tools/list", undefined, CONNECT_TIMEOUT_MS)
    return result.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ content?: Array<{ type?: string; text?: string }>; isError?: boolean }> {
    return this.request("tools/call", { name, arguments: args })
  }

  shutdown() {
    if (this.closed) return
    this.closed = true
    try { this.child.stdin?.end() } catch { /* ignore */ }
    try { this.child.kill("SIGTERM") } catch { /* ignore */ }
  }
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

export class McpToolHub {
  private connections: McpConnection[] = []
  private agentTools: AgentTool[] = []
  private agentToolNames = new Set<string>()

  async connect(servers: McpToolServerInput[]): Promise<McpHubConnectReport> {
    const report: McpHubConnectReport = { connected: [], failed: [], skipped: [], toolCount: 0 }
    await Promise.all(
      servers.map(async (server) => {
        const connection = new McpConnection(server)
        try {
          await connection.initialize()
          const tools = await connection.listTools()
          let addedToolCount = 0
          for (const tool of tools) {
            if (this.addAgentTool(toAgentTool(connection, server, tool))) addedToolCount += 1
            const alias = toWebSearchAlias(connection, server, tool)
            if (alias && this.addAgentTool(alias)) addedToolCount += 1
          }
          this.connections.push(connection)
          report.connected.push({ scope: server.scope, name: server.name, toolCount: addedToolCount })
          report.toolCount += addedToolCount
        } catch (error) {
          connection.shutdown()
          const message = error instanceof Error ? error.message : String(error)
          report.failed.push({ scope: server.scope, name: server.name, error: message })
          debugLog("mcp", "connect failed", { server: server.name, error: message })
        }
      }),
    )
    return report
  }

  getTools(): AgentTool[] {
    return this.agentTools
  }

  private addAgentTool(tool: AgentTool): boolean {
    if (this.agentToolNames.has(tool.name)) return false
    this.agentToolNames.add(tool.name)
    this.agentTools.push(tool)
    return true
  }

  shutdown() {
    for (const connection of this.connections) connection.shutdown()
    this.connections = []
    this.agentTools = []
    this.agentToolNames.clear()
  }
}

function toAgentTool(connection: McpConnection, server: McpToolServerInput, tool: { name: string; description?: string; inputSchema?: unknown }): AgentTool {
  const safeName = `mcp__${sanitizeIdentifier(server.name)}__${sanitizeIdentifier(tool.name)}`
  return createMcpAgentTool(connection, server, tool, safeName, `${server.name}/${tool.name}`)
}

function toWebSearchAlias(connection: McpConnection, server: McpToolServerInput, tool: { name: string; description?: string; inputSchema?: unknown }): AgentTool | undefined {
  const serverName = server.name.toLowerCase()
  const toolName = tool.name.toLowerCase().replace(/[-\s]+/g, "_")
  if (serverName !== "tavily" || toolName !== "tavily_search") return undefined
  return createMcpAgentTool(
    connection,
    server,
    {
      ...tool,
      description: tool.description ?? "Search the web through the configured Tavily MCP server.",
    },
    "web_search",
    "web_search",
  )
}

function createMcpAgentTool(
  connection: McpConnection,
  server: McpToolServerInput,
  tool: { name: string; description?: string; inputSchema?: unknown },
  name: string,
  label: string,
): AgentTool {
  const schema = (tool.inputSchema && typeof tool.inputSchema === "object")
    ? (tool.inputSchema as Record<string, unknown>)
    : { type: "object", properties: {}, additionalProperties: true }
  const parameters = Type.Unsafe(schema)
  return {
    name,
    label,
    description: tool.description ?? `MCP tool '${tool.name}' from server '${server.name}'`,
    parameters,
    prepareArguments: (args) => (args && typeof args === "object" ? args : {}) as Record<string, unknown>,
    execute: async (_toolCallId, params) => {
      const callArgs = (params && typeof params === "object" ? params : {}) as Record<string, unknown>
      const result = await connection.callTool(tool.name, callArgs)
      const content = Array.isArray(result.content) ? result.content : []
      const lines: string[] = []
      for (const part of content) {
        if (part && typeof part === "object") {
          if (typeof part.text === "string") lines.push(part.text)
          else lines.push(JSON.stringify(part))
        }
      }
      const text = lines.join("\n") || (result.isError ? "(tool reported an error with no content)" : "(no content)")
      return {
        content: [{ type: "text", text }],
        details: result,
      } satisfies AgentToolResult<unknown>
    },
  }
}

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_")
}

export function collectMcpToolServers(options: {
  userMcp?: ProjectMcpConfig
  projectMcp?: ProjectMcpConfig
  auth?: BraincodeAuth
}): { servers: McpToolServerInput[]; skipped: Array<{ scope: "user" | "project"; name: string; reason: string }> } {
  const servers: McpToolServerInput[] = []
  const skipped: Array<{ scope: "user" | "project"; name: string; reason: string }> = []
  const seen = new Set<string>()
  const collect = (scope: "user" | "project", source?: ProjectMcpConfig) => {
    if (!source) return
    for (const { name, entry } of extractMcpServerEntries(source.config)) {
      const key = `${scope}:${name}`
      if (seen.has(key)) continue
      seen.add(key)
      if (entry.disabled) {
        skipped.push({ scope, name, reason: "disabled" })
        continue
      }
      if (!entry.command) {
        skipped.push({ scope, name, reason: entry.url ? "url-based server (stdio only)" : "no command configured" })
        continue
      }
      let env: Record<string, string> | undefined
      try {
        env = resolveMcpServerEnv(entry.env, options.auth ?? { providers: {} })
      } catch (error) {
        skipped.push({ scope, name, reason: error instanceof Error ? error.message : String(error) })
        continue
      }
      servers.push({
        scope,
        name,
        command: entry.command,
        args: entry.args,
        env,
      })
    }
  }
  // Project shadows user when names collide.
  collect("project", options.projectMcp)
  collect("user", options.userMcp)
  return { servers, skipped }
}

export type { McpServerEntry }
