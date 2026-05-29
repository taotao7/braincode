import type { ImageContent } from "@earendil-works/pi-ai"
import { createAgentTodoId, formatRoutedAgentRoleCatalog, getAgentRoleSystemPrompt, getModePolicy, getModeRoutingLimits, normalizeAgentRoutingPlan, planAgentRouting, routedAgentRoles, selectBrain, selectModelPolicy, type AgentRole, type AgentRoutingPlan, type AgentTodoDependency, type AgentTodoItem, type AgentWorkerPlan, type BrainModel, type BrainPreset, type BraincodeMode, type ModePolicy, type ModeRoutingLimits, type ModelPolicy, type RoutedAgentRole } from "@braincode/brain"
import { defaultBrains, defaultModels, readBrains, readModels, readSettings } from "@braincode/config"
import { createBrainTaskContext, type BrainTaskContext } from "@braincode/context"
import type { BraincodeModel } from "@braincode/llm"
import { isImageGenerationModel } from "@braincode/llm"
import { debugLog } from "@braincode/shared"
import { runtimeModelRequirementsForImages, runtimeModelRequirementsForRole, selectRuntimeModel, selectRuntimeModelWithApiKey, toPiModelSummary, type RuntimeModelRequirements, type RuntimePiModelSummary } from "./model-selection"
import { createBraincodeAgentRuntime, recordAgentTokenUsage, requireAssistantText } from "./runtime-agent"

export type RuntimeWorkerPlan = AgentWorkerPlan & {
  contextId: string
  model: BraincodeModel
  policy: ModelPolicy
  piModel: RuntimePiModelSummary
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

export type RouterWorkerPlan = AgentWorkerPlan & {
  modelId?: string
}

export type RouterPlanDecision = Omit<AgentRoutingPlan, "workers"> & {
  workers: RouterWorkerPlan[]
  confidence?: number
  modelId?: string
}

export function createRuntimeWorkerPlan(worker: AgentWorkerPlan, brain: BrainModel, models: BraincodeModel[], requirements?: RuntimeModelRequirements, policyOverride?: ModelPolicy): RuntimeWorkerPlan {
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

export function formatInputModalityRoutingDirective(images: ImageContent[]): string {
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

export async function routePromptWithBrain(prompt: string, brain: BrainModel, models: BraincodeModel[], mode: BraincodeMode, modePolicy: ModePolicy, routingLimits: ModeRoutingLimits, fallback: AgentRoutingPlan, images: ImageContent[] = [], home?: string, usageSessionId?: string): Promise<RouterPlanDecision | undefined> {
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
- Runtime order is support workers first, then the primary role, then optional review. Support-worker todos cannot depend on primary-role or review todos.

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
- Do not create primary-role-to-support-worker dependencies; if support work needs planning or constraints, assign that upstream todo to another support role.
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

export async function buildRuntimePlan(prompt: string, home: string | undefined, useRouterBrain: boolean, forceRoles?: RoutedAgentRole[], images: ImageContent[] = [], brainContextId: string = crypto.randomUUID(), usageSessionId?: string): Promise<RuntimePlan> {
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

function isRoutedAgentRole(value: unknown): value is RoutedAgentRole {
  return isAgentRole(value) && value !== "routeBrain" && value !== "pet"
}

function isAgentRole(value: unknown): value is AgentRole {
  return value === "frontend" || value === "backend" || value === "designer" || value === "imageMaker" || value === "dba" || value === "devops" || value === "security" || value === "qa" || value === "review" || value === "summarize" || value === "oracle" || value === "librarian" || value === "rush" || value === "routeBrain" || value === "pet"
}
