import { spawn } from "node:child_process"
import { resolve as resolvePath, relative as relativePath, isAbsolute } from "node:path"
import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core"
export type { AgentEvent } from "@earendil-works/pi-agent-core"
import { collectMcpToolServers, McpToolHub, type McpHubConnectReport } from "./mcp"
export { collectMcpToolServers, McpToolHub } from "./mcp"
export type { McpHubConnectReport, McpToolServerInput } from "./mcp"
import type { ImageContent, Model } from "@earendil-works/pi-ai"
import { createAgentTodoId, formatRoutedAgentRoleCatalog, getAgentRoleSystemPrompt, getModePolicy, normalizeAgentRoutingPlan, planAgentRouting, selectBrain, selectModelPolicy, type AgentRole, type AgentRoutingPlan, type AgentTodoDependency, type AgentTodoItem, type AgentTodoStatus, type AgentWorkerPlan, type BrainModel, type BraincodeMode, type ModelPolicy, type RoutedAgentRole } from "@braincode/brain"
import { appendSessionRecord, defaultBrains, defaultModels, readBrains, readHookSources, readModels, readProjectSupport, readProviderApiKey, readSessionContext, readSettings, readTools, readUserSupport, type HookEventName, type HookHandler, type HookMatcherGroup, type HookSource, type ProjectSupport, type SessionContext } from "@braincode/config"
import { agentToBrainContextTransfer, brainToAgentContextTransfer, type HandoffPacket, type TaskProgress, type WorkerResult } from "@braincode/context"
import type { BraincodeModel } from "@braincode/llm"
import { resolveBuiltInPiModel } from "@braincode/llm"
import type { ContextRef } from "@braincode/protocol"
import { debugLog } from "@braincode/shared"
import { createLocalCodingTools } from "@braincode/tools"

export type AgentRunRequest = {
  prompt: string
  sessionId?: string
  projectRoot?: string
  forceRoles?: RoutedAgentRole[]
  onPlan?: (plan: RuntimePlan) => void | Promise<void>
  onTodoEvent?: (event: TodoLifecycleEvent) => void | Promise<void>
  onEvent?: (event: AgentEvent) => void | Promise<void>
  onToolApproval?: (request: ToolApprovalRequest, signal?: AbortSignal) => ToolApprovalDecision | Promise<ToolApprovalDecision>
  onMcpReport?: (report: McpHubConnectReport) => void | Promise<void>
  onWorkerEvent?: (event: WorkerLifecycleEvent) => void | Promise<void>
}

export type ToolApprovalRequest = {
  toolCallId: string
  toolName: string
  args: unknown
}

export type ToolApprovalDecision = {
  approved: boolean
  reason?: string
}

export type WorkerLifecycleEvent =
  | { type: "worker_start"; role: RoutedAgentRole; goal: string; phase: "support" | "review"; modelId: string; todoIds?: string[] }
  | { type: "worker_end"; role: RoutedAgentRole; phase: "support" | "review"; status: "completed" | "failed"; summary?: string; error?: string; todoIds?: string[] }

export type TodoLifecycleEvent = {
  type: "todo_update"
  todo: AgentTodoItem
  status: AgentTodoStatus
  phase: "planning" | "support" | "primary" | "review"
  role?: RoutedAgentRole
  summary?: string
  error?: string
}

export type AgentRunResult = {
  sessionId: string
  summary: string
  plan: RuntimePlan
  workerResults: ExecutedWorkerResult[]
  mcp?: McpHubConnectReport
  patch?: PatchSummary
  checks?: PatchCheckSummary
}

export type PatchFileChange = {
  path: string
  status: string
}

export type PatchBaseline = {
  changedFiles: PatchFileChange[]
}

export type PatchSummary = {
  changedFiles: PatchFileChange[]
  preExistingChangedFiles: PatchFileChange[]
  diffStats: {
    filesChanged: number
    insertions: number
    deletions: number
    untrackedFiles: number
    raw: string
    unstagedRaw: string
    stagedRaw: string
  }
}

export type PatchCheckStatus = "passed" | "failed" | "skipped"

export type PatchCheckResult = {
  name: string
  command: string
  args: string[]
  status: Exclude<PatchCheckStatus, "skipped">
  exitCode: number | null
  signal: NodeJS.Signals | null
  durationMs: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export type PatchCheckSummary = {
  status: PatchCheckStatus
  reason?: string
  results: PatchCheckResult[]
}

export type PatchCheckOptions = {
  scripts?: string[]
  timeoutMs?: number
  maxOutputBytes?: number
}

export type PatchDiffSnapshot = {
  stat: string
  diff: string
  truncated: boolean
}

export type PatchReviewArtifacts = {
  patch?: PatchSummary
  checks?: PatchCheckSummary
  diff?: PatchDiffSnapshot
}

export type RuntimeModelSelection = {
  requested: ModelPolicy
  configured: BraincodeModel
  piModel: Model<any>
}

export type BraincodeAgentRuntimeOptions = {
  mode: BraincodeMode
  systemPrompt: string
  model: BraincodeModel
  policy: ModelPolicy
  sessionId?: string
  tools?: import("@earendil-works/pi-agent-core").AgentTool[]
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined
  onEvent?: (event: AgentEvent) => void | Promise<void>
  onToolApproval?: (request: ToolApprovalRequest, signal?: AbortSignal) => ToolApprovalDecision | Promise<ToolApprovalDecision>
}

export type BraincodeAgentRuntime = {
  agent: Agent
  selection: RuntimeModelSelection
}

export type RuntimePiModelSummary = {
  provider: string
  id: string
  name: string
  contextWindow: number
}

export type RuntimeWorkerPlan = AgentWorkerPlan & {
  model: BraincodeModel
  policy: ModelPolicy
  piModel: RuntimePiModelSummary
}

export type ExecutedWorkerResult = WorkerResult & {
  role: RoutedAgentRole
  goal: string
  todoIds: string[]
  status: "completed" | "failed"
  error?: string
}

export type RuntimePlan = {
  mode: BraincodeMode
  modeDescription: string
  brain: Pick<BrainModel, "id" | "name" | "description">
  role: RoutedAgentRole
  agentPlan: AgentRoutingPlan
  todos: AgentTodoItem[]
  dependencies: AgentTodoDependency[]
  workers: RuntimeWorkerPlan[]
  routing: {
    source: "router-brain" | "heuristic"
    confidence?: number
    reason?: string
    maxParallelAgents?: number
  }
  model: BraincodeModel
  policy: ModelPolicy
  piModel: RuntimePiModelSummary
  toolExecution: "sequential" | "parallel"
}

type RouterPlanDecision = AgentRoutingPlan & {
  confidence?: number
}

type WorkerTodoStatusHandler = (
  worker: RuntimeWorkerPlan,
  phase: "support" | "review",
  status: AgentTodoStatus,
  detail?: { summary?: string; error?: string },
) => void | Promise<void>

export type HookPermissionMode = "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions"

export type HookRuntimeContext = {
  sessionId: string
  cwd: string
  home?: string
  transcriptPath?: string | null
  model?: string
  turnId?: string
  permissionMode?: HookPermissionMode
}

export type HookRunRecord = {
  eventName: HookEventName
  source: Pick<HookSource, "kind" | "path">
  matcher?: string
  command?: string
  status: "completed" | "skipped" | "failed" | "blocked"
  reason?: string
  stdout?: string
  stderr?: string
  exitCode?: number | null
}

export type HookRunResult = {
  records: HookRunRecord[]
  additionalContext: string[]
  blockedReason?: string
}

function hookMatcherMatches(eventName: HookEventName, matcher: string | undefined, matcherValue?: string): boolean {
  if (eventName === "UserPromptSubmit" || eventName === "Stop") return true
  if (!matcher || matcher === "*") return true

  try {
    return new RegExp(matcher).test(matcherValue ?? "")
  } catch {
    return matcher === matcherValue
  }
}

function getMatchingHookGroups(source: HookSource, eventName: HookEventName, matcherValue?: string): HookMatcherGroup[] {
  return (source.document.hooks[eventName] ?? []).filter((group) => hookMatcherMatches(eventName, group.matcher, matcherValue))
}

function buildHookInput(eventName: HookEventName, eventInput: Record<string, unknown>, context: HookRuntimeContext): Record<string, unknown> {
  return {
    session_id: context.sessionId,
    transcript_path: context.transcriptPath ?? null,
    cwd: context.cwd,
    hook_event_name: eventName,
    model: context.model ?? "braincode",
    turn_id: context.turnId ?? context.sessionId,
    permission_mode: context.permissionMode ?? "default",
    ...eventInput,
  }
}

function parseHookOutput(eventName: HookEventName, stdout: string, stderr: string, exitCode: number | null): { additionalContext?: string; blockedReason?: string } {
  const trimmed = stdout.trim()
  if (exitCode === 2) {
    return { blockedReason: stderr.trim() || trimmed || "Hook blocked the event." }
  }
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed) as { decision?: unknown; reason?: unknown; continue?: unknown; stopReason?: unknown; systemMessage?: unknown; hookSpecificOutput?: unknown }
    const hookSpecificOutput = parsed.hookSpecificOutput && typeof parsed.hookSpecificOutput === "object" ? parsed.hookSpecificOutput as { hookEventName?: unknown; additionalContext?: unknown } : undefined
    const additionalContext = hookSpecificOutput?.hookEventName === eventName && typeof hookSpecificOutput.additionalContext === "string" && hookSpecificOutput.additionalContext.trim()
      ? hookSpecificOutput.additionalContext.trim()
      : undefined
    if (parsed.decision === "block") {
      return {
        additionalContext,
        blockedReason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "Hook blocked the event.",
      }
    }
    if (parsed.continue === false) {
      return {
        additionalContext,
        blockedReason: typeof parsed.stopReason === "string" && parsed.stopReason.trim() ? parsed.stopReason.trim() : "Hook stopped the event.",
      }
    }
    return { additionalContext }
  } catch {
    if (eventName === "SessionStart" || eventName === "SubagentStart" || eventName === "UserPromptSubmit") {
      return { additionalContext: trimmed }
    }
    return {}
  }
}

async function runCommandHook(
  eventName: HookEventName,
  source: HookSource,
  group: HookMatcherGroup,
  handler: HookHandler,
  hookInput: Record<string, unknown>,
  cwd: string,
): Promise<{ record: HookRunRecord; additionalContext?: string; blockedReason?: string }> {
  const baseRecord = {
    eventName,
    source: { kind: source.kind, path: source.path },
    matcher: group.matcher,
    command: handler.command,
  }

  if (handler.enabled === false) {
    return { record: { ...baseRecord, status: "skipped", reason: "disabled" } }
  }
  if (handler.async === true) {
    return { record: { ...baseRecord, status: "skipped", reason: "async command hooks are not supported yet" } }
  }
  if (handler.type !== "command") {
    return { record: { ...baseRecord, status: "skipped", reason: `unsupported hook type: ${handler.type}` } }
  }
  if (!handler.command) {
    return { record: { ...baseRecord, status: "skipped", reason: "missing command" } }
  }
  if (handler.trusted !== true) {
    return { record: { ...baseRecord, status: "skipped", reason: "untrusted" } }
  }

  const timeoutMs = (handler.timeout ?? 600) * 1000
  const command = process.platform === "win32" ? handler.commandWindows ?? handler.command_windows ?? handler.command : handler.command

  return await new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        BRAINCODE_HOOK_SOURCE: source.path,
      },
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutMs)

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ record: { ...baseRecord, status: "failed", reason: error.message, stdout, stderr } })
    })
    child.on("close", (exitCode) => {
      clearTimeout(timer)
      if (timedOut) {
        resolve({ record: { ...baseRecord, status: "failed", reason: `timed out after ${handler.timeout ?? 600}s`, stdout, stderr, exitCode } })
        return
      }

      const output = parseHookOutput(eventName, stdout, stderr, exitCode)
      const status = output.blockedReason ? "blocked" : exitCode === 0 ? "completed" : "failed"
      resolve({
        record: {
          ...baseRecord,
          status,
          reason: output.blockedReason ?? (exitCode === 0 ? undefined : stderr.trim() || `command exited with ${exitCode}`),
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined,
          exitCode,
        },
        additionalContext: output.additionalContext,
        blockedReason: output.blockedReason,
      })
    })
    child.stdin?.end(`${JSON.stringify(hookInput)}\n`)
  })
}

export async function runConfiguredHooks(
  eventName: HookEventName,
  eventInput: Record<string, unknown>,
  context: HookRuntimeContext,
  matcherValue?: string,
): Promise<HookRunResult> {
  const settings = await readSettings(context.home)
  if (settings.features?.hooks === false) {
    return { records: [], additionalContext: [] }
  }

  const sources = await readHookSources(context.home, context.cwd)
  const hookInput = buildHookInput(eventName, eventInput, context)
  const hookRuns: Array<Promise<{ record: HookRunRecord; additionalContext?: string; blockedReason?: string }>> = []
  for (const source of sources) {
    for (const group of getMatchingHookGroups(source, eventName, matcherValue)) {
      for (const handler of group.hooks) {
        hookRuns.push(runCommandHook(eventName, source, group, handler, hookInput, context.cwd))
      }
    }
  }

  const results = await Promise.all(hookRuns)
  const additionalContext = results.map((result) => result.additionalContext).filter((value): value is string => Boolean(value))
  const blockedReason = results.find((result) => result.blockedReason)?.blockedReason
  return {
    records: results.map((result) => result.record),
    additionalContext,
    blockedReason,
  }
}

function addHookAdditionalContext(prompt: string, additionalContext: string[]): string {
  if (additionalContext.length === 0) return prompt
  return `Hook additional context:\n${additionalContext.map((context) => `- ${context}`).join("\n")}\n\n${prompt}`
}

function formatStopHookFeedback(result: HookRunResult): string {
  const messages = [...result.additionalContext]
  if (result.blockedReason) messages.push(result.blockedReason)
  return messages.length > 0 ? `\n\nHook feedback:\n${messages.map((message) => `- ${message}`).join("\n")}` : ""
}

function createHookContext(sessionId: string, cwd: string, home: string | undefined, model?: string): HookRuntimeContext {
  return {
    sessionId,
    cwd,
    home,
    model,
    turnId: sessionId,
    permissionMode: "default",
  }
}

async function runAndRecordHooks(
  eventName: HookEventName,
  eventInput: Record<string, unknown>,
  context: HookRuntimeContext,
  matcherValue: string | undefined,
  home: string | undefined,
  recordType: string,
): Promise<HookRunResult> {
  const result = await runConfiguredHooks(eventName, eventInput, context, matcherValue)
  if (result.records.length > 0 || result.additionalContext.length > 0 || result.blockedReason) {
    await appendSessionRecord(context.sessionId, {
      type: recordType,
      eventName,
      matcher: matcherValue,
      records: result.records,
      additionalContext: result.additionalContext,
      blockedReason: result.blockedReason,
    }, home)
  }
  return result
}

export function selectRuntimeModel(policy: ModelPolicy, models: BraincodeModel[]): RuntimeModelSelection {
  const modelIds = [policy.modelId, ...(policy.fallbackModelIds ?? [])].filter((modelId, index, values) => modelId && values.indexOf(modelId) === index)
  const errors: string[] = []
  debugLog("runtime", "selecting runtime model", { modelIds, configuredModelCount: models.length })

  for (const modelId of modelIds) {
    const configured = models.find((model) => model.id === modelId)
    if (!configured) {
      errors.push(`${modelId}: not configured`)
      continue
    }

    try {
      const { piModel } = resolveBuiltInPiModel(configured)
      return {
        requested: policy,
        configured,
        piModel,
      }
    } catch (error) {
      errors.push(`${modelId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`Model policy references no usable model. Tried: ${errors.join("; ")}`)
}

function toPiModelSummary(selection: RuntimeModelSelection): RuntimePiModelSummary {
  return {
    provider: selection.piModel.provider,
    id: selection.piModel.id,
    name: selection.piModel.name,
    contextWindow: selection.piModel.contextWindow,
  }
}

function createRuntimeWorkerPlan(worker: AgentWorkerPlan, brain: BrainModel, models: BraincodeModel[]): RuntimeWorkerPlan {
  const policy = selectModelPolicy(brain, worker.role)
  const selection = selectRuntimeModel(policy, models)
  return {
    ...worker,
    model: selection.configured,
    policy,
    piModel: toPiModelSummary(selection),
  }
}

async function selectRuntimeModelWithApiKey(policy: ModelPolicy, models: BraincodeModel[], home?: string): Promise<{ selection: RuntimeModelSelection; apiKey: string }> {
  const candidates = await selectRuntimeModelCandidatesWithApiKey(policy, models, home)
  if (candidates[0]) return candidates[0]
  throw new Error("No usable model with API key for policy")
}

async function selectRuntimeModelCandidatesWithApiKey(policy: ModelPolicy, models: BraincodeModel[], home?: string): Promise<Array<{ selection: RuntimeModelSelection; apiKey: string }>> {
  const explicitIds = [policy.modelId, ...(policy.fallbackModelIds ?? [])].filter((modelId, index, values) => modelId && values.indexOf(modelId) === index)
  const errors: string[] = []
  const candidates: Array<{ selection: RuntimeModelSelection; apiKey: string }> = []
  const seenIds = new Set<string>()
  const seenProviders = new Set<string>()

  for (const modelId of explicitIds) {
    try {
      const selection = selectRuntimeModel({ ...policy, modelId, fallbackModelIds: [] }, models)
      const apiKey = await readProviderApiKey(selection.piModel.provider, home)
      if (!apiKey) {
        errors.push(`${modelId}: missing API key for provider '${selection.piModel.provider}'`)
        continue
      }
      seenIds.add(modelId)
      seenProviders.add(selection.piModel.provider)
      candidates.push({ selection, apiKey })
    } catch (error) {
      errors.push(`${modelId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Cross-provider safety net: append catalog-wide fallbacks so a regional/upstream
  // failure on one provider (e.g. cliproxyapi → OpenAI 400 "User location is not
  // supported") automatically rolls over to another provider with an available API key.
  for (const model of models) {
    if (seenIds.has(model.id)) continue
    if (seenProviders.has(model.provider)) continue
    try {
      const selection = selectRuntimeModel({ ...policy, modelId: model.id, fallbackModelIds: [] }, models)
      const apiKey = await readProviderApiKey(selection.piModel.provider, home)
      if (!apiKey) continue
      seenIds.add(model.id)
      seenProviders.add(selection.piModel.provider)
      candidates.push({ selection, apiKey })
    } catch {
      // ignore catalog-fallback failures; explicit errors are already collected
    }
  }

  if (candidates.length > 0) return candidates
  throw new Error(`No usable model with API key for policy. Tried: ${errors.join("; ")}`)
}

export function createBraincodeAgentRuntime(options: BraincodeAgentRuntimeOptions): BraincodeAgentRuntime {
  const { piModel } = resolveBuiltInPiModel(options.model)
  const agent = new Agent({
    sessionId: options.sessionId,
    initialState: {
      systemPrompt: options.systemPrompt,
      model: piModel,
      thinkingLevel: normalizeRuntimeThinkingLevel(options.model, options.policy),
      tools: options.tools ?? [],
      messages: [],
    },
    getApiKey: options.getApiKey,
    toolExecution: options.mode === "radical" ? "parallel" : "sequential",
    beforeToolCall: async (context, signal) => {
      if (options.onToolApproval) {
        const decision = await options.onToolApproval?.({
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          args: context.args,
        }, signal)
        if (decision?.approved === false) {
          return { block: true, reason: decision.reason ?? `User blocked tool call: ${context.toolCall.name}` }
        }
        return undefined
      }
      if (toolCallRequiresApproval(context.toolCall.name, context.args)) {
        return { block: true, reason: `Tool approval callback is required for risky tool call: ${context.toolCall.name}` }
      }
      return undefined
    },
  })

  if (options.onEvent) {
    agent.subscribe((event) => options.onEvent?.(event))
  }

  return {
    agent,
    selection: {
      requested: options.policy,
      configured: options.model,
      piModel,
    },
  }
}

function toolCallRequiresApproval(toolName: string, args: unknown): boolean {
  const name = toolName.toLowerCase()
  if (/(shell|exec|execute|run_command|run-command|terminal|bash|zsh|cmd|powershell|spawn|subprocess|run_script)/.test(name)) return true
  if (/(apply_patch|edit|write|patch|delete|remove|rm_|rename|move|create_file|create-file|filesystem__write)/.test(name)) return true
  const serialized = safeStringify(args).toLowerCase()
  return /\b(rm\s+-rf|sudo|chmod|chown|git\s+push|git\s+reset|drop\s+table|delete\s+from|truncate\s+table|npm\s+publish|bun\s+publish)\b/.test(serialized)
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return String(value)
  }
}

const DEFAULT_CHECK_TIMEOUT_MS = 180_000
const DEFAULT_CHECK_OUTPUT_BYTES = 24_000
const MAX_REVIEW_DIFF_CHARS = 60_000
const CHECK_SCRIPT_PRIORITY = ["check", "typecheck", "lint", "test"] as const

export async function collectPatchBaseline(projectRoot: string): Promise<PatchBaseline | undefined> {
  const status = await runGitCommand(projectRoot, ["status", "--short"])
  if (status.exitCode !== 0) return undefined
  return { changedFiles: parsePatchStatus(status.stdout) }
}

export async function collectPatchSummary(projectRoot: string, baseline?: PatchBaseline): Promise<PatchSummary | undefined> {
  const status = await runGitCommand(projectRoot, ["status", "--short"])
  if (status.exitCode !== 0) return undefined
  const currentChangedFiles = parsePatchStatus(status.stdout)
  const shortstat = await runGitCommand(projectRoot, ["diff", "--shortstat"])
  const stagedShortstat = await runGitCommand(projectRoot, ["diff", "--cached", "--shortstat"])
  const baselineKeys = new Set((baseline?.changedFiles ?? []).map(patchStatusKey))
  const changedFiles = baseline
    ? currentChangedFiles.filter((change) => !baselineKeys.has(patchStatusKey(change)))
    : currentChangedFiles
  const preExistingChangedFiles = baseline
    ? currentChangedFiles.filter((change) => baselineKeys.has(patchStatusKey(change)))
    : []
  const unstagedRaw = shortstat.exitCode === 0 ? shortstat.stdout.trim() : ""
  const stagedRaw = stagedShortstat.exitCode === 0 ? stagedShortstat.stdout.trim() : ""
  const untrackedFiles = currentChangedFiles.filter((change) => change.status === "??").length
  const diffStats = combineGitShortstats(unstagedRaw, stagedRaw, untrackedFiles)
  return {
    changedFiles,
    preExistingChangedFiles,
    diffStats,
  }
}

function hasPatchActivity(summary: PatchSummary | undefined): summary is PatchSummary {
  if (!summary) return false
  if (summary.changedFiles.length > 0) return true
  if (summary.preExistingChangedFiles.length > 0) return false
  return summary.diffStats.filesChanged > 0 || summary.diffStats.insertions > 0 || summary.diffStats.deletions > 0 || summary.diffStats.untrackedFiles > 0
}

export async function runPatchChecks(projectRoot: string, options: PatchCheckOptions = {}): Promise<PatchCheckSummary> {
  const packageScripts = await readPackageScripts(projectRoot)
  if (!packageScripts) {
    return { status: "skipped", reason: "package.json not found or has no scripts", results: [] }
  }

  const scripts = normalizeCheckScripts(options.scripts?.length ? options.scripts : selectDefaultCheckScripts(packageScripts))
  if (scripts.length === 0) {
    return { status: "skipped", reason: "no check, typecheck, lint, or test script found", results: [] }
  }

  const results: PatchCheckResult[] = []
  for (const script of scripts) {
    if (!Object.prototype.hasOwnProperty.call(packageScripts, script)) {
      results.push({
        name: script,
        command: "bun",
        args: ["run", script],
        status: "failed",
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: "",
        stderr: `package.json script not found: ${script}`,
        timedOut: false,
      })
      continue
    }
    results.push(await runBunScriptCheck(projectRoot, script, {
      timeoutMs: options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_CHECK_OUTPUT_BYTES,
    }))
  }

  return {
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    results,
  }
}

async function collectPatchDiffSnapshot(projectRoot: string, maxChars = MAX_REVIEW_DIFF_CHARS): Promise<PatchDiffSnapshot | undefined> {
  const unstagedStat = await runGitCommand(projectRoot, ["diff", "--stat"])
  const stagedStat = await runGitCommand(projectRoot, ["diff", "--cached", "--stat"])
  const unstagedDiff = await runGitCommand(projectRoot, ["diff", "--no-ext-diff"])
  const stagedDiff = await runGitCommand(projectRoot, ["diff", "--cached", "--no-ext-diff"])
  if ([unstagedStat, stagedStat, unstagedDiff, stagedDiff].some((result) => result.exitCode !== 0)) return undefined

  const stat = [
    unstagedStat.stdout.trim(),
    stagedStat.stdout.trim() ? `staged:\n${stagedStat.stdout.trim()}` : "",
  ].filter(Boolean).join("\n")
  const rawDiff = [
    unstagedDiff.stdout.trim(),
    stagedDiff.stdout.trim() ? `# Staged diff\n${stagedDiff.stdout.trim()}` : "",
  ].filter(Boolean).join("\n\n")
  const clipped = clipText(rawDiff, maxChars)
  return { stat, diff: clipped.text, truncated: clipped.truncated }
}

function clipText(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false }
  return { text: `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]`, truncated: true }
}

async function readPackageScripts(projectRoot: string): Promise<Record<string, string> | undefined> {
  const file = Bun.file(resolvePath(projectRoot, "package.json"))
  if (!(await file.exists())) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
  const scripts = (parsed as Record<string, unknown>).scripts
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return undefined
  const output: Record<string, string> = {}
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === "string") output[name] = command
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function selectDefaultCheckScripts(scripts: Record<string, string>): string[] {
  return CHECK_SCRIPT_PRIORITY.filter((script) => Object.prototype.hasOwnProperty.call(scripts, script))
}

function normalizeCheckScripts(scripts: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const script of scripts ?? []) {
    const trimmed = script.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    output.push(trimmed)
  }
  return output
}

async function runBunScriptCheck(
  cwd: string,
  script: string,
  options: { timeoutMs: number; maxOutputBytes: number },
): Promise<PatchCheckResult> {
  const startedAt = Date.now()
  return await new Promise((resolve) => {
    const command = "bun"
    const args = ["run", script]
    let settled = false
    let child
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      resolve({
        name: script,
        command,
        args,
        status: "failed",
        exitCode: null,
        signal: null,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: message,
        timedOut: false,
      })
      return
    }

    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    const append = (current: Buffer, chunk: Buffer) => {
      const next = Buffer.concat([current, chunk])
      return next.byteLength > options.maxOutputBytes ? next.subarray(next.byteLength - options.maxOutputBytes) : next
    }
    const finish = (result: Omit<PatchCheckResult, "durationMs">) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ...result, durationMs: Date.now() - startedAt })
    }
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill("SIGTERM") } catch { /* ignore */ }
    }, options.timeoutMs)

    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk) })
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk) })
    child.on("error", (error) => {
      finish({
        name: script,
        command,
        args,
        status: "failed",
        exitCode: null,
        signal: null,
        stdout: stdout.toString("utf8"),
        stderr: error.message,
        timedOut,
      })
    })
    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      finish({
        name: script,
        command,
        args,
        status: exitCode === 0 && !timedOut ? "passed" : "failed",
        exitCode,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
      })
    })
  })
}

async function runGitCommand(cwd: string, args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => { stdout += String(chunk) })
    child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
    child.on("error", (error) => resolve({ exitCode: 127, stdout, stderr: error.message }))
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }))
  })
}

function parsePatchStatus(stdout: string): PatchFileChange[] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || "?"
      const rawPath = line.slice(3).trim()
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath
      return { path, status }
    })
}

function patchStatusKey(change: PatchFileChange): string {
  return `${change.status}\0${change.path}`
}

function combineGitShortstats(unstagedRaw: string, stagedRaw: string, untrackedFiles: number): PatchSummary["diffStats"] {
  const unstaged = parseGitShortstat(unstagedRaw)
  const staged = parseGitShortstat(stagedRaw)
  const raw = [
    unstagedRaw,
    stagedRaw ? `staged: ${stagedRaw}` : "",
    untrackedFiles > 0 ? `${untrackedFiles} untracked file${untrackedFiles === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" | ")
  return {
    filesChanged: unstaged.filesChanged + staged.filesChanged + untrackedFiles,
    insertions: unstaged.insertions + staged.insertions,
    deletions: unstaged.deletions + staged.deletions,
    untrackedFiles,
    raw,
    unstagedRaw,
    stagedRaw,
  }
}

function parseGitShortstat(raw: string): Pick<PatchSummary["diffStats"], "filesChanged" | "insertions" | "deletions"> {
  const filesChanged = Number(raw.match(/(\d+)\s+files?\s+changed/)?.[1] ?? 0)
  const insertions = Number(raw.match(/(\d+)\s+insertions?\(\+\)/)?.[1] ?? 0)
  const deletions = Number(raw.match(/(\d+)\s+deletions?\(-\)/)?.[1] ?? 0)
  return { filesChanged, insertions, deletions }
}

function normalizeRuntimeThinkingLevel(model: BraincodeModel, policy: ModelPolicy): ModelPolicy["thinkingLevel"] {
  if (model.baseUrl && policy.thinkingLevel === "minimal") return "low"
  return policy.thinkingLevel
}

function isRoutedAgentRole(value: unknown): value is RoutedAgentRole {
  return isAgentRole(value) && value !== "routeBrain" && value !== "pet"
}

function isAgentRole(value: unknown): value is AgentRole {
  return value === "frontend" || value === "backend" || value === "designer" || value === "dba" || value === "devops" || value === "security" || value === "qa" || value === "review" || value === "summarize" || value === "oracle" || value === "librarian" || value === "rush" || value === "routeBrain" || value === "pet"
}

function normalizeRouterDecision(value: { role?: unknown; workers?: unknown; todos?: unknown; dependencies?: unknown; confidence?: unknown; reason?: unknown }, fallback: AgentRoutingPlan, maxWorkers: number): RouterPlanDecision {
  const primaryRole = isRoutedAgentRole(value.role) ? value.role : fallback.primaryRole
  const workersByRole = new Map<RoutedAgentRole, AgentRoutingPlan["workers"][number]>()
  if (Array.isArray(value.workers)) {
    for (const worker of value.workers) {
      if (typeof worker !== "object" || worker === null) continue
      const candidate = worker as { role?: unknown; goal?: unknown; reason?: unknown }
      if (!isRoutedAgentRole(candidate.role)) continue
      workersByRole.set(candidate.role, {
        role: candidate.role,
        goal: typeof candidate.goal === "string" && candidate.goal.trim() ? candidate.goal : fallback.workers.find((item) => item.role === candidate.role)?.goal ?? `Handle ${candidate.role} work.`,
        reason: typeof candidate.reason === "string" && candidate.reason.trim() ? candidate.reason : fallback.workers.find((item) => item.role === candidate.role)?.reason ?? `Router selected ${candidate.role}.`,
      })
    }
  }

  const workers = Array.from(workersByRole.values())
  if (workers.length === 0) {
    workers.push(...fallback.workers)
  }
  if (!workers.some((worker) => worker.role === primaryRole)) {
    workers.unshift({ role: primaryRole, goal: fallback.workers.find((worker) => worker.role === primaryRole)?.goal ?? `Handle ${primaryRole} work.`, reason: "Router selected this as the primary role." })
  }
  const cappedWorkers = workers.slice(0, Math.max(1, maxWorkers))
  if (!cappedWorkers.some((worker) => worker.role === primaryRole)) {
    cappedWorkers.splice(0, cappedWorkers.length > 0 ? 1 : 0, { role: primaryRole, goal: fallback.workers.find((worker) => worker.role === primaryRole)?.goal ?? `Handle ${primaryRole} work.`, reason: "Router selected this as the primary role." })
  }
  const todoInputs = normalizeRouterTodos(value.todos, primaryRole)
  const workerRoles = new Set(cappedWorkers.map((worker) => worker.role))
  const routedTodoInputs = todoInputs.map((todo) => workerRoles.has(todo.role) ? todo : { ...todo, role: primaryRole })
  const normalized = normalizeAgentRoutingPlan({
    primaryRole,
    workers: cappedWorkers,
    todos: routedTodoInputs,
    dependencies: normalizeRouterDependencies(value.dependencies),
    requiresReview: fallback.requiresReview,
    reason: typeof value.reason === "string" && value.reason.trim() ? value.reason : fallback.reason,
  })

  return {
    primaryRole,
    workers: normalized.workers,
    todos: normalized.todos,
    dependencies: normalized.dependencies,
    requiresReview: fallback.requiresReview,
    confidence: typeof value.confidence === "number" ? value.confidence : undefined,
    reason: typeof value.reason === "string" && value.reason.trim() ? value.reason : fallback.reason,
  }
}

function normalizeRouterTodos(value: unknown, fallbackRole: RoutedAgentRole): AgentTodoItem[] {
  if (!Array.isArray(value)) return []
  const todos: AgentTodoItem[] = []
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const candidate = item as { id?: unknown; title?: unknown; task?: unknown; goal?: unknown; role?: unknown; reason?: unknown }
    const title = [candidate.title, candidate.task, candidate.goal].find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    if (!title) continue
    const role = isRoutedAgentRole(candidate.role) ? candidate.role : fallbackRole
    todos.push({
      id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : createAgentTodoId(role, index),
      title,
      role,
      status: "pending",
      ...(typeof candidate.reason === "string" && candidate.reason.trim() ? { reason: candidate.reason } : {}),
    })
  }
  return todos
}

function normalizeRouterDependencies(value: unknown): AgentTodoDependency[] {
  if (!Array.isArray(value)) return []
  const dependencies: AgentTodoDependency[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const candidate = item as { from?: unknown; to?: unknown; fromTodoId?: unknown; toTodoId?: unknown; reason?: unknown }
    const fromTodoId = typeof candidate.fromTodoId === "string" ? candidate.fromTodoId.trim() : typeof candidate.from === "string" ? candidate.from.trim() : ""
    const toTodoId = typeof candidate.toTodoId === "string" ? candidate.toTodoId.trim() : typeof candidate.to === "string" ? candidate.to.trim() : ""
    if (!fromTodoId || !toTodoId || fromTodoId === toTodoId) continue
    dependencies.push({
      fromTodoId,
      toTodoId,
      ...(typeof candidate.reason === "string" && candidate.reason.trim() ? { reason: candidate.reason.trim() } : {}),
    })
  }
  return dependencies
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
  return JSON.parse(candidate)
}

async function routePromptWithBrain(prompt: string, brain: BrainModel, models: BraincodeModel[], mode: BraincodeMode, fallback: AgentRoutingPlan, images: ImageContent[] = [], home?: string): Promise<RouterPlanDecision | undefined> {
  const routerPolicy = brain.planner ?? brain.roles.routeBrain
  if (!routerPolicy?.modelId) return undefined

  try {
    const { selection: routerSelection, apiKey } = await selectRuntimeModelWithApiKey(routerPolicy, models, home)

    const runtime = createBraincodeAgentRuntime({
      mode,
      systemPrompt: getAgentRoleSystemPrompt("routeBrain", routerPolicy),
      model: routerSelection.configured,
      policy: routerPolicy,
      getApiKey: (provider) => (provider === routerSelection.piModel.provider ? apiKey : undefined),
    })

    const roleEnum = "\"frontend\"|\"backend\"|\"designer\"|\"dba\"|\"devops\"|\"security\"|\"qa\"|\"review\"|\"summarize\"|\"oracle\"|\"librarian\"|\"rush\""

    await runtime.agent.prompt(`You are Braincode's routeBrain. Choose the best primary role, useful worker agents, and a concise todo list for this user prompt.

Allowed routed roles:
${formatRoutedAgentRoleCatalog()}

Routing principles (read these before deciding):
- There is no generic "coding" role. Pick the matching specialist for code work: frontend for UI/CSS/components, backend for APIs/services, dba for schema/SQL, devops for CI/infra, security for auth/vuln, qa for tests, designer for UX without code.
- Use librarian when the task needs codebase mapping, symbol lookup, or fact finding (it absorbs what would have been a "research" role).
- Use oracle only for hard architecture/tradeoff/debugging reasoning that needs a top-tier model.
- Use review for defect inspection of existing code; use qa for forward-looking test strategy. They are not interchangeable.
- Use rush for short conversational replies or tiny chores that need no tools (it absorbs what would have been a "fastReply" role).
- Use summarize only when the user explicitly needs a handoff or recap.

Return ONLY a single JSON object matching this schema exactly:
{"role":${roleEnum},"workers":[{"role":${roleEnum},"goal":"short worker goal","reason":"short reason"}],"todos":[{"id":"short-stable-id","title":"concrete task to check off","role":${roleEnum},"reason":"short reason"}],"dependencies":[{"from":"todo-id-that-must-finish-first","to":"todo-id-that-depends-on-it","reason":"short reason"}],"confidence":0.0,"reason":"short reason"}

Output constraints:
- "role" MUST be one of the enum values above. Do not invent role names. Do not include "coding", "fastReply", or "research" — they are deprecated.
- Pick exactly one primary role in "role".
- Include only workers that would materially improve the task.
- Break the work into 1-6 concrete todos in execution order.
- Assign every todo to the agent role that should complete it.
- Use short lowercase todo ids with letters, numbers, dashes, or underscores.
- Include dependencies only when one todo materially needs another todo's output.
- Do not include routeBrain or pet as a worker role.
- Prefer no more than ${brain.routing.maxParallelAgents} workers.
- "confidence" is a number in [0,1] reflecting how confident you are in the routing decision.

User prompt:
${prompt}`, images.length > 0 ? images : undefined)

    const text = extractAssistantText(runtime.agent.state.messages)
    const parsed = extractJsonObject(text) as { role?: unknown; workers?: unknown; todos?: unknown; dependencies?: unknown; confidence?: unknown; reason?: unknown }

    const decision = normalizeRouterDecision(parsed, fallback, brain.routing.maxParallelAgents)
    debugLog("runtime", "router brain selected role", decision)
    return decision
  } catch (error) {
    debugLog("runtime", "router brain failed; falling back to heuristic", { error: error instanceof Error ? error.message : String(error) })
    return undefined
  }
}

async function buildRuntimePlan(prompt: string, home: string | undefined, useRouterBrain: boolean, forceRoles?: RoutedAgentRole[], images: ImageContent[] = []): Promise<RuntimePlan> {
  const [settings, brainDocument, modelDocument] = await Promise.all([readSettings(home), readBrains(home), readModels(home)])
  const brains = brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains
  const models = modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models
  const brain = selectBrain(brains as BrainModel[], settings.defaultBrainId)
  const heuristicPlan = planAgentRouting(prompt, brain)
  const routerDecision = useRouterBrain && (!forceRoles || forceRoles.length === 0)
    ? await routePromptWithBrain(prompt, brain, models as BraincodeModel[], settings.mode, heuristicPlan, images, home)
    : undefined
  const baseAgentPlan = routerDecision ?? heuristicPlan
  const agentPlan = normalizeAgentRoutingPlan(forceRoles && forceRoles.length > 0
    ? {
        ...baseAgentPlan,
        primaryRole: forceRoles[0]!,
        workers: forceRoles.map((role, index) => ({
          role,
          goal: `Respond independently as the ${role} agent.${index === 0 ? " (primary)" : ""}`,
          reason: "Forced multi-agent invocation via /team.",
        })),
        todos: [],
        requiresReview: false,
        reason: `Forced multi-agent run across ${forceRoles.join(", ")}.`,
      }
    : baseAgentPlan)
  const role = agentPlan.primaryRole
  const policy = selectModelPolicy(brain, role)
  const selection = selectRuntimeModel(policy, models as BraincodeModel[])
  const runtimeWorkerInputs = [...agentPlan.workers]
  if (agentPlan.requiresReview && role !== "review" && !runtimeWorkerInputs.some((worker) => worker.role === "review")) {
    runtimeWorkerInputs.push({
      role: "review",
      goal: "Review the primary agent result for correctness, regressions, missing verification, and safety risks.",
      reason: "Brain policy requires review for risky file-editing work.",
    })
  }
  const runtimeTodoPlan = normalizeAgentRoutingPlan({ ...agentPlan, workers: runtimeWorkerInputs, todos: agentPlan.todos, dependencies: agentPlan.dependencies })
  const workers = runtimeTodoPlan.workers.map((worker) => createRuntimeWorkerPlan(worker, brain, models as BraincodeModel[]))
  const modePolicy = getModePolicy(settings.mode)
  const maxParallelAgents = brain.routing?.maxParallelAgents
  const routing = routerDecision
    ? { source: "router-brain" as const, confidence: routerDecision.confidence, reason: routerDecision.reason, maxParallelAgents }
    : { source: "heuristic" as const, reason: useRouterBrain ? "router brain unavailable or failed" : "dry-run/default heuristic route", maxParallelAgents }
  debugLog("runtime", "planned runtime", { mode: settings.mode, brainId: brain.id, role, routingSource: routing.source, modelId: selection.configured.id, provider: selection.piModel.provider })

  return {
    mode: settings.mode,
    modeDescription: modePolicy.description,
    brain: {
      id: brain.id,
      name: brain.name,
      description: brain.description,
    },
    role,
    agentPlan,
    todos: runtimeTodoPlan.todos,
    dependencies: runtimeTodoPlan.dependencies,
    workers,
    routing,
    model: selection.configured,
    policy,
    piModel: toPiModelSummary(selection),
    toolExecution: settings.mode === "radical" ? "parallel" : "sequential",
  }
}

export async function planRuntimeFromConfig(prompt: string, home?: string): Promise<RuntimePlan> {
  return buildRuntimePlan(prompt, home, false)
}

export type ResolvedPetRuntime = {
  model: BraincodeModel
  apiKey: string
  policy: ModelPolicy
  systemPrompt: string
}

export async function resolvePetRuntime(home?: string): Promise<ResolvedPetRuntime | null> {
  try {
    const [settings, brainDocument, modelDocument] = await Promise.all([readSettings(home), readBrains(home), readModels(home)])
    const brains = brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains
    const models = modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models
    const brain = selectBrain(brains as BrainModel[], settings.defaultBrainId)
    const policy = brain.roles.pet
    if (!policy?.modelId) return null
    const { selection, apiKey } = await selectRuntimeModelWithApiKey(policy, models as BraincodeModel[], home)
    return {
      model: selection.configured,
      apiKey,
      policy,
      systemPrompt: getAgentRoleSystemPrompt("pet", policy),
    }
  } catch (error) {
    debugLog("runtime", "pet runtime unavailable", { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

function extractAssistantText(messages: unknown[]): string {
  const assistantMessages = messages.filter((message) => {
    return typeof message === "object" && message !== null && (message as { role?: unknown }).role === "assistant"
  })

  const lastAssistant = assistantMessages.at(-1) as { content?: unknown; errorMessage?: unknown; stopReason?: unknown } | undefined
  if (typeof lastAssistant?.errorMessage === "string" && lastAssistant.errorMessage.trim()) {
    throw new Error(lastAssistant.errorMessage)
  }
  if (lastAssistant?.stopReason === "error") {
    throw new Error("Provider returned an error without a message")
  }
  if (!lastAssistant || !Array.isArray(lastAssistant.content)) return ""

  return lastAssistant.content
    .filter((content): content is { type: "text"; text: string } => {
      return typeof content === "object" && content !== null && (content as { type?: unknown }).type === "text" && typeof (content as { text?: unknown }).text === "string"
    })
    .map((content) => content.text)
    .join("\n")
}

function createWorkerHandoff(worker: RuntimeWorkerPlan, parentId: string, phase: "support" | "review", projectSupport?: ProjectSupport): HandoffPacket {
  const taskId = crypto.randomUUID()
  return {
    ...brainToAgentContextTransfer,
    id: crypto.randomUUID(),
    task: {
      id: taskId,
      parentId,
      layer: "agent",
      agentRole: worker.role,
      goal: worker.goal,
      progress: {
        status: "pending",
        summary: `${worker.role} ${phase} task is queued.`,
      },
      contextRefs: projectSupportContextRefs(projectSupport),
    },
    constraints: [
      `Run as the ${worker.role} agent only.`,
      "Treat this as a Brain-to-agent context transfer: Brain owns orchestration context, and this worker owns only its isolated task context.",
      "Use only this handoff, the original user request, and explicit worker results supplied in the prompt.",
      "Echo the task id and parentId exactly as provided; Brain will use the handoff values as authoritative.",
      "Do not assume access to the full root transcript or another worker's private chain of thought.",
      "Return concise structured findings for the primary Braincode agent.",
    ],
    expectedResult: "JSON with taskId, parentId, progress, summary, artifacts, risks, and nextQuestions.",
  }
}

function projectSupportContextRefs(projectSupport?: ProjectSupport): ContextRef[] {
  if (!projectSupport) return []
  const refs: ContextRef[] = []
  if (projectSupport.agents) {
    refs.push({ kind: "file", uri: projectSupport.agents.path, label: "AGENTS.md" })
  }
  if (projectSupport.mcp) {
    refs.push({ kind: "file", uri: projectSupport.mcp.path, label: ".mcp.json" })
  }
  for (const skill of projectSupport.skills) {
    refs.push({ kind: "file", uri: skill.path, label: `skill:${skill.id}` })
  }
  return refs
}

function formatProjectSupportPromptSection(projectSupport?: ProjectSupport): string {
  if (!projectSupport || (!projectSupport.agents && !projectSupport.mcp && projectSupport.skills.length === 0)) return ""

  const sections = [`Project support context from ${projectSupport.root}:`]
  if (projectSupport.agents) {
    sections.push(`AGENTS.md (${projectSupport.agents.path}):\n${projectSupport.agents.content}`)
  }
  if (projectSupport.mcp) {
    const servers = projectSupport.mcp.serverNames.length > 0 ? projectSupport.mcp.serverNames.join(", ") : "(none declared)"
    sections.push(`MCP config (${projectSupport.mcp.path}):\nAvailable server names: ${servers}\nUse MCP servers only when Braincode exposes them as runtime tools; do not assume access from config metadata alone.`)
  }
  if (projectSupport.skills.length > 0) {
    sections.push(
      [
        "Local skills (.agents/skill):",
        ...projectSupport.skills.map((skill) => `### ${skill.id} (${skill.path})\n${skill.content}`),
      ].join("\n\n"),
    )
  }
  return `${sections.join("\n\n")}\n`
}

function summarizeProjectSupport(projectSupport: ProjectSupport) {
  return {
    root: projectSupport.root,
    agents: projectSupport.agents?.path,
    mcp: projectSupport.mcp ? { path: projectSupport.mcp.path, serverNames: projectSupport.mcp.serverNames } : undefined,
    skills: projectSupport.skills.map((skill) => ({ id: skill.id, path: skill.path })),
  }
}

function buildSupportWorkerPrompt(originalPrompt: string, handoff: HandoffPacket, projectSupport?: ProjectSupport): string {
  const supportContext = formatProjectSupportPromptSection(projectSupport)
  return `Run this isolated Braincode worker handoff.

${supportContext}
Original user request:
${originalPrompt}

Handoff packet:
${JSON.stringify(handoff, null, 2)}

Return only JSON in this shape:
{"taskId":"${handoff.task.id}","parentId":"${handoff.task.parentId}","progress":{"status":"completed|blocked","summary":"brief progress"},"summary":"concise actionable result","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["risk or caveat"],"nextQuestions":["question only if blocked"]}`
}

function buildPrimaryPrompt(originalPrompt: string, workerResults: ExecutedWorkerResult[], primaryRole: RoutedAgentRole, projectSupport?: ProjectSupport): string {
  const supportContext = formatProjectSupportPromptSection(projectSupport)
  if (workerResults.length === 0) {
    return supportContext ? `${supportContext}\nUser request:\n${originalPrompt}` : originalPrompt
  }

  return `${supportContext}
User request:
${originalPrompt}

Supporting worker results:
${formatWorkerResults(workerResults)}

Complete the request as the primary ${primaryRole} agent. Treat worker results as advisory context, resolve conflicts explicitly, and produce the final user-facing result.`
}

function buildReviewPrompt(
  originalPrompt: string,
  primarySummary: string,
  workerResults: ExecutedWorkerResult[],
  handoff: HandoffPacket,
  projectSupport?: ProjectSupport,
  artifacts?: PatchReviewArtifacts,
): string {
  const supportContext = formatProjectSupportPromptSection(projectSupport)
  const patchArtifacts = formatPatchReviewArtifacts(artifacts)
  return `Review this Braincode run as an isolated review agent.

${supportContext}
Original user request:
${originalPrompt}

Primary agent result:
${primarySummary}

Supporting worker results:
${workerResults.length > 0 ? formatWorkerResults(workerResults) : "No supporting worker results."}

Patch artifacts:
${patchArtifacts}

Handoff packet:
${JSON.stringify(handoff, null, 2)}

Return only JSON in this shape:
{"taskId":"${handoff.task.id}","parentId":"${handoff.task.parentId}","progress":{"status":"completed|blocked","summary":"brief progress"},"summary":"review findings or clear statement that no concrete issue was found","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["confirmed risk"],"nextQuestions":["question only if blocked"]}`
}

function formatPatchReviewArtifacts(artifacts: PatchReviewArtifacts | undefined): string {
  if (!artifacts?.patch && !artifacts?.checks && !artifacts?.diff) return "No patch artifacts were collected."
  const sections: string[] = []
  if (artifacts.patch) {
    const changed = artifacts.patch.changedFiles.length > 0
      ? artifacts.patch.changedFiles.map((change) => `- ${change.status} ${change.path}`).join("\n")
      : "(no new changed files)"
    const preExisting = artifacts.patch.preExistingChangedFiles.length > 0
      ? `\nPre-existing changed files:\n${artifacts.patch.preExistingChangedFiles.map((change) => `- ${change.status} ${change.path}`).join("\n")}`
      : ""
    sections.push(`Changed files:\n${changed}${preExisting}\nDiff stats: ${artifacts.patch.diffStats.raw || "no textual diff stats"}`)
  }
  if (artifacts.checks) {
    const lines = artifacts.checks.results.map((result) => {
      const output = [
        result.stdout.trim() ? `stdout: ${clipContextText(result.stdout.trim(), 1200)}` : "",
        result.stderr.trim() ? `stderr: ${clipContextText(result.stderr.trim(), 1200)}` : "",
      ].filter(Boolean).join("\n  ")
      return `- ${result.name}: ${result.status} (exit ${result.exitCode ?? "n/a"}, ${result.durationMs}ms)${output ? `\n  ${output}` : ""}`
    })
    sections.push(`Checks: ${artifacts.checks.status}${artifacts.checks.reason ? ` (${artifacts.checks.reason})` : ""}\n${lines.length > 0 ? lines.join("\n") : "(no checks ran)"}`)
  }
  if (artifacts.diff) {
    sections.push(`Git diff stat:\n${artifacts.diff.stat || "(no diff stat)"}\n\nGit diff${artifacts.diff.truncated ? " (truncated)" : ""}:\n${artifacts.diff.diff || "(no textual diff)"}`)
  }
  return sections.join("\n\n")
}

function formatWorkerResults(workerResults: ExecutedWorkerResult[]): string {
  return workerResults
    .map((result) => {
      const risks = result.risks.length > 0 ? `\nRisks:\n${result.risks.map((risk) => `- ${risk}`).join("\n")}` : ""
      const questions = result.nextQuestions.length > 0 ? `\nOpen questions:\n${result.nextQuestions.map((question) => `- ${question}`).join("\n")}` : ""
      const progress = result.progress.summary ? `${result.progress.status}: ${result.progress.summary}` : result.progress.status
      return `### ${result.role} (${result.status})\nTask: ${result.taskId} -> ${result.parentId}\nGoal: ${result.goal}\nProgress: ${progress}\nSummary: ${result.summary}${risks}${questions}`
    })
    .join("\n\n")
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

function normalizeContextRef(value: unknown): ContextRef | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as { kind?: unknown; uri?: unknown; label?: unknown }
  if (record.kind !== "file" && record.kind !== "thread" && record.kind !== "summary" && record.kind !== "artifact") return undefined
  if (typeof record.uri !== "string" || !record.uri.trim()) return undefined
  return {
    kind: record.kind,
    uri: record.uri.trim(),
    label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : undefined,
  }
}

function normalizeContextRefs(value: unknown): ContextRef[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeContextRef(item)).filter((item): item is ContextRef => Boolean(item))
}

function isTaskProgressStatus(value: unknown): value is TaskProgress["status"] {
  return value === "pending" || value === "running" || value === "completed" || value === "blocked" || value === "failed"
}

function normalizeTaskProgress(value: unknown, fallbackStatus: TaskProgress["status"], fallbackSummary?: string): TaskProgress {
  if (!value || typeof value !== "object") {
    return fallbackSummary ? { status: fallbackStatus, summary: fallbackSummary } : { status: fallbackStatus }
  }

  const record = value as { status?: unknown; summary?: unknown; currentStep?: unknown; completedSteps?: unknown; percent?: unknown }
  const progress: TaskProgress = {
    status: isTaskProgressStatus(record.status) ? record.status : fallbackStatus,
  }
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : fallbackSummary
  if (summary) progress.summary = summary
  if (typeof record.currentStep === "string" && record.currentStep.trim()) progress.currentStep = record.currentStep.trim()
  const completedSteps = normalizeStringArray(record.completedSteps)
  if (completedSteps.length > 0) progress.completedSteps = completedSteps
  if (typeof record.percent === "number" && Number.isFinite(record.percent)) {
    progress.percent = Math.max(0, Math.min(100, record.percent))
  }
  return progress
}

function normalizeWorkerResultText(text: string, handoff: HandoffPacket): WorkerResult {
  try {
    const parsed = extractJsonObject(text)
    if (parsed && typeof parsed === "object") {
      const record = parsed as { progress?: unknown; summary?: unknown; artifacts?: unknown; risks?: unknown; nextQuestions?: unknown }
      const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : text.trim()
      return {
        ...agentToBrainContextTransfer,
        handoffId: handoff.id,
        taskId: handoff.task.id,
        parentId: handoff.task.parentId,
        progress: normalizeTaskProgress(record.progress, "completed", summary),
        summary,
        artifacts: normalizeContextRefs(record.artifacts),
        risks: normalizeStringArray(record.risks),
        nextQuestions: normalizeStringArray(record.nextQuestions),
      }
    }
  } catch {
    // Plain-text worker responses are accepted so provider drift does not break orchestration.
  }

  return {
    ...agentToBrainContextTransfer,
    handoffId: handoff.id,
    taskId: handoff.task.id,
    parentId: handoff.task.parentId,
    progress: normalizeTaskProgress(undefined, "completed", text.trim() || "(empty worker response)"),
    summary: text.trim() || "(empty worker response)",
    artifacts: [],
    risks: [],
    nextQuestions: [],
  }
}

function failedWorkerResult(worker: RuntimeWorkerPlan, handoff: HandoffPacket, error: unknown): ExecutedWorkerResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    ...agentToBrainContextTransfer,
    handoffId: handoff.id,
    taskId: handoff.task.id,
    parentId: handoff.task.parentId,
    progress: {
      status: "failed",
      summary: message,
    },
    role: worker.role,
    goal: worker.goal,
    todoIds: worker.todoIds ?? [],
    status: "failed",
    summary: `${worker.role} worker failed: ${message}`,
    artifacts: [],
    risks: [message],
    nextQuestions: [],
    error: message,
  }
}

async function runWorkerFromPlan(
  worker: RuntimeWorkerPlan,
  buildPrompt: (handoff: HandoffPacket) => string,
  sessionId: string,
  home: string | undefined,
  models: BraincodeModel[],
  mode: BraincodeMode,
  phase: "support" | "review",
  projectSupport?: ProjectSupport,
  hookContext?: HookRuntimeContext,
  onWorkerEvent?: (event: WorkerLifecycleEvent) => void | Promise<void>,
  onTodoStatus?: WorkerTodoStatusHandler,
  promptImages: ImageContent[] = [],
): Promise<ExecutedWorkerResult> {
  const emit = async (event: WorkerLifecycleEvent) => {
    if (!onWorkerEvent) return
    try { await onWorkerEvent(event) } catch { /* ignore listener error */ }
  }
  const handoff = createWorkerHandoff(worker, sessionId, phase, projectSupport)
  let candidates: Array<{ selection: RuntimeModelSelection; apiKey: string }>

  try {
    candidates = await selectRuntimeModelCandidatesWithApiKey(worker.policy, models, home)
  } catch (error) {
    const result = failedWorkerResult(worker, handoff, error)
    await appendSessionRecord(sessionId, { type: "worker_error", phase, worker: worker.role, handoff, error: result.error }, home)
    await onTodoStatus?.(worker, phase, "failed", { error: result.error })
    await emit({ type: "worker_end", role: worker.role, phase, status: "failed", error: result.error, todoIds: worker.todoIds })
    return result
  }

  let lastError: unknown
  for (const [attempt, { selection, apiKey }] of candidates.entries()) {
    const agentSessionId = `${handoff.task.id}-${attempt + 1}`
    await onTodoStatus?.(worker, phase, "running")
    await emit({ type: "worker_start", role: worker.role, goal: worker.goal, phase, modelId: selection.configured.id, todoIds: worker.todoIds })
    await appendSessionRecord(sessionId, { type: "worker_start", phase, worker: worker.role, goal: worker.goal, handoff, model: selection.configured.id, agentSessionId, attempt: attempt + 1 }, home)
    const subagentHookContext: HookRuntimeContext = hookContext
      ? {
          ...hookContext,
          model: selection.configured.id,
          turnId: agentSessionId,
        }
      : createHookContext(sessionId, projectSupport?.root ?? process.cwd(), home, selection.configured.id)
    const subagentStartHooks = await runAndRecordHooks(
      "SubagentStart",
      {
        agent_id: handoff.task.id,
        agent_type: worker.role,
        permission_mode: subagentHookContext.permissionMode ?? "default",
      },
      subagentHookContext,
      worker.role,
      home,
      "hook_subagent_start",
    )
    const runtime = createBraincodeAgentRuntime({
      mode,
      systemPrompt: getAgentRoleSystemPrompt(worker.role, worker.policy),
      model: selection.configured,
      policy: worker.policy,
      sessionId: agentSessionId,
      getApiKey: (provider) => (provider === selection.piModel.provider ? apiKey : undefined),
    })

    try {
      const workerPrompt = addHookAdditionalContext(
        buildPrompt(handoff),
        [
          ...subagentStartHooks.additionalContext,
          ...(subagentStartHooks.blockedReason ? [subagentStartHooks.blockedReason] : []),
        ],
      )
      await runtime.agent.prompt(workerPrompt, promptImages.length > 0 ? promptImages : undefined)
      const text = extractAssistantText(runtime.agent.state.messages)
      const result = normalizeWorkerResultText(text, handoff)
      const executed: ExecutedWorkerResult = { ...result, role: worker.role, goal: worker.goal, todoIds: worker.todoIds ?? [], status: "completed" }
      await appendSessionRecord(sessionId, { type: "worker_end", phase, worker: worker.role, result: executed, attempt: attempt + 1 }, home)
      await onTodoStatus?.(worker, phase, "completed", { summary: result.summary })
      await emit({ type: "worker_end", role: worker.role, phase, status: "completed", summary: text.trim(), todoIds: worker.todoIds })
      await runAndRecordHooks(
        "SubagentStop",
        {
          agent_id: handoff.task.id,
          agent_type: worker.role,
          agent_transcript_path: null,
          stop_hook_active: false,
          last_assistant_message: text || null,
        },
        subagentHookContext,
        worker.role,
        home,
        "hook_subagent_stop",
      )
      return executed
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      await appendSessionRecord(sessionId, { type: "worker_error", phase, worker: worker.role, error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
    }
  }

  const failure = failedWorkerResult(worker, handoff, lastError)
  await onTodoStatus?.(worker, phase, "failed", { error: failure.error })
  await emit({ type: "worker_end", role: worker.role, phase, status: "failed", error: failure.error, todoIds: worker.todoIds })
  return failure
}

async function runSupportWorkers(
  workers: RuntimeWorkerPlan[],
  originalPrompt: string,
  sessionId: string,
  home: string | undefined,
  models: BraincodeModel[],
  mode: BraincodeMode,
  toolExecution: RuntimePlan["toolExecution"],
  projectSupport?: ProjectSupport,
  hookContext?: HookRuntimeContext,
  onWorkerEvent?: (event: WorkerLifecycleEvent) => void | Promise<void>,
  concurrencyCap?: number,
  onTodoStatus?: WorkerTodoStatusHandler,
  promptImages: ImageContent[] = [],
): Promise<ExecutedWorkerResult[]> {
  if (workers.length === 0) return []
  void toolExecution // tool execution governs intra-agent tool calls; worker scheduling is independent.

  const limit = Number.isFinite(concurrencyCap) && (concurrencyCap as number) > 0
    ? Math.min(workers.length, Math.floor(concurrencyCap as number))
    : workers.length
  const results: ExecutedWorkerResult[] = new Array(workers.length)
  let next = 0
  const runOne = async (slot: number) => {
    const index = next++
    if (index >= workers.length) return
    const worker = workers[index]!
    results[index] = await runWorkerFromPlan(
      worker,
      (handoff) => buildSupportWorkerPrompt(originalPrompt, handoff, projectSupport),
      sessionId,
      home,
      models,
      mode,
      "support",
      projectSupport,
      hookContext,
      onWorkerEvent,
      onTodoStatus,
      promptImages,
    )
    return runOne(slot)
  }
  await Promise.all(Array.from({ length: limit }, (_, slot) => runOne(slot)))
  return results
}

function todoIdsForRole(plan: RuntimePlan, role: RoutedAgentRole): string[] {
  return plan.todos.filter((todo) => todo.role === role).map((todo) => todo.id)
}

function setTodoStatus(plan: RuntimePlan, todoIds: string[], status: AgentTodoStatus, detail?: { summary?: string; error?: string }): AgentTodoItem[] {
  const todoIdSet = new Set(todoIds)
  const update = (todo: AgentTodoItem): AgentTodoItem => {
    if (!todoIdSet.has(todo.id)) return todo
    return {
      ...todo,
      status,
      ...(detail?.summary ? { summary: detail.summary } : {}),
      ...(detail?.error ? { summary: detail.error } : {}),
    }
  }
  plan.todos = plan.todos.map(update)
  plan.agentPlan.todos = plan.agentPlan.todos.map(update)
  return plan.todos.filter((todo) => todoIdSet.has(todo.id))
}

async function updateTodoStatus(
  plan: RuntimePlan,
  todoIds: string[],
  status: AgentTodoStatus,
  phase: TodoLifecycleEvent["phase"],
  sessionId: string,
  home: string | undefined,
  onTodoEvent: AgentRunRequest["onTodoEvent"],
  detail?: { role?: RoutedAgentRole; summary?: string; error?: string },
): Promise<void> {
  if (todoIds.length === 0) return
  const updatedTodos = setTodoStatus(plan, todoIds, status, detail)
  if (updatedTodos.length === 0) return
  await appendSessionRecord(sessionId, { type: "todo_update", phase, role: detail?.role, status, todoIds, todos: updatedTodos, summary: detail?.summary, error: detail?.error }, home)
  if (!onTodoEvent) return
  for (const todo of updatedTodos) {
    try {
      await onTodoEvent({ type: "todo_update", todo, status, phase, role: detail?.role ?? todo.role, summary: detail?.summary, error: detail?.error })
    } catch {
      // ignore listener errors
    }
  }
}

function mergeReviewResult(summary: string, review: ExecutedWorkerResult | undefined): string {
  if (!review) return summary
  const risks = review.risks.length > 0 ? `\nRisks:\n${review.risks.map((risk) => `- ${risk}`).join("\n")}` : ""
  return `${summary}\n\nReview:\n${review.summary}${risks}`
}

export async function executePromptFromConfig(request: AgentRunRequest, home?: string): Promise<AgentRunResult> {
  const sessionId = request.sessionId ?? crypto.randomUUID()
  const cwd = request.projectRoot ?? process.cwd()
  const promptHookContext = createHookContext(sessionId, cwd, home)
  const sessionStartHooks = await runAndRecordHooks(
    "SessionStart",
    { source: "startup" },
    promptHookContext,
    "startup",
    home,
    "hook_session_start",
  )
  if (sessionStartHooks.blockedReason) {
    throw new Error(`SessionStart hook blocked the run: ${sessionStartHooks.blockedReason}`)
  }
  const promptHooks = await runAndRecordHooks(
    "UserPromptSubmit",
    { prompt: request.prompt },
    promptHookContext,
    undefined,
    home,
    "hook_user_prompt_submit",
  )
  if (promptHooks.blockedReason) {
    throw new Error(`UserPromptSubmit hook blocked the prompt: ${promptHooks.blockedReason}`)
  }
  const expanded = await expandPromptReferences(request.prompt, cwd, home)
  const promptImages = expanded.images
  const effectivePrompt = addHookAdditionalContext(expanded.prompt, [...sessionStartHooks.additionalContext, ...promptHooks.additionalContext])
  const plan = await buildRuntimePlan(effectivePrompt, home, true, request.forceRoles, promptImages)
  await appendSessionRecord(sessionId, { type: "todo_plan", todos: plan.todos, dependencies: plan.dependencies }, home)
  if (request.onPlan) {
    try {
      await request.onPlan(plan)
    } catch {
      // ignore listener errors
    }
  }
  const modelDocument = await readModels(home)
  const models = (modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models) as BraincodeModel[]
  const candidates = await selectRuntimeModelCandidatesWithApiKey(plan.policy, models, home)

  const projectSupport = await readProjectSupport(cwd)
  const userSupport = await readUserSupport(home)
  const hookContext = createHookContext(sessionId, cwd, home, plan.model.id)
  const supportingWorkers = plan.workers.filter((worker) => worker.role !== plan.role && worker.role !== "review")
  const reviewWorker = plan.workers.find((worker) => worker.role === "review")
  const onWorkerTodoStatus: WorkerTodoStatusHandler = (worker, phase, status, detail) =>
    updateTodoStatus(plan, worker.todoIds ?? [], status, phase, sessionId, home, request.onTodoEvent, { ...detail, role: worker.role })
  const patchBaseline = await collectPatchBaseline(cwd)
  const workerResults = await runSupportWorkers(supportingWorkers, effectivePrompt, sessionId, home, models, plan.mode, plan.toolExecution, projectSupport, hookContext, request.onWorkerEvent, plan.routing.maxParallelAgents, onWorkerTodoStatus, promptImages)
  const primaryPrompt = buildPrimaryPrompt(effectivePrompt, workerResults, plan.role, projectSupport)

  const mcpHub = new McpToolHub()
  const { servers: mcpServers, skipped: mcpSkipped } = collectMcpToolServers({
    userMcp: userSupport.mcp,
    projectMcp: projectSupport.mcp,
  })
  let mcpReport: McpHubConnectReport = { connected: [], failed: [], skipped: mcpSkipped, toolCount: 0 }
  if (mcpServers.length > 0) {
    const connectReport = await mcpHub.connect(mcpServers)
    mcpReport = {
      connected: connectReport.connected,
      failed: connectReport.failed,
      skipped: [...mcpSkipped, ...connectReport.skipped],
      toolCount: connectReport.toolCount,
    }
  }
  if (request.onMcpReport) {
    try {
      await request.onMcpReport(mcpReport)
    } catch {
      // ignore listener errors
    }
  }
  await appendSessionRecord(sessionId, { type: "mcp_connect", report: mcpReport }, home)
  const mcpTools = mcpHub.getTools()
  const toolConfig = await readTools(home)
  const localTools = createLocalCodingTools({ projectRoot: cwd, tools: toolConfig.tools, mode: request.onToolApproval ? "all" : "read-only" })
  const runtimeTools = [...localTools, ...mcpTools]

  try {
    let lastError: unknown
    for (const [attempt, { selection, apiKey }] of candidates.entries()) {
      plan.model = selection.configured
      plan.piModel = toPiModelSummary(selection)
      await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan, projectSupport: summarizeProjectSupport(projectSupport), attempt: attempt + 1 }, home)
      const primaryTodoIds = todoIdsForRole(plan, plan.role)
      await updateTodoStatus(plan, primaryTodoIds, "running", "primary", sessionId, home, request.onTodoEvent, { role: plan.role })

      const runtime = createBraincodeAgentRuntime({
        mode: plan.mode,
        systemPrompt: getAgentRoleSystemPrompt(plan.role, plan.policy),
        model: plan.model,
        policy: plan.policy,
        sessionId,
        tools: runtimeTools,
        getApiKey: (provider) => (provider === plan.piModel.provider ? apiKey : undefined),
        onEvent: request.onEvent,
        onToolApproval: request.onToolApproval,
      })

      try {
        await runtime.agent.prompt(primaryPrompt, promptImages.length > 0 ? promptImages : undefined)
        const primarySummary = extractAssistantText(runtime.agent.state.messages)
        await updateTodoStatus(plan, primaryTodoIds, "completed", "primary", sessionId, home, request.onTodoEvent, { role: plan.role, summary: primarySummary.trim() })
        const patchAfterPrimary = await collectPatchSummary(cwd, patchBaseline)
        const checks = hasPatchActivity(patchAfterPrimary) ? await runPatchChecks(cwd) : undefined
        if (checks) {
          await appendSessionRecord(sessionId, { type: "check_summary", ...checks, attempt: attempt + 1 }, home)
        }
        const reviewArtifacts: PatchReviewArtifacts | undefined = hasPatchActivity(patchAfterPrimary)
          ? { patch: patchAfterPrimary, checks, diff: await collectPatchDiffSnapshot(cwd) }
          : undefined
        const reviewResult =
          plan.agentPlan.requiresReview && reviewWorker && plan.role !== "review"
            ? await runWorkerFromPlan(reviewWorker, (handoff) => buildReviewPrompt(effectivePrompt, primarySummary, workerResults, handoff, projectSupport, reviewArtifacts), sessionId, home, models, plan.mode, "review", projectSupport, hookContext, request.onWorkerEvent, onWorkerTodoStatus, promptImages)
            : undefined
        if (reviewResult) workerResults.push(reviewResult)

        const stopHooks = await runAndRecordHooks(
          "Stop",
          {
            stop_hook_active: false,
            last_assistant_message: primarySummary || null,
          },
          { ...hookContext, model: plan.model.id },
          undefined,
          home,
          "hook_stop",
        )
        const summary = `${mergeReviewResult(primarySummary, reviewResult)}${formatStopHookFeedback(stopHooks)}`
        const patch = await collectPatchSummary(cwd, patchBaseline)
        if (hasPatchActivity(patch)) {
          await appendSessionRecord(sessionId, { type: "patch_summary", ...patch, attempt: attempt + 1 }, home)
        }
        await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults, patch: hasPatchActivity(patch) ? patch : undefined, checks, attempt: attempt + 1 }, home)
        return { sessionId, summary, plan, workerResults, mcp: mcpReport, patch, checks }
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        await appendSessionRecord(sessionId, { type: "run_error", error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
      }
    }

    await updateTodoStatus(plan, todoIdsForRole(plan, plan.role), "failed", "primary", sessionId, home, request.onTodoEvent, { role: plan.role, error: lastError instanceof Error ? lastError.message : String(lastError) })
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  } finally {
    mcpHub.shutdown()
  }
}

export const HANDOFF_SUMMARY_PROMPT = [
  "You are producing a handoff brief so the next agent can continue this session.",
  "Read the prior turns of this session and output a concise brief covering:",
  "  1. The user's overall goal.",
  "  2. Key actions, decisions, and findings so far.",
  "  3. Current state / progress.",
  "  4. What remains to be done or any open questions.",
  "Format as short bullet points. Do not narrate that you are summarizing — output only the brief.",
].join("\n")

export type EnsureSessionHandoffOptions = {
  focus?: string
  force?: boolean
  trigger?: "manual" | "auto"
}

export type EnsureSessionHandoffResult = {
  summary: string
  reused: boolean
  trigger: "manual" | "auto"
  timestamp: number
}

export async function ensureSessionHandoff(
  sessionId: string,
  options: EnsureSessionHandoffOptions = {},
  home?: string,
): Promise<EnsureSessionHandoffResult> {
  const trigger = options.trigger ?? "auto"
  if (!options.force) {
    const context = await readSessionContext(sessionId, home)
    if (context?.latestHandoff?.fresh) {
      return {
        summary: context.latestHandoff.summary,
        reused: true,
        trigger: context.latestHandoff.trigger ?? trigger,
        timestamp: context.latestHandoff.timestamp ?? Date.now(),
      }
    }
  }
  const prompt = options.focus
    ? `${HANDOFF_SUMMARY_PROMPT}\n\nExtra focus requested by the user: ${options.focus}`
    : HANDOFF_SUMMARY_PROMPT
  const result = await executePromptFromConfig({ prompt, sessionId }, home)
  const summary = (result.summary ?? "").trim()
  if (!summary) {
    throw new Error("Handoff summarization returned no text.")
  }
  const timestamp = Date.now()
  await appendSessionRecord(
    sessionId,
    {
      type: "handoff",
      timestamp,
      summary,
      focus: options.focus,
      trigger,
    },
    home,
  )
  return { summary, reused: false, trigger, timestamp }
}

export type PromptReference = {
  token: string
  path: string
  kind: "text" | "image" | "session" | "missing"
  sessionId?: string
  size?: number
  reason?: string
}

export type ExpandedPromptResult = {
  prompt: string
  references: PromptReference[]
  images: ImageContent[]
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"])
const SUPPORTED_IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}
const MAX_INLINE_FILE_BYTES = 64 * 1024
const MAX_INLINE_SESSION_CHARS = 24 * 1024
const MAX_SESSION_FIELD_CHARS = 6 * 1024

function inlineCodeFence(path: string): string {
  const dot = path.lastIndexOf(".")
  const ext = dot === -1 ? "" : path.slice(dot + 1).toLowerCase()
  if (!ext) return ""
  return ext.replace(/[^a-z0-9]/g, "")
}

function clipContextText(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1))}…`
}

function formatSessionContext(context: SessionContext): string {
  const lines: string[] = [
    `Session ${context.sessionId}`,
    `Status: ${context.status}`,
    `Updated: ${new Date(context.updatedAt).toISOString()}`,
    "Scope: compact session context only; full transcripts and private worker internals are not included.",
  ]
  if (context.prompt) lines.push(`Initial prompt:\n${clipContextText(context.prompt, MAX_SESSION_FIELD_CHARS)}`)
  if (context.summary) lines.push(`Latest summary:\n${clipContextText(context.summary, MAX_SESSION_FIELD_CHARS)}`)
  if (context.entries.length > 0) {
    lines.push("Relevant records:")
    for (const entry of context.entries) {
      if (entry.type === "run") {
        const label = `- run${entry.attempt ? ` attempt ${entry.attempt}` : ""} (${entry.status}${entry.role ? `, ${entry.role}` : ""})`
        const prompt = entry.prompt ? `\n  prompt: ${clipContextText(entry.prompt.replace(/\s+/g, " ").trim(), 600)}` : ""
        const summary = entry.summary ? `\n  summary: ${clipContextText(entry.summary, MAX_SESSION_FIELD_CHARS)}` : ""
        lines.push(`${label}${prompt}${summary}`)
      } else if (entry.type === "worker") {
        const label = `- worker${entry.phase ? `/${entry.phase}` : ""}${entry.role ? ` ${entry.role}` : ""} (${entry.status})`
        const summary = entry.summary ? `\n  summary: ${clipContextText(entry.summary, 2000)}` : ""
        const error = entry.error ? `\n  error: ${clipContextText(entry.error, 1200)}` : ""
        lines.push(`${label}${summary}${error}`)
      } else if (entry.type === "todo") {
        const label = `- todo${entry.phase ? `/${entry.phase}` : ""}${entry.role ? ` ${entry.role}` : ""} (${entry.status})`
        const title = entry.title ? `\n  task: ${clipContextText(entry.title, 600)}` : ""
        const summary = entry.summary ? `\n  summary: ${clipContextText(entry.summary, 1200)}` : ""
        const error = entry.error ? `\n  error: ${clipContextText(entry.error, 1200)}` : ""
        lines.push(`${label}${title}${summary}${error}`)
      } else if (entry.type === "check") {
        const label = `- checks${entry.attempt ? ` attempt ${entry.attempt}` : ""} (${entry.status})`
        const reason = entry.reason ? `\n  reason: ${clipContextText(entry.reason, 800)}` : ""
        const checks = entry.checks.length > 0
          ? `\n  scripts: ${entry.checks.map((check) => `${check.name}:${check.status}${check.exitCode === undefined ? "" : `:${check.exitCode ?? "n/a"}`}`).join(", ")}`
          : ""
        lines.push(`${label}${reason}${checks}`)
      } else if (entry.type === "handoff") {
        const label = `- handoff${entry.trigger ? ` (${entry.trigger})` : ""}`
        const focus = entry.focus ? `\n  focus: ${clipContextText(entry.focus, 400)}` : ""
        lines.push(`${label}${focus}\n  summary: ${clipContextText(entry.summary, MAX_SESSION_FIELD_CHARS)}`)
      } else {
        lines.push(`- error${entry.attempt ? ` attempt ${entry.attempt}` : ""}: ${clipContextText(entry.error, 1200)}`)
      }
    }
    if (context.truncated) lines.push("- earlier records omitted")
  }
  return clipContextText(lines.join("\n"), MAX_INLINE_SESSION_CHARS)
}

export async function expandPromptReferences(prompt: string, projectRoot: string, home?: string): Promise<ExpandedPromptResult> {
  const references: PromptReference[] = []
  const images: ImageContent[] = []
  const tokens = new Map<string, PromptReference>()
  const sessionContexts = new Map<string, SessionContext>()
  const sessionBriefs = new Map<string, string>()
  const pattern = /(^|\s)(@@?)([^\s@]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(prompt)) !== null) {
    const marker = match[2]
    const rawTarget = match[3]
    if (!marker || !rawTarget) continue
    const token = `${marker}${rawTarget}`
    if (tokens.has(token)) continue
    if (marker === "@@") {
      const context = await readSessionContext(rawTarget, home)
      if (!context) {
        const ref: PromptReference = { token, path: rawTarget, kind: "missing", reason: "session not found" }
        tokens.set(token, ref)
        references.push(ref)
        continue
      }
      const ref: PromptReference = { token, path: context.path, kind: "session", sessionId: context.sessionId }
      tokens.set(token, ref)
      sessionContexts.set(token, context)
      references.push(ref)
      try {
        const handoff = await ensureSessionHandoff(context.sessionId, { trigger: "auto" }, home)
        sessionBriefs.set(token, handoff.summary)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        debugLog("expandPromptReferences", `handoff for @@${context.sessionId} failed, falling back to mechanical context`, { error: detail })
      }
      continue
    }

    const rawPath = rawTarget
    if (rawPath === "image" || rawPath.startsWith("image:")) continue
    const absolute = isAbsolute(rawPath) ? rawPath : resolvePath(projectRoot, rawPath)
    const file = Bun.file(absolute)
    if (!(await file.exists())) {
      const ref: PromptReference = { token, path: absolute, kind: "missing", reason: "file not found" }
      tokens.set(token, ref)
      references.push(ref)
      continue
    }
    const dot = absolute.lastIndexOf(".")
    const ext = dot === -1 ? "" : absolute.slice(dot).toLowerCase()
    if (IMAGE_EXTENSIONS.has(ext)) {
      const ref: PromptReference = { token, path: absolute, kind: "image" }
      tokens.set(token, ref)
      references.push(ref)
      continue
    }
    const size = file.size
    if (size > MAX_INLINE_FILE_BYTES) {
      const ref: PromptReference = { token, path: absolute, kind: "missing", reason: `file is ${size} bytes (limit ${MAX_INLINE_FILE_BYTES})`, size }
      tokens.set(token, ref)
      references.push(ref)
      continue
    }
    const ref: PromptReference = { token, path: absolute, kind: "text", size }
    tokens.set(token, ref)
    references.push(ref)
  }

  if (references.length === 0) return { prompt, references, images }

  const sections: string[] = []
  for (const ref of references) {
    if (ref.kind === "text") {
      const content = await Bun.file(ref.path).text()
      const rel = relativePath(projectRoot, ref.path) || ref.path
      const fence = inlineCodeFence(ref.path)
      sections.push(`File ${ref.token} (${rel}):\n\`\`\`${fence}\n${content}\n\`\`\``)
    } else if (ref.kind === "image") {
      const rel = relativePath(projectRoot, ref.path) || ref.path
      const dot = ref.path.lastIndexOf(".")
      const ext = dot === -1 ? "" : ref.path.slice(dot).toLowerCase()
      const mimeType = SUPPORTED_IMAGE_MIME_TYPES[ext]
      if (mimeType) {
        try {
          const bytes = await Bun.file(ref.path).bytes()
          const data = Buffer.from(bytes).toString("base64")
          images.push({ type: "image", data, mimeType })
          sections.push(`Image ${ref.token} (${rel}) — attached to this message.`)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          debugLog("expandPromptReferences", `failed to read image ${ref.path}`, { error: detail })
          sections.push(`Image ${ref.token} (${rel}) could not be read: ${detail}.`)
        }
      } else {
        sections.push(`Image ${ref.token} attached at ${rel} (format not inlineable as image; treat as filesystem reference).`)
      }
    } else if (ref.kind === "session") {
      const brief = sessionBriefs.get(ref.token)
      const context = sessionContexts.get(ref.token)
      if (brief) {
        const header = context ? `Session ${context.sessionId} (status: ${context.status})` : `Session ${ref.token.slice(2)}`
        sections.push(`Session reference ${ref.token} — handoff brief:\n${header}\n\n${brief}`)
      } else if (context) {
        sections.push(`Session reference ${ref.token}:\n${formatSessionContext(context)}`)
      } else {
        sections.push(`Session reference ${ref.token} could not be inlined.`)
      }
    } else {
      sections.push(`Reference ${ref.token} could not be inlined: ${ref.reason ?? "unknown"}.`)
    }
  }
  return {
    prompt: `${prompt}\n\nReferenced attachments:\n${sections.join("\n\n")}`,
    references,
    images,
  }
}
