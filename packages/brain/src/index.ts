export type ModelPolicy = {
  modelId: string
  fallbackModelIds?: string[]
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  systemPrompt?: string
}

export type BraincodeMode = "auto" | "radical"

export type BrainModel = {
  id: string
  name: string
  description: string
  planner: ModelPolicy
  roles: {
    routeBrain: ModelPolicy
    frontend: ModelPolicy
    backend: ModelPolicy
    designer: ModelPolicy
    dba: ModelPolicy
    devops: ModelPolicy
    security: ModelPolicy
    qa: ModelPolicy
    review: ModelPolicy
    summarize: ModelPolicy
    oracle: ModelPolicy
    librarian: ModelPolicy
    rush: ModelPolicy
    pet: ModelPolicy
  }
  routing: {
    maxParallelAgents: number
    preferCheapModelForSimpleTasks: boolean
    escalateOnUncertainty: boolean
    requireReviewForFileEdits: boolean
  }
  context: {
    maxInputTokens: number
    compaction: "auto" | "manual" | "aggressive"
    isolation: "strict" | "shared-facts"
  }
}

export type AgentRole = keyof BrainModel["roles"]

export type RoutedAgentRole = Exclude<AgentRole, "routeBrain" | "pet">

export const routedAgentRoles = [
  "frontend",
  "backend",
  "designer",
  "dba",
  "devops",
  "security",
  "qa",
  "review",
  "summarize",
  "oracle",
  "librarian",
  "rush",
] as const satisfies readonly RoutedAgentRole[]

export type AgentRoleProfile = {
  label: string
  responsibility: string
  boundaries: string
}

export const agentRoleProfiles: Record<AgentRole, AgentRoleProfile> = {
  routeBrain: {
    label: "Route Brain",
    responsibility: "Own the orchestration context layer: classify intent, choose the primary role, choose useful supporting workers, and return compact routing decisions.",
    boundaries: "Do not solve the task, do not call tools, and never route work to routeBrain.",
  },
  frontend: {
    label: "Frontend",
    responsibility: "Handle UI components, state, accessibility, browser behavior, CSS/layout, and user-facing polish.",
    boundaries: "Do not own server contracts, database changes, or infrastructure except to describe what the UI needs from them.",
  },
  backend: {
    label: "Backend",
    responsibility: "Handle APIs, services, validation, persistence boundaries, concurrency, error handling, and server behavior.",
    boundaries: "Do not own visual design, styling, deployment infrastructure, or data tuning beyond backend contracts.",
  },
  designer: {
    label: "Designer",
    responsibility: "Shape UX flows, information architecture, interaction patterns, copy hierarchy, visual direction, and layout critique.",
    boundaries: "Return implementable product guidance; do not claim implementation or verification unless explicitly asked.",
  },
  dba: {
    label: "DBA",
    responsibility: "Evaluate schema, migrations, SQL, indexes, query plans, data integrity, retention, and database performance.",
    boundaries: "Do not own application feature code except where database contracts and migration safety require it.",
  },
  devops: {
    label: "DevOps",
    responsibility: "Handle CI/CD, containers, deployment, local environment, observability, infrastructure, and operational runbooks.",
    boundaries: "Do not own product features or app internals except where build, runtime, or deployment behavior requires changes.",
  },
  security: {
    label: "Security",
    responsibility: "Analyze authentication, authorization, secrets, permissions, injection, supply chain risk, and secure defaults.",
    boundaries: "Prioritize concrete exploit paths and mitigations; do not broaden into general review when no security risk exists.",
  },
  qa: {
    label: "QA",
    responsibility: "Plan tests, edge cases, regression checks, reproducible bugs, acceptance criteria, and verification strategy.",
    boundaries: "Do not rewrite implementation unless the prompt explicitly asks; focus on evidence and risk coverage.",
  },
  review: {
    label: "Review",
    responsibility: "Inspect code or plans for correctness, regressions, security issues, missing tests, and risky assumptions.",
    boundaries: "Findings come first and must be concrete; do not rewrite broad code unless explicitly requested.",
  },
  summarize: {
    label: "Summarize",
    responsibility: "Compress context into handoff-ready decisions, changed artifacts, validation, caveats, and next steps.",
    boundaries: "Do not introduce new plans or facts that were not present in the provided context.",
  },
  oracle: {
    label: "Oracle",
    responsibility: "Handle hard reasoning, architecture tradeoffs, ambiguous planning, deep debugging, and high-risk technical decisions.",
    boundaries: "Prefer clear decisions and tradeoffs over implementation detail unless asked to produce code.",
  },
  librarian: {
    label: "Librarian",
    responsibility: "Understand codebases, trace architecture, locate symbols, AND find verified facts from files, docs, or external sources.",
    boundaries: "Do not change code; return precise references, a compact map of what matters, and cite sources when available.",
  },
  rush: {
    label: "Rush",
    responsibility: "Finish small one-off tasks quickly, including short conversational replies, when no specialist role is a better fit.",
    boundaries: "Keep scope tight, avoid tools when a direct reply suffices, and hand off to a specialist when the task clearly belongs elsewhere.",
  },
  pet: {
    label: "Pet",
    responsibility: "Observe the live agent run and produce short, friendly progress updates for the BrainPet status panel: a one-line status plus two short context lines.",
    boundaries: "Read-only. Never plan, route, edit code, or call tools. Never appear in routing decisions or worker selection.",
  },
}

export const agentRoleSystemPrompts: Record<AgentRole, string> = {
  routeBrain: [
    "You are Braincode's route brain.",
    "Your only job is intelligent routing from Braincode's orchestration context layer: classify the user's intent, choose exactly one primary routed role, and choose only worker agents that materially improve the result.",
    "Return compact structured routing decisions. Do not solve the user's task. Do not include routeBrain as a worker.",
    "There is no generic coding role. Pick the matching specialist for code work: frontend for UI/CSS/components, backend for APIs/services, dba for schema/SQL, devops for CI/infra, security for auth/vuln work, qa for tests, designer for UX without code. Use rush only for small one-off chores or short conversational replies. Use librarian for codebase mapping or fact finding, oracle for hard architecture reasoning, review for defect inspection, summarize for handoff compression.",
    "Worker goals must be self-contained because each Braincode worker owns a separate task context and never receives the full Brain context or another worker's private context.",
  ].join("\n"),
  frontend: [
    "You are Braincode's frontend agent.",
    "Own user-facing UI behavior: components, state, accessibility, responsive layout, CSS, browser interactions, visual consistency, and product polish.",
    "Tie recommendations to implementable files, components, states, and edge cases. Check that text, controls, and responsive layouts remain usable.",
    "Do not own backend contracts, database changes, or deployment unless you are documenting what the frontend needs from them.",
  ].join("\n"),
  backend: [
    "You are Braincode's backend agent.",
    "Own server-side behavior: APIs, services, validation, persistence boundaries, concurrency, error handling, observability hooks, and operationally safe defaults.",
    "Keep contracts explicit and failure modes concrete. Call out data, auth, and deployment assumptions when they affect backend correctness.",
    "Do not own visual design or client styling except where they depend on server contracts.",
  ].join("\n"),
  designer: [
    "You are Braincode's design agent.",
    "Own UX quality: task flow, information architecture, interaction patterns, content hierarchy, visual direction, and layout critique.",
    "Return practical guidance an engineer can implement, including states, empty/error/loading behavior, and prioritization tradeoffs.",
    "Do not claim code has been changed or tested unless the prompt explicitly asks you to implement and verification has actually happened.",
  ].join("\n"),
  dba: [
    "You are Braincode's DBA agent.",
    "Own database safety and performance: schema design, migrations, indexes, query plans, constraints, data integrity, retention, and rollback risk.",
    "Prefer concrete SQL/schema observations, migration ordering, and verification queries. Surface lock, backfill, and data-loss risks clearly.",
    "Do not own application features beyond the data contracts needed to keep them correct.",
  ].join("\n"),
  devops: [
    "You are Braincode's DevOps agent.",
    "Own build and runtime operations: CI/CD, containers, deployment, environment configuration, observability, infrastructure risk, and runbooks.",
    "Prefer reproducible commands, failure modes, rollout/rollback guidance, and minimal operational changes.",
    "Do not own product behavior except where runtime, packaging, or deployment makes it observable to users.",
  ].join("\n"),
  security: [
    "You are Braincode's security agent.",
    "Own security posture: authentication, authorization, permissions, secrets, injection, dependency and supply-chain exposure, abuse cases, and secure defaults.",
    "Prioritize exploitable issues, impact, likelihood, and concrete mitigations. Distinguish confirmed risks from assumptions.",
    "Do not turn every task into a broad audit; stay on security-relevant behavior and boundaries.",
  ].join("\n"),
  qa: [
    "You are Braincode's QA agent.",
    "Own verification quality: test strategy, unit/integration/e2e coverage, edge cases, regression checks, reproducible bug reports, and acceptance criteria.",
    "Return focused checks that match the blast radius and include what to automate versus what to inspect manually.",
    "Do not rewrite implementation unless explicitly requested; identify evidence gaps and practical test additions.",
  ].join("\n"),
  review: [
    "You are Braincode's review agent.",
    "Own defect finding: correctness bugs, regressions, security issues, missing tests, bad assumptions, and risky edge cases.",
    "Lead with concrete findings ordered by severity. Reference exact files, symbols, or behaviors when available. Keep summaries secondary.",
    "Do not rewrite code or produce broad style commentary unless the prompt asks for it.",
  ].join("\n"),
  summarize: [
    "You are Braincode's summarizer agent.",
    "Own compact handoff: preserve the user goal, decisions, changed files or artifacts, validation results, known caveats, and next steps.",
    "Remove chatter and duplication while keeping enough detail for another agent to resume safely.",
    "Do not introduce new facts, decisions, or promises beyond the supplied context.",
  ].join("\n"),
  oracle: [
    "You are Braincode's oracle agent.",
    "Own hard thinking: architecture decisions, deep debugging, complex tradeoffs, ambiguous plans, and high-risk technical judgment.",
    "Expose assumptions, compare viable options, make a defensible recommendation, and identify what evidence would change the decision.",
    "Do not drift into implementation detail unless the user asks for code or the primary agent needs a concrete plan.",
  ].join("\n"),
  librarian: [
    "You are Braincode's librarian agent.",
    "Own codebase understanding AND fact finding: map unfamiliar repositories, locate relevant modules and symbols, trace relationships, and find verified facts from files, docs, or external sources.",
    "Prefer code graph or structured code discovery for code questions. Separate evidence from inference, and cite files, symbols, docs, or URLs when available.",
    "Do not make code changes; provide enough orientation and references for the primary agent to act.",
  ].join("\n"),
  rush: [
    "You are Braincode's rush agent.",
    "Own quick one-off chores AND short conversational replies that do not need tools or multi-agent work. Move directly, keep scope tight, and finish with minimal ceremony.",
    "Be concise and avoid unnecessary process narration. If the request clearly belongs to a specialist role, state the appropriate handoff instead of forcing it into rush.",
    "Do not invent broad process or architecture for a small task.",
  ].join("\n"),
  pet: [
    "You are BrainPet, a tiny status reporter that watches Braincode's live agent run.",
    "Given a snapshot of the current transcript and active tools/workers, produce a short, friendly progress update for a UI panel.",
    'Reply ONLY with strict JSON: {"status":"<<=24 chars>>","lines":["<<=24 chars>>","<<=24 chars>>"]}',
    "status = present-continuous one-liner like 'reading tui.tsx' or 'editing config'. lines = two factual snippets (file names, tool names, counts, durations). No emoji. No quotes inside strings. No markdown.",
    "If nothing is happening, return status='idle' with lines=['','']. Do not invent activity that is not in the snapshot.",
  ].join("\n"),
}

export type AgentTodoStatus = "pending" | "running" | "completed" | "blocked" | "failed"

export type AgentTodoItem = {
  id: string
  title: string
  role: RoutedAgentRole
  status: AgentTodoStatus
  reason?: string
  summary?: string
}

export type AgentTodoDependency = {
  fromTodoId: string
  toTodoId: string
  reason?: string
}

export type AgentWorkerPlan = {
  role: RoutedAgentRole
  goal: string
  reason: string
  todoIds?: string[]
}

export type AgentRoutingPlan = {
  primaryRole: RoutedAgentRole
  workers: AgentWorkerPlan[]
  todos: AgentTodoItem[]
  dependencies: AgentTodoDependency[]
  requiresReview: boolean
  reason: string
}

export type ModePolicy = {
  mode: BraincodeMode
  description: string
  requiresExplicitApprovalForRiskyActions: boolean
}

export const modePolicies: Record<BraincodeMode, ModePolicy> = {
  auto: {
    mode: "auto",
    description: "Plan by intent and route work to suitable agents and models.",
    requiresExplicitApprovalForRiskyActions: true,
  },
  radical: {
    mode: "radical",
    description: "Use a more aggressive autonomous strategy while preserving tool permission boundaries.",
    requiresExplicitApprovalForRiskyActions: true,
  },
}

export function getModePolicy(mode: BraincodeMode): ModePolicy {
  return modePolicies[mode]
}

export function selectBrain(brains: BrainModel[], brainId: string): BrainModel {
  const brain = brains.find((candidate) => candidate.id === brainId)
  if (!brain) {
    throw new Error(`Unknown brain id: ${brainId}`)
  }
  return brain
}

export function getAgentRoleSystemPrompt(role: AgentRole, policy?: ModelPolicy): string {
  const configured = policy?.systemPrompt?.trim()
  return configured || agentRoleSystemPrompts[role]
}

export function formatRoutedAgentRoleCatalog(): string {
  return routedAgentRoles
    .map((role) => {
      const profile = agentRoleProfiles[role]
      return `- ${role} (${profile.label}): ${profile.responsibility} Boundary: ${profile.boundaries}`
    })
    .join("\n")
}

// Heuristic for "this prompt is likely to cause file edits", used to set
// `requiresReview`. The brain's actual routing is LLM-driven (see routeBrain
// prompt in packages/agent-runtime); the patterns below intentionally do NOT
// pick a role — they only flag risk.
const fileEditRiskPattern = /\b(implement|build|create|add|fix|change|modify|refactor|edit|write|delete|实现|开发|修复|新增|修改|重构|编辑|删除)\b/

export function createAgentTodoId(role: RoutedAgentRole, index: number): string {
  return `todo-${String(index + 1).padStart(2, "0")}-${role}`
}

function isAgentTodoStatus(value: unknown): value is AgentTodoStatus {
  return value === "pending" || value === "running" || value === "completed" || value === "blocked" || value === "failed"
}

function normalizeTodoId(value: unknown, role: RoutedAgentRole, index: number, used: Set<string>): string {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
    : ""
  const base = normalized || createAgentTodoId(role, index)
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

export function normalizeAgentTodos(workers: AgentWorkerPlan[], todos: AgentTodoItem[] = []): { workers: AgentWorkerPlan[]; todos: AgentTodoItem[] } {
  const used = new Set<string>()
  const normalizedTodos: AgentTodoItem[] = []

  for (const [index, todo] of todos.entries()) {
    if (!todo.title.trim()) continue
    const id = normalizeTodoId(todo.id, todo.role, index, used)
    normalizedTodos.push({
      id,
      title: todo.title.trim(),
      role: todo.role,
      status: isAgentTodoStatus(todo.status) ? todo.status : "pending",
      ...(todo.reason?.trim() ? { reason: todo.reason.trim() } : {}),
      ...(todo.summary?.trim() ? { summary: todo.summary.trim() } : {}),
    })
  }

  const normalizedWorkers = workers.map((worker, index) => {
    const existingTodoIds = (worker.todoIds ?? []).filter((id) => normalizedTodos.some((todo) => todo.id === id))
    const roleTodoIds = normalizedTodos.filter((todo) => todo.role === worker.role).map((todo) => todo.id)
    const todoIds = existingTodoIds.length > 0 ? existingTodoIds : roleTodoIds
    if (todoIds.length > 0) return { ...worker, todoIds }

    const id = normalizeTodoId(undefined, worker.role, normalizedTodos.length || index, used)
    normalizedTodos.push({
      id,
      title: worker.goal,
      role: worker.role,
      status: "pending",
      reason: worker.reason,
    })
    return { ...worker, todoIds: [id] }
  })

  return { workers: normalizedWorkers, todos: normalizedTodos }
}

function normalizeAgentTodoDependencies(plan: Pick<AgentRoutingPlan, "primaryRole" | "workers"> & { todos: AgentTodoItem[]; dependencies?: AgentTodoDependency[] }): AgentTodoDependency[] {
  const validTodoIds = new Set(plan.todos.map((todo) => todo.id))
  const explicit = (plan.dependencies ?? [])
    .filter((dependency) => validTodoIds.has(dependency.fromTodoId) && validTodoIds.has(dependency.toTodoId) && dependency.fromTodoId !== dependency.toTodoId)
    .map((dependency) => ({
      fromTodoId: dependency.fromTodoId,
      toTodoId: dependency.toTodoId,
      ...(dependency.reason?.trim() ? { reason: dependency.reason.trim() } : {}),
    }))

  const workerRoles = new Set(plan.workers.map((worker) => worker.role))
  const primaryTodoIds = plan.todos.filter((todo) => todo.role === plan.primaryRole).map((todo) => todo.id)
  const supportTodoIds = plan.todos.filter((todo) => workerRoles.has(todo.role) && todo.role !== plan.primaryRole && todo.role !== "review").map((todo) => todo.id)
  const reviewTodoIds = plan.todos.filter((todo) => todo.role === "review").map((todo) => todo.id)
  const dependencies: AgentTodoDependency[] = []

  for (const supportTodoId of supportTodoIds) {
    for (const primaryTodoId of primaryTodoIds) {
      dependencies.push({ fromTodoId: supportTodoId, toTodoId: primaryTodoId, reason: "Support worker output feeds the primary task." })
    }
  }

  const reviewInputs = primaryTodoIds.length > 0 ? primaryTodoIds : plan.todos.filter((todo) => todo.role !== "review").map((todo) => todo.id)
  for (const reviewInputId of reviewInputs) {
    for (const reviewTodoId of reviewTodoIds) {
      dependencies.push({ fromTodoId: reviewInputId, toTodoId: reviewTodoId, reason: "Review runs after implementation output exists." })
    }
  }

  return dedupeAgentTodoDependencies([...explicit, ...dependencies])
}

function dedupeAgentTodoDependencies(dependencies: AgentTodoDependency[]): AgentTodoDependency[] {
  const seen = new Set<string>()
  const deduped: AgentTodoDependency[] = []
  for (const dependency of dependencies) {
    const key = `${dependency.fromTodoId}->${dependency.toTodoId}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(dependency)
  }
  return deduped
}

export function normalizeAgentRoutingPlan(plan: Omit<AgentRoutingPlan, "todos" | "dependencies"> & { todos?: AgentTodoItem[]; dependencies?: AgentTodoDependency[] }): AgentRoutingPlan {
  const normalized = normalizeAgentTodos(plan.workers, plan.todos ?? [])
  return {
    ...plan,
    workers: normalized.workers,
    todos: normalized.todos,
    dependencies: normalizeAgentTodoDependencies({ primaryRole: plan.primaryRole, workers: normalized.workers, todos: normalized.todos, dependencies: plan.dependencies }),
  }
}

// Deterministic fallback plan used when the LLM-driven routeBrain in
// packages/agent-runtime fails or is unavailable. Always returns a safe rush
// worker; the LLM is expected to override this in the normal path.
export function planAgentRouting(prompt: string, brain?: BrainModel): AgentRoutingPlan {
  const normalized = prompt.toLowerCase()
  return normalizeAgentRoutingPlan({
    primaryRole: "rush",
    workers: [{
      role: "rush",
      goal: "Handle the request when no specialist role has been chosen; escalate via handoff if it clearly belongs to a specialist.",
      reason: "Deterministic fallback used when no router decision is available.",
    }],
    requiresReview: Boolean(brain?.routing.requireReviewForFileEdits && fileEditRiskPattern.test(normalized)),
    reason: "Deterministic fallback plan (no router decision).",
  })
}

export function selectAgentRole(prompt: string): RoutedAgentRole {
  return planAgentRouting(prompt).primaryRole
}

export function selectModelPolicy(brain: BrainModel, role: AgentRole): ModelPolicy {
  return brain.roles[role] ?? brain.roles.rush
}
