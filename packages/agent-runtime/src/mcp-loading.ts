import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
import { Type } from "typebox"
import { debugLog } from "@braincode/shared"
import type { ToolEvidenceCache } from "./evidence-cache"
import { wrapToolsWithEvidenceCache } from "./evidence-cache"
import type { BraincodeAgentRuntime } from "./runtime-agent"
import { collectMcpToolServers, type McpHubConnectReport, type McpLoadingStrategy, type McpToolHub } from "./mcp"

export const DEFAULT_MCP_STARTUP_BUDGET_MS = 10_000
export const DEFAULT_MCP_PER_SERVER_CONNECT_TIMEOUT_MS = 15_000

export type RuntimeMcpLoader = {
  initialize: () => Promise<void>
  report: () => McpHubConnectReport
  activeRuntimes: Set<BraincodeAgentRuntime>
  refreshRuntimeTools: (runtime: BraincodeAgentRuntime) => void
  stop: () => void
}

export function createRuntimeMcpLoader(options: {
  hub: McpToolHub
  servers: ReturnType<typeof collectMcpToolServers>["servers"]
  skipped: McpHubConnectReport["skipped"]
  strategy: McpLoadingStrategy
  startupBudgetMs: number
  perServerConnectTimeoutMs: number
  runtimeTools: AgentTool[]
  localToolCount: number
  toolEvidenceCache: ToolEvidenceCache
  publishReport: (report: McpHubConnectReport) => Promise<void>
}): RuntimeMcpLoader {
  const activeRuntimes = new Set<BraincodeAgentRuntime>()
  let callbacksActive = true
  let connectStarted = false
  let connectSettled = false
  let connectPromise: Promise<McpHubConnectReport> | undefined
  let report: McpHubConnectReport = createMcpReport({
    connected: [],
    failed: [],
    skipped: options.skipped,
    pending: options.servers.length > 0 ? pendingMcpServers(options.servers, "not started") : [],
    loading: false,
    strategy: options.strategy,
    toolCount: 0,
  })

  const publish = async (nextReport: McpHubConnectReport) => {
    report = nextReport
    if (!callbacksActive) return
    try {
      await options.publishReport(nextReport)
    } catch (error) {
      debugLog("mcp", "report listener failed", { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const refreshRuntimeTools = (runtime: BraincodeAgentRuntime) => {
    runtime.agent.state.tools = wrapToolsWithEvidenceCache(options.runtimeTools, options.toolEvidenceCache)
  }

  const syncMcpTools = () => {
    const connectorTools = options.servers.length > 0 && !connectSettled ? [connectTool] : []
    options.runtimeTools.splice(options.localToolCount, options.runtimeTools.length - options.localToolCount, ...options.hub.getTools(), ...connectorTools)
    for (const runtime of activeRuntimes) refreshRuntimeTools(runtime)
  }

  const startConnect = async (): Promise<McpHubConnectReport> => {
    if (connectPromise) return connectPromise
    connectStarted = true
    connectPromise = options.hub.connect(options.servers, {
      perServerConnectTimeoutMs: options.perServerConnectTimeoutMs,
    }).then(async (connectReport) => {
      connectSettled = true
      const finalReport = createMcpReport({
        connected: connectReport.connected,
        failed: connectReport.failed,
        skipped: [...options.skipped, ...connectReport.skipped],
        pending: [],
        loading: false,
        strategy: options.strategy,
        toolCount: connectReport.toolCount,
      })
      syncMcpTools()
      await publish(finalReport)
      return finalReport
    }).catch(async (error) => {
      connectSettled = true
      const message = error instanceof Error ? error.message : String(error)
      const failed = options.servers.map((server) => ({ scope: server.scope, name: server.name, error: message }))
      const failedReport = createMcpReport({
        connected: [],
        failed,
        skipped: options.skipped,
        pending: [],
        loading: false,
        strategy: options.strategy,
        toolCount: 0,
      })
      syncMcpTools()
      await publish(failedReport)
      return failedReport
    })
    return connectPromise
  }

  const connectTool: AgentTool = createMcpConnectTool({ connect: startConnect })
  syncMcpTools()

  return {
    activeRuntimes,
    report: () => report,
    refreshRuntimeTools,
    stop: () => {
      callbacksActive = false
    },
    initialize: async () => {
      if (options.servers.length === 0) {
        if (options.skipped.length > 0) await publish(report)
        return
      }
      if (options.strategy === "lazy") {
        report = createMcpReport({
          connected: [],
          failed: [],
          skipped: options.skipped,
          pending: pendingMcpServers(options.servers, "lazy loading deferred"),
          loading: false,
          strategy: options.strategy,
          toolCount: 0,
        })
        await publish(report)
        return
      }
      if (options.strategy === "background") {
        report = createMcpReport({
          connected: [],
          failed: [],
          skipped: options.skipped,
          pending: pendingMcpServers(options.servers, "loading in background"),
          loading: true,
          strategy: options.strategy,
          toolCount: 0,
        })
        await publish(report)
        void startConnect()
        return
      }

      const startupBudgetMs = options.startupBudgetMs
      const connection = startConnect()
      const completed = await waitForCompletionWithin(connection, startupBudgetMs)
      if (!completed && connectStarted && !connectSettled) {
        report = createMcpReport({
          connected: [],
          failed: [],
          skipped: options.skipped,
          pending: pendingMcpServers(options.servers, `startup budget exceeded after ${startupBudgetMs}ms`),
          loading: true,
          strategy: options.strategy,
          toolCount: 0,
        })
        await publish(report)
      }
    },
  }
}

export function normalizeRuntimeInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function createMcpConnectTool(options: {
  connect: () => Promise<McpHubConnectReport>
}): AgentTool {
  return {
    name: "mcp__connect",
    label: "MCP Connect",
    description: "Connect configured MCP servers and expose their tools when lazy or background loading is active.",
    parameters: Type.Object({}),
    prepareArguments: () => ({}),
    execute: async () => {
      const report = await options.connect()
      return {
        content: [{ type: "text", text: formatMcpConnectToolReport(report) }],
        details: { tool: "mcp__connect", report },
      } satisfies AgentToolResult<unknown>
    },
    executionMode: "sequential",
  }
}

function formatMcpConnectToolReport(report: McpHubConnectReport): string {
  const lines = ["MCP connection report:"]
  if (report.connected.length > 0) {
    lines.push(`Connected: ${report.connected.map((entry) => `${entry.name} (${entry.toolCount} tools)`).join(", ")}`)
  }
  if (report.failed.length > 0) {
    lines.push(`Failed: ${report.failed.map((entry) => `${entry.name} (${entry.error})`).join(", ")}`)
  }
  if (report.skipped.length > 0) {
    lines.push(`Skipped: ${report.skipped.map((entry) => `${entry.name} (${entry.reason})`).join(", ")}`)
  }
  const pending = report.pending ?? []
  if (pending.length > 0) {
    lines.push(`Pending: ${pending.map((entry) => `${entry.name} (${entry.reason})`).join(", ")}`)
  }
  if (lines.length === 1) lines.push("No MCP servers configured.")
  return lines.join("\n")
}

function pendingMcpServers(servers: ReturnType<typeof collectMcpToolServers>["servers"], reason: string): NonNullable<McpHubConnectReport["pending"]> {
  return servers.map((server) => ({ scope: server.scope, name: server.name, reason }))
}

function createMcpReport(report: McpHubConnectReport): McpHubConnectReport {
  return {
    connected: report.connected,
    failed: report.failed,
    skipped: report.skipped,
    pending: report.pending ?? [],
    toolCount: report.toolCount,
    loading: report.loading ?? false,
    strategy: report.strategy,
  }
}

async function waitForCompletionWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  if (timeoutMs <= 0) return false
  return await new Promise<boolean>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(false)
    }, timeoutMs)
    promise.then(
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(true)
      },
    )
  })
}
