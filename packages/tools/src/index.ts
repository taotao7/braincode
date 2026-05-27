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

export type ToolConfigDocument = {
  tools: ToolConfiguration[]
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
  }
}

export { createLocalCodingTools, localCodingToolNames, type LocalCodingToolName, type LocalCodingToolOptions, type LocalToolMode } from "./local"

export function normalizeToolConfiguration(document: ToolConfigDocument): ToolConfigDocument {
  const configuredByName = new Map(document.tools.map((tool) => [tool.name, tool]))
  const knownTools = builtInToolDefinitions.map((tool) => {
    const configured = configuredByName.get(tool.name)
    return {
      ...tool,
      permissions: [...tool.permissions],
      enabled: configured?.enabled ?? tool.defaultEnabled,
      approvalPolicy: normalizeApprovalPolicy(configured, tool),
    }
  })
  const customTools = document.tools
    .filter((tool) => !builtInToolDefinitions.some((builtIn) => builtIn.name === tool.name))
    .map((tool) => ({
      ...tool,
      approvalPolicy: normalizeApprovalPolicy(tool, tool),
    }))

  return { tools: [...knownTools, ...customTools] }
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
