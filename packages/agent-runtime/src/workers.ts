import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core"
import type { ImageContent } from "@earendil-works/pi-ai"
import { getAgentRoleSystemPrompt, type AgentTodoDependency, type AgentTodoStatus, type BraincodeMode, type RoutedAgentRole } from "@braincode/brain"
import { appendSessionRecord, type ProjectSupport } from "@braincode/config"
import { agentToBrainContextTransfer, brainToAgentContextTransfer, createHandoffAgentMessage, createWorkerResultAgentMessage, type HandoffPacket, type TaskProgress, type WorkerResult } from "@braincode/context"
import { generateImage, type BraincodeModel } from "@braincode/llm"
import type { ContextRef } from "@braincode/protocol"
import { debugLog } from "@braincode/shared"
import { isHandoffRequiredError } from "./context-budget"
import { addHookAdditionalContext, createHookContext, runAndRecordHooks, type HookRuntimeContext } from "./hooks"
import { buildImageMakerPrompt, imageMakerWorkerResult, saveGeneratedImageArtifact, selectImageMakerModelCandidates } from "./image-maker"
import { runtimeModelRequirementsForRole, selectRuntimeModelCandidatesWithApiKey, type RuntimeModelCandidate } from "./model-selection"
import { normalizeReviewDecisionText, formatWorkerResults, type ReviewDecision } from "./review"
import { createBraincodeAgentRuntime, createRunAbortedError, linkRuntimeAbort, recordAgentTokenUsage, recordAutomaticHandoffIfNeeded, requireAssistantText, throwIfRunAborted } from "./runtime-agent"
import type { RuntimePlan, RuntimeWorkerPlan } from "./router"
import type { ToolEvidenceCache } from "./evidence-cache"
import { READ_TOOL_DISCIPLINE, formatReadOnlyToolAccess } from "./tool-discipline"

export type WorkerLifecycleEvent =
  | { type: "worker_start"; role: RoutedAgentRole; goal: string; phase: "primary" | "support" | "review"; modelId: string; handoffId: string; taskId: string; parentId: string; progress: TaskProgress; todoIds?: string[] }
  | { type: "worker_end"; role: RoutedAgentRole; phase: "primary" | "support" | "review"; status: "completed" | "blocked" | "failed"; handoffId: string; taskId: string; parentId: string; progress: TaskProgress; summary?: string; error?: string; todoIds?: string[] }

export type ExecutedWorkerResult = WorkerResult & {
  role: RoutedAgentRole
  goal: string
  todoIds: string[]
  status: "completed" | "blocked" | "failed"
  error?: string
  reviewDecision?: ReviewDecision
}

export type WorkerTodoStatusHandler = (
  worker: RuntimeWorkerPlan,
  phase: "support" | "review",
  status: AgentTodoStatus,
  detail?: { summary?: string; error?: string },
) => void | Promise<void>

export const readOnlyToolWorkerRoles = new Set<RoutedAgentRole>(["librarian", "qa", "security", "review"])

const MAX_INLINE_PROJECT_SUPPORT_CHARS = 64_000
const MAX_INLINE_AGENTS_CHARS = 32_000
const MAX_INLINE_SKILLS = 12
const MAX_INLINE_SKILL_CHARS = 8_000

export function createWorkerHandoff(worker: RuntimeWorkerPlan, parentId: string, phase: "support" | "review", projectSupport?: ProjectSupport): HandoffPacket {
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

export function formatProjectSupportPromptSection(projectSupport?: ProjectSupport): string {
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
        "Local skills (.agents/skills):",
        ...inlineSkills.map((skill) => `### ${skill.id} (${skill.path})\n${clipPromptText(skill.content, `skill:${skill.id}`, MAX_INLINE_SKILL_CHARS)}`),
        omittedCount > 0 ? `[${omittedCount} additional local skill file(s) omitted from inline prompt context. Use project files/tools if their full content is needed.]` : "",
      ].join("\n\n"),
    )
  }
  return `${clipPromptText(sections.join("\n\n"), "project support context", MAX_INLINE_PROJECT_SUPPORT_CHARS)}\n`
}

export function summarizeProjectSupport(projectSupport: ProjectSupport) {
  return {
    root: projectSupport.root,
    agents: projectSupport.agents?.path,
    mcp: projectSupport.mcp ? { path: projectSupport.mcp.path, serverNames: projectSupport.mcp.serverNames } : undefined,
    skills: projectSupport.skills.map((skill) => ({ id: skill.id, path: skill.path })),
  }
}

// User-facing response guidance for the primary agent only. Support workers and
// dispatched specialists return strict JSON, so this lives here rather than in
// the shared role prompt where it would conflict with their output contract.
const PRIMARY_RESPONSE_GUIDANCE = "Response style:\nKeep responses proportional to the task: answer simple questions directly, and reserve headers, bullet lists, and step-by-step breakdowns for genuinely multi-part work. Lead with the result, explain reasoning only where it matters, and do not pad with restatements or filler. Reply in the language the user used.\n"

export function buildPrimaryPrompt(originalPrompt: string, workerResults: ExecutedWorkerResult[], primaryRole: RoutedAgentRole, projectSupport?: ProjectSupport, toolNames: string[] = [], environmentSection = ""): string {
  const supportContext = formatProjectSupportPromptSection(projectSupport)
  const toolContext = formatPrimaryToolContext(toolNames)
  const header = `${environmentSection}${supportContext}${toolContext}${PRIMARY_RESPONSE_GUIDANCE}`
  if (workerResults.length === 0) {
    return `${header}\nUser request:\n${originalPrompt}`
  }

  return `${header}
User request:
${originalPrompt}

Supporting worker results:
${formatWorkerResults(workerResults)}

Complete the request as the primary ${primaryRole} agent. Treat worker results as advisory context, resolve conflicts explicitly, and produce the final user-facing result.`
}

export async function runWorkerFromPlan(
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
    candidates = worker.role === "imageMaker"
      ? await selectImageMakerModelCandidates(worker.policy, models, home)
      : await selectRuntimeModelCandidatesWithApiKey(worker.policy, models, home, requirements)
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
      compaction: worker.compaction,
    })
    const unlinkAbort = linkRuntimeAbort(runtime, signal)

    try {
      const workerPrompt = addHookAdditionalContext(
        applyWorkerMcpToolContext(buildPrompt(handoff), tools),
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

/**
 * Continuous-concurrency worker pool. Keeps up to `limit` workers in flight and
 * refills a freed slot the instant any worker settles, instead of waiting for a
 * whole wave to finish. A pending worker is launched only when `isReady` returns
 * true for it; when no worker is in flight and none is ready, the remaining
 * pending workers are blocked via `onBlocked` (dependency deadlock or cycle).
 *
 * Results are written back at the worker's original index so the returned array
 * preserves input order regardless of completion order. Blocked workers are
 * recorded at their index via `onBlocked`, so they remain in the returned array.
 */
export async function runWorkerPool(options: {
  count: number
  limit: number
  isReady: (index: number, results: ReadonlyArray<ExecutedWorkerResult | undefined>) => boolean
  runWorker: (index: number, priorResults: ExecutedWorkerResult[]) => Promise<ExecutedWorkerResult>
  onBlocked: (index: number, results: ExecutedWorkerResult[]) => Promise<ExecutedWorkerResult>
  throwIfAborted?: () => void
}): Promise<ExecutedWorkerResult[]> {
  const { count, isReady, runWorker, onBlocked, throwIfAborted } = options
  const limit = Math.max(1, Math.min(count, Math.floor(options.limit)))
  const results = new Array<ExecutedWorkerResult | undefined>(count)
  const pending = new Set<number>()
  for (let index = 0; index < count; index++) pending.add(index)
  const inflight = new Map<number, Promise<number>>()

  const launch = (index: number) => {
    pending.delete(index)
    const priorResults = results.filter((result): result is ExecutedWorkerResult => Boolean(result))
    const settled = runWorker(index, priorResults).then((result) => {
      results[index] = result
      return index
    })
    inflight.set(index, settled)
  }

  while (pending.size > 0 || inflight.size > 0) {
    throwIfAborted?.()
    while (inflight.size < limit) {
      const next = Array.from(pending).find((index) => isReady(index, results))
      if (next === undefined) break
      launch(next)
    }
    if (inflight.size === 0) {
      // No worker is running and none is ready: the remaining pending workers
      // have unsatisfiable dependencies (failed/blocked upstream or a cycle).
      for (const index of Array.from(pending)) {
        pending.delete(index)
        const priorResults = results.filter((result): result is ExecutedWorkerResult => Boolean(result))
        results[index] = await onBlocked(index, priorResults)
      }
      break
    }
    const finished = await Promise.race(inflight.values())
    inflight.delete(finished)
  }

  return results.filter((result): result is ExecutedWorkerResult => Boolean(result))
}

export async function runSupportWorkers(
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
  getMcpTools: () => AgentTool[] = () => [],
  environmentSection = "",
): Promise<ExecutedWorkerResult[]> {
  throwIfRunAborted(signal)
  if (workers.length === 0) return []
  void toolExecution // tool execution governs intra-agent tool calls; worker dependency scheduling is Brain-mediated.

  const limit = Number.isFinite(concurrencyCap) && (concurrencyCap as number) > 0
    ? Math.min(workers.length, Math.floor(concurrencyCap as number))
    : workers.length
  const todoOwnerById = new Map<string, number>()
  for (const [index, worker] of workers.entries()) {
    for (const todoId of worker.todoIds ?? []) {
      todoOwnerById.set(todoId, index)
    }
  }

  // A worker is ready when every dependency edge into one of its todos has an
  // upstream owner that has already completed. `results[owner]?.status` is only
  // set once that worker settles, so a `completed` upstream is necessarily both
  // settled and successful; a failed/blocked upstream keeps the dependent
  // pending until the pool detects the deadlock and blocks it.
  const isReady = (index: number, results: ReadonlyArray<ExecutedWorkerResult | undefined>): boolean => {
    const workerTodoIds = new Set(workers[index]?.todoIds ?? [])
    if (workerTodoIds.size === 0) return true
    return dependencies.every((dependency) => {
      if (!workerTodoIds.has(dependency.toTodoId)) return true
      const owner = todoOwnerById.get(dependency.fromTodoId)
      return owner !== undefined && (owner === index || results[owner]?.status === "completed")
    })
  }

  const runWorker = (index: number, priorResults: ExecutedWorkerResult[]): Promise<ExecutedWorkerResult> => {
    const worker = workers[index]!
    const localSet = readOnlyToolWorkerRoles.has(worker.role) ? readOnlyTools : []
    const workerTools = [...localSet, ...getMcpTools()]
    return runWorkerFromPlan(
      worker,
      (handoff) => buildSupportWorkerPrompt(originalPrompt, handoff, projectSupport, priorResults, environmentSection),
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
  }

  const onBlocked = async (index: number): Promise<ExecutedWorkerResult> => {
    const reason = "Worker dependency graph is blocked or cyclic; no pending worker has all upstream todos completed successfully."
    const worker = workers[index]!
    const result = blockedWorkerResult(worker, sessionId, reason)
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
    return result
  }

  return runWorkerPool({
    count: workers.length,
    limit,
    isReady,
    runWorker,
    onBlocked,
    throwIfAborted: () => throwIfRunAborted(signal),
  })
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

function clipPromptText(text: string, label: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[${label} truncated at ${maxChars}/${text.length} chars; use project files/tools to inspect the remaining content if needed.]`
}

function buildSupportWorkerPrompt(originalPrompt: string, handoff: HandoffPacket, projectSupport?: ProjectSupport, priorResults: ExecutedWorkerResult[] = [], environmentSection = ""): string {
  const supportContext = formatProjectSupportPromptSection(projectSupport)
  const priorResultContext = priorResults.length > 0
    ? `\nBrain-supplied prior worker results for dependencies:\n${formatWorkerResults(priorResults)}\n`
    : ""
  const toolContext = readOnlyToolWorkerRoles.has(handoff.task.agentRole as RoutedAgentRole)
    ? `\n${formatReadOnlyToolAccess()}\n`
    : ""
  return `Run this isolated Braincode worker handoff.

${environmentSection}${supportContext}
Original user request:
${originalPrompt}
${priorResultContext}
${toolContext}

Handoff packet:
${JSON.stringify(handoff, null, 2)}

Return only JSON in this shape:
{"taskId":"${handoff.task.id}","parentId":"${handoff.task.parentId}","progress":{"status":"completed|blocked","summary":"brief progress"},"summary":"concise actionable result","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["risk or caveat"],"nextQuestions":["question only if blocked"]}`
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
  const hasWebSearch = names.includes("web_search")
  const mcpToolNames = names.filter((name) => name.startsWith("mcp__") && name !== "mcp__connect")
  const onlineGuidanceLines: string[] = []
  if (hasWebSearch) {
    onlineGuidanceLines.push(
      "Web search is available through web_search. For live or external facts (weather, news, prices, current events, anything past your training cutoff, or an explicit request to look something up), call web_search instead of saying you cannot browse the internet.",
    )
  } else if (names.includes("mcp__connect")) {
    onlineGuidanceLines.push(
      "MCP servers are still connecting. If the user needs live/online facts and no web_search tool is listed yet, call mcp__connect first to finish loading MCP tools, then use the connected tool.",
    )
  }
  if (mcpToolNames.length > 0) {
    onlineGuidanceLines.push(`Connected MCP tools usable directly: ${mcpToolNames.join(", ")}.`)
    onlineGuidanceLines.push(...formatMcpUsageGuidance(mcpToolNames))
  }
  if (hasWebSearch || mcpToolNames.length > 0 || names.includes("mcp__connect")) {
    onlineGuidanceLines.push(
      "Do not read ~/.braincode config files (mcp.json, auth.json) or other paths outside the project to discover capabilities; the tools listed here are already what you can call.",
    )
  }
  return [
    "Runtime tool access:",
    `Available tools: ${names.join(", ")}`,
    executeGuidance,
    ...onlineGuidanceLines,
    "Tool-use discipline: gather context with the fewest calls. " + READ_TOOL_DISCIPLINE + " State-changing tools (edits, shell, scripts) still run one at a time.",
    "If a tool call is blocked or fails, report the concrete tool result or block reason.",
    "",
  ].join("\n")
}

// Capability-aware guidance for connected MCP servers. The plain tool list does
// not tell the model *when* to reach for a browser or a renderer, so it tends to
// reason from source instead of driving the tools. We key off the server name
// embedded in `mcp__<server>__<tool>` and emit one concrete line per connected
// server (specific copy for servers we know, a generic nudge otherwise). Only
// servers actually connected this run produce lines, so the guidance never
// references a capability that is not available.
export function formatMcpUsageGuidance(mcpToolNames: string[]): string[] {
  const servers = new Set<string>()
  for (const name of mcpToolNames) {
    const match = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(name)
    const server = match?.[1]
    if (server && server !== "connect") servers.add(server)
  }
  const lines: string[] = []
  for (const server of [...servers].sort()) {
    const normalized = server.toLowerCase().replace(/[-_]/g, "")
    if (normalized.includes("chromedevtools") || normalized === "chrome" || normalized.includes("playwright") || normalized.includes("puppeteer")) {
      lines.push(`A real browser is connected via the '${server}' MCP server. To verify or review UI, layout, or visual/runtime behavior, navigate to the running app and take a snapshot or screenshot with these tools instead of reasoning only from source.`)
    } else if (normalized.includes("blender")) {
      lines.push(`A Blender instance is connected via the '${server}' MCP server. For 3D modeling, scene, or render tasks, drive Blender with these tools to produce the actual artifact rather than only describing what to build.`)
    } else if (normalized.includes("figma") || normalized.includes("opendesign")) {
      lines.push(`A design tool is connected via the '${server}' MCP server. When the task involves inspecting or producing designs, use these tools to read or edit the real design rather than guessing.`)
    } else {
      lines.push(`The '${server}' MCP server is connected and exposes real capabilities; when the task matches what it does, prefer calling its tools over reasoning from source alone.`)
    }
  }
  return lines
}

// Workers receive their tool list directly (not via the primary's tool-context
// block), so any connected MCP tools they get need the same "when to use this"
// framing appended to their handoff prompt. No-op when the worker has no MCP
// tools this run.
export function applyWorkerMcpToolContext(prompt: string, tools: AgentTool[]): string {
  const mcpToolNames = tools
    .map((tool) => tool.name)
    .filter((name) => name.startsWith("mcp__") && name !== "mcp__connect")
  if (mcpToolNames.length === 0) return prompt
  const names = [...new Set(mcpToolNames)].sort()
  const lines = [
    "Connected MCP tools available to you this run:",
    `${names.join(", ")}.`,
    ...formatMcpUsageGuidance(names),
    "",
  ]
  return `${lines.join("\n")}\n${prompt}`
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

function workerResultStatus(result: WorkerResult): ExecutedWorkerResult["status"] {
  if (result.progress.status === "failed") return "failed"
  if (result.progress.status === "blocked") return "blocked"
  return "completed"
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
  return JSON.parse(candidate)
}
