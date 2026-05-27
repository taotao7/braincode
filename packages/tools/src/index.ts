export type ToolPermission = "read" | "write" | "execute"

export type ToolRisk = "low" | "medium" | "high"

export type ToolApprovalPolicy = "allow" | "confirm-dangerous"

export type ToolDefinition = {
  name: string
  description: string
  permissions: ToolPermission[]
  risk: ToolRisk
  defaultEnabled: boolean
  approvalPolicy: ToolApprovalPolicy
}

export type ToolConfiguration = ToolDefinition & {
  enabled: boolean
}

export type CheckRunnerConfiguration = {
  enabled: boolean
  scripts: string[]
  timeoutMs: number
  maxOutputBytes: number
}

export type ToolConfigDocument = {
  tools: ToolConfiguration[]
  checks?: CheckRunnerConfiguration
}

const DEFAULT_CHECK_TIMEOUT_MS = 180_000
const DEFAULT_CHECK_OUTPUT_BYTES = 24_000

export const defaultCheckRunnerConfiguration: CheckRunnerConfiguration = {
  enabled: true,
  scripts: [],
  timeoutMs: DEFAULT_CHECK_TIMEOUT_MS,
  maxOutputBytes: DEFAULT_CHECK_OUTPUT_BYTES,
}

export const builtInToolDefinitions: ToolDefinition[] = [
  {
    name: "list_files",
    description: "List project files inside the current project workspace.",
    permissions: ["read"],
    risk: "low",
    defaultEnabled: true,
    approvalPolicy: "allow",
  },
  {
    name: "read_file",
    description: "Read files inside the current project workspace.",
    permissions: ["read"],
    risk: "low",
    defaultEnabled: true,
    approvalPolicy: "allow",
  },
  {
    name: "search_files",
    description: "Search project files by path or text pattern.",
    permissions: ["read"],
    risk: "low",
    defaultEnabled: true,
    approvalPolicy: "allow",
  },
  {
    name: "edit_file",
    description: "Modify files in the current project workspace.",
    permissions: ["write"],
    risk: "medium",
    defaultEnabled: true,
    approvalPolicy: "confirm-dangerous",
  },
  {
    name: "apply_patch",
    description: "Apply unified diffs to files in the current project workspace.",
    permissions: ["write"],
    risk: "medium",
    defaultEnabled: true,
    approvalPolicy: "confirm-dangerous",
  },
  {
    name: "shell",
    description: "Run shell commands in the current project workspace.",
    permissions: ["execute"],
    risk: "high",
    defaultEnabled: true,
    approvalPolicy: "confirm-dangerous",
  },
  {
    name: "git_diff",
    description: "Inspect git diffs in the current project workspace.",
    permissions: ["read"],
    risk: "low",
    defaultEnabled: true,
    approvalPolicy: "allow",
  },
  {
    name: "get_changed_files",
    description: "Inspect changed files in the current project workspace.",
    permissions: ["read"],
    risk: "low",
    defaultEnabled: true,
    approvalPolicy: "allow",
  },
  {
    name: "run_script",
    description: "Run package scripts in the current project workspace.",
    permissions: ["execute"],
    risk: "high",
    defaultEnabled: true,
    approvalPolicy: "confirm-dangerous",
  },
]

export function createDefaultToolConfiguration(): ToolConfigDocument {
  return {
    tools: builtInToolDefinitions.map((tool) => ({
      ...tool,
      permissions: [...tool.permissions],
      enabled: tool.defaultEnabled,
    })),
    checks: { ...defaultCheckRunnerConfiguration, scripts: [] },
  }
}

export { createLocalCodingTools, localCodingToolNames, type LocalCodingToolName, type LocalCodingToolOptions, type LocalToolMode } from "./local"

export function normalizeToolConfiguration(document: ToolConfigDocument): ToolConfigDocument {
  const configuredTools = Array.isArray(document.tools) ? document.tools : []
  const configuredByName = new Map(configuredTools.map((tool) => [tool.name, tool]))
  const knownTools = builtInToolDefinitions.map((tool) => {
    const configured = configuredByName.get(tool.name)
    return {
      ...tool,
      permissions: [...tool.permissions],
      enabled: configured?.enabled ?? tool.defaultEnabled,
      approvalPolicy: normalizeApprovalPolicy(configured, tool),
    }
  })
  const customTools = configuredTools
    .filter((tool) => !builtInToolDefinitions.some((builtIn) => builtIn.name === tool.name))
    .map((tool) => ({
      ...tool,
      approvalPolicy: normalizeApprovalPolicy(tool, tool),
    }))

  return { tools: [...knownTools, ...customTools], checks: normalizeCheckRunnerConfiguration(document.checks) }
}

export function normalizeCheckRunnerConfiguration(value: unknown): CheckRunnerConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...defaultCheckRunnerConfiguration, scripts: [] }
  }
  const record = value as Record<string, unknown>
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : defaultCheckRunnerConfiguration.enabled,
    scripts: normalizeStringArray(record.scripts),
    timeoutMs: normalizeInteger(record.timeoutMs, 1_000, 900_000, defaultCheckRunnerConfiguration.timeoutMs),
    maxOutputBytes: normalizeInteger(record.maxOutputBytes, 1_000, 512_000, defaultCheckRunnerConfiguration.maxOutputBytes),
  }
}

function normalizeApprovalPolicy(configured: unknown, fallback: ToolDefinition): ToolApprovalPolicy {
  if (configured && typeof configured === "object") {
    const record = configured as Record<string, unknown>
    if (record.approvalPolicy === "allow" || record.approvalPolicy === "confirm-dangerous") return record.approvalPolicy
    if (record.requiresApproval === true) return "confirm-dangerous"
    if (record.requiresApproval === false) return "allow"
  }
  return fallback.approvalPolicy
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    output.push(trimmed)
  }
  return output
}

function normalizeInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
