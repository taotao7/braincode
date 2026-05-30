import type { AgentEvent, AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
import { Type } from "typebox"
import { getModePolicy, routedAgentRoles, selectBrain, type BrainModel, type BrainPreset, type BraincodeMode, type RoutedAgentRole } from "@braincode/brain"
import { appendSessionRecord, defaultBrains, readBrains, type ProjectSupport } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { debugLog } from "@braincode/shared"
import type { ToolEvidenceCache } from "./evidence-cache"
import type { HookRuntimeContext } from "./hooks"
import { formatWorkerResults } from "./review"
import { createRuntimeWorkerPlan, type RuntimePlan } from "./router"
import { throwIfRunAborted } from "./runtime-agent"
import { readOnlyToolWorkerRoles, runWorkerFromPlan, type ExecutedWorkerResult, type WorkerLifecycleEvent, type WorkerTodoStatusHandler } from "./workers"

// Roles the primary agent may request mid-run through the dispatch tool. This is
// intentionally narrower than the full routed-role set: it excludes `review`
// (the independent review gate runs through its own path after the primary) and
// `rush` (a catch-all with no value as an isolated sub-agent), and `imageMaker`
// (its artifact-writing generation path is a planned-worker concern, not an
// advisory mid-run consultation).
export const dispatchableRoles = routedAgentRoles.filter(
  (role) => role !== "review" && role !== "rush" && role !== "imageMaker",
) as Exclude<RoutedAgentRole, "review" | "rush" | "imageMaker">[]

export type DispatchSpecialistToolOptions = {
  plan: RuntimePlan
  models: BraincodeModel[]
  home: string | undefined
  sessionId: string
  projectSupport: ProjectSupport
  hookContext: HookRuntimeContext
  readOnlyTools: AgentTool[]
  toolEvidenceCache: ToolEvidenceCache
  onWorkerEvent?: (event: WorkerLifecycleEvent) => void | Promise<void>
  onWorkerTodoStatus?: WorkerTodoStatusHandler
  onEvent?: (event: AgentEvent) => void | Promise<void>
  signal?: AbortSignal
  // Sink for results so the orchestrator can fold dispatched worker output into
  // the final report and the review worker's input. Mutated in place.
  dispatchedResults: ExecutedWorkerResult[]
  // Seam for tests: override how a dispatched worker is executed. Defaults to the
  // real isolated worker run. Production code never sets this.
  runWorker?: (role: RoutedAgentRole, goal: string, reason: string, options: DispatchSpecialistToolOptions) => Promise<ExecutedWorkerResult>
}

export type DispatchSpecialistTool = {
  tool: AgentTool
  /** Number of dispatches consumed so far this run. */
  count: () => number
}

const DISPATCH_TOOL_NAME = "dispatch_specialist"

export function dispatchSpecialistMaxForMode(mode: BraincodeMode): number {
  return getModePolicy(mode).routing.maxDynamicDispatches
}

export function formatDispatchToolGuidance(mode: BraincodeMode): string {
  const max = dispatchSpecialistMaxForMode(mode)
  if (max <= 0) return ""
  return [
    "Specialist dispatch:",
    `You can call ${DISPATCH_TOOL_NAME} up to ${max} time(s) this run to get an independent, isolated answer from a specialist agent (${dispatchableRoles.join(", ")}) when you hit a question outside your own role's expertise.`,
    "The specialist runs in its own context: it sees only the goal you write plus the original request, never your private transcript. Write a self-contained goal. Use it for advice/analysis you cannot confidently produce yourself, not for routine work you can do directly.",
    "",
  ].join("\n")
}

export function createDispatchSpecialistTool(options: DispatchSpecialistToolOptions): DispatchSpecialistTool {
  const maxDispatches = dispatchSpecialistMaxForMode(options.plan.mode)
  const allowedRoles = new Set<RoutedAgentRole>(dispatchableRoles)
  let dispatched = 0
  let inflight = 0

  const parameters = Type.Object({
    role: Type.Union(dispatchableRoles.map((role) => Type.Literal(role))),
    goal: Type.String(),
    reason: Type.Optional(Type.String()),
  })

  const tool: AgentTool = {
    name: DISPATCH_TOOL_NAME,
    label: "Dispatch Specialist",
    description: `Request an isolated specialist sub-agent (${dispatchableRoles.join(", ")}) to independently analyze a question and return structured findings. The specialist runs in its own context and only sees the goal you provide plus the original user request, never your transcript. Bounded to ${maxDispatches} call(s) per run. Use only for advice outside your own role; do routine in-role work yourself.`,
    parameters,
    // Brain-mediated, read-only fan-out: dispatched specialists never edit. The
    // tool can run alongside the primary's own read-only calls.
    executionMode: "parallel",
    prepareArguments: (args) => {
      const record = args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : {}
      return {
        role: typeof record.role === "string" ? record.role.trim() : "",
        goal: typeof record.goal === "string" ? record.goal : "",
        reason: typeof record.reason === "string" ? record.reason : undefined,
      } as never
    },
    execute: async (_toolCallId, params) => {
      const input = params as { role: string; goal: string; reason?: string }
      const role = input.role as RoutedAgentRole
      const goal = input.goal?.trim() ?? ""
      const reason = input.reason?.trim() || `Primary ${options.plan.role} agent requested ${role} consultation.`

      if (!allowedRoles.has(role)) {
        return dispatchToolError(`Role "${input.role}" is not dispatchable. Choose one of: ${dispatchableRoles.join(", ")}.`)
      }
      if (!goal) {
        return dispatchToolError("A non-empty, self-contained goal is required so the isolated specialist can act without your transcript.")
      }
      if (maxDispatches <= 0) {
        return dispatchToolError("Specialist dispatch is disabled for this run.")
      }
      // Reserve a slot up front so concurrent calls in one tool batch cannot
      // collectively exceed the budget.
      if (dispatched + inflight >= maxDispatches) {
        return dispatchToolError(`Dispatch budget exhausted: ${dispatched} of ${maxDispatches} specialist dispatch(es) already used this run. Complete the task with the evidence you have.`)
      }
      inflight += 1
      try {
        throwIfRunAborted(options.signal)
        const run = options.runWorker ?? runDispatchedWorker
        const result = await run(role, goal, reason, options)
        dispatched += 1
        options.dispatchedResults.push(result)
        return dispatchToolResult(result, { used: dispatched, max: maxDispatches })
      } finally {
        inflight -= 1
      }
    },
  }

  return { tool, count: () => dispatched }
}

async function runDispatchedWorker(
  role: RoutedAgentRole,
  goal: string,
  reason: string,
  options: DispatchSpecialistToolOptions,
): Promise<ExecutedWorkerResult> {
  const brain = await resolveBrain(options.home, options.plan.brain.id)
  const worker = createRuntimeWorkerPlan({ role, goal, reason }, brain, options.models)
  // Register the worker context as a child of the run so recovery/tracking sees
  // it, mirroring how planned workers are attached in buildRuntimePlan.
  options.plan.context.childContextIds.push(worker.contextId)

  debugLog("runtime", "dynamic dispatch start", {
    role,
    contextId: worker.contextId,
    modelId: worker.model.id,
    primaryRole: options.plan.role,
  })
  await appendSessionRecord(options.sessionId, {
    type: "dynamic_dispatch",
    phase: "request",
    role,
    goal,
    reason,
    contextId: worker.contextId,
    primaryRole: options.plan.role,
  }, options.home)

  // Dispatched specialists are advisory: they get read-only tools only when
  // their role is a read-only evidence role, exactly like planned support
  // workers. They never receive write/execute tools.
  const workerTools = readOnlyToolWorkerRoles.has(role) ? options.readOnlyTools : []
  const result = await runWorkerFromPlan(
    worker,
    (handoff) => buildDispatchWorkerPrompt(options.plan.context.goal, goal, handoff, options.projectSupport),
    options.sessionId,
    options.home,
    options.models,
    options.plan.mode,
    "support",
    options.projectSupport,
    options.hookContext,
    options.onWorkerEvent,
    options.onWorkerTodoStatus,
    [],
    workerTools,
    workerTools.length > 0 ? options.toolEvidenceCache : undefined,
    workerTools.length > 0 ? options.onEvent : undefined,
    options.signal,
  )

  await appendSessionRecord(options.sessionId, {
    type: "dynamic_dispatch",
    phase: "result",
    role,
    contextId: worker.contextId,
    status: result.status,
    summary: result.summary,
  }, options.home)
  return result
}

async function resolveBrain(home: string | undefined, brainId: string): Promise<BrainModel> {
  // Read the configured brains so the dispatched worker selects models through
  // the same role-policy chains as planned workers. Falls back to defaults.
  const brainDocument = await readBrains(home)
  const brains = (brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains) as BrainPreset[]
  return selectBrain(brains, brainId)
}

function buildDispatchWorkerPrompt(originalRequest: string, goal: string, handoff: { task: { id: string; parentId: string } }, projectSupport: ProjectSupport): string {
  const support = formatDispatchProjectSupport(projectSupport)
  return `Run this isolated Braincode specialist consultation requested mid-run by the primary agent.

${support}Original user request:
${originalRequest}

Specialist goal (self-contained; you do not have the primary agent's transcript):
${goal}

You are advisory: analyze and return concrete findings the primary agent can act on. Do not assume access to anything beyond this prompt, allowed context references, and tool results.

Return only JSON in this shape:
{"taskId":"${handoff.task.id}","parentId":"${handoff.task.parentId}","progress":{"status":"completed|blocked","summary":"brief progress"},"summary":"concise actionable findings","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["risk or caveat"],"nextQuestions":["question only if blocked"]}`
}

function formatDispatchProjectSupport(projectSupport: ProjectSupport): string {
  if (!projectSupport.agents) return ""
  return `Project instructions (${projectSupport.agents.path}):\n${projectSupport.agents.content}\n\n`
}

function dispatchToolError(message: string): AgentToolResult<{ tool: string; ok: false; error: string }> {
  return {
    content: [{ type: "text", text: `dispatch_specialist rejected: ${message}` }],
    details: { tool: DISPATCH_TOOL_NAME, ok: false, error: message },
  }
}

function dispatchToolResult(
  result: ExecutedWorkerResult,
  budget: { used: number; max: number },
): AgentToolResult<{ tool: string; ok: true; role: RoutedAgentRole; status: string; budget: { used: number; max: number } }> {
  const header = `Specialist ${result.role} (${result.status}) — dispatch ${budget.used}/${budget.max} used.`
  return {
    content: [{ type: "text", text: `${header}\n\n${formatWorkerResults([result])}` }],
    details: { tool: DISPATCH_TOOL_NAME, ok: true, role: result.role, status: result.status, budget },
  }
}




