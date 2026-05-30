import type { AgentEvent } from "@earendil-works/pi-agent-core"
export type { AgentEvent } from "@earendil-works/pi-agent-core"
import { collectMcpToolServers, McpToolHub, type McpHubConnectReport, type McpLoadingStrategy } from "./mcp"
export { collectMcpToolServers, McpToolHub } from "./mcp"
export type { McpHubConnectReport, McpLoadingStrategy, McpToolServerInput } from "./mcp"
export { demoBenchmarkTasks, evaluateDemoBenchmarkPlan, resolveDemoBenchmarkTasks, runDemoBenchmarkSuite } from "./benchmark"
export type { DemoBenchmarkCheck, DemoBenchmarkCheckStatus, DemoBenchmarkExpectation, DemoBenchmarkPlanRunner, DemoBenchmarkRunOptions, DemoBenchmarkSuiteResult, DemoBenchmarkSuiteSummary, DemoBenchmarkTask, DemoBenchmarkTaskCategory, DemoBenchmarkTaskResult } from "./benchmark"
import { ContextHandoffRequiredError, estimateProviderContextBytes, formatBytes, isHandoffRequiredError, isProviderMessageSizeLimitError } from "./context-budget"
export { ContextHandoffRequiredError, enforceHandoffContextBudget, estimateProviderContextBytes, isHandoffRequiredError, isProviderMessageSizeLimitError } from "./context-budget"
import { createToolEvidenceCache, type ToolEvidenceCacheOptions } from "./evidence-cache"
export { createToolEvidenceCache, wrapToolsWithEvidenceCache } from "./evidence-cache"
export type { ToolEvidenceCache, ToolEvidenceCacheOptions } from "./evidence-cache"
import { runtimeModelRequirementsForRole, selectRuntimeModelCandidatesWithApiKey, selectRuntimeModelWithApiKey, toPiModelSummary } from "./model-selection"
export { selectRuntimeModel } from "./model-selection"
export type { RuntimeModelRequirements, RuntimeModelSelection, RuntimePiModelSummary } from "./model-selection"
import { getAgentRoleSystemPrompt, normalizeAgentTodos, selectBrain, type AgentTodoItem, type AgentTodoStatus, type AgentWorkerPlan, type BrainModel, type BrainPreset, type ModelPolicy, type RoutedAgentRole } from "@braincode/brain"
import { appendSessionRecord, defaultBrains, defaultModels, readAuth, readBrains, readModels, readProjectChecks, readProjectSupport, readSessionContext, readSettings, readTools, readUserSupport, type SessionContext } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { generateImage } from "@braincode/llm"
import { debugLog } from "@braincode/shared"
import { createLocalCodingTools, defaultCheckRunnerConfiguration, mergeCheckRunnerConfiguration, type CheckRunnerConfiguration, type LocalToolMode, type PermissionPolicyEvaluation } from "@braincode/tools"
export type { PermissionPolicyDocument, PermissionPolicyEvaluation, PermissionPolicyMatch } from "@braincode/tools"
import { addHookAdditionalContext, createHookContext, formatStopHookFeedback, runAndRecordHooks, type HookRuntimeContext } from "./hooks"
export { runConfiguredHooks } from "./hooks"
export type { HookPermissionMode, HookRunRecord, HookRunResult, HookRuntimeContext } from "./hooks"
import { runPatchChecksWithApproval, type PatchCheckSummary } from "./checks"
export { classifyPatchKind, patchKindRequiresReview, runPatchChecks, runPatchChecksWithApproval } from "./checks"
export type { PatchCheckOptions, PatchCheckResult, PatchCheckStatus, PatchCheckSummary, PatchKind } from "./checks"
import { collectPatchBaseline, collectPatchDiffSnapshot, collectPatchSummary, collectUntrackedFilePreviews, hasPatchActivity, type PatchSummary } from "./patch"
export { collectPatchBaseline, collectPatchDiffSnapshot, collectPatchSummary, collectUntrackedFilePreviews } from "./patch"
export type { PatchBaseline, PatchDiffSnapshot, PatchFileChange, PatchSummary, UntrackedFilePreview } from "./patch"
import { applyCheckGateToReviewDecision, buildReviewPrompt, mergeReviewResult, normalizeReviewDecisionText, type PatchReviewArtifacts, type ReviewDecision } from "./review"
export { applyCheckGateToReviewDecision, buildReviewPrompt, formatWorkerResults, mergeReviewResult, normalizeReviewDecisionText } from "./review"
export type { PatchReviewArtifacts, ReviewDecision, ReviewDecisionStatus, ReviewFinding, ReviewFindingSeverity } from "./review"
import { expandPromptReferences as expandPromptReferencesBase, formatSessionContext, type ExpandedPromptResult, type ExpandPromptReferencesOptions } from "./prompt-references"
export type { ExpandedPromptResult, ExpandPromptReferencesOptions, PromptReference } from "./prompt-references"
import { buildImageMakerPrompt, saveGeneratedImageArtifact, selectImageMakerModelCandidates } from "./image-maker"
export { buildImageMakerPrompt, imageMakerWorkerResult, saveGeneratedImageArtifact, selectImageMakerModelCandidates } from "./image-maker"
export type { ImageMakerWorkerPlan, ImageMakerWorkerResult } from "./image-maker"
import { buildFinalReport, type FinalReport } from "./final-report"
export { buildFinalReport, resolveFinalReportStatus } from "./final-report"
export type { BuildFinalReportInput, FinalReport, FinalReportStatus } from "./final-report"
import { createBraincodeAgentRuntime, createRunAbortedError, linkRuntimeAbort, recordAgentTokenUsage, recordAutomaticHandoffIfNeeded, requireAssistantText, throwIfRunAborted, type ToolApprovalDecision, type ToolApprovalRequest } from "./runtime-agent"
export { createBraincodeAgentRuntime, extractAssistantText, requireAssistantText } from "./runtime-agent"
export type { BraincodeAgentRuntime, BraincodeAgentRuntimeOptions, TokenUsageScope, ToolApprovalDecision, ToolApprovalRequest } from "./runtime-agent"
import { buildRuntimePlan, createRuntimeWorkerPlan, formatRoleModelCapabilityDirective, normalizeRouterDecision, normalizeRouterModelId, type PlanRuntimeOptions, type RuntimePlan, type RuntimeWorkerPlan } from "./router"
export { buildRuntimePlan, createRuntimeWorkerPlan, formatInputModalityRoutingDirective, formatRoleModelCapabilityDirective, normalizeRouterDecision, normalizeRouterModelId, routePromptWithBrain } from "./router"
export type { PlanRuntimeOptions, RouterPlanDecision, RouterWorkerPlan, RuntimePlan, RuntimeWorkerPlan } from "./router"
import { buildPrimaryPrompt, formatProjectSupportPromptSection, runSupportWorkers, runWorkerFromPlan, summarizeProjectSupport, type ExecutedWorkerResult, type WorkerLifecycleEvent, type WorkerTodoStatusHandler } from "./workers"
export { buildPrimaryPrompt, createWorkerHandoff, formatProjectSupportPromptSection, readOnlyToolWorkerRoles, runSupportWorkers, runWorkerFromPlan } from "./workers"
export type { ExecutedWorkerResult, WorkerLifecycleEvent, WorkerTodoStatusHandler } from "./workers"
import { createRuntimeMcpLoader, DEFAULT_MCP_PER_SERVER_CONNECT_TIMEOUT_MS, DEFAULT_MCP_STARTUP_BUDGET_MS, normalizeRuntimeInteger } from "./mcp-loading"

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
  const brain = selectBrain(brains as BrainPreset[], plan.brain.id) as BrainModel
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
  const candidates = plan.role === "imageMaker"
    ? await selectImageMakerModelCandidates(plan.policy, models, home)
    : await selectRuntimeModelCandidatesWithApiKey(plan.policy, models, home, requirements)

  const projectSupport = await readProjectSupport(cwd)
  const userSupport = await readUserSupport(home)
  const auth = await readAuth(home)
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

  const mcpHub = new McpToolHub()
  const { servers: mcpServers, skipped: mcpSkipped } = collectMcpToolServers({
    userMcp: userSupport.mcp,
    projectMcp: projectSupport.mcp,
    auth,
  })
  const toolConfig = await readTools(home)
  const projectChecks = await readProjectChecks(cwd)
  const checkOptions: CheckRunnerConfiguration = mergeCheckRunnerConfiguration(toolConfig.checks ?? defaultCheckRunnerConfiguration, projectChecks?.config)
  const localToolMode = request.localToolMode ?? (request.onToolApproval ? "all" : "read-only")
  const localTools = createLocalCodingTools({ projectRoot: cwd, tools: toolConfig.tools, mode: localToolMode, ignoreDisabled: request.ignoreDisabledLocalTools, permissionPolicy: toolConfig.permissions })
  const readOnlyTools = createLocalCodingTools({ projectRoot: cwd, tools: toolConfig.tools, mode: "read-only", ignoreDisabled: request.ignoreDisabledLocalTools, permissionPolicy: toolConfig.permissions })
  const toolEvidenceCache = createToolEvidenceCache()
  const runtimeTools = [...localTools]
  let permissionPolicyReviewRequired = false
  const onPermissionPolicyEvaluation = (evaluation: PermissionPolicyEvaluation) => {
    if (evaluation.reviewRequired) {
      permissionPolicyReviewRequired = true
      plan.agentPlan.requiresReview = true
    }
  }
  const mcpLoadingStrategy = request.mcpLoadingStrategy ?? "eager"
  const mcpLoader = createRuntimeMcpLoader({
    hub: mcpHub,
    servers: mcpServers,
    skipped: mcpSkipped,
    strategy: mcpLoadingStrategy,
    startupBudgetMs: normalizeRuntimeInteger(request.mcpStartupBudgetMs, 0, 120_000, DEFAULT_MCP_STARTUP_BUDGET_MS),
    perServerConnectTimeoutMs: normalizeRuntimeInteger(request.mcpPerServerConnectTimeoutMs, 250, 120_000, DEFAULT_MCP_PER_SERVER_CONNECT_TIMEOUT_MS),
    runtimeTools,
    localToolCount: localTools.length,
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
  await mcpLoader.initialize()

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
          const finalReport = buildFinalReport({
            task: request.prompt,
            sessionId,
            plan,
            workerResults,
            modelSummary: primarySummary,
            patch,
            runtimeToolCount: runtimeTools.length,
          })
          await appendSessionRecord(sessionId, { type: "final_report", finalReport, attempt: attempt + 1 }, home)
          await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults, patch: hasPatchActivity(patch) ? patch : undefined, finalReport, attempt: attempt + 1 }, home)
          return { sessionId, summary, finalReport, plan, workerResults, mcp: mcpLoader.report(), patch }
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
        permissionPolicy: toolConfig.permissions,
        onPermissionPolicyEvaluation,
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
          ? await runPatchChecksWithApproval(cwd, { ...checkOptions, patch: patchAfterPrimary }, {
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
        const reviewResult =
          plan.agentPlan.requiresReview && reviewWorker && plan.role !== "review"
            ? await runWorkerFromPlan(reviewWorker, (handoff) => buildReviewPrompt(effectivePrompt, primarySummary, workerResults, handoff, formatProjectSupportPromptSection(projectSupport), reviewArtifacts), sessionId, home, models, plan.mode, "review", projectSupport, hookContext, request.onWorkerEvent, onWorkerTodoStatus, promptImages, readOnlyTools, toolEvidenceCache, request.onEvent, request.signal)
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
        const finalReport = buildFinalReport({
          task: request.prompt,
          sessionId,
          plan,
          workerResults,
          modelSummary: primarySummary,
          patch,
          checks,
          review: reviewDecision,
          runtimeToolCount: runtimeTools.length,
        })
        await appendSessionRecord(sessionId, { type: "final_report", finalReport, attempt: attempt + 1 }, home)
        await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults, patch: hasPatchActivity(patch) ? patch : undefined, checks, reviewDecision, finalReport, attempt: attempt + 1 }, home)
        return { sessionId, summary, finalReport, plan, workerResults, mcp: mcpLoader.report(), patch, checks, reviewDecision }
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
      finally {
        mcpLoader.activeRuntimes.delete(runtime)
      }
    }

    await updateTodoStatus(plan, todoIdsForRole(plan, plan.role), "failed", "primary", sessionId, home, request.onTodoEvent, { role: plan.role, error: lastError instanceof Error ? lastError.message : String(lastError) })
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  } finally {
    mcpLoader.stop()
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
