import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { join, resolve as resolvePath, relative as relativePath, isAbsolute } from "node:path"
import { Agent, type AgentEvent, type AgentMessage, type AgentTool, type AgentToolResult } from "@earendil-works/pi-agent-core"
export type { AgentEvent } from "@earendil-works/pi-agent-core"
import { collectMcpToolServers, McpToolHub, type McpHubConnectReport } from "./mcp"
export { collectMcpToolServers, McpToolHub } from "./mcp"
export type { McpHubConnectReport, McpToolServerInput } from "./mcp"
export { demoBenchmarkTasks, evaluateDemoBenchmarkPlan, resolveDemoBenchmarkTasks, runDemoBenchmarkSuite } from "./benchmark"
export type { DemoBenchmarkCheck, DemoBenchmarkCheckStatus, DemoBenchmarkExpectation, DemoBenchmarkPlanRunner, DemoBenchmarkRunOptions, DemoBenchmarkSuiteResult, DemoBenchmarkSuiteSummary, DemoBenchmarkTask, DemoBenchmarkTaskCategory, DemoBenchmarkTaskResult } from "./benchmark"
import { runtimeModelRequirementsForImages, runtimeModelRequirementsForRole, selectRuntimeModel, selectRuntimeModelCandidatesWithApiKey, selectRuntimeModelWithApiKey, toPiModelSummary, type RuntimeModelCandidate, type RuntimeModelRequirements, type RuntimeModelSelection, type RuntimePiModelSummary } from "./model-selection"
export { selectRuntimeModel } from "./model-selection"
export type { RuntimeModelRequirements, RuntimeModelSelection, RuntimePiModelSummary } from "./model-selection"
import type { ImageContent } from "@earendil-works/pi-ai"
import { createAgentTodoId, formatRoutedAgentRoleCatalog, getAgentRoleSystemPrompt, getModePolicy, getModeRoutingLimits, normalizeAgentRoutingPlan, planAgentRouting, routedAgentRoles, selectBrain, selectModelPolicy, type AgentRole, type AgentRoutingPlan, type AgentTodoDependency, type AgentTodoItem, type AgentTodoStatus, type AgentWorkerPlan, type BrainModel, type BrainPreset, type BraincodeMode, type ModePolicy, type ModeRoutingLimits, type ModelPolicy, type RoutedAgentRole } from "@braincode/brain"
import { appendSessionRecord, appendTokenUsageRecord, defaultBrains, defaultModels, getBraincodeHome, normalizeTokenUsage, readAuth, readBrains, readHookSources, readModels, readProjectSupport, readSessionContext, readSettings, readTools, readUserSupport, type HookEventName, type HookHandler, type HookMatcherGroup, type HookSource, type ProjectSupport, type SessionContext, type TokenUsagePhase } from "@braincode/config"
import { agentToBrainContextTransfer, brainToAgentContextTransfer, createBrainTaskContext, createHandoffAgentMessage, createWorkerResultAgentMessage, type BrainTaskContext, type HandoffPacket, type TaskProgress, type WorkerResult } from "@braincode/context"
import type { BraincodeModel, ImageGenerationResult } from "@braincode/llm"
import { generateImage, isImageGenerationModel, resolveBuiltInPiModel } from "@braincode/llm"
import type { ContextRef } from "@braincode/protocol"
import { debugLog, isDebugEnabled } from "@braincode/shared"
import { createLocalCodingTools, defaultCheckRunnerConfiguration, type CheckRunnerConfiguration, type LocalToolMode } from "@braincode/tools"

export type AgentRunRequest = {
  prompt: string
  sessionId?: string
  projectRoot?: string
  signal?: AbortSignal
  forceRoles?: RoutedAgentRole[]
  onPlan?: (plan: RuntimePlan) => void | Promise<void>
  onTodoEvent?: (event: TodoLifecycleEvent) => void | Promise<void>
  onEvent?: (event: AgentEvent) => void | Promise<void>
  onToolApproval?: (request: ToolApprovalRequest, signal?: AbortSignal) => ToolApprovalDecision | Promise<ToolApprovalDecision>
  localToolMode?: LocalToolMode
  ignoreDisabledLocalTools?: boolean
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

function createRunAbortedError(): Error {
  const error = new Error("Braincode run interrupted by user.")
  error.name = "AbortError"
  return error
}

function throwIfRunAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createRunAbortedError()
}

function linkRuntimeAbort(runtime: BraincodeAgentRuntime, signal?: AbortSignal): () => void {
  if (!signal) return () => {}
  const abort = () => runtime.agent.abort()
  if (signal.aborted) {
    abort()
    return () => {}
  }
  signal.addEventListener("abort", abort, { once: true })
  return () => signal.removeEventListener("abort", abort)
}

export type WorkerLifecycleEvent =
  | { type: "worker_start"; role: RoutedAgentRole; goal: string; phase: "primary" | "support" | "review"; modelId: string; handoffId: string; taskId: string; parentId: string; progress: TaskProgress; todoIds?: string[] }
  | { type: "worker_end"; role: RoutedAgentRole; phase: "primary" | "support" | "review"; status: "completed" | "blocked" | "failed"; handoffId: string; taskId: string; parentId: string; progress: TaskProgress; summary?: string; error?: string; todoIds?: string[] }

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
  reviewDecision?: ReviewDecision
}

export function humanizeAgentRuntimeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (isHandoffRequiredError(error)) {
    const sessionId = error instanceof ContextHandoffRequiredError ? error.sessionId : undefined
    const size = error instanceof ContextHandoffRequiredError ? ` (${formatBytes(error.estimatedBytes)} prepared for a ${formatBytes(error.limitBytes)} provider limit)` : ""
    return [
      `Context handoff required${size}.`,
      "",
      "The active agent context is too large to send safely. Braincode should continue from a handoff boundary instead of silently compressing the current transcript.",
      sessionId
        ? `In the TUI, run \`/handoff\` for the current session, or continue a new prompt with \`@@${sessionId} <next task>\`.`
        : "In the TUI, run `/handoff`, then continue from the generated `@@<session-id>` draft.",
      "The handoff is a compact session packet; full tool transcripts and private worker context are not copied forward.",
    ].join("\n")
  }
  if (isProviderMessageSizeLimitError(error)) {
    return [
      "Context handoff required.",
      "",
      `The provider rejected this request because the message payload is too large: ${message}`,
      "Run `/handoff` in the TUI, then continue from the generated `@@<session-id>` draft.",
    ].join("\n")
  }
  if (/Kimi For Coding is currently only available for Coding Agents/i.test(message)) {
    return [
      message,
      "",
      "Hint: Kimi rejected this request because the configured kimi-for-coding endpoint only accepts supported coding-agent clients. Braincode could reach the provider, but this model access mode is not usable for the current runtime request.",
      "Fix: choose a model/provider that accepts Braincode in `braincode config`, or remove `kimi/kimi-for-coding` from the affected role's `fallbackModelIds` in ~/.braincode/brains.json.",
    ].join("\n")
  }
  if (/User location is not supported/i.test(message) || /region is not supported/i.test(message)) {
    return `${message}\n\nHint: The upstream provider rejected the request because of geographic restrictions. Either set a usable proxy baseUrl for the provider in ~/.braincode/models.json or configure a Brain role that maps to a different provider.`
  }
  if (/missing API key for provider/i.test(message)) {
    return `${message}\n\nHint: Add the provider API key with \`braincode config\` or write it to ~/.braincode/auth.json.`
  }
  if (/Provider returned an empty assistant response/i.test(message)) {
    return `${message}\n\nHint: The provider returned HTTP success but no assistant content. Check the model API type in ~/.braincode/models.json; for OpenAI-compatible proxies, try switching this model between \`openai-responses\` and \`openai-completions\` in \`braincode config\`.`
  }
  if (/image input requires a vision-capable model|no configured vision-capable model/i.test(message)) {
    return `${message}\n\nHint: This prompt includes an image, so Braincode can only use a model marked as Vision-capable. Enable Vision for a compatible model in \`braincode config\`, or let routeBrain select a configured vision model for this run.`
  }
  return message
}

const PROVIDER_MESSAGE_SIZE_LIMIT_BYTES = 2 * 1024 * 1024
const PROVIDER_MESSAGE_SIZE_GUARD_BYTES = Math.floor(PROVIDER_MESSAGE_SIZE_LIMIT_BYTES * 0.88)
const AUTO_HANDOFF_SUMMARY_CHARS = 24 * 1024
const AUTO_HANDOFF_MESSAGE_CHARS = 1600

export class ContextHandoffRequiredError extends Error {
  readonly estimatedBytes: number
  readonly limitBytes: number
  readonly sessionId?: string
  readonly handoffSummary?: string

  constructor(input: { estimatedBytes: number; limitBytes: number; sessionId?: string; handoffSummary?: string }) {
    super(`Braincode handoff required: active message context is ${input.estimatedBytes} bytes, exceeding the ${input.limitBytes} byte safety budget.`)
    this.name = "ContextHandoffRequiredError"
    this.estimatedBytes = input.estimatedBytes
    this.limitBytes = input.limitBytes
    this.sessionId = input.sessionId
    this.handoffSummary = input.handoffSummary
  }
}

export function isHandoffRequiredError(error: unknown): boolean {
  if (error instanceof ContextHandoffRequiredError) return true
  const message = error instanceof Error ? error.message : String(error)
  return /Braincode handoff required|Context handoff required/i.test(message)
}

export function isProviderMessageSizeLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /total message size\s+\d+\s+exceeds limit\s+\d+/i.test(message)
    || /message payload is too large/i.test(message)
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
  enabled?: boolean
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

export type ReviewDecisionStatus = "approved" | "changes_requested" | "blocked"

export type ReviewFindingSeverity = "low" | "medium" | "high"

export type ReviewFinding = {
  severity: ReviewFindingSeverity
  issue: string
  file?: string
  line?: number
  evidence?: string
  suggestion?: string
}

export type ReviewDecision = {
  decision: ReviewDecisionStatus
  rationale: string
  findings: ReviewFinding[]
  requiredChanges: string[]
  blockingIssues: string[]
  residualRisks: string[]
}

type ToolEvidenceCacheEntry = {
  result: AgentToolResult<any>
  createdAt: number
}

export type ToolEvidenceCache = {
  entries: Map<string, ToolEvidenceCacheEntry>
  counts: Map<string, number>
  lastKey?: string
  consecutiveCount: number
}

export type BraincodeAgentRuntimeOptions = {
  mode: BraincodeMode
  systemPrompt: string
  model: BraincodeModel
  policy: ModelPolicy
  sessionId?: string
  tools?: AgentTool[]
  toolEvidenceCache?: ToolEvidenceCache
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined
  onEvent?: (event: AgentEvent) => void | Promise<void>
  onToolApproval?: (request: ToolApprovalRequest, signal?: AbortSignal) => ToolApprovalDecision | Promise<ToolApprovalDecision>
  usage?: TokenUsageScope
}

export type TokenUsageScope = {
  sessionId: string
  home?: string
  role: AgentRole
  phase: TokenUsagePhase
  agentSessionId?: string
  taskId?: string
  parentId?: string
  attempt?: number
  brainId?: string
}

export type BraincodeAgentRuntime = {
  agent: Agent
  selection: RuntimeModelSelection
}

export type RuntimeWorkerPlan = AgentWorkerPlan & {
  contextId: string
  model: BraincodeModel
  policy: ModelPolicy
  piModel: RuntimePiModelSummary
}

export type ExecutedWorkerResult = WorkerResult & {
  role: RoutedAgentRole
  goal: string
  todoIds: string[]
  status: "completed" | "blocked" | "failed"
  error?: string
  reviewDecision?: ReviewDecision
}

export type RuntimePlan = {
  mode: BraincodeMode
  modeDescription: string
  brain: Pick<BrainModel, "id" | "name" | "description">
  context: BrainTaskContext
  role: RoutedAgentRole
  agentPlan: AgentRoutingPlan
  todos: AgentTodoItem[]
  dependencies: AgentTodoDependency[]
  workers: RuntimeWorkerPlan[]
  routing: {
    source: "router-brain" | "heuristic"
    confidence?: number
    reason?: string
    configuredMaxParallelAgents?: number
    maxParallelAgents?: number
    maxWorkerAgents?: number
    maxTodos?: number
  }
  model: BraincodeModel
  policy: ModelPolicy
  piModel: RuntimePiModelSummary
  toolExecution: "sequential" | "parallel"
}

export type PlanRuntimeOptions = {
  /**
   * Defaults to true because Braincode's normal planning path is routeBrain.
   * Set false only for heuristic-only diagnostics that must not call a provider.
   */
  useRouterBrain?: boolean
  /**
   * Base directory for @file/image references during plan previews.
   * Defaults to the current process working directory.
   */
  projectRoot?: string
}

type RouterWorkerPlan = AgentWorkerPlan & {
  modelId?: string
}

type RouterPlanDecision = Omit<AgentRoutingPlan, "workers"> & {
  workers: RouterWorkerPlan[]
  confidence?: number
  modelId?: string
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

function createRuntimeWorkerPlan(worker: AgentWorkerPlan, brain: BrainModel, models: BraincodeModel[], requirements?: RuntimeModelRequirements, policyOverride?: ModelPolicy): RuntimeWorkerPlan {
  const policy = policyOverride ?? selectModelPolicy(brain, worker.role)
  const workerRequirements = worker.role === "imageMaker" ? { requiresImageGeneration: true } : requirements
  const selection = selectRuntimeModel(policy, models, workerRequirements)
  return {
    ...worker,
    contextId: crypto.randomUUID(),
    model: selection.configured,
    policy,
    piModel: toPiModelSummary(selection),
  }
}

const CACHEABLE_EVIDENCE_TOOLS = new Set(["list_files", "read_file", "search_files", "git_diff", "get_changed_files"])
const EVIDENCE_CACHE_SUPPRESS_CONTENT_AFTER_CONSECUTIVE = 8

export function createToolEvidenceCache(): ToolEvidenceCache {
  return {
    entries: new Map(),
    counts: new Map(),
    consecutiveCount: 0,
  }
}

function wrapToolsWithEvidenceCache(tools: AgentTool[], cache: ToolEvidenceCache): AgentTool[] {
  return tools.map((tool) => {
    const wrapped: AgentTool = {
      ...tool,
      execute: async (toolCallId, params, signal, onUpdate) => {
        const key = toolEvidenceKey(tool.name, params)
        const count = recordToolEvidenceCall(cache, key)
        const cacheable = isCacheableEvidenceToolCall(tool.name, params)
        const cached = cacheable ? cache.entries.get(key) : undefined
        if (cached) {
          return annotateToolEvidenceResult(cached.result, {
            toolName: tool.name,
            reused: true,
            callCount: count,
            consecutiveCount: cache.consecutiveCount,
            cacheAgeMs: Date.now() - cached.createdAt,
          })
        }

        const result = await tool.execute(toolCallId, params as never, signal, onUpdate as never)
        if (toolInvalidatesEvidenceCache(tool.name, params)) {
          resetToolEvidenceCache(cache)
        } else if (cacheable) {
          cache.entries.set(key, { result, createdAt: Date.now() })
        }

        return annotateToolEvidenceResult(result, {
          toolName: tool.name,
          reused: false,
          callCount: count,
          consecutiveCount: cache.consecutiveCount,
        })
      },
    }
    return wrapped
  })
}

function recordToolEvidenceCall(cache: ToolEvidenceCache, key: string): number {
  const count = (cache.counts.get(key) ?? 0) + 1
  cache.counts.set(key, count)
  cache.consecutiveCount = cache.lastKey === key ? cache.consecutiveCount + 1 : 1
  cache.lastKey = key
  return count
}

function resetToolEvidenceCache(cache: ToolEvidenceCache): void {
  cache.entries.clear()
  cache.counts.clear()
  cache.lastKey = undefined
  cache.consecutiveCount = 0
}

function toolEvidenceKey(toolName: string, args: unknown): string {
  return `${toolName.toLowerCase()}:${canonicalToolArgs(args)}`
}

function canonicalToolArgs(value: unknown): string {
  try {
    return JSON.stringify(toStableJsonValue(value, new WeakSet())) ?? ""
  } catch {
    return safeStringify(value)
  }
}

function toStableJsonValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (Array.isArray(value)) return value.map((item) => toStableJsonValue(item, seen))
  if (typeof value !== "object") return String(value)
  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    output[key] = toStableJsonValue((value as Record<string, unknown>)[key], seen)
  }
  seen.delete(value)
  return output
}

function isCacheableEvidenceToolCall(toolName: string, _args: unknown): boolean {
  const name = toolName.toLowerCase()
  if (CACHEABLE_EVIDENCE_TOOLS.has(name)) return true
  return false
}

function toolInvalidatesEvidenceCache(toolName: string, args: unknown): boolean {
  if (isCacheableEvidenceToolCall(toolName, args)) return false
  const name = toolName.toLowerCase()
  return /(apply_patch|edit|write|patch|delete|remove|rm_|rename|move|create_file|create-file|filesystem__write|shell|exec|execute|run_command|run-command|terminal|bash|zsh|cmd|powershell|spawn|subprocess|run_script)/.test(name)
}

function annotateToolEvidenceResult<TDetails>(
  result: AgentToolResult<TDetails>,
  evidence: {
    toolName: string
    reused: boolean
    callCount: number
    consecutiveCount: number
    cacheAgeMs?: number
  },
): AgentToolResult<TDetails> {
  const warning = formatEvidenceCacheReminder(evidence)
  const details = addEvidenceCacheDetails(result.details, { ...evidence, warning })
  if (!warning) return { ...result, details }
  if (evidence.reused && evidence.consecutiveCount >= EVIDENCE_CACHE_SUPPRESS_CONTENT_AFTER_CONSECUTIVE) {
    return {
      ...result,
      details,
      content: [
        {
          type: "text",
          text: `${warning}\n\nNo new tool output is included because this duplicate read-only call has already been answered in this turn.`,
        },
      ],
    }
  }

  const [first, ...rest] = result.content
  if (first && first.type === "text" && typeof first.text === "string") {
    return {
      ...result,
      details,
      content: [{ ...first, text: `${warning}\n\n${first.text}` }, ...rest],
    }
  }
  return {
    ...result,
    details,
    content: [{ type: "text", text: warning }, ...result.content],
  }
}

function addEvidenceCacheDetails<TDetails>(details: TDetails, evidenceCache: Record<string, unknown>): TDetails {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return { ...(details as Record<string, unknown>), evidenceCache } as TDetails
  }
  return { value: details, evidenceCache } as TDetails
}

function formatEvidenceCacheReminder(evidence: { toolName: string; reused: boolean; callCount: number; consecutiveCount: number; cacheAgeMs?: number }): string | undefined {
  if (evidence.callCount <= 1) return undefined
  const age = evidence.cacheAgeMs === undefined ? "" : ` (${evidence.cacheAgeMs}ms old)`
  if (evidence.consecutiveCount >= 8) {
    return `[Braincode evidence cache] Repeated ${evidence.toolName} with identical arguments ${evidence.consecutiveCount} times in a row. Stop repeating this call; use the cached evidence${age} or change the arguments.`
  }
  if (evidence.consecutiveCount >= 5) {
    return `[Braincode evidence cache] Strong duplicate reminder: ${evidence.toolName} has identical arguments ${evidence.consecutiveCount} times in a row. Reuse the existing evidence${age} unless inputs changed.`
  }
  if (evidence.consecutiveCount >= 3) {
    return `[Braincode evidence cache] Duplicate reminder: ${evidence.toolName} has identical arguments ${evidence.consecutiveCount} times in a row. Avoid looping over the same evidence.`
  }
  return evidence.reused
    ? `[Braincode evidence cache] Reusing cached read-only result for duplicate ${evidence.toolName} call${age}.`
    : `[Braincode evidence cache] Duplicate ${evidence.toolName} call detected; reuse prior evidence unless the arguments need to change.`
}

export function createBraincodeAgentRuntime(options: BraincodeAgentRuntimeOptions): BraincodeAgentRuntime {
  const { piModel } = resolveBuiltInPiModel(options.model)
  const tools = options.toolEvidenceCache && options.tools
    ? wrapToolsWithEvidenceCache(options.tools, options.toolEvidenceCache)
    : options.tools ?? []
  const agent = new Agent({
    sessionId: options.sessionId,
    initialState: {
      systemPrompt: options.systemPrompt,
      model: piModel,
      thinkingLevel: normalizeRuntimeThinkingLevel(options.model, options.policy),
      tools,
      messages: [],
    },
    transformContext: async (messages) => enforceHandoffContextBudget(messages, {
      systemPrompt: options.systemPrompt,
      sessionId: options.sessionId,
    }),
    getApiKey: options.getApiKey,
    onPayload: (payload, model) => {
      if (!isDebugEnabled()) return undefined
      debugLog("runtime", "provider payload", {
        configuredModelId: options.model.id,
        provider: model.provider,
        modelId: model.id,
        api: model.api,
        payload: summarizeProviderPayload(payload),
      })
      return undefined
    },
    onResponse: (response, model) => {
      if (!isDebugEnabled()) return
      debugLog("runtime", "provider response", {
        configuredModelId: options.model.id,
        provider: model.provider,
        modelId: model.id,
        api: model.api,
        status: response.status,
        headers: summarizeProviderResponseHeaders(response.headers),
      })
    },
    toolExecution: options.mode === "radical" ? "parallel" : "sequential",
    beforeToolCall: async (context, signal) => {
      if (options.mode === "radical") return undefined
      const requiresApproval = toolCallRequiresApproval(context.toolCall.name, context.args)
      if (options.onToolApproval && requiresApproval) {
        const decision = await options.onToolApproval({
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          args: context.args,
        }, signal)
        if (decision?.approved === false) {
          return { block: true, reason: decision.reason ?? `User blocked tool call: ${context.toolCall.name}` }
        }
        return undefined
      }
      if (requiresApproval) {
        return { block: true, reason: `Tool approval callback is required for risky tool call: ${context.toolCall.name}` }
      }
      return undefined
    },
  })

  agent.subscribe((event) => {
    if (isDebugEnabled() && shouldDebugAgentEvent(event)) {
      debugLog("runtime", "agent event", summarizeAgentEvent(event))
    }
    return options.onEvent?.(event)
  })

  return {
    agent,
    selection: {
      requested: options.policy,
      configured: options.model,
      piModel,
    },
  }
}

async function recordAgentTokenUsage(
  messages: unknown[],
  scope: TokenUsageScope | undefined,
  model: BraincodeModel,
): Promise<void> {
  if (!scope) return
  let usageIndex = 0
  for (const [messageIndex, message] of messages.entries()) {
    if (!message || typeof message !== "object") continue
    const usage = normalizeTokenUsage((message as { usage?: unknown }).usage)
    if (!usage) continue
    usageIndex += 1
    await appendTokenUsageRecord(
      scope.sessionId,
      {
        role: scope.role,
        phase: scope.phase,
        brainId: scope.brainId,
        modelId: model.id,
        provider: model.provider,
        agentSessionId: scope.agentSessionId,
        taskId: scope.taskId,
        parentId: scope.parentId,
        turnId: `${scope.agentSessionId ?? scope.sessionId}:${messageIndex}:${usageIndex}`,
        attempt: scope.attempt,
        usage,
      },
      scope.home,
    )
  }
}

function enforceHandoffContextBudget(
  messages: AgentMessage[],
  options: { systemPrompt: string; sessionId?: string },
): AgentMessage[] {
  const estimatedBytes = estimateProviderContextBytes(messages, options.systemPrompt)
  if (estimatedBytes <= PROVIDER_MESSAGE_SIZE_GUARD_BYTES) return messages
  const handoffSummary = buildAutomaticHandoffSummary(messages, {
    estimatedBytes,
    limitBytes: PROVIDER_MESSAGE_SIZE_GUARD_BYTES,
    sessionId: options.sessionId,
  })
  throw new ContextHandoffRequiredError({
    estimatedBytes,
    limitBytes: PROVIDER_MESSAGE_SIZE_GUARD_BYTES,
    sessionId: options.sessionId,
    handoffSummary,
  })
}

export function estimateProviderContextBytes(messages: AgentMessage[], systemPrompt: string): number {
  return utf8ByteLength(safeStringify({ systemPrompt, messages: sanitizeMessagesForContextBudget(messages) }))
}

function sanitizeMessagesForContextBudget(messages: AgentMessage[]): unknown[] {
  return messages.map((message) => sanitizeContextBudgetValue(message))
}

function sanitizeContextBudgetValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeContextBudgetValue(item))
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  if (isImageLikeContextBlock(record)) {
    const sanitized: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(record)) {
      if (key === "data" && typeof entry === "string") {
        sanitized[key] = `[image data omitted from context budget: ${entry.length} chars]`
      } else if (key === "image_url") {
        sanitized[key] = summarizeImageUrlForContextBudget(entry)
      } else if (key === "url" && typeof entry === "string" && entry.startsWith("data:image/")) {
        sanitized[key] = `[image data URL omitted from context budget: ${entry.length} chars]`
      } else {
        sanitized[key] = sanitizeContextBudgetValue(entry)
      }
    }
    return sanitized
  }
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, sanitizeContextBudgetValue(entry)]))
}

function isImageLikeContextBlock(record: Record<string, unknown>): boolean {
  const type = typeof record.type === "string" ? record.type.toLowerCase() : ""
  if (type === "image" || type === "input_image" || type === "image_url") return true
  return typeof record.data === "string" && typeof record.mimeType === "string" && record.mimeType.startsWith("image/")
}

function summarizeImageUrlForContextBudget(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:image/")
      ? `[image data URL omitted from context budget: ${value.length} chars]`
      : value
  }
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
    if (key === "url" && typeof entry === "string" && entry.startsWith("data:image/")) {
      return [key, `[image data URL omitted from context budget: ${entry.length} chars]`]
    }
    return [key, sanitizeContextBudgetValue(entry)]
  }))
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "unknown size"
  if (bytes >= 1024 * 1024) return `${trimTrailingZero((bytes / 1024 / 1024).toFixed(1))} MB`
  if (bytes >= 1024) return `${trimTrailingZero((bytes / 1024).toFixed(1))} KB`
  return `${Math.max(0, Math.round(bytes))} bytes`
}

function trimTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value
}

function buildAutomaticHandoffSummary(
  messages: AgentMessage[],
  input: { estimatedBytes: number; limitBytes: number; sessionId?: string },
): string {
  const lines = [
    "Auto handoff generated by Braincode because the active agent context reached the provider message-size boundary.",
    input.sessionId ? `Session: ${input.sessionId}` : "",
    `Estimated active context: ${formatBytes(input.estimatedBytes)}; safety budget: ${formatBytes(input.limitBytes)}.`,
    "Continue from this packet instead of copying the full transcript or raw tool output forward.",
    "",
    "Recent visible context:",
  ].filter(Boolean)
  const selected = selectMessagesForAutomaticHandoff(messages)
  for (const message of selected) {
    const entry = formatMessageForAutomaticHandoff(message)
    if (!entry) continue
    const next = [...lines, entry].join("\n")
    if (next.length > AUTO_HANDOFF_SUMMARY_CHARS) {
      lines.push(`- Additional context omitted from this automatic handoff after ${selected.length} selected messages.`)
      break
    }
    lines.push(entry)
  }
  return clipTextForHandoff(lines.join("\n"), AUTO_HANDOFF_SUMMARY_CHARS)
}

function selectMessagesForAutomaticHandoff(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= 40) return messages
  const firstUser = messages.find((message) => message.role === "user")
  const recent = messages.slice(-39)
  return firstUser && !recent.includes(firstUser) ? [firstUser, ...recent] : recent
}

function formatMessageForAutomaticHandoff(message: AgentMessage): string | undefined {
  if (message.role === "user") {
    return `- user: ${clipTextForHandoff(messageContentText(message.content), AUTO_HANDOFF_MESSAGE_CHARS)}`
  }
  if (message.role === "assistant") {
    const text = assistantTextForHandoff(message)
    const toolCalls = assistantToolCallsForHandoff(message)
    const parts = [
      text ? `text: ${clipTextForHandoff(text, AUTO_HANDOFF_MESSAGE_CHARS)}` : "",
      toolCalls.length > 0 ? `tool calls: ${toolCalls.join("; ")}` : "",
      message.errorMessage ? `error: ${clipTextForHandoff(message.errorMessage, 800)}` : "",
      message.stopReason ? `stop: ${message.stopReason}` : "",
    ].filter(Boolean)
    return parts.length > 0 ? `- assistant: ${parts.join(" | ")}` : undefined
  }
  if (message.role === "toolResult") {
    return `- tool result ${message.toolName}: ${clipTextForHandoff(messageContentText(message.content), AUTO_HANDOFF_MESSAGE_CHARS)}`
  }
  return undefined
}

function assistantTextForHandoff(message: Extract<AgentMessage, { role: "assistant" }>): string {
  return message.content
    .map((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "text" && typeof (block as { text?: unknown }).text === "string" ? (block as { text: string }).text : "")
    .filter(Boolean)
    .join("\n")
    .trim()
}

function assistantToolCallsForHandoff(message: Extract<AgentMessage, { role: "assistant" }>): string[] {
  return message.content
    .filter((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "toolCall")
    .map((block) => {
      const record = block as unknown as Record<string, unknown>
      const name = typeof record.name === "string" ? record.name : "tool"
      const args = "arguments" in record ? ` ${clipTextForHandoff(safeStringify(record.arguments), 600)}` : ""
      return `${name}${args}`
    })
}

function messageContentText(content: unknown): string {
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return safeStringify(content)
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return ""
      const record = block as Record<string, unknown>
      if (typeof record.text === "string") return record.text
      if (record.type === "image") return "[image input]"
      return ""
    })
    .filter(Boolean)
    .join("\n")
    .trim()
}

function clipTextForHandoff(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 32))}\n...[truncated ${text.length - limit} chars]`
}

async function recordAutomaticHandoffIfNeeded(error: unknown, sessionId: string, home: string | undefined): Promise<void> {
  if (!(error instanceof ContextHandoffRequiredError) || !error.handoffSummary) return
  await appendSessionRecord(sessionId, {
    type: "handoff",
    summary: error.handoffSummary,
    focus: "automatic context-size guard",
    trigger: "auto",
    estimatedBytes: error.estimatedBytes,
    limitBytes: error.limitBytes,
  }, home)
}

function summarizeProviderPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return { type: typeof payload }
  const record = payload as Record<string, unknown>
  return {
    model: record.model,
    stream: record.stream,
    input: summarizeProviderMessageList(record.input),
    messages: summarizeProviderMessageList(record.messages),
    tools: Array.isArray(record.tools)
      ? record.tools.map((tool) => summarizeProviderTool(tool)).slice(0, 12)
      : undefined,
    toolCount: Array.isArray(record.tools) ? record.tools.length : undefined,
    toolsTruncated: Array.isArray(record.tools) ? record.tools.length > 12 : undefined,
    reasoning: record.reasoning,
    temperature: record.temperature,
    maxTokens: record.max_tokens ?? record.max_completion_tokens ?? record.max_output_tokens,
    store: record.store,
  }
}

function summarizeProviderMessageList(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined
  return {
    count: value.length,
    items: value.slice(0, 12).map((item) => summarizeProviderMessageItem(item)),
    truncated: value.length > 12,
  }
}

function summarizeProviderMessageItem(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") return { type: typeof item }
  const record = item as Record<string, unknown>
  return {
    role: record.role,
    type: record.type,
    content: summarizeProviderContent(record.content),
    outputLength: typeof record.output === "string" ? record.output.length : undefined,
    name: record.name,
  }
}

function summarizeProviderContent(content: unknown): unknown {
  if (typeof content === "string") return { kind: "string", length: content.length }
  if (!Array.isArray(content)) return content === undefined ? undefined : { kind: typeof content }
  return {
    kind: "array",
    count: content.length,
    items: content.slice(0, 12).map((item) => {
      if (!item || typeof item !== "object") return { type: typeof item }
      const record = item as Record<string, unknown>
      return {
        type: record.type,
        textLength: typeof record.text === "string" ? record.text.length : undefined,
        image: typeof record.image_url === "string" ? "present" : undefined,
      }
    }),
    truncated: content.length > 12,
  }
}

function summarizeProviderTool(tool: unknown): Record<string, unknown> {
  if (!tool || typeof tool !== "object") return { type: typeof tool }
  const record = tool as Record<string, unknown>
  return {
    type: record.type,
    name: record.name,
    functionName: typeof record.function === "object" && record.function
      ? (record.function as Record<string, unknown>).name
      : undefined,
  }
}

function summarizeProviderResponseHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => {
      return /request|trace|content-type|ratelimit|cache|openai|cf-ray|x-/i.test(key)
    }),
  )
}

function summarizeAgentEvent(event: AgentEvent): Record<string, unknown> {
  switch (event.type) {
    case "agent_start":
    case "turn_start":
      return { type: event.type }
    case "agent_end":
      return { type: event.type, messageCount: event.messages.length }
    case "turn_end":
      return {
        type: event.type,
        message: summarizeAgentMessage(event.message),
        toolResultCount: event.toolResults.length,
      }
    case "message_start":
    case "message_end":
      return { type: event.type, message: summarizeAgentMessage(event.message) }
    case "message_update":
      return {
        type: event.type,
        update: summarizeAssistantMessageEvent(event.assistantMessageEvent),
        message: summarizeAgentMessage(event.message),
      }
    case "tool_execution_start":
      return {
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argKeys: event.args && typeof event.args === "object" ? Object.keys(event.args) : undefined,
      }
    case "tool_execution_update":
      return { type: event.type, toolCallId: event.toolCallId, toolName: event.toolName }
    case "tool_execution_end":
      return {
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
        result: summarizeToolResultForDebug(event.result),
      }
  }
}

function shouldDebugAgentEvent(event: AgentEvent): boolean {
  if (process.env.BRAINCODE_DEBUG_STREAM === "true") return true
  if (event.type !== "message_update") return true
  const update = event.assistantMessageEvent
  if (!update || typeof update !== "object") return true
  const updateType = (update as { type?: unknown }).type
  return updateType !== "text_delta" && updateType !== "thinking_delta"
}

function summarizeAssistantMessageEvent(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== "object") return { type: typeof event }
  const record = event as Record<string, unknown>
  return {
    type: record.type,
    contentIndex: record.contentIndex,
    deltaLength: typeof record.delta === "string" ? record.delta.length : undefined,
    reason: record.reason,
  }
}

function summarizeToolResultForDebug(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") return { type: typeof result }
  const record = result as Record<string, unknown>
  return {
    isError: record.isError,
    content: summarizeProviderContent(record.content),
    detailsType: record.details === undefined ? undefined : typeof record.details,
    terminate: record.terminate,
  }
}

function toolCallRequiresApproval(toolName: string, args: unknown): boolean {
  const name = toolName.toLowerCase()
  if (name === "web_search" || name.startsWith("mcp__")) return false
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

type PackageManager = {
  name: "bun" | "pnpm" | "yarn" | "npm"
  command: string
  runArgs: (script: string) => string[]
}

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
  if (options.enabled === false) {
    return { status: "skipped", reason: "checks disabled in tools configuration", results: [] }
  }
  const packageScripts = await readPackageScripts(projectRoot)
  if (!packageScripts) {
    return { status: "skipped", reason: "package.json not found or has no scripts", results: [] }
  }
  const packageManager = await detectPackageManager(projectRoot)

  const scripts = normalizeCheckScripts(options.scripts?.length ? options.scripts : selectDefaultCheckScripts(packageScripts))
  if (scripts.length === 0) {
    return { status: "skipped", reason: "no check, typecheck, lint, or test script found", results: [] }
  }

  const results: PatchCheckResult[] = []
  for (const script of scripts) {
    if (!Object.prototype.hasOwnProperty.call(packageScripts, script)) {
      results.push({
        name: script,
        command: packageManager.command,
        args: packageManager.runArgs(script),
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
    results.push(await runPackageScriptCheck(projectRoot, script, packageManager, {
      timeoutMs: options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_CHECK_OUTPUT_BYTES,
    }))
  }

  return {
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    results,
  }
}

export async function runPatchChecksWithApproval(
  projectRoot: string,
  options: PatchCheckOptions = {},
  approval: {
    mode: BraincodeMode
    sessionId: string
    attempt: number
    onToolApproval?: AgentRunRequest["onToolApproval"]
    signal?: AbortSignal
  },
): Promise<PatchCheckSummary> {
  if (options.enabled === false) return runPatchChecks(projectRoot, options)
  if (approval.mode !== "radical") {
    if (!approval.onToolApproval) {
      return { status: "skipped", reason: "check scripts require command execution approval", results: [] }
    }
    const decision = await approval.onToolApproval({
      toolCallId: `patch-checks:${approval.sessionId}:${approval.attempt}`,
      toolName: "run_script",
      args: {
        scripts: options.scripts?.length ? options.scripts : [...CHECK_SCRIPT_PRIORITY],
        reason: "post-patch verification",
      },
    }, approval.signal)
    if (approval.signal?.aborted) throw createRunAbortedError()
    if (decision?.approved === false) {
      return { status: "skipped", reason: `check scripts blocked: ${decision.reason ?? "not approved"}`, results: [] }
    }
  }
  return runPatchChecks(projectRoot, options)
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

async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  if (await Bun.file(resolvePath(projectRoot, "bun.lockb")).exists() || await Bun.file(resolvePath(projectRoot, "bun.lock")).exists()) {
    return {
      name: "bun",
      command: "bun",
      runArgs: (script) => ["run", script],
    }
  }
  if (await Bun.file(resolvePath(projectRoot, "pnpm-lock.yaml")).exists()) {
    return {
      name: "pnpm",
      command: "pnpm",
      runArgs: (script) => ["run", script],
    }
  }
  if (await Bun.file(resolvePath(projectRoot, "yarn.lock")).exists()) {
    return {
      name: "yarn",
      command: "yarn",
      runArgs: (script) => ["run", script],
    }
  }
  if (await Bun.file(resolvePath(projectRoot, "package-lock.json")).exists()) {
    return {
      name: "npm",
      command: "npm",
      runArgs: (script) => ["run", script],
    }
  }
  return {
    name: "bun",
    command: "bun",
    runArgs: (script) => ["run", script],
  }
}

async function runPackageScriptCheck(
  cwd: string,
  script: string,
  packageManager: PackageManager,
  options: { timeoutMs: number; maxOutputBytes: number },
): Promise<PatchCheckResult> {
  const startedAt = Date.now()
  return await new Promise((resolve) => {
    const command = packageManager.command
    const args = packageManager.runArgs(script)
    let settled = false
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        detached: process.platform !== "win32",
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
      terminateProcessTree(child, "SIGTERM")
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

function terminateProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
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
  return value === "frontend" || value === "backend" || value === "designer" || value === "imageMaker" || value === "dba" || value === "devops" || value === "security" || value === "qa" || value === "review" || value === "summarize" || value === "oracle" || value === "librarian" || value === "rush" || value === "routeBrain" || value === "pet"
}

export function normalizeRouterDecision(value: { role?: unknown; workers?: unknown; todos?: unknown; dependencies?: unknown; confidence?: unknown; reason?: unknown; modelId?: unknown }, fallback: AgentRoutingPlan, limits: Pick<ModeRoutingLimits, "maxWorkerAgents" | "maxTodos">, allowedRoles?: readonly RoutedAgentRole[]): RouterPlanDecision {
  const allowedRoleSet = allowedRoles && allowedRoles.length > 0 ? new Set<RoutedAgentRole>(allowedRoles) : undefined
  const roleIsAllowed = (role: unknown): role is RoutedAgentRole => isRoutedAgentRole(role) && (!allowedRoleSet || allowedRoleSet.has(role))
  const fallbackRole = roleIsAllowed(fallback.primaryRole) ? fallback.primaryRole : allowedRoles?.[0] ?? fallback.primaryRole
  const primaryRole = roleIsAllowed(value.role) ? value.role : fallbackRole
  const workersByRole = new Map<RoutedAgentRole, RouterWorkerPlan>()
  if (Array.isArray(value.workers)) {
    for (const worker of value.workers) {
      if (typeof worker !== "object" || worker === null) continue
      const candidate = worker as { role?: unknown; goal?: unknown; reason?: unknown; modelId?: unknown }
      if (!roleIsAllowed(candidate.role)) continue
      const modelId = typeof candidate.modelId === "string" && candidate.modelId.trim() ? candidate.modelId.trim() : undefined
      workersByRole.set(candidate.role, {
        role: candidate.role,
        goal: typeof candidate.goal === "string" && candidate.goal.trim() ? candidate.goal : fallback.workers.find((item) => item.role === candidate.role)?.goal ?? `Handle ${candidate.role} work.`,
        reason: typeof candidate.reason === "string" && candidate.reason.trim() ? candidate.reason : fallback.workers.find((item) => item.role === candidate.role)?.reason ?? `Router selected ${candidate.role}.`,
        ...(modelId ? { modelId } : {}),
      })
    }
  }

  const fallbackPrimaryWorker = fallback.workers.find((worker) => worker.role === primaryRole)
  const primaryWorker = {
    role: primaryRole,
    goal: fallbackPrimaryWorker?.goal ?? `Handle ${primaryRole} work.`,
    reason: primaryRole === fallback.primaryRole
      ? fallbackPrimaryWorker?.reason ?? "Router selected this as the primary role."
      : "Router selected this as the primary role.",
  }
  const workers = Array.from(workersByRole.values())
  if (workers.length === 0) {
    workers.push(primaryWorker)
  }
  const filteredWorkers = primaryRole === "rush"
    ? workers
    : workers.filter((worker) => worker.role !== "rush")
  workers.splice(0, workers.length, ...(filteredWorkers.length > 0 ? filteredWorkers : [primaryWorker]))
  if (!workers.some((worker) => worker.role === primaryRole)) {
    workers.unshift(primaryWorker)
  }
  const cappedWorkers = workers.slice(0, Math.max(1, limits.maxWorkerAgents))
  if (!cappedWorkers.some((worker) => worker.role === primaryRole)) {
    cappedWorkers.splice(0, cappedWorkers.length > 0 ? 1 : 0, primaryWorker)
  }
  const todoInputs = normalizeRouterTodos(value.todos, primaryRole, limits.maxTodos, allowedRoleSet)
  const workerRoles = new Set(cappedWorkers.map((worker) => worker.role))
  const routedTodoInputs = todoInputs
    .filter((todo) => primaryRole === "rush" || todo.role !== "rush")
    .map((todo) => workerRoles.has(todo.role) ? todo : { ...todo, role: primaryRole })
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
    workers: normalized.workers as RouterWorkerPlan[],
    todos: normalized.todos,
    dependencies: normalized.dependencies,
    requiresReview: fallback.requiresReview,
    confidence: typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : undefined,
    modelId: typeof value.modelId === "string" && value.modelId.trim() ? value.modelId.trim() : undefined,
    reason: typeof value.reason === "string" && value.reason.trim() ? value.reason : fallback.reason,
  }
}

function normalizeRouterTodos(value: unknown, fallbackRole: RoutedAgentRole, maxTodos: number, allowedRoleSet?: ReadonlySet<RoutedAgentRole>): AgentTodoItem[] {
  if (!Array.isArray(value)) return []
  const todos: AgentTodoItem[] = []
  for (const [index, item] of value.slice(0, Math.max(1, maxTodos)).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const candidate = item as { id?: unknown; title?: unknown; task?: unknown; goal?: unknown; role?: unknown; reason?: unknown }
    const title = [candidate.title, candidate.task, candidate.goal].find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    if (!title) continue
    const candidateRole = isRoutedAgentRole(candidate.role) ? candidate.role : undefined
    const role = candidateRole && (!allowedRoleSet || allowedRoleSet.has(candidateRole)) ? candidateRole : fallbackRole
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

function formatModeRoutingDirective(mode: BraincodeMode, policy: ModePolicy, limits: ModeRoutingLimits): string {
  if (mode === "radical") {
    return [
      `Execution mode: radical (${policy.description})`,
      `Runtime budgets: up to ${limits.maxWorkerAgents} routed workers, up to ${limits.maxParallelAgents} support agents in parallel when dependencies allow, and up to ${limits.maxTodos} todos.`,
      "Radical routing rules:",
      "- Decompose substantial work proactively. Prefer several independent specialist workers over a single broad worker when their outputs can reduce implementation uncertainty.",
      "- Use librarian early for unfamiliar repositories, large edits, or tasks needing symbol/architecture mapping.",
      "- Use oracle earlier for ambiguous architecture, cross-domain tradeoffs, deep debugging, or low-confidence routing.",
      "- Add QA for implementation work that needs meaningful verification planning or regression coverage.",
      "- Add security, DBA, DevOps, designer, frontend, or backend support whenever that domain materially affects correctness.",
      "- Keep rush only for genuinely tiny chores; do not route multi-step coding work to rush just because it is quick to describe.",
      "- Prefer independent todos that can run in parallel. Add dependencies only where a downstream agent needs a prior summary.",
    ].join("\n")
  }

  return [
    `Execution mode: auto (${policy.description})`,
    `Runtime budgets: up to ${limits.maxWorkerAgents} routed workers, up to ${limits.maxParallelAgents} support agents in parallel when dependencies allow, and up to ${limits.maxTodos} todos.`,
    "Auto routing rules:",
    "- Keep the plan focused. Use support workers only when their independent result clearly improves the primary outcome.",
    "- Prefer the smallest role set that can complete the task safely.",
    "- Use rush for tiny chores and direct conversational replies.",
  ].join("\n")
}

function formatInputModalityRoutingDirective(images: ImageContent[]): string {
  if (images.length === 0) {
    return "Input modality: text only."
  }
  return [
    `Input modality: text plus ${images.length} attached image${images.length === 1 ? "" : "s"}.`,
    "Image-input routing rules:",
    "- Any text agent that receives and reasons about the original user image must run on a vision-capable model selected from user configuration.",
    "- Do not route to imageMaker merely because the user attached an image; imageMaker is only for generating or editing image assets.",
    "- If the user asks what is in an image, route by task domain: rush for a small direct answer only when rush's own execution chain can receive image input; designer/frontend/review/etc. when the image is evidence for that specialist work.",
  ].join("\n")
}

function policyModelIds(policy: ModelPolicy): string[] {
  return [policy.modelId, ...(policy.fallbackModelIds ?? [])].filter((modelId, index, values) => modelId && values.indexOf(modelId) === index)
}

function brainRoutedRoleTextModelIds(brain: BrainModel): string[] {
  const ids = new Set<string>()
  for (const role of routedAgentRoles) {
    if (role === "imageMaker") continue
    for (const modelId of roleExecutionModelIds(brain, role)) {
      ids.add(modelId)
    }
  }
  return [...ids]
}

function roleExecutionModelIds(brain: BrainModel, role: RoutedAgentRole): string[] {
  return policyModelIds(selectModelPolicy(brain, role))
}

function policySatisfiesRequirements(policy: ModelPolicy, models: BraincodeModel[], requirements?: RuntimeModelRequirements): boolean {
  try {
    selectRuntimeModel(policy, models, requirements)
    return true
  } catch {
    return false
  }
}

export function formatRoleModelCapabilityDirective(brain: BrainModel, models: BraincodeModel[], images: ImageContent[]): string {
  const imageRequirements = runtimeModelRequirementsForImages(images)
  const modelById = new Map(models.map((model) => [model.id, model]))
  const modelLines = brainRoutedRoleTextModelIds(brain)
    .map((modelId) => {
      const model = modelById.get(modelId)
      if (!model || isImageGenerationModel(model)) return `- ${modelId}: not configured as a text model`
      const vision = model.supportsVision === true ? "vision" : "text-only"
      const tools = model.supportsTools ? "tools" : "no-tools"
      return `- ${model.id}: ${vision}, ${tools}, context ${model.contextWindow}`
    })

  const roleLines = routedAgentRoles.map((role) => {
    const policy = selectModelPolicy(brain, role)
    if (role === "imageMaker") {
      const imageGenerationReady = policySatisfiesRequirements(policy, models, { requiresImageGeneration: true })
      return `- ${role}: default chain ${policyModelIds(policy).join(" -> ") || "(none)"}; ${imageGenerationReady ? "image-generation-capable" : "not image-generation-capable"}; use only for image generation/edit requests, not image description.`
    }
    const defaultReady = policySatisfiesRequirements(policy, models, imageRequirements)
    const capability = imageRequirements?.requiresVision
      ? defaultReady ? "default chain can receive image input" : "default chain cannot receive image input"
      : "no image constraint for this prompt"
    return `- ${role}: default chain ${policyModelIds(policy).join(" -> ") || "(none)"}; ${capability}`
  })

  return [
    "Text models available through routed role policies:",
    ...modelLines,
    "Configured role execution policies:",
    ...roleLines,
    "Model routing rules:",
    "- Pick the best role for the task. Braincode executes each selected role with that role's own modelId -> fallbackModelIds chain.",
    "- Do not rebind a role to the planner model or to another role's model. The planner/routeBrain model is for routing only unless it is also configured in the selected role's own chain.",
    "- For image inputs, choose primary and worker text roles whose own execution chain can receive image input. Do not choose a role whose chain is text-only for attached images.",
    "- Do not invent model ids. Use imageMaker only for image generation/edit requests, not image description.",
  ].join("\n")
}

export function normalizeRouterModelId(
  value: unknown,
  models: BraincodeModel[],
  requirements: RuntimeModelRequirements | undefined,
  fallbackModelId?: string,
  allowedModelIds?: ReadonlySet<string>,
): string | undefined {
  const candidates = [value, fallbackModelId]
    .filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
    .map((candidate) => candidate.trim())

  for (const modelId of candidates) {
    if (allowedModelIds && !allowedModelIds.has(modelId)) continue
    try {
      const selection = selectRuntimeModel({ modelId, fallbackModelIds: [], thinkingLevel: "medium" }, models, requirements)
      return selection.configured.id
    } catch {
      // Try the next candidate; the final runtime selection will surface a detailed error if none work.
    }
  }
  return undefined
}

function normalizeRouterDecisionModelIds(
  decision: RouterPlanDecision,
  brain: BrainModel,
  models: BraincodeModel[],
  requirements: RuntimeModelRequirements | undefined,
): RouterPlanDecision {
  const primaryAllowedModelIds = new Set(roleExecutionModelIds(brain, decision.primaryRole))
  const primaryModelId = normalizeRouterModelId(decision.modelId, models, requirements, undefined, primaryAllowedModelIds)
  const workers = decision.workers.map((worker) => {
    if (worker.role === "imageMaker") return worker
    const workerAllowedModelIds = new Set(roleExecutionModelIds(brain, worker.role))
    const workerModelId = normalizeRouterModelId(worker.modelId, models, requirements, undefined, workerAllowedModelIds)
    return workerModelId ? { ...worker, modelId: workerModelId } : worker
  })
  const { modelId: _ignored, ...rest } = decision
  return {
    ...rest,
    ...(primaryModelId ? { modelId: primaryModelId } : {}),
    workers,
  }
}

async function routePromptWithBrain(prompt: string, brain: BrainModel, models: BraincodeModel[], mode: BraincodeMode, modePolicy: ModePolicy, routingLimits: ModeRoutingLimits, fallback: AgentRoutingPlan, images: ImageContent[] = [], home?: string, usageSessionId?: string): Promise<RouterPlanDecision | undefined> {
  const routerPolicy = brain.planner ?? brain.roles.routeBrain
  const routeBrainRequired = images.length > 0
  if (!routerPolicy?.modelId) {
    if (routeBrainRequired) {
      throw new Error("routeBrain is required for image routing, but no planner or routeBrain model is configured.")
    }
    return undefined
  }
  const requirements = runtimeModelRequirementsForImages(images)

  try {
    const { selection: routerSelection, apiKey } = await selectRuntimeModelWithApiKey(routerPolicy, models, home, requirements)

    const runtime = createBraincodeAgentRuntime({
      mode,
      systemPrompt: getAgentRoleSystemPrompt("routeBrain", routerPolicy),
      model: routerSelection.configured,
      policy: routerPolicy,
      getApiKey: (provider) => (provider === routerSelection.piModel.provider ? apiKey : undefined),
    })

    const roleEnum = routedAgentRoles.map((role) => `"${role}"`).join("|")

    try {
      await runtime.agent.prompt(`You are Braincode's routeBrain. Choose the best primary role, useful worker agents, and a concise todo list for this user prompt.

${formatModeRoutingDirective(mode, modePolicy, routingLimits)}

${formatInputModalityRoutingDirective(images)}

${formatRoleModelCapabilityDirective(brain, models, images)}

Allowed routed roles:
${formatRoutedAgentRoleCatalog()}

Routing principles (read these before deciding):
- There is no generic "coding" role. Pick the matching specialist for code work: frontend for UI/CSS/components, backend for APIs/services, dba for schema/SQL, devops for CI/infra, security for auth/vuln, qa for tests, designer for UX without code.
- Use librarian when the task needs codebase mapping, symbol lookup, or fact finding (it absorbs what would have been a "research" role).
- Use imageMaker when the user asks to generate, edit, or produce raster image assets, role portraits, illustrations, marketing visuals, or other image files.
- Use oracle only for hard architecture/tradeoff/debugging reasoning, high uncertainty, or cross-domain technical judgment.
- Use review for defect inspection of existing code; use qa for forward-looking test strategy. They are not interchangeable.
- Use rush for short conversational replies or tiny chores that need no tools (it absorbs what would have been a "fastReply" role).
- Never use rush for workspace actions that require tools: git status/diff/add/commit/push, shell commands, package scripts, tests, file edits, or repository inspection. Route git/commit/release/CI/package-command work to devops unless another specialist is clearly primary.
- Use summarize only when the user explicitly needs a handoff or recap.
- Route by role responsibility and by each role's configured model policy. Braincode executes the primary role and workers with their own role policy chains.
- Do not invent execution engines or rebind model ids. You may not assign the planner model or another role's model to a selected role unless that model is already in the selected role's own chain.
- Dependencies are Brain-mediated: add one only when the downstream todo should receive the upstream todo's summarized result before it runs.

Return ONLY a single JSON object matching this schema exactly:
{"role":${roleEnum},"workers":[{"role":${roleEnum},"goal":"short worker goal","reason":"short reason"}],"todos":[{"id":"short-stable-id","title":"concrete task to check off","role":${roleEnum},"reason":"short reason"}],"dependencies":[{"from":"todo-id-that-must-finish-first","to":"todo-id-that-depends-on-it","reason":"short reason"}],"confidence":0.0,"reason":"short reason"}

Output constraints:
- "role" MUST be one of the enum values above. Do not invent role names. Do not include "coding", "fastReply", or "research" — they are deprecated.
- Do not include "modelId" fields. The selected Brain Model's role policies decide execution models.
- For image inputs, every selected text role must have a configured role execution chain that can receive image input. Omit imageMaker unless the user asks for image generation/editing.
- Pick exactly one primary role in "role".
- Include only workers that would materially improve the task.
- Do not include rush as a support worker when the primary role is not rush. If a specialist is primary and no extra support is needed, include only the primary specialist worker.
- Break the work into 1-${routingLimits.maxTodos} concrete todos in execution order.
- Assign every todo to the agent role that should complete it.
- Use short lowercase todo ids with letters, numbers, dashes, or underscores.
- Include dependencies only when one todo materially needs another todo's output.
- Do not include routeBrain or pet as a worker role.
- Prefer no more than ${routingLimits.maxWorkerAgents} workers.
- "confidence" is a number in [0,1] reflecting how confident you are in the routing decision.

User prompt:
${prompt}`, images.length > 0 ? images : undefined)
    } finally {
      await recordAgentTokenUsage(
        runtime.agent.state.messages,
        usageSessionId
          ? {
              sessionId: usageSessionId,
              home,
              role: "routeBrain",
              phase: "router",
              agentSessionId: `${usageSessionId}:router`,
              taskId: `${usageSessionId}:router`,
              parentId: usageSessionId,
              brainId: brain.id,
            }
          : undefined,
        routerSelection.configured,
      )
    }

    const text = requireAssistantText(runtime.agent.state.messages, {
      stage: "router",
      role: "routeBrain",
      modelId: routerSelection.configured.id,
      provider: routerSelection.piModel.provider,
      api: routerSelection.configured.api,
    })
    const parsed = extractJsonObject(text) as { role?: unknown; workers?: unknown; todos?: unknown; dependencies?: unknown; confidence?: unknown; reason?: unknown; modelId?: unknown }

    const decision = normalizeRouterDecisionModelIds(
      normalizeRouterDecision(parsed, fallback, routingLimits),
      brain,
      models,
      requirements,
    )
    debugLog("runtime", "router brain selected role", decision)
    return decision
  } catch (error) {
    if (routeBrainRequired) {
      const detail = error instanceof Error ? error.message : String(error)
      debugLog("runtime", "router brain failed for image input", { error: detail })
      throw new Error(`routeBrain failed before image routing could complete. Braincode did not fall back to heuristic routing because this prompt includes image input. ${detail}`)
    }
    debugLog("runtime", "router brain failed; falling back to heuristic", { error: error instanceof Error ? error.message : String(error) })
    return undefined
  }
}

async function buildRuntimePlan(prompt: string, home: string | undefined, useRouterBrain: boolean, forceRoles?: RoutedAgentRole[], images: ImageContent[] = [], brainContextId: string = crypto.randomUUID(), usageSessionId?: string): Promise<RuntimePlan> {
  const [settings, brainDocument, modelDocument] = await Promise.all([readSettings(home), readBrains(home), readModels(home)])
  const brains = brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains
  const models = modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models
  const requirements = runtimeModelRequirementsForImages(images)
  const brain = selectBrain(brains as BrainPreset[], settings.defaultBrainId)
  const modePolicy = getModePolicy(settings.mode)
  const routingLimits = getModeRoutingLimits(settings.mode, brain.routing?.maxParallelAgents)
  const heuristicPlan = planAgentRouting(prompt, brain)
  const routerDecision = useRouterBrain && (!forceRoles || forceRoles.length === 0)
    ? await routePromptWithBrain(prompt, brain, models as BraincodeModel[], settings.mode, modePolicy, routingLimits, heuristicPlan, images, home, usageSessionId)
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
  const rolePolicy = selectModelPolicy(brain, role)
  const roleModelIds = new Set(roleExecutionModelIds(brain, role))
  const policy = routerDecision?.modelId && role !== "imageMaker" && roleModelIds.has(routerDecision.modelId)
    ? { ...rolePolicy, modelId: routerDecision.modelId, fallbackModelIds: [], imageModel: undefined }
    : rolePolicy
  const selection = selectRuntimeModel(policy, models as BraincodeModel[], runtimeModelRequirementsForRole(role, images))
  const runtimeWorkerInputs = [...agentPlan.workers]
  if (agentPlan.requiresReview && role !== "review" && !runtimeWorkerInputs.some((worker) => worker.role === "review")) {
    runtimeWorkerInputs.push({
      role: "review",
      goal: "Review the primary agent result for correctness, regressions, missing verification, and safety risks.",
      reason: "Brain policy requires review for risky file-editing work.",
    })
  }
  const runtimeTodoPlan = normalizeAgentRoutingPlan({ ...agentPlan, workers: runtimeWorkerInputs, todos: agentPlan.todos, dependencies: agentPlan.dependencies })
  const policyForRuntimeWorker = (worker: AgentWorkerPlan): ModelPolicy | undefined => {
    if (worker.role === role) return policy
    if (worker.role === "imageMaker") return undefined
    const routedWorker = worker as RouterWorkerPlan
    const selectedModelId = routedWorker.modelId
    return selectedModelId
      ? { ...selectModelPolicy(brain, worker.role), modelId: selectedModelId, fallbackModelIds: [], imageModel: undefined }
      : undefined
  }
  const workers = runtimeTodoPlan.workers.map((worker) =>
    createRuntimeWorkerPlan(worker, brain, models as BraincodeModel[], requirements, policyForRuntimeWorker(worker)),
  )
  const context = createBrainTaskContext({
    id: brainContextId,
    goal: prompt,
    childContextIds: workers.map((worker) => worker.contextId),
    progress: {
      status: "pending",
      summary: `Planned ${runtimeTodoPlan.todos.length} todo${runtimeTodoPlan.todos.length === 1 ? "" : "s"} across ${workers.length} worker context${workers.length === 1 ? "" : "s"}.`,
    },
  })
  const routingBudget = {
    configuredMaxParallelAgents: routingLimits.configuredMaxParallelAgents,
    maxParallelAgents: routingLimits.maxParallelAgents,
    maxWorkerAgents: routingLimits.maxWorkerAgents,
    maxTodos: routingLimits.maxTodos,
  }
  const routing = routerDecision
    ? { source: "router-brain" as const, confidence: routerDecision.confidence, reason: routerDecision.reason, ...routingBudget }
    : { source: "heuristic" as const, reason: useRouterBrain ? "router brain unavailable or failed" : "heuristic diagnostic; router brain not requested", ...routingBudget }
  debugLog("runtime", "planned runtime", { mode: settings.mode, brainId: brain.id, role, routingSource: routing.source, modelId: selection.configured.id, provider: selection.piModel.provider })

  return {
    mode: settings.mode,
    modeDescription: modePolicy.description,
    brain: {
      id: brain.id,
      name: brain.name,
      description: brain.description,
    },
    context,
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

export async function planRuntimeFromConfig(prompt: string, home?: string, options: PlanRuntimeOptions = {}): Promise<RuntimePlan> {
  const projectRoot = options.projectRoot ?? process.cwd()
  const useRouterBrain = options.useRouterBrain ?? true
  const expanded = await expandPromptReferences(prompt, projectRoot, home, { generateSessionHandoffs: useRouterBrain })
  return buildRuntimePlan(expanded.prompt, home, useRouterBrain, undefined, expanded.images)
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
    const brain = selectBrain(brains as BrainPreset[], settings.defaultBrainId)
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

function extractAssistantText(messages: unknown[], debugContext: Record<string, unknown> = {}): string {
  const assistantMessages = messages.filter((message) => {
    return typeof message === "object" && message !== null && (message as { role?: unknown }).role === "assistant"
  })

  const lastAssistant = assistantMessages.at(-1) as { content?: unknown; errorMessage?: unknown; stopReason?: unknown } | undefined
  debugLog("runtime", "extract assistant text", {
    ...debugContext,
    messageCount: messages.length,
    assistantMessageCount: assistantMessages.length,
    assistant: summarizeAgentMessage(lastAssistant),
  })
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

function requireAssistantText(messages: unknown[], debugContext: Record<string, unknown>): string {
  const text = extractAssistantText(messages, debugContext)
  if (text.trim()) return text

  debugLog("runtime", "empty assistant response", {
    ...debugContext,
    messageCount: messages.length,
    messages: messages.slice(-4).map((message) => summarizeAgentMessage(message)),
  })

  const model = formatDebugModelLabel(debugContext)
  const api = debugContext.api ? ` via ${String(debugContext.api)}` : ""
  throw new Error(`Provider returned an empty assistant response${model ? ` from ${model}` : ""}${api}.`)
}

function formatDebugModelLabel(debugContext: Record<string, unknown>): string {
  const modelId = typeof debugContext.modelId === "string" ? debugContext.modelId : ""
  const provider = typeof debugContext.provider === "string" ? debugContext.provider : ""
  if (!modelId) return provider
  if (!provider || modelId.includes("/")) return modelId
  return `${provider}/${modelId}`
}

function summarizeAgentMessage(message: unknown): Record<string, unknown> {
  if (!message || typeof message !== "object") return { type: typeof message }
  const record = message as Record<string, unknown>
  const content = Array.isArray(record.content) ? record.content : undefined
  return {
    role: record.role,
    api: record.api,
    provider: record.provider,
    model: record.model,
    stopReason: record.stopReason,
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
    content: content ? summarizeAgentContent(content) : summarizeProviderContent(record.content),
    usage: summarizeUsage(record.usage),
  }
}

function summarizeAgentContent(content: unknown[]): Record<string, unknown> {
  return {
    count: content.length,
    types: content.map((block) => {
      if (!block || typeof block !== "object") return typeof block
      return (block as { type?: unknown }).type
    }),
    textLength: content.reduce<number>((total, block) => {
      if (!block || typeof block !== "object") return total
      const text = (block as { text?: unknown }).text
      return total + (typeof text === "string" ? text.length : 0)
    }, 0),
    thinkingLength: content.reduce<number>((total, block) => {
      if (!block || typeof block !== "object") return total
      const thinking = (block as { thinking?: unknown }).thinking
      return total + (typeof thinking === "string" ? thinking.length : 0)
    }, 0),
    toolCalls: content
      .filter((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "toolCall")
      .map((block) => {
        const record = block as Record<string, unknown>
        return {
          id: record.id,
          name: record.name,
          argKeys: record.arguments && typeof record.arguments === "object" ? Object.keys(record.arguments) : undefined,
        }
      }),
  }
}

function summarizeUsage(usage: unknown): Record<string, unknown> | undefined {
  if (!usage || typeof usage !== "object") return undefined
  const record = usage as Record<string, unknown>
  return {
    input: readDebugNumber(record.input),
    output: readDebugNumber(record.output),
    cacheRead: readDebugNumber(record.cacheRead),
    cacheWrite: readDebugNumber(record.cacheWrite),
    totalTokens: readDebugNumber(record.totalTokens),
    total: readDebugNumber(record.total),
  }
}

function readDebugNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function createWorkerHandoff(worker: RuntimeWorkerPlan, parentId: string, phase: "support" | "review", projectSupport?: ProjectSupport): HandoffPacket {
  return {
    ...brainToAgentContextTransfer,
    id: crypto.randomUUID(),
    task: {
      id: worker.contextId,
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
    sections.push(`AGENTS.md (${projectSupport.agents.path}):\n${clipPromptText(projectSupport.agents.content, "AGENTS.md", MAX_INLINE_AGENTS_CHARS)}`)
  }
  if (projectSupport.mcp) {
    const servers = projectSupport.mcp.serverNames.length > 0 ? projectSupport.mcp.serverNames.join(", ") : "(none declared)"
    sections.push(`MCP config (${projectSupport.mcp.path}):\nAvailable server names: ${servers}\nUse MCP servers only when Braincode exposes them as runtime tools; do not assume access from config metadata alone.`)
  }
  if (projectSupport.skills.length > 0) {
    const inlineSkills = projectSupport.skills.slice(0, MAX_INLINE_SKILLS)
    const omittedCount = projectSupport.skills.length - inlineSkills.length
    sections.push(
      [
        "Local skills (.agents/skill):",
        ...inlineSkills.map((skill) => `### ${skill.id} (${skill.path})\n${clipPromptText(skill.content, `skill:${skill.id}`, MAX_INLINE_SKILL_CHARS)}`),
        omittedCount > 0 ? `[${omittedCount} additional local skill file(s) omitted from inline prompt context. Use project files/tools if their full content is needed.]` : "",
      ].join("\n\n"),
    )
  }
  return `${clipPromptText(sections.join("\n\n"), "project support context", MAX_INLINE_PROJECT_SUPPORT_CHARS)}\n`
}

function clipPromptText(text: string, label: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[${label} truncated at ${maxChars}/${text.length} chars; use project files/tools to inspect the remaining content if needed.]`
}

function summarizeProjectSupport(projectSupport: ProjectSupport) {
  return {
    root: projectSupport.root,
    agents: projectSupport.agents?.path,
    mcp: projectSupport.mcp ? { path: projectSupport.mcp.path, serverNames: projectSupport.mcp.serverNames } : undefined,
    skills: projectSupport.skills.map((skill) => ({ id: skill.id, path: skill.path })),
  }
}

const readOnlyToolWorkerRoles = new Set<RoutedAgentRole>(["librarian", "qa", "security", "review"])
const MAX_INLINE_PROJECT_SUPPORT_CHARS = 64_000
const MAX_INLINE_AGENTS_CHARS = 32_000
const MAX_INLINE_SKILLS = 12
const MAX_INLINE_SKILL_CHARS = 8_000

function buildSupportWorkerPrompt(originalPrompt: string, handoff: HandoffPacket, projectSupport?: ProjectSupport, priorResults: ExecutedWorkerResult[] = []): string {
  const supportContext = formatProjectSupportPromptSection(projectSupport)
  const priorResultContext = priorResults.length > 0
    ? `\nBrain-supplied prior worker results for dependencies:\n${formatWorkerResults(priorResults)}\n`
    : ""
  const toolContext = readOnlyToolWorkerRoles.has(handoff.task.agentRole as RoutedAgentRole)
    ? "\nTool access:\nRead-only project tools may be available. Use them to gather concrete evidence, but do not attempt edits, shell execution, package scripts, or other state-changing actions.\n"
    : ""
  return `Run this isolated Braincode worker handoff.

${supportContext}
Original user request:
${originalPrompt}
${priorResultContext}
${toolContext}

Handoff packet:
${JSON.stringify(handoff, null, 2)}

Return only JSON in this shape:
{"taskId":"${handoff.task.id}","parentId":"${handoff.task.parentId}","progress":{"status":"completed|blocked","summary":"brief progress"},"summary":"concise actionable result","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["risk or caveat"],"nextQuestions":["question only if blocked"]}`
}

function buildPrimaryPrompt(originalPrompt: string, workerResults: ExecutedWorkerResult[], primaryRole: RoutedAgentRole, projectSupport?: ProjectSupport, toolNames: string[] = []): string {
  const supportContext = formatProjectSupportPromptSection(projectSupport)
  const toolContext = formatPrimaryToolContext(toolNames)
  if (workerResults.length === 0) {
    return `${supportContext}${toolContext}${supportContext || toolContext ? "\n" : ""}User request:\n${originalPrompt}`
  }

  return `${supportContext}
${toolContext}
User request:
${originalPrompt}

Supporting worker results:
${formatWorkerResults(workerResults)}

Complete the request as the primary ${primaryRole} agent. Treat worker results as advisory context, resolve conflicts explicitly, and produce the final user-facing result.`
}

function formatPrimaryToolContext(toolNames: string[]): string {
  if (toolNames.length === 0) {
    return "Runtime tool access:\nNo runtime tools are exposed in this run. Do not claim to have performed local file, shell, git, or command actions.\n"
  }
  const names = [...new Set(toolNames)].sort()
  const hasExecuteTool = names.some((name) => /^(shell|exec_command|run_script|write_stdin)$/.test(name))
  const executeGuidance = hasExecuteTool
    ? "Shell/command execution is available through shell and/or exec_command. For workspace requests such as git status, git add, git commit, tests, and package scripts, use tools instead of saying shell/git tools are unavailable."
    : "Shell/command execution is not exposed in this run. If the user asks for git commits, shell commands, tests, or package scripts, explain that this run lacks execute tools and suggest TUI radical/current-session approval or `braincode run --yes`."
  return [
    "Runtime tool access:",
    `Available tools: ${names.join(", ")}`,
    executeGuidance,
    "If a tool call is blocked or fails, report the concrete tool result or block reason.",
    "",
  ].join("\n")
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
Tool access:
Read-only project tools may be available. Use them to verify changed files, inspect diffs, and check specific source evidence. Do not edit files or execute commands.

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
{"taskId":"${handoff.task.id}","parentId":"${handoff.task.parentId}","progress":{"status":"completed|blocked","summary":"brief progress"},"decision":"approved|changes_requested|blocked","rationale":"brief reason for the decision","findings":[{"severity":"low|medium|high","file":"optional project-relative path","line":1,"evidence":"short evidence","issue":"specific issue","suggestion":"specific fix"}],"requiredChanges":["specific change required before approval"],"blockingIssues":["issue that prevents review completion"],"residualRisks":["risk that remains after review"],"summary":"review findings or clear statement that no concrete issue was found","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["confirmed risk"],"nextQuestions":["question only if blocked"]}`
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

export function normalizeReviewDecisionText(text: string, review: WorkerResult, checks?: PatchCheckSummary): ReviewDecision {
  let parsedRecord: Record<string, unknown> | undefined
  try {
    const parsed = extractJsonObject(text)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsedRecord = parsed as Record<string, unknown>
  } catch {
    // Review text without JSON falls back to worker result fields.
  }

  const explicitDecision = normalizeReviewDecisionStatus(parsedRecord?.decision)
  const rationale = stringValue(parsedRecord?.rationale) ?? review.summary
  const findings = normalizeReviewFindings(parsedRecord?.findings)
  const requiredChanges = normalizeStringArray(parsedRecord?.requiredChanges)
  const blockingIssues = normalizeStringArray(parsedRecord?.blockingIssues)
  const residualRisks = uniqueStrings([...normalizeStringArray(parsedRecord?.residualRisks), ...review.risks])
  const missingDecisionChange = explicitDecision
    ? undefined
    : "Review did not provide an explicit structured decision; rerun or inspect review output before treating this as approved."
  const fallbackDecision = missingDecisionChange
    ? fallbackReviewDecisionWithoutExplicitDecision(review)
    : fallbackReviewDecision(review, checks)
  return applyCheckGateToReviewDecision({
    decision: explicitDecision ?? fallbackDecision,
    rationale,
    findings,
    requiredChanges: missingDecisionChange ? uniqueStrings([...requiredChanges, missingDecisionChange]) : requiredChanges,
    blockingIssues,
    residualRisks,
  }, checks)
}

function normalizeReviewFindings(value: unknown): ReviewFinding[] {
  if (!Array.isArray(value)) return []
  const findings: ReviewFinding[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const issue = stringValue(record.issue)
    if (!issue) continue
    const severity = normalizeReviewFindingSeverity(record.severity)
    const file = stringValue(record.file)
    const evidence = stringValue(record.evidence)
    const suggestion = stringValue(record.suggestion)
    const line = typeof record.line === "number" && Number.isInteger(record.line) && record.line > 0
      ? record.line
      : undefined
    findings.push({
      severity,
      issue,
      ...(file ? { file } : {}),
      ...(line ? { line } : {}),
      ...(evidence ? { evidence } : {}),
      ...(suggestion ? { suggestion } : {}),
    })
  }
  return findings
}

function normalizeReviewFindingSeverity(value: unknown): ReviewFindingSeverity {
  return value === "low" || value === "medium" || value === "high" ? value : "medium"
}

function normalizeReviewDecisionStatus(value: unknown): ReviewDecisionStatus | undefined {
  return value === "approved" || value === "changes_requested" || value === "blocked" ? value : undefined
}

function fallbackReviewDecision(review: WorkerResult, checks?: PatchCheckSummary): ReviewDecisionStatus {
  if (review.progress.status === "blocked" || review.progress.status === "failed") return "blocked"
  if (checks?.status === "failed") return "changes_requested"
  return review.risks.length > 0 ? "changes_requested" : "approved"
}

function fallbackReviewDecisionWithoutExplicitDecision(review: WorkerResult): ReviewDecisionStatus {
  if (review.progress.status === "blocked" || review.progress.status === "failed") return "blocked"
  return "changes_requested"
}

function applyCheckGateToReviewDecision(decision: ReviewDecision, checks?: PatchCheckSummary): ReviewDecision {
  if (checks?.status !== "failed" || decision.decision !== "approved") return decision
  const failedChecks = checks.results.filter((result) => result.status === "failed").map((result) => result.name)
  const checkChange = failedChecks.length > 0
    ? `Fix failing checks before approval: ${failedChecks.join(", ")}.`
    : "Fix failing checks before approval."
  return {
    ...decision,
    decision: "changes_requested",
    findings: [
      ...decision.findings,
      {
        severity: "high",
        issue: checkChange,
        evidence: checks.results
          .filter((result) => result.status === "failed")
          .map((result) => `${result.name}: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode ?? "n/a"}`}`)
          .join("\n"),
        suggestion: "Run and fix the failing checks before approval.",
      },
    ],
    requiredChanges: uniqueStrings([...decision.requiredChanges, checkChange]),
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    output.push(trimmed)
  }
  return output
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

function blockedWorkerResult(worker: RuntimeWorkerPlan, parentId: string, reason: string): ExecutedWorkerResult {
  return {
    ...agentToBrainContextTransfer,
    handoffId: `blocked:${crypto.randomUUID()}`,
    taskId: worker.contextId,
    parentId,
    progress: {
      status: "blocked",
      summary: reason,
    },
    role: worker.role,
    goal: worker.goal,
    todoIds: worker.todoIds ?? [],
    status: "blocked",
    summary: `${worker.role} worker blocked: ${reason}`,
    artifacts: [],
    risks: [reason],
    nextQuestions: [],
    error: reason,
  }
}

async function emitWorkerLifecycleEvent(
  onWorkerEvent: ((event: WorkerLifecycleEvent) => void | Promise<void>) | undefined,
  event: WorkerLifecycleEvent,
): Promise<void> {
  if (!onWorkerEvent) return
  try {
    await onWorkerEvent(event)
  } catch {
    // ignore listener errors
  }
}

function imageExtension(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return "jpg"
  if (/webp/i.test(mimeType)) return "webp"
  return "png"
}

async function saveGeneratedImageArtifact(sessionId: string, result: ImageGenerationResult, home?: string): Promise<string> {
  const root = join(home ?? getBraincodeHome(), "generated-images", sessionId)
  await mkdir(root, { recursive: true })
  const path = join(root, `image-${Date.now()}.${imageExtension(result.mimeType)}`)
  await Bun.write(path, Buffer.from(result.base64, "base64"))
  return path
}

function buildImageMakerPrompt(input: { request: string; workerResults?: ExecutedWorkerResult[]; projectSupport?: ProjectSupport }): string {
  const sections = [
    "Create a raster image asset for this Braincode request.",
    "Use the user's requested subject, style, and constraints. Avoid adding visible text unless the user explicitly asked for text in the image.",
    "",
    "User request:",
    input.request,
  ]
  if (input.workerResults && input.workerResults.length > 0) {
    sections.push("", "Brain-supplied worker guidance:", formatWorkerResults(input.workerResults))
  }
  if (input.projectSupport?.agents) {
    sections.push("", "Project visual constraints from AGENTS.md may apply; honor explicit brand or safety constraints when they are relevant.")
  }
  return sections.join("\n")
}

function imageMakerWorkerResult(
  worker: RuntimeWorkerPlan,
  handoff: HandoffPacket,
  artifactPath: string,
  generation: ImageGenerationResult,
  prompt: string,
): ExecutedWorkerResult {
  const summary = [
    `Generated image artifact: ${artifactPath}`,
    `Model: ${generation.provider}/${generation.modelId}`,
    `Bytes: ${generation.bytes}`,
    "Prompt:",
    prompt,
  ].join("\n")
  return {
    ...agentToBrainContextTransfer,
    handoffId: handoff.id,
    taskId: handoff.task.id,
    parentId: handoff.task.parentId,
    progress: {
      status: "completed",
      summary: `Generated image artifact at ${artifactPath}.`,
    },
    role: worker.role,
    goal: worker.goal,
    todoIds: worker.todoIds ?? [],
    status: "completed",
    summary,
    artifacts: [{ kind: "artifact", uri: artifactPath, label: "Generated image" }],
    risks: generation.revisedPrompt ? [`Provider revised prompt: ${generation.revisedPrompt}`] : [],
    nextQuestions: [],
  }
}

function workerResultStatus(result: WorkerResult): ExecutedWorkerResult["status"] {
  if (result.progress.status === "failed") return "failed"
  if (result.progress.status === "blocked") return "blocked"
  return "completed"
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
  tools: AgentTool[] = [],
  toolEvidenceCache?: ToolEvidenceCache,
  onEvent?: (event: AgentEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<ExecutedWorkerResult> {
  throwIfRunAborted(signal)
  const emit = async (event: WorkerLifecycleEvent) => {
    if (!onWorkerEvent) return
    try { await onWorkerEvent(event) } catch { /* ignore listener error */ }
  }
  const handoff = createWorkerHandoff(worker, sessionId, phase, projectSupport)
  await appendSessionRecord(sessionId, { type: "agent_message", phase, worker: worker.role, message: createHandoffAgentMessage(handoff) }, home)
  let candidates: RuntimeModelCandidate[]
  const requirements = runtimeModelRequirementsForRole(worker.role, promptImages)

  try {
    candidates = await selectRuntimeModelCandidatesWithApiKey(worker.policy, models, home, requirements)
  } catch (error) {
    const result = failedWorkerResult(worker, handoff, error)
    await appendSessionRecord(sessionId, { type: "agent_message", phase, worker: worker.role, message: createWorkerResultAgentMessage(result, { from: worker.role }) }, home)
    await appendSessionRecord(sessionId, { type: "worker_error", phase, worker: worker.role, handoff, error: result.error }, home)
    await onTodoStatus?.(worker, phase, "failed", { error: result.error })
    await emit({ type: "worker_end", role: worker.role, phase, status: "failed", handoffId: handoff.id, taskId: handoff.task.id, parentId: handoff.task.parentId, progress: result.progress, error: result.error, todoIds: worker.todoIds })
    return result
  }

  if (worker.role === "imageMaker") {
    const prompt = buildImageMakerPrompt({ request: worker.goal, projectSupport })
    for (const [attempt, { selection, apiKey }] of candidates.entries()) {
      const agentSessionId = `${handoff.task.id}-${attempt + 1}`
      await onTodoStatus?.(worker, phase, "running")
      await emit({ type: "worker_start", role: worker.role, goal: worker.goal, phase, modelId: selection.configured.id, handoffId: handoff.id, taskId: handoff.task.id, parentId: handoff.task.parentId, progress: { ...handoff.task.progress, status: "running" }, todoIds: worker.todoIds })
      await appendSessionRecord(sessionId, { type: "worker_start", phase, worker: worker.role, goal: worker.goal, handoff, model: selection.configured.id, agentSessionId, attempt: attempt + 1 }, home)
      try {
        throwIfRunAborted(signal)
        const generation = await generateImage(selection.configured, apiKey, { prompt, signal })
        throwIfRunAborted(signal)
        const artifactPath = await saveGeneratedImageArtifact(sessionId, generation, home)
        const result = imageMakerWorkerResult(worker, handoff, artifactPath, generation, prompt)
        await appendSessionRecord(sessionId, { type: "agent_message", phase, worker: worker.role, message: createWorkerResultAgentMessage(result, { from: worker.role }), attempt: attempt + 1 }, home)
        await appendSessionRecord(sessionId, { type: "worker_end", phase, worker: worker.role, result, attempt: attempt + 1 }, home)
        await onTodoStatus?.(worker, phase, "completed", { summary: result.summary })
        await emit({ type: "worker_end", role: worker.role, phase, status: "completed", handoffId: handoff.id, taskId: handoff.task.id, parentId: handoff.task.parentId, progress: result.progress, summary: result.summary, todoIds: worker.todoIds })
        return result
      } catch (error) {
        if (signal?.aborted) throw createRunAbortedError()
        const message = error instanceof Error ? error.message : String(error)
        await appendSessionRecord(sessionId, { type: "worker_error", phase, worker: worker.role, error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
        if (attempt === candidates.length - 1) {
          const failure = failedWorkerResult(worker, handoff, error)
          await appendSessionRecord(sessionId, { type: "agent_message", phase, worker: worker.role, message: createWorkerResultAgentMessage(failure, { from: worker.role }) }, home)
          await onTodoStatus?.(worker, phase, "failed", { error: failure.error })
          await emit({ type: "worker_end", role: worker.role, phase, status: "failed", handoffId: handoff.id, taskId: handoff.task.id, parentId: handoff.task.parentId, progress: failure.progress, error: failure.error, todoIds: worker.todoIds })
          return failure
        }
      }
    }
  }

  let lastError: unknown
  for (const [attempt, { selection, apiKey }] of candidates.entries()) {
    const agentSessionId = `${handoff.task.id}-${attempt + 1}`
    await onTodoStatus?.(worker, phase, "running")
    await emit({ type: "worker_start", role: worker.role, goal: worker.goal, phase, modelId: selection.configured.id, handoffId: handoff.id, taskId: handoff.task.id, parentId: handoff.task.parentId, progress: { ...handoff.task.progress, status: "running" }, todoIds: worker.todoIds })
    await appendSessionRecord(sessionId, { type: "worker_start", phase, worker: worker.role, goal: worker.goal, handoff, model: selection.configured.id, agentSessionId, attempt: attempt + 1 }, home)
    debugLog("runtime", "worker attempt start", {
      phase,
      role: worker.role,
      attempt: attempt + 1,
      modelId: selection.configured.id,
      provider: selection.piModel.provider,
      api: selection.configured.api,
    })
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
      tools,
      toolEvidenceCache,
      getApiKey: (provider) => (provider === selection.piModel.provider ? apiKey : undefined),
      onEvent,
    })
    const unlinkAbort = linkRuntimeAbort(runtime, signal)

    try {
      const workerPrompt = addHookAdditionalContext(
        buildPrompt(handoff),
        [
          ...subagentStartHooks.additionalContext,
          ...(subagentStartHooks.blockedReason ? [subagentStartHooks.blockedReason] : []),
        ],
      )
      try {
        throwIfRunAborted(signal)
        await runtime.agent.prompt(workerPrompt, promptImages.length > 0 ? promptImages : undefined)
        throwIfRunAborted(signal)
      } finally {
        unlinkAbort()
        await recordAgentTokenUsage(
          runtime.agent.state.messages,
          {
            sessionId,
            home,
            role: worker.role,
            phase,
            agentSessionId,
            taskId: handoff.task.id,
            parentId: handoff.task.parentId,
            attempt: attempt + 1,
          },
          selection.configured,
        )
      }
      const text = requireAssistantText(runtime.agent.state.messages, {
        stage: "worker",
        phase,
        role: worker.role,
        attempt: attempt + 1,
        modelId: selection.configured.id,
        provider: selection.piModel.provider,
        api: selection.configured.api,
      })
      const result = normalizeWorkerResultText(text, handoff)
      const reviewDecision = phase === "review" ? normalizeReviewDecisionText(text, result) : undefined
      const status = workerResultStatus(result)
      const executed: ExecutedWorkerResult = { ...result, role: worker.role, goal: worker.goal, todoIds: worker.todoIds ?? [], status, reviewDecision }
      await appendSessionRecord(sessionId, { type: "agent_message", phase, worker: worker.role, message: createWorkerResultAgentMessage(executed, { from: worker.role }), attempt: attempt + 1 }, home)
      await appendSessionRecord(sessionId, { type: "worker_end", phase, worker: worker.role, result: executed, attempt: attempt + 1 }, home)
      await onTodoStatus?.(worker, phase, status, { summary: result.summary })
      await emit({ type: "worker_end", role: worker.role, phase, status, handoffId: handoff.id, taskId: handoff.task.id, parentId: handoff.task.parentId, progress: result.progress, summary: text.trim(), todoIds: worker.todoIds })
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
      debugLog("runtime", "worker attempt failed", {
        phase,
        role: worker.role,
        attempt: attempt + 1,
        modelId: selection.configured.id,
        provider: selection.piModel.provider,
        error: message,
        willFallback: attempt < candidates.length - 1,
      })
      await appendSessionRecord(sessionId, { type: "worker_error", phase, worker: worker.role, error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
      if (signal?.aborted) throw createRunAbortedError()
      if (isHandoffRequiredError(error)) {
        await recordAutomaticHandoffIfNeeded(error, sessionId, home)
        break
      }
    }
  }

  const failure = failedWorkerResult(worker, handoff, lastError)
  await appendSessionRecord(sessionId, { type: "agent_message", phase, worker: worker.role, message: createWorkerResultAgentMessage(failure, { from: worker.role }) }, home)
  await onTodoStatus?.(worker, phase, "failed", { error: failure.error })
  await emit({ type: "worker_end", role: worker.role, phase, status: "failed", handoffId: handoff.id, taskId: handoff.task.id, parentId: handoff.task.parentId, progress: failure.progress, error: failure.error, todoIds: worker.todoIds })
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
  dependencies: AgentTodoDependency[] = [],
  projectSupport?: ProjectSupport,
  hookContext?: HookRuntimeContext,
  onWorkerEvent?: (event: WorkerLifecycleEvent) => void | Promise<void>,
  concurrencyCap?: number,
  onTodoStatus?: WorkerTodoStatusHandler,
  promptImages: ImageContent[] = [],
  readOnlyTools: AgentTool[] = [],
  toolEvidenceCache?: ToolEvidenceCache,
  onEvent?: (event: AgentEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<ExecutedWorkerResult[]> {
  throwIfRunAborted(signal)
  if (workers.length === 0) return []
  void toolExecution // tool execution governs intra-agent tool calls; worker dependency scheduling is Brain-mediated.

  const limit = Number.isFinite(concurrencyCap) && (concurrencyCap as number) > 0
    ? Math.min(workers.length, Math.floor(concurrencyCap as number))
    : workers.length
  const results: ExecutedWorkerResult[] = new Array(workers.length)
  const pending = new Set(workers.map((_, index) => index))
  const todoOwnerById = new Map<string, number>()
  for (const [index, worker] of workers.entries()) {
    for (const todoId of worker.todoIds ?? []) {
      todoOwnerById.set(todoId, index)
    }
  }

  const workerIsReady = (index: number) => {
    const workerTodoIds = new Set(workers[index]?.todoIds ?? [])
    if (workerTodoIds.size === 0) return true
    return dependencies.every((dependency) => {
      if (!workerTodoIds.has(dependency.toTodoId)) return true
      const owner = todoOwnerById.get(dependency.fromTodoId)
      return owner === undefined || owner === index || (!pending.has(owner) && results[owner]?.status === "completed")
    })
  }

  while (pending.size > 0) {
    throwIfRunAborted(signal)
    const pendingIndexes = Array.from(pending)
    const readyIndexes = pendingIndexes.filter(workerIsReady)
    if (readyIndexes.length === 0) {
      const reason = "Worker dependency graph is blocked or cyclic; no pending worker has all upstream todos completed successfully."
      await Promise.all(pendingIndexes.map(async (index) => {
        pending.delete(index)
        const worker = workers[index]!
        const result = blockedWorkerResult(worker, sessionId, reason)
        results[index] = result
        await appendSessionRecord(sessionId, { type: "agent_message", phase: "support", worker: worker.role, message: createWorkerResultAgentMessage(result, { from: worker.role }) }, home)
        await appendSessionRecord(sessionId, { type: "worker_end", phase: "support", worker: worker.role, result }, home)
        await onTodoStatus?.(worker, "support", "blocked", { error: reason })
        await emitWorkerLifecycleEvent(onWorkerEvent, {
          type: "worker_end",
          role: worker.role,
          phase: "support",
          status: "blocked",
          handoffId: result.handoffId,
          taskId: result.taskId,
          parentId: result.parentId,
          progress: result.progress,
          error: result.error,
          todoIds: worker.todoIds,
        })
      }))
      break
    }
    const wave = readyIndexes.slice(0, limit)
    await Promise.all(wave.map(async (index) => {
      pending.delete(index)
      const priorResults = results.filter((result): result is ExecutedWorkerResult => Boolean(result))
      const worker = workers[index]!
      const workerTools = readOnlyToolWorkerRoles.has(worker.role) ? readOnlyTools : []
      results[index] = await runWorkerFromPlan(
        worker,
        (handoff) => buildSupportWorkerPrompt(originalPrompt, handoff, projectSupport, priorResults),
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
        workerTools,
        workerTools.length > 0 ? toolEvidenceCache : undefined,
        workerTools.length > 0 ? onEvent : undefined,
        signal,
      )
    }))
  }

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

function mergeReviewResult(summary: string, review: ExecutedWorkerResult | undefined, reviewDecision?: ReviewDecision): string {
  if (!review) return summary
  const decision = reviewDecision ?? review.reviewDecision
  const decisionText = decision
    ? [
        `Decision: ${decision.decision}`,
        `Rationale: ${decision.rationale}`,
        decision.requiredChanges.length > 0 ? `Required changes:\n${decision.requiredChanges.map((change) => `- ${change}`).join("\n")}` : "",
        decision.blockingIssues.length > 0 ? `Blocking issues:\n${decision.blockingIssues.map((issue) => `- ${issue}`).join("\n")}` : "",
      ].filter(Boolean).join("\n")
    : review.summary
  const findings = decision?.findings.length
    ? `\nFindings:\n${decision.findings.map((finding) => {
        const location = finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""
        const suggestion = finding.suggestion ? ` Suggestion: ${finding.suggestion}` : ""
        return `- [${finding.severity}]${location} ${finding.issue}${suggestion}`
      }).join("\n")}`
    : ""
  const residualRisks = decision?.residualRisks.length
    ? `\nResidual risks:\n${decision.residualRisks.map((risk) => `- ${risk}`).join("\n")}`
    : ""
  const risks = !decision && review.risks.length > 0 ? `\nRisks:\n${review.risks.map((risk) => `- ${risk}`).join("\n")}` : ""
  return `${summary}\n\nReview:\n${decisionText}${findings}${residualRisks}${risks}`
}

export async function executePromptFromConfig(request: AgentRunRequest, home?: string): Promise<AgentRunResult> {
  throwIfRunAborted(request.signal)
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
  throwIfRunAborted(request.signal)
  const expanded = await expandPromptReferences(request.prompt, cwd, home)
  throwIfRunAborted(request.signal)
  const promptImages = expanded.images
  const effectivePrompt = addHookAdditionalContext(expanded.prompt, [...sessionStartHooks.additionalContext, ...promptHooks.additionalContext])
  const plan = await buildRuntimePlan(effectivePrompt, home, true, request.forceRoles, promptImages, sessionId, sessionId)
  throwIfRunAborted(request.signal)
  await appendSessionRecord(sessionId, { type: "context_plan", context: plan.context }, home)
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
  const requirements = runtimeModelRequirementsForRole(plan.role, promptImages)
  const candidates = await selectRuntimeModelCandidatesWithApiKey(plan.policy, models, home, requirements)

  const projectSupport = await readProjectSupport(cwd)
  const userSupport = await readUserSupport(home)
  const auth = await readAuth(home)
  const hookContext = createHookContext(sessionId, cwd, home, plan.model.id)
  const supportingWorkers = plan.workers.filter((worker) => worker.role !== plan.role && worker.role !== "review")
  const primaryWorker = plan.workers.find((worker) => worker.role === plan.role)
  const reviewWorker = plan.workers.find((worker) => worker.role === "review")
  const onWorkerTodoStatus: WorkerTodoStatusHandler = (worker, phase, status, detail) =>
    updateTodoStatus(plan, worker.todoIds ?? [], status, phase, sessionId, home, request.onTodoEvent, { ...detail, role: worker.role })
  const emitWorkerEvent = async (event: WorkerLifecycleEvent) => {
    if (!request.onWorkerEvent) return
    try {
      await request.onWorkerEvent(event)
    } catch {
      // ignore listener errors
    }
  }

  const mcpHub = new McpToolHub()
  const { servers: mcpServers, skipped: mcpSkipped } = collectMcpToolServers({
    userMcp: userSupport.mcp,
    projectMcp: projectSupport.mcp,
    auth,
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
  const checkOptions: CheckRunnerConfiguration = toolConfig.checks ?? defaultCheckRunnerConfiguration
  const localToolMode = request.localToolMode ?? (request.onToolApproval ? "all" : "read-only")
  const localTools = createLocalCodingTools({ projectRoot: cwd, tools: toolConfig.tools, mode: localToolMode, ignoreDisabled: request.ignoreDisabledLocalTools })
  const readOnlyTools = createLocalCodingTools({ projectRoot: cwd, tools: toolConfig.tools, mode: "read-only", ignoreDisabled: request.ignoreDisabledLocalTools })
  const runtimeTools = [...localTools, ...mcpTools]
  const toolEvidenceCache = createToolEvidenceCache()

  try {
    const patchBaseline = await collectPatchBaseline(cwd)
    const workerResults = await runSupportWorkers(supportingWorkers, effectivePrompt, sessionId, home, models, plan.mode, plan.toolExecution, plan.dependencies, projectSupport, hookContext, request.onWorkerEvent, plan.routing.maxParallelAgents, onWorkerTodoStatus, promptImages, readOnlyTools, toolEvidenceCache, request.onEvent, request.signal)
    if (plan.role === "imageMaker") {
      const primaryTodoIds = todoIdsForRole(plan, plan.role)
      const primaryTaskId = primaryWorker?.contextId ?? `${plan.context.id}:primary`
      const primaryHandoffId = `primary:${primaryTaskId}`
      const primaryGoal = primaryWorker?.goal ?? request.prompt
      const imagePrompt = buildImageMakerPrompt({ request: effectivePrompt, workerResults, projectSupport })
      let lastError: unknown
      for (const [attempt, { selection, apiKey }] of candidates.entries()) {
        plan.model = selection.configured
        plan.piModel = toPiModelSummary(selection)
        await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan, projectSupport: summarizeProjectSupport(projectSupport), attempt: attempt + 1 }, home)
        await updateTodoStatus(plan, primaryTodoIds, "running", "primary", sessionId, home, request.onTodoEvent, { role: plan.role })
        await emitWorkerEvent({
          type: "worker_start",
          role: plan.role,
          goal: primaryGoal,
          phase: "primary",
          modelId: selection.configured.id,
          handoffId: primaryHandoffId,
          taskId: primaryTaskId,
          parentId: plan.context.id,
          progress: { status: "running", summary: primaryGoal },
          todoIds: primaryTodoIds,
        })
        try {
          throwIfRunAborted(request.signal)
          const generation = await generateImage(selection.configured, apiKey, { prompt: imagePrompt, signal: request.signal })
          throwIfRunAborted(request.signal)
          const artifactPath = await saveGeneratedImageArtifact(sessionId, generation, home)
          const primarySummary = [
            `Generated image artifact: ${artifactPath}`,
            `Model: ${generation.provider}/${generation.modelId}`,
            `Bytes: ${generation.bytes}`,
            "Prompt:",
            imagePrompt,
          ].join("\n")
          await updateTodoStatus(plan, primaryTodoIds, "completed", "primary", sessionId, home, request.onTodoEvent, { role: plan.role, summary: primarySummary })
          await emitWorkerEvent({
            type: "worker_end",
            role: plan.role,
            phase: "primary",
            status: "completed",
            handoffId: primaryHandoffId,
            taskId: primaryTaskId,
            parentId: plan.context.id,
            progress: { status: "completed", summary: primarySummary },
            summary: primarySummary,
            todoIds: primaryTodoIds,
          })
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
          const summary = `${primarySummary}${formatStopHookFeedback(stopHooks)}`
          const patch = await collectPatchSummary(cwd, patchBaseline)
          await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults, patch: hasPatchActivity(patch) ? patch : undefined, attempt: attempt + 1 }, home)
          return { sessionId, summary, plan, workerResults, mcp: mcpReport, patch }
        } catch (error) {
          lastError = error
          const message = error instanceof Error ? error.message : String(error)
          await emitWorkerEvent({
            type: "worker_end",
            role: plan.role,
            phase: "primary",
            status: "failed",
            handoffId: primaryHandoffId,
            taskId: primaryTaskId,
            parentId: plan.context.id,
            progress: { status: "failed", summary: message },
            error: message,
            todoIds: primaryTodoIds,
          })
          await appendSessionRecord(sessionId, { type: "run_error", error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
          if (request.signal?.aborted) throw createRunAbortedError()
        }
      }
      await updateTodoStatus(plan, todoIdsForRole(plan, plan.role), "failed", "primary", sessionId, home, request.onTodoEvent, { role: plan.role, error: lastError instanceof Error ? lastError.message : String(lastError) })
      throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }
    const primaryPrompt = buildPrimaryPrompt(effectivePrompt, workerResults, plan.role, projectSupport, runtimeTools.map((tool) => tool.name))
    let lastError: unknown
    for (const [attempt, { selection, apiKey }] of candidates.entries()) {
      plan.model = selection.configured
      plan.piModel = toPiModelSummary(selection)
      debugLog("runtime", "primary attempt start", {
        attempt: attempt + 1,
        role: plan.role,
        modelId: selection.configured.id,
        provider: selection.piModel.provider,
        api: selection.configured.api,
        workerResultCount: workerResults.length,
        toolCount: runtimeTools.length,
      })
      await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan, projectSupport: summarizeProjectSupport(projectSupport), attempt: attempt + 1 }, home)
      const primaryTodoIds = todoIdsForRole(plan, plan.role)
      await updateTodoStatus(plan, primaryTodoIds, "running", "primary", sessionId, home, request.onTodoEvent, { role: plan.role })
      const primaryTaskId = primaryWorker?.contextId ?? `${plan.context.id}:primary`
      const primaryHandoffId = `primary:${primaryTaskId}`
      const primaryGoal = primaryWorker?.goal ?? request.prompt
      await emitWorkerEvent({
        type: "worker_start",
        role: plan.role,
        goal: primaryGoal,
        phase: "primary",
        modelId: selection.configured.id,
        handoffId: primaryHandoffId,
        taskId: primaryTaskId,
        parentId: plan.context.id,
        progress: { status: "running", summary: primaryGoal },
        todoIds: primaryTodoIds,
      })

      const runtime = createBraincodeAgentRuntime({
        mode: plan.mode,
        systemPrompt: getAgentRoleSystemPrompt(plan.role, plan.policy),
        model: plan.model,
        policy: plan.policy,
        sessionId,
        tools: runtimeTools,
        toolEvidenceCache,
        getApiKey: (provider) => (provider === plan.piModel.provider ? apiKey : undefined),
        onEvent: request.onEvent,
        onToolApproval: request.onToolApproval,
      })
      const unlinkAbort = linkRuntimeAbort(runtime, request.signal)

      try {
        try {
          throwIfRunAborted(request.signal)
          await runtime.agent.prompt(primaryPrompt, promptImages.length > 0 ? promptImages : undefined)
          throwIfRunAborted(request.signal)
        } finally {
          unlinkAbort()
          await recordAgentTokenUsage(
            runtime.agent.state.messages,
            {
              sessionId,
              home,
              role: plan.role,
              phase: "primary",
              agentSessionId: sessionId,
              taskId: primaryTaskId,
              parentId: plan.context.id,
              attempt: attempt + 1,
              brainId: plan.brain.id,
            },
            selection.configured,
          )
        }
        const primarySummary = requireAssistantText(runtime.agent.state.messages, {
          stage: "primary",
          role: plan.role,
          attempt: attempt + 1,
          modelId: selection.configured.id,
          provider: selection.piModel.provider,
          api: selection.configured.api,
        })
        await updateTodoStatus(plan, primaryTodoIds, "completed", "primary", sessionId, home, request.onTodoEvent, { role: plan.role, summary: primarySummary.trim() })
        await emitWorkerEvent({
          type: "worker_end",
          role: plan.role,
          phase: "primary",
          status: "completed",
          handoffId: primaryHandoffId,
          taskId: primaryTaskId,
          parentId: plan.context.id,
          progress: { status: "completed", summary: primarySummary.trim() },
          summary: primarySummary.trim(),
          todoIds: primaryTodoIds,
        })
        const patchAfterPrimary = await collectPatchSummary(cwd, patchBaseline)
        const checks = hasPatchActivity(patchAfterPrimary)
          ? await runPatchChecksWithApproval(cwd, checkOptions, {
              mode: plan.mode,
              sessionId,
              attempt: attempt + 1,
              onToolApproval: request.onToolApproval,
              signal: request.signal,
            })
          : undefined
        if (checks) {
          await appendSessionRecord(sessionId, { type: "check_summary", ...checks, attempt: attempt + 1 }, home)
        }
        const reviewArtifacts: PatchReviewArtifacts | undefined = hasPatchActivity(patchAfterPrimary)
          ? { patch: patchAfterPrimary, checks, diff: await collectPatchDiffSnapshot(cwd) }
          : undefined
        const reviewResult =
          plan.agentPlan.requiresReview && reviewWorker && plan.role !== "review"
            ? await runWorkerFromPlan(reviewWorker, (handoff) => buildReviewPrompt(effectivePrompt, primarySummary, workerResults, handoff, projectSupport, reviewArtifacts), sessionId, home, models, plan.mode, "review", projectSupport, hookContext, request.onWorkerEvent, onWorkerTodoStatus, promptImages, readOnlyTools, toolEvidenceCache, request.onEvent, request.signal)
            : undefined
        const reviewDecision = reviewResult
          ? applyCheckGateToReviewDecision(reviewResult.reviewDecision ?? normalizeReviewDecisionText(reviewResult.summary, reviewResult, checks), checks)
          : undefined
        if (reviewResult) {
          reviewResult.reviewDecision = reviewDecision
          workerResults.push(reviewResult)
        }
        if (reviewDecision) {
          await appendSessionRecord(sessionId, { type: "review_decision", ...reviewDecision, attempt: attempt + 1 }, home)
        }

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
        const summary = `${mergeReviewResult(primarySummary, reviewResult, reviewDecision)}${formatStopHookFeedback(stopHooks)}`
        const patch = await collectPatchSummary(cwd, patchBaseline)
        if (hasPatchActivity(patch)) {
          await appendSessionRecord(sessionId, { type: "patch_summary", ...patch, attempt: attempt + 1 }, home)
        }
        await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults, patch: hasPatchActivity(patch) ? patch : undefined, checks, reviewDecision, attempt: attempt + 1 }, home)
        return { sessionId, summary, plan, workerResults, mcp: mcpReport, patch, checks, reviewDecision }
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        debugLog("runtime", "primary attempt failed", {
          attempt: attempt + 1,
          role: plan.role,
          modelId: selection.configured.id,
          provider: selection.piModel.provider,
          error: message,
          willFallback: attempt < candidates.length - 1,
        })
        await emitWorkerEvent({
          type: "worker_end",
          role: plan.role,
          phase: "primary",
          status: "failed",
          handoffId: primaryHandoffId,
          taskId: primaryTaskId,
          parentId: plan.context.id,
          progress: { status: "failed", summary: message },
          error: message,
          todoIds: primaryTodoIds,
        })
        await appendSessionRecord(sessionId, { type: "run_error", error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
        if (request.signal?.aborted) throw createRunAbortedError()
        if (isHandoffRequiredError(error) || isProviderMessageSizeLimitError(error)) {
          await recordAutomaticHandoffIfNeeded(error, sessionId, home)
          break
        }
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
  const context = await readSessionContext(sessionId, home)
  if (!options.force) {
    if (context?.latestHandoff?.fresh) {
      return {
        summary: context.latestHandoff.summary,
        reused: true,
        trigger: context.latestHandoff.trigger ?? trigger,
        timestamp: context.latestHandoff.timestamp ?? Date.now(),
      }
    }
  }
  if (!context) {
    throw new Error(`No session context found for handoff: ${sessionId}`)
  }
  const prompt = buildSessionHandoffPrompt(context, options.focus)
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

function buildSessionHandoffPrompt(context: SessionContext, focus?: string): string {
  return [
    HANDOFF_SUMMARY_PROMPT,
    focus ? `Extra focus requested by the user: ${focus}` : "",
    "Compact session context to summarize:",
    formatSessionContext(context),
  ].filter(Boolean).join("\n\n")
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

export type ExpandPromptReferencesOptions = {
  generateSessionHandoffs?: boolean
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
      } else if (entry.type === "review") {
        const label = `- review${entry.attempt ? ` attempt ${entry.attempt}` : ""} (${entry.decision})`
        const rationale = entry.rationale ? `\n  rationale: ${clipContextText(entry.rationale, 1200)}` : ""
        const required = entry.requiredChanges.length > 0 ? `\n  required: ${clipContextText(entry.requiredChanges.join("; "), 1200)}` : ""
        const blocked = entry.blockingIssues.length > 0 ? `\n  blocked: ${clipContextText(entry.blockingIssues.join("; "), 1200)}` : ""
        lines.push(`${label}${rationale}${required}${blocked}`)
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

export async function expandPromptReferences(prompt: string, projectRoot: string, home?: string, options: ExpandPromptReferencesOptions = {}): Promise<ExpandedPromptResult> {
  const references: PromptReference[] = []
  const images: ImageContent[] = []
  const tokens = new Map<string, PromptReference>()
  const sessionContexts = new Map<string, SessionContext>()
  const sessionBriefs = new Map<string, string>()
  const generateSessionHandoffs = options.generateSessionHandoffs ?? true
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
      if (generateSessionHandoffs) {
        try {
          const handoff = await ensureSessionHandoff(context.sessionId, { trigger: "auto" }, home)
          sessionBriefs.set(token, handoff.summary)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          debugLog("expandPromptReferences", `handoff for @@${context.sessionId} failed, falling back to mechanical context`, { error: detail })
        }
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
