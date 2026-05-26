import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core"
import type { Model } from "@earendil-works/pi-ai"
import { formatRoutedAgentRoleCatalog, getAgentRoleSystemPrompt, getModePolicy, planAgentRouting, selectBrain, selectModelPolicy, type AgentRole, type AgentRoutingPlan, type AgentWorkerPlan, type BrainModel, type BraincodeMode, type ModelPolicy, type RoutedAgentRole } from "@braincode/brain"
import { appendSessionRecord, defaultBrains, defaultModels, readBrains, readModels, readProviderApiKey, readSettings } from "@braincode/config"
import type { HandoffPacket, WorkerResult } from "@braincode/context"
import type { BraincodeModel } from "@braincode/llm"
import { resolveBuiltInPiModel } from "@braincode/llm"
import type { ContextRef } from "@braincode/protocol"
import { debugLog } from "@braincode/shared"

export type AgentRunRequest = {
  prompt: string
  sessionId?: string
}

export type AgentRunResult = {
  sessionId: string
  summary: string
  plan: RuntimePlan
  workerResults: ExecutedWorkerResult[]
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
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined
  onEvent?: (event: AgentEvent) => void | Promise<void>
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
  status: "completed" | "failed"
  error?: string
}

export type RuntimePlan = {
  mode: BraincodeMode
  modeDescription: string
  brain: Pick<BrainModel, "id" | "name" | "description">
  role: RoutedAgentRole
  agentPlan: AgentRoutingPlan
  workers: RuntimeWorkerPlan[]
  routing: {
    source: "router-brain" | "heuristic"
    confidence?: number
    reason?: string
  }
  model: BraincodeModel
  policy: ModelPolicy
  piModel: RuntimePiModelSummary
  toolExecution: "sequential" | "parallel"
}

type RouterPlanDecision = AgentRoutingPlan & {
  confidence?: number
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
  const modelIds = [policy.modelId, ...(policy.fallbackModelIds ?? [])].filter((modelId, index, values) => modelId && values.indexOf(modelId) === index)
  const errors: string[] = []
  const candidates: Array<{ selection: RuntimeModelSelection; apiKey: string }> = []

  for (const modelId of modelIds) {
    try {
      const selection = selectRuntimeModel({ ...policy, modelId, fallbackModelIds: [] }, models)
      const apiKey = await readProviderApiKey(selection.piModel.provider, home)
      if (!apiKey) {
        errors.push(`${modelId}: missing API key for provider '${selection.piModel.provider}'`)
        continue
      }
      candidates.push({ selection, apiKey })
    } catch (error) {
      errors.push(`${modelId}: ${error instanceof Error ? error.message : String(error)}`)
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
      tools: [],
      messages: [],
    },
    getApiKey: options.getApiKey,
    toolExecution: options.mode === "radical" ? "parallel" : "sequential",
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

function normalizeRuntimeThinkingLevel(model: BraincodeModel, policy: ModelPolicy): ModelPolicy["thinkingLevel"] {
  if (model.baseUrl && policy.thinkingLevel === "minimal") return "low"
  return policy.thinkingLevel
}

function isRoutedAgentRole(value: unknown): value is RoutedAgentRole {
  return isAgentRole(value) && value !== "routeBrain"
}

function isAgentRole(value: unknown): value is AgentRole {
  return value === "coding" || value === "frontend" || value === "backend" || value === "designer" || value === "dba" || value === "devops" || value === "security" || value === "qa" || value === "research" || value === "review" || value === "summarize" || value === "fastReply" || value === "oracle" || value === "librarian" || value === "rush" || value === "routeBrain"
}

function normalizeRouterDecision(value: { role?: unknown; workers?: unknown; confidence?: unknown; reason?: unknown }, fallback: AgentRoutingPlan, maxWorkers: number): RouterPlanDecision {
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

  return {
    primaryRole,
    workers: cappedWorkers,
    requiresReview: fallback.requiresReview,
    confidence: typeof value.confidence === "number" ? value.confidence : undefined,
    reason: typeof value.reason === "string" && value.reason.trim() ? value.reason : fallback.reason,
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
  return JSON.parse(candidate)
}

async function routePromptWithBrain(prompt: string, brain: BrainModel, models: BraincodeModel[], mode: BraincodeMode, fallback: AgentRoutingPlan, home?: string): Promise<RouterPlanDecision | undefined> {
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

    await runtime.agent.prompt(`Choose the best primary role and any useful worker agents for this user prompt.

Allowed roles:
${formatRoutedAgentRoleCatalog()}

Return only JSON in this shape:
{"role":"coding|frontend|backend|designer|dba|devops|security|qa|research|review|summarize|fastReply|oracle|librarian|rush","workers":[{"role":"coding|frontend|backend|designer|dba|devops|security|qa|research|review|summarize|fastReply|oracle|librarian|rush","goal":"short worker goal","reason":"short reason"}],"confidence":0.0,"reason":"short reason"}

Constraints:
- Pick exactly one primary role in "role".
- Include only workers that would materially improve the task.
- Do not include routeBrain as a role.
- Prefer no more than ${brain.routing.maxParallelAgents} workers.
- If implementation is needed, include coding as a worker and usually as the primary role.

User prompt:
${prompt}`)

    const text = extractAssistantText(runtime.agent.state.messages)
    const parsed = extractJsonObject(text) as { role?: unknown; workers?: unknown; confidence?: unknown; reason?: unknown }

    const decision = normalizeRouterDecision(parsed, fallback, brain.routing.maxParallelAgents)
    debugLog("runtime", "router brain selected role", decision)
    return decision
  } catch (error) {
    debugLog("runtime", "router brain failed; falling back to heuristic", { error: error instanceof Error ? error.message : String(error) })
    return undefined
  }
}

async function buildRuntimePlan(prompt: string, home: string | undefined, useRouterBrain: boolean): Promise<RuntimePlan> {
  const [settings, brainDocument, modelDocument] = await Promise.all([readSettings(home), readBrains(home), readModels(home)])
  const brains = brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains
  const models = modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models
  const brain = selectBrain(brains as BrainModel[], settings.defaultBrainId)
  const heuristicPlan = planAgentRouting(prompt, brain)
  const routerDecision = useRouterBrain ? await routePromptWithBrain(prompt, brain, models as BraincodeModel[], settings.mode, heuristicPlan, home) : undefined
  const agentPlan = routerDecision ?? heuristicPlan
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
  const workers = runtimeWorkerInputs.map((worker) => createRuntimeWorkerPlan(worker, brain, models as BraincodeModel[]))
  const modePolicy = getModePolicy(settings.mode)
  const routing = routerDecision
    ? { source: "router-brain" as const, confidence: routerDecision.confidence, reason: routerDecision.reason }
    : { source: "heuristic" as const, reason: useRouterBrain ? "router brain unavailable or failed" : "dry-run/default heuristic route" }
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

function createWorkerHandoff(worker: RuntimeWorkerPlan): HandoffPacket {
  return {
    id: crypto.randomUUID(),
    goal: worker.goal,
    constraints: [
      `Run as the ${worker.role} agent only.`,
      "Use only this handoff, the original user request, and explicit worker results supplied in the prompt.",
      "Do not assume access to the full root transcript or another worker's private chain of thought.",
      "Return concise structured findings for the primary Braincode agent.",
    ],
    contextRefs: [],
    expectedResult: "JSON with summary, artifacts, risks, and nextQuestions.",
  }
}

function buildSupportWorkerPrompt(originalPrompt: string, handoff: HandoffPacket): string {
  return `Run this isolated Braincode worker handoff.

Original user request:
${originalPrompt}

Handoff packet:
${JSON.stringify(handoff, null, 2)}

Return only JSON in this shape:
{"summary":"concise actionable result","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["risk or caveat"],"nextQuestions":["question only if blocked"]}`
}

function buildPrimaryPrompt(originalPrompt: string, workerResults: ExecutedWorkerResult[], primaryRole: RoutedAgentRole): string {
  if (workerResults.length === 0) return originalPrompt

  return `User request:
${originalPrompt}

Supporting worker results:
${formatWorkerResults(workerResults)}

Complete the request as the primary ${primaryRole} agent. Treat worker results as advisory context, resolve conflicts explicitly, and produce the final user-facing result.`
}

function buildReviewPrompt(originalPrompt: string, primarySummary: string, workerResults: ExecutedWorkerResult[], handoff: HandoffPacket): string {
  return `Review this Braincode run as an isolated review agent.

Original user request:
${originalPrompt}

Primary agent result:
${primarySummary}

Supporting worker results:
${workerResults.length > 0 ? formatWorkerResults(workerResults) : "No supporting worker results."}

Handoff packet:
${JSON.stringify(handoff, null, 2)}

Return only JSON in this shape:
{"summary":"review findings or clear statement that no concrete issue was found","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["confirmed risk"],"nextQuestions":["question only if blocked"]}`
}

function formatWorkerResults(workerResults: ExecutedWorkerResult[]): string {
  return workerResults
    .map((result) => {
      const risks = result.risks.length > 0 ? `\nRisks:\n${result.risks.map((risk) => `- ${risk}`).join("\n")}` : ""
      const questions = result.nextQuestions.length > 0 ? `\nOpen questions:\n${result.nextQuestions.map((question) => `- ${question}`).join("\n")}` : ""
      return `### ${result.role} (${result.status})\nGoal: ${result.goal}\nSummary: ${result.summary}${risks}${questions}`
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

function normalizeWorkerResultText(text: string, handoff: HandoffPacket): WorkerResult {
  try {
    const parsed = extractJsonObject(text)
    if (parsed && typeof parsed === "object") {
      const record = parsed as { summary?: unknown; artifacts?: unknown; risks?: unknown; nextQuestions?: unknown }
      return {
        handoffId: handoff.id,
        summary: typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : text.trim(),
        artifacts: normalizeContextRefs(record.artifacts),
        risks: normalizeStringArray(record.risks),
        nextQuestions: normalizeStringArray(record.nextQuestions),
      }
    }
  } catch {
    // Plain-text worker responses are accepted so provider drift does not break orchestration.
  }

  return {
    handoffId: handoff.id,
    summary: text.trim() || "(empty worker response)",
    artifacts: [],
    risks: [],
    nextQuestions: [],
  }
}

function failedWorkerResult(worker: RuntimeWorkerPlan, handoff: HandoffPacket, error: unknown): ExecutedWorkerResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    handoffId: handoff.id,
    role: worker.role,
    goal: worker.goal,
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
): Promise<ExecutedWorkerResult> {
  const handoff = createWorkerHandoff(worker)
  let candidates: Array<{ selection: RuntimeModelSelection; apiKey: string }>

  try {
    candidates = await selectRuntimeModelCandidatesWithApiKey(worker.policy, models, home)
  } catch (error) {
    const result = failedWorkerResult(worker, handoff, error)
    await appendSessionRecord(sessionId, { type: "worker_error", phase, worker: worker.role, handoff, error: result.error }, home)
    return result
  }

  let lastError: unknown
  for (const [attempt, { selection, apiKey }] of candidates.entries()) {
    await appendSessionRecord(sessionId, { type: "worker_start", phase, worker: worker.role, goal: worker.goal, handoff, model: selection.configured.id, attempt: attempt + 1 }, home)
    const runtime = createBraincodeAgentRuntime({
      mode,
      systemPrompt: getAgentRoleSystemPrompt(worker.role, worker.policy),
      model: selection.configured,
      policy: worker.policy,
      sessionId: `${sessionId}-${phase}-${worker.role}-${attempt + 1}`,
      getApiKey: (provider) => (provider === selection.piModel.provider ? apiKey : undefined),
    })

    try {
      await runtime.agent.prompt(buildPrompt(handoff))
      const text = extractAssistantText(runtime.agent.state.messages)
      const result = normalizeWorkerResultText(text, handoff)
      const executed: ExecutedWorkerResult = { ...result, role: worker.role, goal: worker.goal, status: "completed" }
      await appendSessionRecord(sessionId, { type: "worker_end", phase, worker: worker.role, result: executed, attempt: attempt + 1 }, home)
      return executed
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      await appendSessionRecord(sessionId, { type: "worker_error", phase, worker: worker.role, error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
    }
  }

  return failedWorkerResult(worker, handoff, lastError)
}

async function runSupportWorkers(
  workers: RuntimeWorkerPlan[],
  originalPrompt: string,
  sessionId: string,
  home: string | undefined,
  models: BraincodeModel[],
  mode: BraincodeMode,
  toolExecution: RuntimePlan["toolExecution"],
): Promise<ExecutedWorkerResult[]> {
  if (workers.length === 0) return []
  if (toolExecution === "parallel" && workers.length > 1) {
    return Promise.all(workers.map((worker) => runWorkerFromPlan(worker, (handoff) => buildSupportWorkerPrompt(originalPrompt, handoff), sessionId, home, models, mode, "support")))
  }

  const results: ExecutedWorkerResult[] = []
  for (const worker of workers) {
    results.push(await runWorkerFromPlan(worker, (handoff) => buildSupportWorkerPrompt(originalPrompt, handoff), sessionId, home, models, mode, "support"))
  }
  return results
}

function mergeReviewResult(summary: string, review: ExecutedWorkerResult | undefined): string {
  if (!review) return summary
  const risks = review.risks.length > 0 ? `\nRisks:\n${review.risks.map((risk) => `- ${risk}`).join("\n")}` : ""
  return `${summary}\n\nReview:\n${review.summary}${risks}`
}

export async function executePromptFromConfig(request: AgentRunRequest, home?: string): Promise<AgentRunResult> {
  const plan = await buildRuntimePlan(request.prompt, home, true)
  const modelDocument = await readModels(home)
  const models = (modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models) as BraincodeModel[]
  const candidates = await selectRuntimeModelCandidatesWithApiKey(plan.policy, models, home)

  const sessionId = request.sessionId ?? crypto.randomUUID()
  const supportingWorkers = plan.workers.filter((worker) => worker.role !== plan.role && worker.role !== "review")
  const reviewWorker = plan.workers.find((worker) => worker.role === "review")
  const workerResults = await runSupportWorkers(supportingWorkers, request.prompt, sessionId, home, models, plan.mode, plan.toolExecution)
  const primaryPrompt = buildPrimaryPrompt(request.prompt, workerResults, plan.role)

  let lastError: unknown
  for (const [attempt, { selection, apiKey }] of candidates.entries()) {
    plan.model = selection.configured
    plan.piModel = toPiModelSummary(selection)
    await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan, attempt: attempt + 1 }, home)

    const runtime = createBraincodeAgentRuntime({
      mode: plan.mode,
      systemPrompt: getAgentRoleSystemPrompt(plan.role, plan.policy),
      model: plan.model,
      policy: plan.policy,
      sessionId,
      getApiKey: (provider) => (provider === plan.piModel.provider ? apiKey : undefined),
    })

    try {
      await runtime.agent.prompt(primaryPrompt)
      const primarySummary = extractAssistantText(runtime.agent.state.messages)
      const reviewResult =
        plan.agentPlan.requiresReview && reviewWorker && plan.role !== "review"
          ? await runWorkerFromPlan(reviewWorker, (handoff) => buildReviewPrompt(request.prompt, primarySummary, workerResults, handoff), sessionId, home, models, plan.mode, "review")
          : undefined
      if (reviewResult) workerResults.push(reviewResult)

      const summary = mergeReviewResult(primarySummary, reviewResult)
      await appendSessionRecord(sessionId, { type: "run_end", summary, workerResults, attempt: attempt + 1 }, home)
      return { sessionId, summary, plan, workerResults }
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      await appendSessionRecord(sessionId, { type: "run_error", error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
