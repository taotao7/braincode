export type ToolPermission = "read" | "write" | "execute"

export type ToolRisk = "low" | "medium" | "high"

export type ToolApprovalPolicy = "allow" | "confirm-dangerous"

export type CheckPatchKind =
  | "docs-only"
  | "frontend"
  | "backend"
  | "test-only"
  | "package-change"
  | "auth-risk"
  | "db-risk"
  | "ci-risk"
  | "unknown-code"

export type CheckSelectionStrategy = "smart" | "all"

export type CheckPolicyConfiguration = {
  enabled?: boolean
  scripts?: string[]
  review?: "required" | "optional"
  reason?: string
}

export type CheckPolicyConfigurationMap = Partial<Record<CheckPatchKind, CheckPolicyConfiguration>>

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
  strategy: CheckSelectionStrategy
  policies: CheckPolicyConfigurationMap
  timeoutMs: number
  maxOutputBytes: number
}

export type PartialCheckRunnerConfiguration = {
  enabled?: boolean
  scripts?: string[]
  strategy?: CheckSelectionStrategy
  policies?: CheckPolicyConfigurationMap
  timeoutMs?: number
  maxOutputBytes?: number
}

export {
  createDefaultPermissionPolicy,
  evaluateToolPermissionPolicy,
  extractPatchTargetPaths,
  extractToolCommand,
  extractToolTargetPaths,
  formatPermissionPolicyDenial,
  formatPermissionPolicyReason,
  normalizePermissionPolicy,
  summarizePermissionPolicyEvaluation,
} from "./permission-policy"
export type {
  CommandPermissionRule,
  PathPermissionRule,
  PermissionPolicyAction,
  PermissionPolicyDecision,
  PermissionPolicyDocument,
  PermissionPolicyEvaluation,
  PermissionPolicyMatch,
  PermissionPolicyReview,
} from "./permission-policy"
import { createDefaultPermissionPolicy, normalizePermissionPolicy, type PermissionPolicyDocument } from "./permission-policy"

export type ToolConfigDocument = {
  tools: ToolConfiguration[]
  checks?: CheckRunnerConfiguration
  permissions?: PermissionPolicyDocument
}

const DEFAULT_CHECK_TIMEOUT_MS = 180_000
const DEFAULT_CHECK_OUTPUT_BYTES = 24_000
const CHECK_PATCH_KINDS: CheckPatchKind[] = [
  "docs-only",
  "frontend",
  "backend",
  "test-only",
  "package-change",
  "auth-risk",
  "db-risk",
  "ci-risk",
  "unknown-code",
]

export const defaultCheckRunnerConfiguration: CheckRunnerConfiguration = {
  enabled: true,
  scripts: [],
  strategy: "smart",
  policies: {},
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
    name: "exec_command",
    description: "Run a shell command and return output or a session id for ongoing interaction.",
    permissions: ["execute"],
    risk: "high",
    defaultEnabled: true,
    approvalPolicy: "confirm-dangerous",
  },
  {
    name: "write_stdin",
    description: "Write input to, or poll output from, an ongoing exec_command session.",
    permissions: ["execute"],
    risk: "high",
    defaultEnabled: true,
    approvalPolicy: "confirm-dangerous",
  },
  {
    name: "list_background",
    description: "List active and recently-exited exec_command sessions, including background processes.",
    permissions: ["execute"],
    risk: "low",
    defaultEnabled: true,
    approvalPolicy: "allow",
  },
  {
    name: "kill_background",
    description: "Terminate an exec_command session (background or foreground) by its session id.",
    permissions: ["execute"],
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
    checks: { ...defaultCheckRunnerConfiguration, scripts: [], policies: {} },
    permissions: createDefaultPermissionPolicy(),
  }
}

export { createLocalCodingTools, localCodingToolNames, ExecSessionManager, type LocalCodingToolName, type LocalCodingToolOptions, type LocalToolMode, type BackgroundExitInfo, type BackgroundExitListener, type ExecSessionSummary } from "./local"

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

  return {
    tools: [...knownTools, ...customTools],
    checks: normalizeCheckRunnerConfiguration(document.checks),
    permissions: normalizePermissionPolicy(document.permissions),
  }
}

export function normalizeCheckRunnerConfiguration(value: unknown): CheckRunnerConfiguration {
  const partial = normalizePartialCheckRunnerConfiguration(value)
  return {
    enabled: partial.enabled ?? defaultCheckRunnerConfiguration.enabled,
    scripts: partial.scripts ?? [],
    strategy: partial.strategy ?? defaultCheckRunnerConfiguration.strategy,
    policies: partial.policies ?? {},
    timeoutMs: partial.timeoutMs ?? defaultCheckRunnerConfiguration.timeoutMs,
    maxOutputBytes: partial.maxOutputBytes ?? defaultCheckRunnerConfiguration.maxOutputBytes,
  }
}

export function normalizePartialCheckRunnerConfiguration(value: unknown): PartialCheckRunnerConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const output: PartialCheckRunnerConfiguration = {}
  if (typeof record.enabled === "boolean") output.enabled = record.enabled
  if (Array.isArray(record.scripts)) output.scripts = normalizeStringArray(record.scripts)
  const strategy = normalizeCheckSelectionStrategy(record.strategy)
  if (strategy) output.strategy = strategy
  const policies = normalizeCheckPolicyConfigurationMap(record.policies)
  if (Object.keys(policies).length > 0) output.policies = policies
  const timeoutMs = normalizeOptionalInteger(record.timeoutMs, 1_000, 900_000)
  if (timeoutMs !== undefined) output.timeoutMs = timeoutMs
  const maxOutputBytes = normalizeOptionalInteger(record.maxOutputBytes, 1_000, 512_000)
  if (maxOutputBytes !== undefined) output.maxOutputBytes = maxOutputBytes
  return output
}

export function mergeCheckRunnerConfiguration(
  base: CheckRunnerConfiguration,
  override?: PartialCheckRunnerConfiguration,
): CheckRunnerConfiguration {
  const normalizedBase = normalizeCheckRunnerConfiguration(base)
  if (!override) return normalizedBase
  const normalizedOverride = normalizePartialCheckRunnerConfiguration(override)
  return {
    enabled: normalizedOverride.enabled ?? normalizedBase.enabled,
    scripts: normalizedOverride.scripts ?? normalizedBase.scripts,
    strategy: normalizedOverride.strategy ?? normalizedBase.strategy,
    policies: mergeCheckPolicyConfigurationMaps(normalizedBase.policies, normalizedOverride.policies),
    timeoutMs: normalizedOverride.timeoutMs ?? normalizedBase.timeoutMs,
    maxOutputBytes: normalizedOverride.maxOutputBytes ?? normalizedBase.maxOutputBytes,
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

function normalizeCheckSelectionStrategy(value: unknown): CheckSelectionStrategy | undefined {
  return value === "smart" || value === "all" ? value : undefined
}

function normalizeCheckPolicyConfigurationMap(value: unknown): CheckPolicyConfigurationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const output: CheckPolicyConfigurationMap = {}
  for (const kind of CHECK_PATCH_KINDS) {
    const policy = normalizeCheckPolicyConfiguration(record[kind])
    if (policy) output[kind] = policy
  }
  return output
}

function normalizeCheckPolicyConfiguration(value: unknown): CheckPolicyConfiguration | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const output: CheckPolicyConfiguration = {}
  if (typeof record.enabled === "boolean") output.enabled = record.enabled
  if (Array.isArray(record.scripts)) output.scripts = normalizeStringArray(record.scripts)
  if (record.review === "required" || record.review === "optional") output.review = record.review
  if (typeof record.reason === "string" && record.reason.trim()) output.reason = record.reason.trim()
  return Object.keys(output).length > 0 ? output : undefined
}

function mergeCheckPolicyConfigurationMaps(
  base: CheckPolicyConfigurationMap,
  override: CheckPolicyConfigurationMap | undefined,
): CheckPolicyConfigurationMap {
  const output: CheckPolicyConfigurationMap = { ...base }
  if (!override) return output
  for (const kind of CHECK_PATCH_KINDS) {
    const next = override[kind]
    if (!next) continue
    output[kind] = { ...(output[kind] ?? {}), ...next }
  }
  return output
}

function normalizeInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function normalizeOptionalInteger(value: unknown, min: number, max: number): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
