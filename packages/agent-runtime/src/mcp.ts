import { spawn, type ChildProcess } from "node:child_process"
import { Type } from "typebox"
import type { AgentTool, AgentToolResult } from "./pi-agent"
import { extractMcpServerEntries, resolveMcpServerEnv, type BraincodeAuth, type McpServerEntry, type ProjectMcpConfig } from "@braincode/config"
import { debugLog } from "@braincode/shared"

const PROTOCOL_VERSION = "2024-11-05"
const REQUEST_TIMEOUT_MS = 30000
const CONNECT_TIMEOUT_MS = 15000

export type McpLoadingStrategy = "eager" | "lazy" | "background"

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
  pending?: Array<{ scope: "user" | "project"; name: string; reason: string }>
  toolCount: number
  loading?: boolean
  strategy?: McpLoadingStrategy
}

export type McpHubConnectOptions = {
  perServerConnectTimeoutMs?: number
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
      detached: process.platform !== "win32",
    })
    // An MCP server that dies before reading stdin raises EPIPE on the stream;
    // without a listener that becomes an uncaught exception for the whole process.
    this.child.stdin?.on("error", () => {})
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

  async initialize(timeoutMs = CONNECT_TIMEOUT_MS) {
    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "braincode", version: "0.1" },
    }, timeoutMs)
    this.notify("notifications/initialized")
  }

  async listTools(timeoutMs = CONNECT_TIMEOUT_MS): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    const result = await this.request<{ tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> }>("tools/list", undefined, timeoutMs)
    return result.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ content?: Array<{ type?: string; text?: string }>; isError?: boolean }> {
    return this.request("tools/call", { name, arguments: args })
  }

  // Whether the transport can still serve requests. False once the child
  // closed/errored (abortPending) or shutdown() ran. Used by a reused hub to
  // detect servers that died between prompts instead of reporting them from
  // cache as connected.
  isAlive(): boolean {
    return !this.closed && this.child.exitCode === null && this.child.signalCode === null
  }

  shutdown() {
    if (this.closed) return
    this.closed = true
    try { this.child.stdin?.end() } catch { /* ignore */ }
    terminateProcessTree(this.child, "SIGTERM")
    // Escalate: a server that ignores SIGTERM must not outlive run teardown.
    // unref() so the pending kill timer never keeps the CLI process alive.
    const killTimer = setTimeout(() => {
      if (this.child.exitCode === null && this.child.signalCode === null) {
        terminateProcessTree(this.child, "SIGKILL")
      }
    }, 1_000)
    killTimer.unref?.()
    this.child.once("close", () => clearTimeout(killTimer))
  }
}

function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid
  if (pid && process.platform !== "win32") {
    try {
      process.kill(-pid, signal)
      return
    } catch {
      // Fall through to direct child termination.
    }
  }
  if (pid && process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" }).on("error", () => {})
      return
    } catch {
      // Fall through to direct child termination.
    }
  }
  try { child.kill(signal) } catch { /* ignore */ }
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

// Identity of a server within the hub (config name + scope).
function serverKey(server: { scope: "user" | "project"; name: string }): string {
  return `${server.scope}:${server.name}`
}

// Identity of a server's launch configuration. A reused hub compares this to
// detect config edits (changed command/args/env under the same name) that
// must force a reconnect instead of serving the stale cached connection.
// Env entries are sorted so key insertion order (config file ordering, auth
// injection order) never fingerprints as a config change.
function serverConfigKey(server: McpToolServerInput): string {
  return JSON.stringify({
    command: server.command,
    args: server.args ?? [],
    env: Object.entries(server.env ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  })
}

// Per-server bookkeeping. `pending` is the whole connect attempt (spawn +
// initialize + tools/list), created atomically with the record so at most one
// live attempt exists per key by construction; concurrent and cross-turn
// callers (e.g. a previous prompt that returned early) all await the same
// promise. It never rejects — the outcome is read back from the record.
// `toolNames` is only trustworthy once `established` is true. scope/name/
// configKey are derived from `connection.info` rather than stored separately.
type ServerRecord = {
  connection: McpConnection
  toolNames: string[]
  established: boolean
  error?: string
  pending?: Promise<void>
}

export class McpToolHub {
  private servers = new Map<string, ServerRecord>()
  private agentTools: AgentTool[] = []
  private agentToolNames = new Set<string>()

  async connect(servers: McpToolServerInput[], options: McpHubConnectOptions = {}): Promise<McpHubConnectReport> {
    const report: McpHubConnectReport = { connected: [], failed: [], skipped: [], toolCount: 0 }
    const connectTimeoutMs = normalizeConnectTimeoutMs(options.perServerConnectTimeoutMs)
    this.pruneRemovedServers(servers)
    await Promise.all(
      servers.map(async (server) => {
        const record = await this.ensureServer(server, connectTimeoutMs)
        if (record.established) {
          report.connected.push({ scope: server.scope, name: server.name, toolCount: record.toolNames.length })
          report.toolCount += record.toolNames.length
        } else {
          report.failed.push({ scope: server.scope, name: server.name, error: record.error ?? "MCP connect failed" })
        }
      }),
    )
    return report
  }

  // Get-or-create the server's record and await its settled state. All
  // concurrency lives here: the record and its `pending` attempt are created
  // in the same synchronous step, so two callers (same turn or cross-turn)
  // can never spawn the same server twice; a failed prior attempt is retried
  // by replacing the record. Stale-but-established records (dead process,
  // edited config) are dropped and reconnected.
  private async ensureServer(server: McpToolServerInput, connectTimeoutMs: number): Promise<ServerRecord> {
    const key = serverKey(server)
    for (;;) {
      const existing = this.servers.get(key)
      if (existing?.pending) {
        // A handshake from this or an earlier prompt is in flight (an early
        // return — clarification, abort — can leave one). Wait it out and
        // re-check rather than skipping the server or racing a second spawn.
        await existing.pending
        continue
      }
      if (existing?.established) {
        // Reused hub: serve from cache only if the process is still alive and
        // its launch config is unchanged; otherwise reconnect so a crashed or
        // reconfigured server never reports as connected with dead tools. (A
        // live unchanged server keeps its turn-1 tool catalog; dynamic
        // tool-list changes require an edit or restart to pick up.)
        if (existing.connection.isAlive() && serverConfigKey(existing.connection.info) === serverConfigKey(server)) {
          return existing
        }
        debugLog("mcp", "reconnecting cached server", { server: server.name, reason: existing.connection.isAlive() ? "config changed" : "connection dead" })
        this.dropServer(key)
      } else if (existing) {
        // Prior attempt failed (record kept for its error). Retry fresh.
        this.servers.delete(key)
      }
      const connection = new McpConnection(server)
      const record: ServerRecord = { connection, toolNames: [], established: false }
      record.pending = this.establishServer(record, server, connectTimeoutMs)
      this.servers.set(key, record)
      await record.pending
      return record
    }
  }

  // Initialize + list tools for a freshly spawned connection. Never rejects:
  // failure shuts the connection down and records the error on the record
  // (ensureServer replaces failed records on the next attempt).
  private async establishServer(record: ServerRecord, server: McpToolServerInput, connectTimeoutMs: number): Promise<void> {
    const { connection } = record
    try {
      await connection.initialize(connectTimeoutMs)
      const tools = await connection.listTools(connectTimeoutMs)
      for (const tool of tools) {
        const agentTool = toAgentTool(connection, server, tool)
        if (this.addAgentTool(agentTool)) record.toolNames.push(agentTool.name)
        const alias = toWebSearchAlias(connection, server, tool)
        if (alias && this.addAgentTool(alias)) record.toolNames.push(alias.name)
      }
      record.established = true
    } catch (error) {
      connection.shutdown()
      record.error = error instanceof Error ? error.message : String(error)
      debugLog("mcp", "connect failed", { server: server.name, error: record.error })
    } finally {
      record.pending = undefined
    }
  }

  // Remove one server: shut down its connection and drop its tools and
  // bookkeeping so it can be pruned or freshly reconnected.
  private dropServer(key: string): void {
    const record = this.servers.get(key)
    if (!record) return
    record.connection.shutdown()
    this.servers.delete(key)
    const removed = new Set(record.toolNames)
    if (removed.size > 0) {
      this.agentTools = this.agentTools.filter((tool) => !removed.has(tool.name))
      for (const name of removed) this.agentToolNames.delete(name)
    }
  }

  // Shut down servers that were connected on a previous prompt but are no
  // longer in the configured set (user removed/renamed them between turns).
  // Public so the runtime loader can prune a reused hub even on prompts where
  // connect() is never called (lazy strategy, empty configured set). Returns
  // the number of servers removed so callers know to re-sync tool lists.
  pruneRemovedServers(servers: McpToolServerInput[]): number {
    const desired = new Set(servers.map(serverKey))
    let pruned = 0
    for (const [key, record] of [...this.servers]) {
      if (desired.has(key)) continue
      // Leave in-flight connects alone: they belong to a concurrent connect()
      // call for a server that IS configured (or will settle and be pruned on
      // the next reconcile).
      if (record.pending) continue
      this.dropServer(key)
      pruned += 1
      debugLog("mcp", "pruned removed server", { server: record.connection.info.name, toolCount: record.toolNames.length })
    }
    return pruned
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
    for (const record of this.servers.values()) record.connection.shutdown()
    this.servers.clear()
    this.agentTools = []
    this.agentToolNames.clear()
  }
}

function normalizeConnectTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return CONNECT_TIMEOUT_MS
  return Math.max(250, Math.min(120_000, Math.floor(value)))
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
      if (result.isError) {
        throw new Error(`MCP tool ${label} failed: ${text}`)
      }
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
  const seenServerNames = new Set<string>()
  const collect = (scope: "user" | "project", source?: ProjectMcpConfig) => {
    if (!source) return
    for (const { name, entry } of extractMcpServerEntries(source.config)) {
      if (seenServerNames.has(name)) {
        skipped.push({ scope, name, reason: "shadowed by project MCP server" })
        continue
      }
      seenServerNames.add(name)
      if (entry.disabled) {
        skipped.push({ scope, name, reason: "disabled" })
        continue
      }
      if (scope === "project" && entry.trusted !== true) {
        skipped.push({ scope, name, reason: "untrusted project MCP server" })
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
