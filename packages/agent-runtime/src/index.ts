import type { AgentEvent } from "./pi-agent"
export type { AgentEvent } from "./pi-agent"
import { collectMcpToolServers, McpToolHub, type McpHubConnectReport, type McpLoadingStrategy } from "./mcp"
export { collectMcpToolServers, McpToolHub } from "./mcp"
export type { McpHubConnectReport, McpLoadingStrategy, McpToolServerInput } from "./mcp"
export { demoBenchmarkTasks, evaluateDemoBenchmarkPlan, resolveDemoBenchmarkTasks, runDemoBenchmarkSuite } from "./benchmark"
export type { DemoBenchmarkCheck, DemoBenchmarkCheckStatus, DemoBenchmarkExpectation, DemoBenchmarkPlanRunner, DemoBenchmarkRunOptions, DemoBenchmarkSuiteResult, DemoBenchmarkSuiteSummary, DemoBenchmarkTask, DemoBenchmarkTaskCategory, DemoBenchmarkTaskResult } from "./benchmark"
export { ensureExecutionBenchmarkReportsDir, loadExecutionBenchmarkTasks, resolveExecutionBenchmarkTasks, runExecutionBenchmarkSuite } from "./execution-benchmark"
export type { ExecutionBenchmarkCheck, ExecutionBenchmarkCheckStatus, ExecutionBenchmarkExecutor, ExecutionBenchmarkExpectedChecksStatus, ExecutionBenchmarkExpectedReviewDecision, ExecutionBenchmarkMode, ExecutionBenchmarkRunOptions, ExecutionBenchmarkSuiteResult, ExecutionBenchmarkSuiteSummary, ExecutionBenchmarkTask, ExecutionBenchmarkTaskMetrics, ExecutionBenchmarkTaskResult } from "./execution-benchmark"
import { ContextHandoffRequiredError, estimateProviderContextBytes, formatBytes, isHandoffRequiredError, isProviderMessageSizeLimitError } from "./context-budget"
export { ContextHandoffRequiredError, enforceHandoffContextBudget, estimateProviderContextBytes, isHandoffRequiredError, isProviderMessageSizeLimitError } from "./context-budget"
import { createToolEvidenceCache, type ToolEvidenceCacheOptions } from "./evidence-cache"
export { createToolEvidenceCache, wrapToolsWithEvidenceCache } from "./evidence-cache"
export type { ToolEvidenceCache, ToolEvidenceCacheOptions } from "./evidence-cache"
import { runtimeModelRequirementsForRole, selectRuntimeModelCandidatesWithApiKey, selectRuntimeModelWithApiKey, toPiModelSummary } from "./model-selection"
export { selectRuntimeModel } from "./model-selection"
export type { RuntimeModelRequirements, RuntimeModelSelection, RuntimePiModelSummary } from "./model-selection"
import { getAgentRoleSystemPrompt, getModePolicy, normalizeAgentTodos, selectBrain, selectModelPolicy, type AgentIntentClarification, type AgentTodoItem, type AgentTodoStatus, type AgentWorkerPlan, type BrainModel, type BrainPreset, type ModelPolicy, type RoutedAgentRole } from "@braincode/brain"
import { appendSessionRecord, defaultBrains, defaultModels, readAuth, readBrains, readModels, readProjectChecks, readProjectSupport, readSessionContext, readSessionTokenUsageSummary, readSettings, readTools, readUserSupport, type SessionContext } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { debugLog } from "@braincode/shared"
import { createLocalCodingTools, defaultCheckRunnerConfiguration, mergeCheckRunnerConfiguration, ExecSessionManager, type BackgroundExitListener, type CheckRunnerConfiguration, type LocalToolMode, type PermissionPolicyEvaluation } from "@braincode/tools"
export type { PermissionPolicyDocument, PermissionPolicyEvaluation, PermissionPolicyMatch } from "@braincode/tools"
export { ExecSessionManager } from "@braincode/tools"
export type { BackgroundExitInfo, BackgroundExitListener } from "@braincode/tools"
import { addHookAdditionalContext, createHookContext, formatStopHookFeedback, runAndRecordHooks, type HookRuntimeContext } from "./hooks"
export { runConfiguredHooks } from "./hooks"
export type { HookPermissionMode, HookRunRecord, HookRunResult, HookRuntimeContext } from "./hooks"
import { classifyPatchKind, classifyPatchRiskTier, patchHasAuthPath, patchHasCiPath, runPatchChecksWithApproval, type PatchCheckSummary } from "./checks"
export { classifyPatchKind, classifyPatchRiskTier, patchHasAuthPath, patchHasCiPath, patchKindRequiresReview, patchKindRiskTier, runPatchChecks, runPatchChecksWithApproval } from "./checks"
export type { PatchCheckOptions, PatchCheckResult, PatchCheckStatus, PatchCheckSummary, PatchKind, PatchRiskTier } from "./checks"
import { collectPatchBaseline, collectPatchDiffSnapshot, collectPatchSummary, collectUntrackedFilePreviews, hasPatchActivity, type PatchSummary } from "./patch"
export { collectPatchBaseline, collectPatchDiffSnapshot, collectPatchSummary, collectUntrackedFilePreviews } from "./patch"
export type { PatchBaseline, PatchDiffSnapshot, PatchFileChange, PatchSummary, UntrackedFilePreview } from "./patch"
import { applyCheckGateToReviewDecision, buildPrimaryFixPrompt, buildReviewPrompt, evaluateReviewIndependence, fixLoopTrigger, mergeReviewResult, normalizeReviewDecisionText, reviewModeForRiskTier, type PatchReviewArtifacts, type ReviewDecision, type ReviewIndependence } from "./review"
export { applyCheckGateToReviewDecision, applyReviewGatesToReviewDecision, buildReviewPrompt, evaluateReviewIndependence, formatWorkerResults, mergeReviewResult, normalizeReviewDecisionText, reviewModeForRiskTier } from "./review"
export type { MissingReviewArtifactsPolicy, PatchReviewArtifacts, ReviewCoverageEntry, ReviewCoverageStatus, ReviewDecision, ReviewDecisionStatus, ReviewFinding, ReviewFindingSeverity, ReviewGateOptions, ReviewIndependence, ReviewIndependenceLevel, ReviewIndependenceParticipant, ReviewMode } from "./review"
import { expandPromptReferences as expandPromptReferencesBase, formatSessionContext, type ExpandedPromptResult, type ExpandPromptReferencesOptions } from "./prompt-references"
export type { ExpandedPromptResult, ExpandPromptReferencesOptions, PromptReference } from "./prompt-references"
import { buildImageMakerPrompt, generateImageArtifact, selectImageMakerModelCandidates } from "./image-maker"
import { createGenerateImageTool } from "./generate-image-tool"
export { buildImageMakerPrompt, imageMakerWorkerResult, saveGeneratedImageArtifact, selectImageMakerModelCandidates } from "./image-maker"
export type { ImageMakerWorkerPlan, ImageMakerWorkerResult } from "./image-maker"
import { buildFinalReport, type FinalReport } from "./final-report"
export { buildFinalReport, resolveFinalReportStatus } from "./final-report"
export type { BuildFinalReportInput, FinalReport, FinalReportPlanReview, FinalReportStatus } from "./final-report"
import { createBraincodeAgentRuntime, createRunAbortedError, linkRuntimeAbort, recordAgentTokenUsage, recordAutomaticHandoffIfNeeded, requireAssistantText, throwIfRunAborted, type ToolApprovalDecision, type ToolApprovalRequest } from "./runtime-agent"
export { createBraincodeAgentRuntime, extractAssistantText, requireAssistantText } from "./runtime-agent"
export type { BraincodeAgentRuntime, BraincodeAgentRuntimeOptions, TokenUsageScope, ToolApprovalDecision, ToolApprovalRequest } from "./runtime-agent"
import { buildRuntimePlan, createRuntimeWorkerPlan, formatRoleModelCapabilityDirective, normalizeRouterDecision, normalizeRouterModelId, type PlanRuntimeOptions, type RuntimePlan, type RuntimeWorkerPlan } from "./router"
export { buildRuntimePlan, createRuntimeWorkerPlan, formatInputModalityRoutingDirective, formatRoleModelCapabilityDirective, normalizeRouterDecision, normalizeRouterModelId, routePromptWithBrain } from "./router"
export type { PlanRuntimeOptions, RouterPlanDecision, RouterWorkerPlan, RuntimePlan, RuntimeWorkerPlan } from "./router"
import { buildPrimaryPrompt, formatProjectSupportPromptSection, mergeProjectAndUserSupport, runSupportWorkers, runWorkerFromPlan, summarizeProjectSupport, type ExecutedWorkerResult, type WorkerLifecycleEvent, type WorkerTodoStatusHandler } from "./workers"
export { buildPrimaryPrompt, createWorkerHandoff, formatProjectSupportPromptSection, mergeProjectAndUserSupport, readOnlyToolWorkerRoles, runSupportWorkers, runWorkerFromPlan } from "./workers"
export type { ExecutedWorkerResult, RuntimeSupportContext, WorkerExecutionModel, WorkerLifecycleEvent, WorkerTodoStatusHandler } from "./workers"
import { createRuntimeMcpLoader, DEFAULT_MCP_PER_SERVER_CONNECT_TIMEOUT_MS, DEFAULT_MCP_STARTUP_BUDGET_MS, normalizeRuntimeInteger } from "./mcp-loading"
import { createDispatchSpecialistTool, formatDispatchToolGuidance, type DispatchSpecialistTool } from "./dynamic-dispatch"
export { createDispatchSpecialistTool, dispatchableRoles, dispatchSpecialistMaxForMode, formatDispatchToolGuidance } from "./dynamic-dispatch"
import { gatherEnvironmentContext, formatEnvironmentSection } from "./environment"
import { createPhaseTimer } from "./phase-timing"
export { gatherEnvironmentContext, formatEnvironmentSection, type EnvironmentContext } from "./environment"
export type { DispatchSpecialistTool, DispatchSpecialistToolOptions } from "./dynamic-dispatch"
import { buildRuntimeMetricsSummary, createRuntimeToolCallMetricsTracker, type RuntimeMetricsPhase, type RuntimeMetricsSummary } from "./metrics"
export { buildRuntimeMetricsSummary, createRuntimeToolCallMetricsTracker } from "./metrics"
export type { RuntimeMetricsPhase, RuntimeMetricsSummary, RuntimeTokenUsageSummary, RuntimeToolCallPhaseSummary, RuntimeToolCallSummary } from "./metrics"
import { buildExecutionPlanReview, type ExecutionPlanReviewRecord } from "./execution-plan-review"
export { buildExecutionPlanReview }
export type { ExecutionPlanReviewApprover, ExecutionPlanReviewRecord, ExecutionPlanReviewStatus, ExecutionPlanSideEffect, ExecutionPlanSideEffectKind } from "./execution-plan-review"
import type { ToolAuditScope } from "./tool-audit"
export { recordToolApprovalDecision, recordToolExecutionEvent, recordToolExecutionSummary } from "./tool-audit"
export type { ToolApprovalAuditApprover, ToolApprovalAuditDecision, ToolApprovalDecisionRecord, ToolAuditScope, ToolExecutionSummaryRecord } from "./tool-audit"

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
  mcpLoadingStrategy?: McpLoadingStrategy
  mcpStartupBudgetMs?: number
  mcpPerServerConnectTimeoutMs?: number
  onWorkerEvent?: (event: WorkerLifecycleEvent) => void | Promise<void>
  /** Reuse a session manager across prompts so background processes survive between turns (TUI passes a session-scoped instance). */
  execSessions?: ExecSessionManager
  /**
   * Reuse an MCP hub across prompts so servers stay connected between turns
   * instead of being re-spawned and re-listed on every prompt (TUI passes a
   * session-scoped instance). Callers that pass a hub own its lifecycle and
   * must call hub.shutdown() when the session ends; the runtime only shuts
   * down hubs it created itself.
   */
  mcpHub?: McpToolHub
  /** Notified when a background process started via exec_command exits. */
  onBackgroundExit?: BackgroundExitListener
}

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
  finalReport: FinalReport
  plan: RuntimePlan
  workerResults: ExecutedWorkerResult[]
  mcp?: McpHubConnectReport
  patch?: PatchSummary
  checks?: PatchCheckSummary
  reviewDecision?: ReviewDecision
  fixIterations?: number
}

async function appendExecutionPlanReviewIfNeeded(
  sessionId: string,
  home: string | undefined,
  plan: RuntimePlan,
  options: {
    localToolMode: LocalToolMode
    hasApprovalCallback: boolean
    expanded: ExpandedPromptResult
    checkOptions: CheckRunnerConfiguration
    mcpServers: Array<{ scope: string; name: string }>
  },
): Promise<ExecutionPlanReviewRecord | undefined> {
  const record = buildExecutionPlanReview(plan, {
    sessionId,
    localToolMode: options.localToolMode,
    hasApprovalCallback: options.hasApprovalCallback,
    promptReferences: options.expanded.references,
    checkOptions: options.checkOptions,
    mcpServers: options.mcpServers,
  })
  if (!record) return undefined
  await appendSessionRecord(sessionId, record, home)
  return record
}

async function buildRunMetrics(
  sessionId: string,
  home: string | undefined,
  toolCalls: ReturnType<typeof createRuntimeToolCallMetricsTracker>["summary"],
): Promise<RuntimeMetricsSummary> {
  const usage = await readSessionTokenUsageSummary(sessionId, home)
  return buildRuntimeMetricsSummary(usage, toolCalls())
}

async function appendToolCallCountRecord(
  sessionId: string,
  home: string | undefined,
  metrics: RuntimeMetricsSummary,
  attempt: number,
): Promise<void> {
  await appendSessionRecord(sessionId, {
    type: "tool_call_count",
    total: metrics.toolCalls.total,
    failed: metrics.toolCalls.failed,
    byPhase: metrics.toolCalls.byPhase,
    attempt,
  }, home)
}

function createPhaseEventHandler(
  phase: RuntimeMetricsPhase,
  tracker: ReturnType<typeof createRuntimeToolCallMetricsTracker>,
  onEvent: AgentRunRequest["onEvent"],
): AgentRunRequest["onEvent"] {
  return async (event) => {
    tracker.onEvent(phase, event)
    if (!onEvent) return
    await onEvent(event)
  }
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
    const brain = selectBrain(brains, settings.defaultBrainId)
    const policy = brain.roles.pet
    if (!policy?.modelId) return null
    const { selection, apiKey } = await selectRuntimeModelWithApiKey(policy, models, home)
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

function todoIdsForRole(plan: RuntimePlan, role: RoutedAgentRole): string[] {
  return plan.todos.filter((todo) => todo.role === role).map((todo) => todo.id)
}

// Fold dispatched-specialist results into the worker-result list without
// duplicating ones already merged. Dispatched results carry a unique task id
// (the worker context id), so identity-by-taskId is a safe dedup key.
function mergeDispatchedResults(workerResults: ExecutedWorkerResult[], dispatchedResults: ExecutedWorkerResult[]): void {
  const present = new Set(workerResults.map((result) => result.taskId))
  for (const result of dispatchedResults) {
    if (present.has(result.taskId)) continue
    present.add(result.taskId)
    workerResults.push(result)
  }
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

function formatIntentClarificationSummary(clarification: AgentIntentClarification): string {
  const chinese = /[\u4e00-\u9fff]/.test(`${clarification.question} ${clarification.reason}`)
  const optionLines = clarification.options.map((option, index) =>
    `${index + 1}. ${option.label} (${option.id}): ${option.description}`,
  )
  if (chinese) {
    return [
      "需要先确认后再交给专业 agent。",
      "",
      `问题：${clarification.question}`,
      clarification.missing.length > 0 ? `缺少信息：${clarification.missing.join("、")}` : "",
      "",
      "可选方向：",
      ...optionLines,
      "",
      `原因：${clarification.reason}`,
      "你可以回复选项编号、选项 id，或直接补充目标/约束/验收标准。",
    ].filter(Boolean).join("\n")
  }
  return [
    "I need one clarification before handing this to specialist agents.",
    "",
    `Question: ${clarification.question}`,
    clarification.missing.length > 0 ? `Missing: ${clarification.missing.join(", ")}` : "",
    "",
    "Options:",
    ...optionLines,
    "",
    `Reason: ${clarification.reason}`,
    "Reply with an option number, an option id, or the missing target, constraints, and acceptance criteria.",
  ].filter(Boolean).join("\n")
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

// Owns the primary phase's lifecycle chorus (todo transitions + worker_start /
// worker_end envelopes), which otherwise repeats at every primary attempt,
// fix iteration, and failure branch with only status/summary varying.
function createPrimaryLifecycle(input: {
  plan: RuntimePlan
  primaryWorker?: RuntimeWorkerPlan
  requestPrompt: string
  sessionId: string
  home?: string
  onTodoEvent: AgentRunRequest["onTodoEvent"]
  emitWorkerEvent: (event: WorkerLifecycleEvent) => Promise<void>
}) {
  const { plan, primaryWorker, sessionId, home, onTodoEvent, emitWorkerEvent } = input
  // plan.todos can be replaced mid-run (ensureReviewWorker renormalizes), so
  // todo ids are resolved at emission time, matching the previous inline code.
  const todoIds = () => todoIdsForRole(plan, plan.role)
  const taskId = primaryWorker?.contextId ?? `${plan.context.id}:primary`
  const handoffId = `primary:${taskId}`
  const goal = primaryWorker?.goal ?? input.requestPrompt
  const envelope = () => ({ role: plan.role, phase: "primary" as const, handoffId, taskId, parentId: plan.context.id, todoIds: todoIds() })
  return {
    taskId,
    handoffId,
    goal,
    async start(modelId: string, options: { goal?: string; progressSummary?: string } = {}) {
      const startGoal = options.goal ?? goal
      await updateTodoStatus(plan, todoIds(), "running", "primary", sessionId, home, onTodoEvent, { role: plan.role })
      await emitWorkerEvent({ type: "worker_start", ...envelope(), goal: startGoal, modelId, progress: { status: "running", summary: options.progressSummary ?? startGoal } })
    },
    async completed(summary: string) {
      await updateTodoStatus(plan, todoIds(), "completed", "primary", sessionId, home, onTodoEvent, { role: plan.role, summary })
      await emitWorkerEvent({ type: "worker_end", ...envelope(), status: "completed", progress: { status: "completed", summary }, summary })
    },
    async failed(message: string) {
      await emitWorkerEvent({ type: "worker_end", ...envelope(), status: "failed", progress: { status: "failed", summary: message }, error: message })
    },
  }
}

async function ensureReviewWorker(
  plan: RuntimePlan,
  models: BraincodeModel[],
  home: string | undefined,
  sessionId: string,
  onTodoEvent: AgentRunRequest["onTodoEvent"],
  options: { goal?: string; reason?: string } = {},
): Promise<RuntimeWorkerPlan> {
  const existing = plan.workers.find((worker) => worker.role === "review")
  if (existing) return existing

  const reviewWorkerInput: AgentWorkerPlan = {
    role: "review",
    goal: options.goal ?? "Review sensitive changes for correctness, regressions, and safety risks.",
    reason: options.reason ?? "Policy requires independent review for this run.",
  }
  const brainDocument = await readBrains(home)
  const brains = brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains
  const brain = selectBrain(brains, plan.brain.id)
  const normalized = normalizeAgentTodos([...plan.agentPlan.workers, reviewWorkerInput], plan.agentPlan.todos)
  const normalizedReviewWorker = normalized.workers.find((worker) => worker.role === "review") ?? reviewWorkerInput
  const reviewWorker = createRuntimeWorkerPlan(normalizedReviewWorker, brain, models)
  plan.agentPlan = {
    ...plan.agentPlan,
    workers: normalized.workers,
    todos: normalized.todos,
    requiresReview: true,
  }
  plan.workers.push(reviewWorker)
  plan.todos = normalized.todos
  plan.context.childContextIds.push(reviewWorker.contextId)

  await appendSessionRecord(sessionId, {
    type: "todo_plan",
    todos: plan.todos,
    dependencies: plan.dependencies,
    reason: options.reason ?? "policy requires review",
  }, home)

  if (onTodoEvent) {
    for (const todoId of reviewWorker.todoIds ?? []) {
      const todo = plan.todos.find((item) => item.id === todoId)
      if (!todo) continue
      try {
        await onTodoEvent({ type: "todo_update", todo, status: todo.status, phase: "planning", role: "review" })
      } catch {
        // ignore listener errors
      }
    }
  }

  return reviewWorker
}

// Prepend a compact "conversation so far" summary to the current prompt when the
// session already has prior runs, giving the router brain and primary agent
// continuity for follow-ups. Returns the prompt unchanged when there is no prior
// run history (first turn, or caller passed no context to avoid duplication).
export function applySessionContinuity(prompt: string, priorContext: SessionContext | undefined): string {
  const hasPriorRuns = priorContext?.entries.some((entry) => entry.type === "run") ?? false
  if (!hasPriorRuns || !priorContext) return prompt
  return `Conversation so far (most recent session activity, for continuity with this follow-up):\n${formatSessionContext(priorContext)}\n\nCurrent request:\n${prompt}`
}

export async function executePromptFromConfig(request: AgentRunRequest, home?: string): Promise<AgentRunResult> {
  throwIfRunAborted(request.signal)
  const sessionId = request.sessionId ?? crypto.randomUUID()
  const cwd = request.projectRoot ?? process.cwd()
  const timing = createPhaseTimer("executePromptFromConfig")
  const promptHookContext = createHookContext(sessionId, cwd, home)
  const sessionStartHooks = await timing.measure("hooks:session_start", () => runAndRecordHooks(
    "SessionStart",
    { source: "startup" },
    promptHookContext,
    "startup",
    home,
    "hook_session_start",
  ))
  if (sessionStartHooks.blockedReason) {
    throw new Error(`SessionStart hook blocked the run: ${sessionStartHooks.blockedReason}`)
  }
  const promptHooks = await timing.measure("hooks:user_prompt_submit", () => runAndRecordHooks(
    "UserPromptSubmit",
    { prompt: request.prompt },
    promptHookContext,
    undefined,
    home,
    "hook_user_prompt_submit",
  ))
  if (promptHooks.blockedReason) {
    throw new Error(`UserPromptSubmit hook blocked the prompt: ${promptHooks.blockedReason}`)
  }
  throwIfRunAborted(request.signal)
  const expanded = await timing.measure("prompt_references", () => expandPromptReferences(request.prompt, cwd, home))
  throwIfRunAborted(request.signal)
  const promptImages = expanded.images
  const hookPrompt = addHookAdditionalContext(expanded.prompt, [...sessionStartHooks.additionalContext, ...promptHooks.additionalContext])
  // Automatic multi-turn continuity: when this session already has prior runs,
  // inject a compact summary of the conversation so far so both the router brain
  // and the primary agent understand follow-ups like "try again" or "make it
  // blue". Skip when the user already referenced this session with @@<id> (the
  // expansion above already injected it) to avoid duplication.
  const alreadyReferencedThisSession = expanded.references.some((ref) => ref.kind === "session" && ref.sessionId === sessionId)
  const priorContext = alreadyReferencedThisSession ? undefined : await timing.measure("session_context", () => readSessionContext(sessionId, home))
  const effectivePrompt = applySessionContinuity(hookPrompt, priorContext)
  // Config documents (needed by the router below and this run), prep reads,
  // and the router LLM round-trip all overlap: nothing in prep depends on
  // config docs, and the router only needs the docs, so its latency hides
  // behind disk/git latency instead of following it serially.
  const configDocumentsPromise = timing.measure("config:documents", () =>
    Promise.all([readModels(home), readSettings(home), readBrains(home)]),
  )
  const planPromise = timing.measure("runtime_plan:router", () =>
    configDocumentsPromise.then(([models, settings, brains]) =>
      buildRuntimePlan(effectivePrompt, home, true, request.forceRoles, promptImages, sessionId, sessionId, { settings, brains, models }),
    ),
  )
  const prepPromise = timing.measure("prep:parallel", () =>
    Promise.all([
      readProjectSupport(cwd),
      gatherEnvironmentContext({ cwd }),
      readUserSupport(home),
      readAuth(home),
      readTools(home),
      readProjectChecks(cwd),
      // Safe to capture alongside the other reads: nothing on the prep path
      // mutates the worktree (hooks already ran above; workers run later).
      collectPatchBaseline(cwd),
    ]).then(([projectSupport, environmentContext, userSupport, auth, toolConfig, projectChecks, patchBaseline]) => ({
      // Named so every consumer destructures by key — a reordered read above
      // can no longer silently shift a value into the wrong slot.
      projectSupport,
      environmentContext,
      userSupport,
      auth,
      toolConfig,
      projectChecks,
      patchBaseline,
    })),
  )
  // The configured MCP server set derives purely from prep data. Computed once
  // and shared by the early connect and the loader below, so both always see
  // the identical server list. The .catch keeps a prep failure from becoming
  // an unhandled rejection on the clarification early-return path (prep itself
  // is handled through this chain; the real error surfaces at `await` below).
  const mcpToolServersPromise = prepPromise.then(({ projectSupport, userSupport, auth }) =>
    collectMcpToolServers({ userMcp: userSupport.mcp, projectMcp: projectSupport.mcp, auth }),
  )
  mcpToolServersPromise.catch(() => {})
  // Session-scoped hub reuse (see AgentRunRequest.mcpHub): connected servers
  // survive across prompts, so turn 2+ skips the spawn + initialize +
  // tools/list handshake entirely.
  const ownsMcpHub = !request.mcpHub
  const mcpHub = request.mcpHub ?? new McpToolHub()
  const mcpPerServerConnectTimeoutMs = normalizeRuntimeInteger(request.mcpPerServerConnectTimeoutMs, 250, 120_000, DEFAULT_MCP_PER_SERVER_CONNECT_TIMEOUT_MS)
  const mcpLoadingStrategy = request.mcpLoadingStrategy ?? "eager"
  // For session-scoped hubs with the eager strategy, MCP connect depends only
  // on prep data (auth + MCP configs) — start it as soon as prep resolves so
  // server spawn + handshake overlaps the router LLM round-trip. lazy and
  // background strategies exist to defer exactly this work, so they never
  // connect early. Owned per-run hubs keep the serial path: an early
  // clarification return or a prep-stage throw must not leak spawned server
  // processes that only the later try/finally cleans up. This promise is
  // deliberately never awaited on the run path — the loader's initialize()
  // joins the same in-flight handshakes (see McpToolHub.ensureServer) under
  // its own startup budget, which stays the single settle point.
  if (request.mcpHub && mcpLoadingStrategy === "eager") {
    void mcpToolServersPromise
      .then(({ servers }) => {
        if (servers.length === 0) return
        return timing.measure("mcp:early_connect", () => mcpHub.connect(servers, { perServerConnectTimeoutMs: mcpPerServerConnectTimeoutMs }))
      })
      .catch(() => undefined)
  }
  const plan = await planPromise
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
  if (plan.agentPlan.clarification?.required) {
    const clarification = plan.agentPlan.clarification
    const summary = formatIntentClarificationSummary(clarification)
    await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan, projectSupport: { root: cwd }, attempt: 1 }, home)
    await appendSessionRecord(sessionId, { type: "clarification_request", clarification, attempt: 1 }, home)
    await updateTodoStatus(
      plan,
      plan.todos.map((todo) => todo.id),
      "blocked",
      "planning",
      sessionId,
      home,
      request.onTodoEvent,
      { role: plan.role, summary: "Waiting for user clarification before specialist handoff." },
    )
    const metrics = buildRuntimeMetricsSummary(
      await readSessionTokenUsageSummary(sessionId, home),
      { total: 0, failed: 0, byPhase: [] },
    )
    const finalReport = buildFinalReport({
      task: request.prompt,
      sessionId,
      plan,
      workerResults: [],
      modelSummary: summary,
      metrics,
      runtimeToolCount: 0,
      clarification,
    })
    await appendSessionRecord(sessionId, { type: "final_report", finalReport, attempt: 1 }, home)
    await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults: [], finalReport, attempt: 1 }, home)
    return { sessionId, summary, finalReport, plan, workerResults: [] }
  }
  const [modelDocument, runtimeSettings, brainDocument] = await configDocumentsPromise
  const models = modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models
  // Full brain (the plan only carries an id/name/description pick) so we can
  // resolve the imageMaker model policy for the mid-run generate_image tool.
  const brain = selectBrain(brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains, plan.brain.id)
  const requirements = runtimeModelRequirementsForRole(plan.role, promptImages)
  const { projectSupport, environmentContext, userSupport, auth, toolConfig, projectChecks, patchBaseline } = await prepPromise
  // Model candidate selection needs the routed role, so it runs after the plan
  // resolves; the auth document from prep is threaded through so no candidate
  // re-reads auth.json from disk.
  const candidates = await timing.measure("model_candidates", () =>
    plan.role === "imageMaker"
      ? selectImageMakerModelCandidates(plan.policy, models, home)
      : selectRuntimeModelCandidatesWithApiKey(plan.policy, models, home, requirements, auth),
  )
  const environmentSection = formatEnvironmentSection({ ...environmentContext, modelId: plan.model.id })
  const runtimeSupport = mergeProjectAndUserSupport(projectSupport, userSupport)
  const hookContext = createHookContext(sessionId, cwd, home, plan.model.id)
  const supportingWorkers = plan.workers.filter((worker) => worker.role !== plan.role && worker.role !== "review")
  const primaryWorker = plan.workers.find((worker) => worker.role === plan.role)
  let reviewWorker = plan.workers.find((worker) => worker.role === "review")
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

  const { servers: mcpServers, skipped: mcpSkipped } = await mcpToolServersPromise
  const checkOptions: CheckRunnerConfiguration = mergeCheckRunnerConfiguration(toolConfig.checks ?? defaultCheckRunnerConfiguration, projectChecks?.config)
  const localToolMode = request.localToolMode ?? (request.onToolApproval ? "all" : "read-only")
  // Share one session manager across both tool sets (and, via request.execSessions,
  // across prompts) so background processes survive between turns and stay visible
  // regardless of which tool mode reaches them. The exit listener is registered once
  // on the manager; createLocalCodingTools re-registering it is idempotent.
  const execSessions = request.execSessions ?? new ExecSessionManager()
  if (request.onBackgroundExit) execSessions.setBackgroundExitListener(request.onBackgroundExit)
  const localTools = createLocalCodingTools({ projectRoot: cwd, tools: toolConfig.tools, mode: localToolMode, ignoreDisabled: request.ignoreDisabledLocalTools, permissionPolicy: toolConfig.permissions, execSessions })
  const readOnlyTools = createLocalCodingTools({ projectRoot: cwd, tools: toolConfig.tools, mode: "read-only", ignoreDisabled: request.ignoreDisabledLocalTools, permissionPolicy: toolConfig.permissions, execSessions })
  const toolEvidenceCache = createToolEvidenceCache()
  const toolCallMetrics = createRuntimeToolCallMetricsTracker()
  // Dispatched specialist worker results, collected mid-run when the primary
  // agent calls the dispatch_specialist tool. Folded into workerResults so the
  // review worker and final report see them. Forced multi-agent (/team) runs and
  // imageMaker primaries do not get the tool; review never gets it either.
  const dispatchedResults: ExecutedWorkerResult[] = []
  const dynamicDispatchEnabled = runtimeSettings.features?.dynamicDispatch !== false
    && !(request.forceRoles && request.forceRoles.length > 0)
    && plan.role !== "review"
    && plan.role !== "imageMaker"
  const dispatchTool: DispatchSpecialistTool | undefined = dynamicDispatchEnabled
    ? createDispatchSpecialistTool({
        plan,
        models,
        home,
        sessionId,
        projectSupport: runtimeSupport,
        environmentSection,
        hookContext,
        readOnlyTools,
        getMcpTools: () => mcpHub.getTools(),
        toolEvidenceCache,
        onWorkerEvent: request.onWorkerEvent,
        onWorkerTodoStatus,
        onEvent: createPhaseEventHandler("support", toolCallMetrics, request.onEvent),
        signal: request.signal,
        dispatchedResults,
      })
    : undefined
  // The dispatch tool lives in the local prefix so the MCP loader's tool sync,
  // which splices everything after localToolCount, never removes it. It only
  // reaches the primary runtime; workers receive their own tool lists.
  const primaryLocalTools = dispatchTool ? [...localTools, dispatchTool.tool] : [...localTools]
  // Let a non-imageMaker primary generate image assets mid-run (e.g. a frontend
  // agent that needs a hero image). imageMaker primaries already own generation,
  // and read-only runs cannot write artifacts, so both are excluded. The tool
  // resolves an image-generation model the same way the imageMaker worker does
  // and returns a graceful message when none is configured.
  if (localToolMode === "all" && plan.role !== "imageMaker") {
    const imagePolicy = selectModelPolicy(brain, "imageMaker")
    primaryLocalTools.push(createGenerateImageTool({ models, home, sessionId, imagePolicy, signal: request.signal }))
  }
  const runtimeTools = [...primaryLocalTools]
  let permissionPolicyReviewRequired = false
  const onPermissionPolicyEvaluation = (evaluation: PermissionPolicyEvaluation) => {
    if (evaluation.reviewRequired) {
      permissionPolicyReviewRequired = true
      plan.agentPlan.requiresReview = true
    }
  }
  // The early connect (started alongside the router call above) is not
  // awaited: initialize()'s hub.connect joins the same in-flight handshakes
  // via ensureServer under the loader's own startup budget.
  const mcpLoader = createRuntimeMcpLoader({
    hub: mcpHub,
    servers: mcpServers,
    skipped: mcpSkipped,
    strategy: mcpLoadingStrategy,
    startupBudgetMs: normalizeRuntimeInteger(request.mcpStartupBudgetMs, 0, 120_000, DEFAULT_MCP_STARTUP_BUDGET_MS),
    perServerConnectTimeoutMs: mcpPerServerConnectTimeoutMs,
    runtimeTools,
    localToolCount: primaryLocalTools.length,
    toolEvidenceCache,
    publishReport: async (report) => {
      if (request.onMcpReport) {
        try {
          await request.onMcpReport(report)
        } catch {
          // ignore listener errors
        }
      }
      await appendSessionRecord(sessionId, { type: "mcp_connect", report }, home)
    },
  })
  const executionPlanReview = await appendExecutionPlanReviewIfNeeded(sessionId, home, plan, {
    localToolMode,
    hasApprovalCallback: Boolean(request.onToolApproval),
    expanded,
    checkOptions,
    mcpServers: mcpServers.map((server) => ({ scope: server.scope, name: server.name })),
  })
  await timing.measure("mcp:initialize", () => mcpLoader.initialize())

  try {
    const workerResults = await timing.measure("support_workers", () => runSupportWorkers({
      workers: supportingWorkers,
      originalPrompt: effectivePrompt,
      sessionId,
      home,
      models,
      mode: plan.mode,
      toolExecution: plan.toolExecution,
      dependencies: plan.dependencies,
      projectSupport: runtimeSupport,
      hookContext,
      onWorkerEvent: request.onWorkerEvent,
      concurrencyCap: plan.routing.maxParallelAgents,
      onTodoStatus: onWorkerTodoStatus,
      promptImages,
      readOnlyTools,
      toolEvidenceCache,
      onEvent: createPhaseEventHandler("support", toolCallMetrics, request.onEvent),
      signal: request.signal,
      getMcpTools: () => mcpHub.getTools(),
      environmentSection,
    }))
    const primaryLifecycle = createPrimaryLifecycle({
      plan,
      primaryWorker,
      requestPrompt: request.prompt,
      sessionId,
      home,
      onTodoEvent: request.onTodoEvent,
      emitWorkerEvent,
    })
    if (plan.role === "imageMaker") {
      const imagePrompt = buildImageMakerPrompt({ request: effectivePrompt, workerResults, projectSupport: runtimeSupport })
      let lastError: unknown
      for (const [attempt, { selection, apiKey }] of candidates.entries()) {
        plan.model = selection.configured
        plan.piModel = toPiModelSummary(selection)
        await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan, projectSupport: summarizeProjectSupport(runtimeSupport), attempt: attempt + 1 }, home)
        await primaryLifecycle.start(selection.configured.id)
        try {
          const { summary: primarySummary } = await generateImageArtifact({ model: selection.configured, apiKey, prompt: imagePrompt, sessionId, home, signal: request.signal })
          await primaryLifecycle.completed(primarySummary)
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
          const metrics = await buildRunMetrics(sessionId, home, toolCallMetrics.summary)
          await appendToolCallCountRecord(sessionId, home, metrics, attempt + 1)
          const finalReport = buildFinalReport({
            task: request.prompt,
            sessionId,
            plan,
            workerResults,
            modelSummary: primarySummary,
            patch,
            planReview: executionPlanReview,
            metrics,
            runtimeToolCount: metrics.toolCalls.total,
          })
          await appendSessionRecord(sessionId, { type: "final_report", finalReport, attempt: attempt + 1 }, home)
          await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults, patch: hasPatchActivity(patch) ? patch : undefined, finalReport, attempt: attempt + 1 }, home)
          return { sessionId, summary, finalReport, plan, workerResults, mcp: mcpLoader.report(), patch }
        } catch (error) {
          lastError = error
          const message = error instanceof Error ? error.message : String(error)
          await primaryLifecycle.failed(message)
          await appendSessionRecord(sessionId, { type: "run_error", error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
          if (request.signal?.aborted) throw createRunAbortedError()
        }
      }
      await updateTodoStatus(plan, todoIdsForRole(plan, plan.role), "failed", "primary", sessionId, home, request.onTodoEvent, { role: plan.role, error: lastError instanceof Error ? lastError.message : String(lastError) })
      throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }

    const primaryPromptBase = buildPrimaryPrompt(effectivePrompt, workerResults, plan.role, runtimeSupport, runtimeTools.map((tool) => tool.name), environmentSection)
    const dispatchGuidance = dispatchTool ? formatDispatchToolGuidance(plan.mode) : ""
    const primaryPrompt = dispatchGuidance ? `${dispatchGuidance}\n${primaryPromptBase}` : primaryPromptBase
    timing.report({ sessionId, role: plan.role, workerCount: supportingWorkers.length, mcpServerCount: mcpServers.length })
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
      await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan, projectSupport: summarizeProjectSupport(runtimeSupport), attempt: attempt + 1 }, home)
      await primaryLifecycle.start(selection.configured.id)
      const primaryTaskId = primaryLifecycle.taskId

      const runtime = createBraincodeAgentRuntime({
        mode: plan.mode,
        systemPrompt: getAgentRoleSystemPrompt(plan.role, plan.policy),
        model: plan.model,
        policy: plan.policy,
        sessionId,
        tools: runtimeTools,
        toolEvidenceCache,
        getApiKey: (provider) => (provider === plan.piModel.provider ? apiKey : undefined),
        onEvent: createPhaseEventHandler("primary", toolCallMetrics, request.onEvent),
        onToolApproval: request.onToolApproval,
        permissionPolicy: toolConfig.permissions,
        onPermissionPolicyEvaluation,
        compaction: plan.compaction,
        audit: {
          sessionId,
          home,
          phase: "primary",
          role: plan.role,
          agentSessionId: sessionId,
          taskId: primaryTaskId,
          parentId: plan.context.id,
          attempt: attempt + 1,
          brainId: plan.brain.id,
        },
      })
      mcpLoader.activeRuntimes.add(runtime)
      mcpLoader.refreshRuntimeTools(runtime)
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
        let primarySummary = requireAssistantText(runtime.agent.state.messages, {
          stage: "primary",
          role: plan.role,
          attempt: attempt + 1,
          modelId: selection.configured.id,
          provider: selection.piModel.provider,
          api: selection.configured.api,
        })
        await primaryLifecycle.completed(primarySummary.trim())

        const maxFixIterations = getModePolicy(plan.mode).routing.maxFixIterations
        const fixLoopEligible = plan.role !== "review" && !(request.forceRoles && request.forceRoles.length > 0)
        let recordedMessageCount = runtime.agent.state.messages.length
        let fixIterations = 0
        let checks: PatchCheckSummary | undefined
        let reviewResult: ExecutedWorkerResult | undefined
        let reviewDecision: ReviewDecision | undefined
        // Bounded fix loop: when automated checks fail or review requests
        // changes, re-handoff the failing evidence to the same primary agent
        // (so it keeps its working context) and re-run checks/review. Budget is
        // mode-scoped (auto: 1, radical: 2). `blocked` does not auto-fix.
        while (true) {
          throwIfRunAborted(request.signal)
          // Fold any specialists the primary dispatched (initial turn or a prior
          // fix iteration) into workerResults so review and the final report see
          // them. Idempotent: dispatched results have unique task ids.
          mergeDispatchedResults(workerResults, dispatchedResults)
          const patchAfterPrimary = await collectPatchSummary(cwd, patchBaseline)
          const checkAuditScope: ToolAuditScope = {
            sessionId,
            home,
            phase: "primary",
            role: plan.role,
            agentSessionId: sessionId,
            taskId: primaryTaskId,
            parentId: plan.context.id,
            attempt: attempt + 1,
            brainId: plan.brain.id,
          }
          checks = hasPatchActivity(patchAfterPrimary)
            ? await runPatchChecksWithApproval(cwd, { ...checkOptions, patch: patchAfterPrimary }, {
                mode: plan.mode,
                sessionId,
                attempt: attempt + 1,
                onToolApproval: request.onToolApproval,
                signal: request.signal,
                audit: checkAuditScope,
              })
            : undefined
          if (checks) {
            await appendSessionRecord(sessionId, { type: "check_summary", ...checks, attempt: attempt + 1, fixIteration: fixIterations }, home)
          }
          if (checks?.reviewRequired) {
            plan.agentPlan.requiresReview = true
          }
          const reviewArtifacts: PatchReviewArtifacts | undefined = hasPatchActivity(patchAfterPrimary)
            ? {
                patch: patchAfterPrimary,
                checks,
                diff: await collectPatchDiffSnapshot(cwd),
                untrackedPreviews: await collectUntrackedFilePreviews(cwd, patchAfterPrimary),
              }
            : undefined
          if ((permissionPolicyReviewRequired || checks?.reviewRequired) && plan.role !== "review") {
            const reason = checks?.reviewRequired
              ? checks.reason ?? "Smart check policy requires independent review."
              : "Permission policy requires independent review for this tool call."
            reviewWorker = await ensureReviewWorker(plan, models, home, sessionId, request.onTodoEvent, {
              goal: checks?.reviewRequired
                ? "Review smart-check sensitive changes for correctness, regressions, and safety risks."
                : "Review permission-policy sensitive changes for correctness, regressions, and safety risks.",
              reason,
            })
          }
          const riskTier = hasPatchActivity(patchAfterPrimary)
            ? classifyPatchRiskTier({
                patchKind: classifyPatchKind(patchAfterPrimary),
                permissionReviewRequired: permissionPolicyReviewRequired,
                hasAuthPath: patchHasAuthPath(patchAfterPrimary),
                hasCiPath: patchHasCiPath(patchAfterPrimary),
              })
            : undefined
          const reviewMode = riskTier ? reviewModeForRiskTier(riskTier) : "normal"
          const primaryIndependence = {
            modelId: plan.model.id,
            provider: plan.piModel.provider,
          }
          const plannedReviewer = { modelId: reviewWorker?.model?.id, provider: reviewWorker?.piModel?.provider }
          const reviewChangedFiles = patchAfterPrimary?.changedFiles.map((change) => change.path) ?? []
          reviewResult =
            plan.agentPlan.requiresReview && reviewWorker && plan.role !== "review"
              ? await runWorkerFromPlan({
                  worker: reviewWorker,
                  buildPrompt: (handoff, reviewer) => buildReviewPrompt(
                    effectivePrompt,
                    primarySummary,
                    workerResults,
                    handoff,
                    formatProjectSupportPromptSection(runtimeSupport),
                    reviewArtifacts,
                    environmentSection,
                    {
                      mode: reviewMode,
                      riskTier,
                      independence: evaluateReviewIndependence(primaryIndependence, reviewer),
                    },
                  ),
                  sessionId,
                  home,
                  models,
                  mode: plan.mode,
                  phase: "review",
                  projectSupport: runtimeSupport,
                  hookContext,
                  onWorkerEvent: request.onWorkerEvent,
                  onTodoStatus: onWorkerTodoStatus,
                  promptImages,
                  tools: [...readOnlyTools, ...mcpHub.getTools()],
                  toolEvidenceCache,
                  onEvent: createPhaseEventHandler("review", toolCallMetrics, request.onEvent),
                  signal: request.signal,
                })
              : undefined
          const actualReviewer = reviewResult?.modelId
            ? { modelId: reviewResult.modelId, provider: reviewResult.provider }
            : plannedReviewer
          const reviewIndependence: ReviewIndependence = evaluateReviewIndependence(primaryIndependence, actualReviewer)
          if (reviewArtifacts && plan.agentPlan.requiresReview && reviewWorker && plan.role !== "review") {
            await appendSessionRecord(sessionId, {
              type: "review_artifacts_summary",
              attempt: attempt + 1,
              fixIteration: fixIterations,
              changedFiles: reviewChangedFiles,
              diffTruncated: Boolean(reviewArtifacts.diff?.truncated),
              checksStatus: checks?.status,
              riskTier,
              reviewMode,
              independence: {
                primary: primaryIndependence,
                reviewer: actualReviewer,
                level: reviewIndependence.level,
                sameModel: reviewIndependence.sameModel,
                sameProvider: reviewIndependence.sameProvider,
              },
            }, home)
          }
          reviewDecision = reviewResult
            ? applyCheckGateToReviewDecision(
                reviewResult.reviewDecision ?? normalizeReviewDecisionText(reviewResult.summary, reviewResult),
                checks,
                reviewArtifacts,
                {
                  missingArtifacts: "changes_requested",
                  ...(riskTier ? { riskTier } : {}),
                  ...(reviewChangedFiles.length > 0 ? { changedFiles: reviewChangedFiles } : {}),
                  independence: reviewIndependence,
                },
              )
            : undefined
          if (reviewDecision) {
            reviewDecision = { ...reviewDecision, mode: reviewMode }
          }
          if (reviewResult) {
            reviewResult.reviewDecision = reviewDecision
          }
          if (reviewDecision) {
            await appendSessionRecord(sessionId, { type: "review_decision", ...reviewDecision, attempt: attempt + 1, fixIteration: fixIterations }, home)
          }

          const trigger = fixLoopTrigger(checks, reviewDecision)
          if (!trigger || !fixLoopEligible || fixIterations >= maxFixIterations) break

          fixIterations += 1
          await appendSessionRecord(sessionId, { type: "fix_iteration", iteration: fixIterations, trigger, attempt: attempt + 1 }, home)
          await primaryLifecycle.start(selection.configured.id, {
            goal: `Apply check/review fixes (iteration ${fixIterations})`,
            progressSummary: `fix iteration ${fixIterations}`,
          })
          const fixPrompt = buildPrimaryFixPrompt({ checks, reviewDecision }, fixIterations)
          const unlinkFixAbort = linkRuntimeAbort(runtime, request.signal)
          try {
            throwIfRunAborted(request.signal)
            await runtime.agent.prompt(fixPrompt, promptImages.length > 0 ? promptImages : undefined)
            throwIfRunAborted(request.signal)
          } finally {
            unlinkFixAbort()
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
              recordedMessageCount,
            )
            recordedMessageCount = runtime.agent.state.messages.length
          }
          primarySummary = requireAssistantText(runtime.agent.state.messages, {
            stage: "primary",
            role: plan.role,
            attempt: attempt + 1,
            modelId: selection.configured.id,
            provider: selection.piModel.provider,
            api: selection.configured.api,
          })
          await primaryLifecycle.completed(primarySummary.trim())
        }
        // Push only the final review result so the merger/report reflect the
        // last decision (the loop recomputes review each iteration).
        if (reviewResult) {
          workerResults.push(reviewResult)
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
        const metrics = await buildRunMetrics(sessionId, home, toolCallMetrics.summary)
        await appendToolCallCountRecord(sessionId, home, metrics, attempt + 1)
        const finalReport = buildFinalReport({
          task: request.prompt,
          sessionId,
          plan,
          workerResults,
          modelSummary: primarySummary,
          patch,
          checks,
          planReview: executionPlanReview,
          review: reviewDecision,
          metrics,
          runtimeToolCount: metrics.toolCalls.total,
          fixIterations,
        })
        await appendSessionRecord(sessionId, { type: "final_report", finalReport, attempt: attempt + 1 }, home)
        await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults, patch: hasPatchActivity(patch) ? patch : undefined, checks, reviewDecision, finalReport, fixIterations, attempt: attempt + 1 }, home)
        return { sessionId, summary, finalReport, plan, workerResults, mcp: mcpLoader.report(), patch, checks, reviewDecision, fixIterations }
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
        await primaryLifecycle.failed(message)
        await appendSessionRecord(sessionId, { type: "run_error", error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
        if (request.signal?.aborted) throw createRunAbortedError()
        if (isHandoffRequiredError(error) || isProviderMessageSizeLimitError(error)) {
          await recordAutomaticHandoffIfNeeded(error, sessionId, home)
          break
        }
      }
      finally {
        mcpLoader.activeRuntimes.delete(runtime)
      }
    }

    await updateTodoStatus(plan, todoIdsForRole(plan, plan.role), "failed", "primary", sessionId, home, request.onTodoEvent, { role: plan.role, error: lastError instanceof Error ? lastError.message : String(lastError) })
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  } finally {
    mcpLoader.stop()
    if (ownsMcpHub) mcpHub.shutdown()
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

export async function expandPromptReferences(
  prompt: string,
  projectRoot: string,
  home?: string,
  options: ExpandPromptReferencesOptions = {},
): Promise<ExpandedPromptResult> {
  return expandPromptReferencesBase(prompt, projectRoot, home, {
    ...options,
    ensureSessionHandoff: options.ensureSessionHandoff ?? ((sessionId, callbackHome) =>
      ensureSessionHandoff(sessionId, { trigger: "auto" }, callbackHome)),
  })
}
