export type PermissionPolicyAction = "allow" | "ask" | "deny"

export type PermissionPolicyReview = "required" | "optional"

export type PathPermissionRule = {
  pattern: string
  edit: PermissionPolicyAction
  review?: PermissionPolicyReview
  reason?: string
}

export type CommandPermissionRule = {
  pattern: string
  policy: PermissionPolicyAction
  review?: PermissionPolicyReview
  reason?: string
}

export type PermissionPolicyDocument = {
  paths: PathPermissionRule[]
  commands: CommandPermissionRule[]
}

export type PermissionPolicyDecision = PermissionPolicyAction | "none"

export type PermissionPolicyMatch = {
  kind: "path" | "command"
  pattern: string
  action: PermissionPolicyAction
  reviewRequired: boolean
  target: string
  reason?: string
}

export type PermissionPolicyEvaluation = {
  action: PermissionPolicyDecision
  reviewRequired: boolean
  matches: PermissionPolicyMatch[]
  targetPaths: string[]
  command?: string
  reason?: string
}

type JsonRecord = Record<string, unknown>

const DEFAULT_PATH_PERMISSION_RULES: PathPermissionRule[] = [
  { pattern: "src/auth/**", edit: "ask", review: "required" },
  { pattern: "src/payment/**", edit: "ask", review: "required" },
  { pattern: "db/**", edit: "ask", review: "required" },
  { pattern: "package.json", edit: "ask", review: "required" },
  { pattern: ".github/workflows/**", edit: "ask", review: "required" },
  { pattern: "../**", edit: "deny" },
]

const DEFAULT_COMMAND_PERMISSION_RULES: CommandPermissionRule[] = [
  { pattern: "bun test", policy: "allow" },
  { pattern: "bun run test", policy: "allow" },
  { pattern: "npm test", policy: "allow" },
  { pattern: "npm run test", policy: "allow" },
  { pattern: "pnpm test", policy: "allow" },
  { pattern: "pnpm run test", policy: "allow" },
  { pattern: "yarn test", policy: "allow" },
  { pattern: "yarn run test", policy: "allow" },
  { pattern: "git push", policy: "deny" },
  { pattern: "bun publish", policy: "deny" },
  { pattern: "bun run publish", policy: "deny" },
  { pattern: "npm publish", policy: "deny" },
  { pattern: "npm run publish", policy: "deny" },
  { pattern: "pnpm publish", policy: "deny" },
  { pattern: "pnpm run publish", policy: "deny" },
  { pattern: "yarn publish", policy: "deny" },
  { pattern: "yarn run publish", policy: "deny" },
  { pattern: "rm -rf", policy: "deny" },
]

export function createDefaultPermissionPolicy(): PermissionPolicyDocument {
  return {
    paths: DEFAULT_PATH_PERMISSION_RULES.map((rule) => ({ ...rule })),
    commands: DEFAULT_COMMAND_PERMISSION_RULES.map((rule) => ({ ...rule })),
  }
}

export function normalizePermissionPolicy(value: unknown): PermissionPolicyDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createDefaultPermissionPolicy()
  const record = value as JsonRecord
  return {
    paths: mergePermissionRules(
      DEFAULT_PATH_PERMISSION_RULES,
      normalizePathPermissionRules(record.paths),
      (rule) => `path:${rule.pattern}:${rule.edit}:${rule.review ?? ""}`,
    ),
    commands: mergePermissionRules(
      DEFAULT_COMMAND_PERMISSION_RULES,
      normalizeCommandPermissionRules(record.commands),
      (rule) => `command:${rule.pattern}:${rule.policy}:${rule.review ?? ""}`,
    ),
  }
}

export function evaluateToolPermissionPolicy(
  toolName: string,
  args: unknown,
  policy: PermissionPolicyDocument | undefined,
): PermissionPolicyEvaluation {
  const normalizedPolicy = normalizePermissionPolicy(policy)
  const targetPaths = extractToolTargetPaths(toolName, args)
  const command = extractToolCommand(toolName, args)
  const matches: PermissionPolicyMatch[] = []

  for (const targetPath of targetPaths) {
    for (const rule of normalizedPolicy.paths) {
      if (!pathPolicyMatch(targetPath, rule.pattern)) continue
      matches.push({
        kind: "path",
        pattern: rule.pattern,
        action: rule.edit,
        reviewRequired: rule.review === "required",
        target: targetPath,
        ...(rule.reason ? { reason: rule.reason } : {}),
      })
    }
  }

  if (command) {
    for (const rule of normalizedPolicy.commands) {
      if (!commandPolicyMatch(command, rule.pattern)) continue
      matches.push({
        kind: "command",
        pattern: rule.pattern,
        action: rule.policy,
        reviewRequired: rule.review === "required",
        target: command,
        ...(rule.reason ? { reason: rule.reason } : {}),
      })
    }
  }

  const action = resolvePolicyAction(matches)
  const reviewRequired = matches.some((match) => match.reviewRequired)
  return {
    action,
    reviewRequired,
    matches,
    targetPaths,
    ...(command ? { command } : {}),
    ...(matches.length > 0 ? { reason: formatPermissionPolicyReason(matches) } : {}),
  }
}

export function summarizePermissionPolicyEvaluation(evaluation: PermissionPolicyEvaluation): Omit<PermissionPolicyEvaluation, "targetPaths"> & { targetPaths?: string[] } {
  return {
    action: evaluation.action,
    reviewRequired: evaluation.reviewRequired,
    matches: evaluation.matches,
    ...(evaluation.targetPaths.length > 0 ? { targetPaths: evaluation.targetPaths } : {}),
    ...(evaluation.command ? { command: evaluation.command } : {}),
    ...(evaluation.reason ? { reason: evaluation.reason } : {}),
  }
}

export function formatPermissionPolicyReason(matches: PermissionPolicyMatch[]): string {
  if (matches.length === 0) return "No permission policy matched."
  return matches.map((match) => {
    const review = match.reviewRequired ? ", review required" : ""
    const reason = match.reason ? `, ${match.reason}` : ""
    return `${match.kind} ${match.target} matched ${match.pattern}: ${match.action}${review}${reason}`
  }).join("; ")
}

export function formatPermissionPolicyDenial(evaluation: PermissionPolicyEvaluation): string {
  return `Permission policy denied tool call: ${evaluation.reason ?? "deny rule matched"}`
}

export function extractToolTargetPaths(toolName: string, args: unknown): string[] {
  const name = toolName.toLowerCase()
  const record = asRecord(args)
  const paths = new Set<string>()
  const addPath = (value: unknown) => {
    if (typeof value !== "string") return
    const normalized = normalizePolicyPath(value)
    if (normalized) paths.add(normalized)
  }

  if (/(edit_file|filesystem__write|create_file|create-file|write_file|write-file)/.test(name)) {
    addPath(record.path ?? record.file ?? record.filePath)
  }
  if (/(apply_patch|patch)/.test(name)) {
    const patch = typeof record.patch === "string" ? record.patch : typeof record.diff === "string" ? record.diff : undefined
    if (patch) {
      for (const path of extractPatchTargetPaths(patch)) paths.add(path)
    }
  }
  return [...paths]
}

export function extractPatchTargetPaths(patch: string): string[] {
  const paths = new Set<string>()
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      const path = line.slice(4).trim()
      if (path !== "/dev/null") paths.add(stripDiffPrefix(path))
    } else if (line.startsWith("diff --git ")) {
      const parts = line.split(/\s+/)
      if (parts[2]) paths.add(stripDiffPrefix(parts[2]))
      if (parts[3]) paths.add(stripDiffPrefix(parts[3]))
    } else if (line.startsWith("rename from ") || line.startsWith("rename to ")) {
      paths.add(normalizePolicyPath(line.slice(line.indexOf(" ") + 1).trim()))
    }
  }
  return [...paths].filter(Boolean)
}

export function extractToolCommand(toolName: string, args: unknown): string | undefined {
  const name = toolName.toLowerCase()
  const record = asRecord(args)
  if (/(exec_command|shell|terminal|bash|zsh|cmd|powershell)/.test(name)) {
    return normalizeCommandText(record.cmd ?? record.command)
  }
  if (/run_script/.test(name)) {
    const script = typeof record.script === "string" ? record.script : typeof record.name === "string" ? record.name : undefined
    if (!script) return undefined
    const rawArgs = Array.isArray(record.args) ? record.args.filter((value): value is string => typeof value === "string") : []
    return normalizeCommandText(["bun", "run", script, ...rawArgs].join(" "))
  }
  return undefined
}

function normalizePathPermissionRules(value: unknown): PathPermissionRule[] {
  if (!Array.isArray(value)) return []
  const rules: PathPermissionRule[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as JsonRecord
    const pattern = normalizePolicyPath(record.pattern)
    const edit = normalizePermissionAction(record.edit)
    if (!pattern || !edit) continue
    rules.push({
      pattern,
      edit,
      ...(record.review === "required" || record.review === "optional" ? { review: record.review } : {}),
      ...(typeof record.reason === "string" && record.reason.trim() ? { reason: record.reason.trim() } : {}),
    })
  }
  return rules
}

function normalizeCommandPermissionRules(value: unknown): CommandPermissionRule[] {
  if (!Array.isArray(value)) return []
  const rules: CommandPermissionRule[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as JsonRecord
    const pattern = normalizeCommandText(record.pattern)
    const policy = normalizePermissionAction(record.policy)
    if (!pattern || !policy) continue
    rules.push({
      pattern,
      policy,
      ...(record.review === "required" || record.review === "optional" ? { review: record.review } : {}),
      ...(typeof record.reason === "string" && record.reason.trim() ? { reason: record.reason.trim() } : {}),
    })
  }
  return rules
}

function mergePermissionRules<TRule>(defaults: readonly TRule[], configured: readonly TRule[], keyForRule: (rule: TRule) => string): TRule[] {
  const seen = new Set<string>()
  const output: TRule[] = []
  for (const rule of [...defaults, ...configured]) {
    const key = keyForRule(rule)
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ ...rule })
  }
  return output
}

function resolvePolicyAction(matches: PermissionPolicyMatch[]): PermissionPolicyDecision {
  if (matches.some((match) => match.action === "deny")) return "deny"
  if (matches.some((match) => match.action === "ask")) return "ask"
  if (matches.some((match) => match.action === "allow")) return "allow"
  return "none"
}

function normalizePermissionAction(value: unknown): PermissionPolicyAction | undefined {
  return value === "allow" || value === "ask" || value === "deny" ? value : undefined
}

function pathPolicyMatch(path: string, pattern: string): boolean {
  const normalizedPath = normalizePolicyPath(path)
  const normalizedPattern = normalizePolicyPath(pattern)
  if (!normalizedPath || !normalizedPattern) return false
  return globMatch(normalizedPath, normalizedPattern)
}

function commandPolicyMatch(command: string, pattern: string): boolean {
  const normalizedCommand = normalizeCommandText(command)
  const normalizedPattern = normalizeCommandText(pattern)
  if (!normalizedCommand || !normalizedPattern) return false
  if (normalizedPattern.includes("*")) return globMatch(normalizedCommand, normalizedPattern)
  return normalizedCommand === normalizedPattern
    || normalizedCommand.startsWith(`${normalizedPattern} `)
    || normalizedCommand.includes(` ${normalizedPattern} `)
    // Also match when the pattern ends the command ("cd x && git push"), so
    // chained commands cannot slip past deny rules like "git push".
    || normalizedCommand.endsWith(` ${normalizedPattern}`)
}

function globMatch(value: string, glob: string): boolean {
  if (!glob.includes("*")) return value === glob
  let pattern = ""
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    const next = glob[index + 1]
    if (char === "*" && next === "*") {
      pattern += ".*"
      index += 1
    } else if (char === "*") {
      pattern += "[^/]*"
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    }
  }
  return new RegExp(`^${pattern}$`).test(value)
}

function normalizePolicyPath(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .trim()
    .replace(/^"|"$/g, "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
}

function normalizeCommandText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().replace(/\s+/g, " ")
  return normalized ? normalized.toLowerCase() : undefined
}

function stripDiffPrefix(path: string): string {
  const unquoted = normalizePolicyPath(path)
  return unquoted.startsWith("a/") || unquoted.startsWith("b/") ? unquoted.slice(2) : unquoted
}

function asRecord(args: unknown): JsonRecord {
  return args && typeof args === "object" && !Array.isArray(args) ? args as JsonRecord : {}
}
