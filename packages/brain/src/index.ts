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
    coding: ModelPolicy
    frontend: ModelPolicy
    backend: ModelPolicy
    designer: ModelPolicy
    dba: ModelPolicy
    devops: ModelPolicy
    security: ModelPolicy
    qa: ModelPolicy
    research: ModelPolicy
    review: ModelPolicy
    summarize: ModelPolicy
    fastReply: ModelPolicy
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
  "coding",
  "frontend",
  "backend",
  "designer",
  "dba",
  "devops",
  "security",
  "qa",
  "research",
  "review",
  "summarize",
  "fastReply",
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
  coding: {
    label: "Coding",
    responsibility: "Implement code changes, follow repository conventions, keep edits scoped, and run focused verification.",
    boundaries: "Do not redesign product, security, data, or operations decisions unless the prompt asks for it or specialist results require it.",
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
  research: {
    label: "Research",
    responsibility: "Find verified facts from files, docs, or external sources and separate evidence from inference.",
    boundaries: "Do not implement; return concise findings with source references when available.",
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
  fastReply: {
    label: "Fast Reply",
    responsibility: "Answer simple conversational prompts or small factual asks directly with minimal ceremony.",
    boundaries: "Avoid tool use, long analysis, and multi-agent routing unless the prompt expands beyond a quick reply.",
  },
  oracle: {
    label: "Oracle",
    responsibility: "Handle hard reasoning, architecture tradeoffs, ambiguous planning, deep debugging, and high-risk technical decisions.",
    boundaries: "Prefer clear decisions and tradeoffs over implementation detail unless asked to produce code.",
  },
  librarian: {
    label: "Librarian",
    responsibility: "Understand large or unfamiliar codebases, trace architecture, locate symbols, and explain file/function relationships.",
    boundaries: "Do not change code; return precise references and a compact map of what matters.",
  },
  rush: {
    label: "Rush",
    responsibility: "Finish miscellaneous one-off tasks quickly when no specialist role is a better fit.",
    boundaries: "Keep scope tight and hand off to a specialist role when the task clearly belongs elsewhere.",
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
    "Prefer coding as the primary role whenever the user asks to implement, fix, create, change, refactor, or edit code. Add specialist workers for frontend, backend, security, QA, DBA, DevOps, design, research, review, oracle, librarian, summarize, fastReply, or rush only when their scope is clearly relevant.",
    "Worker goals must be self-contained because each Braincode worker owns a separate task context and never receives the full Brain context or another worker's private context.",
  ].join("\n"),
  coding: [
    "You are Braincode's coding agent.",
    "Own implementation: read the provided context, make the smallest correct code changes, preserve repository conventions, and integrate specialist worker findings when they are useful.",
    "Validate with focused checks that match the risk. State exactly what changed, what was verified, and what risk remains.",
    "Do not broaden into product redesign, security review, data modeling, or infrastructure work unless the prompt or worker handoff requires it.",
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
  research: [
    "You are Braincode's research agent.",
    "Own fact finding: inspect relevant files or sources, separate verified evidence from inference, and return concise actionable findings.",
    "Cite concrete files, symbols, docs, or URLs when available. Highlight freshness or uncertainty when it matters.",
    "Do not implement or over-plan; stop at the information needed by the primary agent.",
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
  fastReply: [
    "You are Braincode's fast reply agent.",
    "Own simple direct answers: short conversation, small clarifications, and low-risk factual replies that do not need tools or multi-agent work.",
    "Be concise, answer the actual question, and avoid unnecessary process narration.",
    "Escalate only when the prompt clearly requires code, research, review, or planning.",
  ].join("\n"),
  oracle: [
    "You are Braincode's oracle agent.",
    "Own hard thinking: architecture decisions, deep debugging, complex tradeoffs, ambiguous plans, and high-risk technical judgment.",
    "Expose assumptions, compare viable options, make a defensible recommendation, and identify what evidence would change the decision.",
    "Do not drift into implementation detail unless the user asks for code or the primary agent needs a concrete plan.",
  ].join("\n"),
  librarian: [
    "You are Braincode's librarian agent.",
    "Own codebase understanding: map unfamiliar repositories, locate relevant modules and symbols, trace relationships, and explain how pieces fit together.",
    "Prefer code graph or structured code discovery, then return precise file/function references and a concise architecture map.",
    "Do not make code changes; provide enough orientation for the primary agent to act.",
  ].join("\n"),
  rush: [
    "You are Braincode's rush agent.",
    "Own odd jobs and quick one-off chores that do not fit a specialist role. Move directly, keep scope tight, and finish with minimal ceremony.",
    "If the request clearly belongs to a specialist role, state the appropriate handoff instead of forcing it into rush.",
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

type RoleSignal = {
  role: RoutedAgentRole
  pattern: RegExp
  goal: string
  reason: string
}

const roleSignals: RoleSignal[] = [
  { role: "librarian", pattern: /\b(librarian|external codebase|large codebase|repository architecture|trace codebase|codebase architecture|代码库理解|外部仓库|架构梳理)\b/, goal: "Understand the relevant codebase or repository structure and return concise findings.", reason: "The prompt asks for codebase or repository understanding." },
  { role: "oracle", pattern: /\b(oracle|deep reasoning|architecture|architect|hard debugging|tradeoff|复杂架构|深入分析|疑难|架构)\b/, goal: "Provide deep reasoning, architecture guidance, or a hard-debugging plan.", reason: "The prompt asks for deep reasoning, architecture, or difficult debugging." },
  { role: "frontend", pattern: /\b(frontend|front-end|ui|ux|react|vue|svelte|css|html|页面|前端|界面)\b/, goal: "Handle UI, browser behavior, components, styling, and user-facing polish.", reason: "The prompt contains frontend or UI signals." },
  { role: "backend", pattern: /\b(backend|back-end|api|server|service|endpoint|后端|接口|服务端)\b/, goal: "Handle APIs, services, validation, persistence boundaries, and server behavior.", reason: "The prompt contains backend or API signals." },
  { role: "designer", pattern: /\b(design|designer|visual|mockup|wireframe|style|brand|品牌|设计|视觉|原型)\b/, goal: "Provide practical UX flow, visual direction, and interaction guidance.", reason: "The prompt contains product design or visual design signals." },
  { role: "dba", pattern: /\b(database|db|dba|sql|postgres|mysql|sqlite|schema|migration|index|query plan|数据库|索引|迁移)\b/, goal: "Review schema, migrations, indexes, query plans, and data integrity.", reason: "The prompt contains database, schema, migration, or query signals." },
  { role: "devops", pattern: /\b(devops|deploy|deployment|docker|kubernetes|k8s|ci|cd|infra|ops|observability|部署|运维|流水线)\b/, goal: "Handle CI/CD, deployment, containers, infrastructure, and operations.", reason: "The prompt contains deployment, infrastructure, or operations signals." },
  { role: "security", pattern: /\b(security|secure|auth|permission|vulnerability|threat|secret|token|安全|权限|漏洞|鉴权|密钥)\b/, goal: "Analyze auth, permissions, secrets, vulnerabilities, and secure defaults.", reason: "The prompt contains security, auth, permission, or secret-handling signals." },
  { role: "qa", pattern: /\b(test|tests|testing|qa|e2e|unit test|integration test|regression|测试|质量|回归)\b/, goal: "Plan focused tests, edge cases, regression checks, and verification strategy.", reason: "The prompt contains testing or quality signals." },
  { role: "review", pattern: /\b(review|audit|inspect|check|code review|审查|检查)\b/, goal: "Review code or plans for correctness, regressions, risk, and missing tests.", reason: "The prompt asks for review, audit, inspection, or checking." },
  { role: "summarize", pattern: /\b(summarize|summary|recap|handoff|总结|摘要|交接)\b/, goal: "Summarize decisions, context, validation, caveats, and next steps.", reason: "The prompt asks for summarization or handoff context." },
  { role: "research", pattern: /\b(research|find|search|investigate|look up|调研|搜索|查找|调查)\b/, goal: "Find relevant facts quickly and return concise actionable findings.", reason: "The prompt asks for research, search, or investigation." },
  { role: "rush", pattern: /\b(rush|quick chore|misc|one-off|随便|杂项|小活|快速处理)\b/, goal: "Handle a quick miscellaneous task while keeping scope tight.", reason: "The prompt describes a miscellaneous or quick one-off chore." },
]

const implementationPattern = /\b(implement|build|create|add|fix|change|modify|refactor|code|实现|开发|修复|新增|修改|重构)\b/
const simpleConversationPattern = /\b(hi|hello|thanks|thank you|你好|谢谢)\b/
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
  if (explicit.length > 0) return dedupeAgentTodoDependencies(explicit)

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

  return dedupeAgentTodoDependencies(dependencies)
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

export function planAgentRouting(prompt: string, brain?: BrainModel): AgentRoutingPlan {
  const normalized = prompt.toLowerCase()
  const matched = roleSignals.filter((signal) => signal.pattern.test(normalized))

  if (matched.length === 0 && simpleConversationPattern.test(normalized) && normalized.length < 120) {
    return normalizeAgentRoutingPlan({
      primaryRole: "fastReply",
      workers: [{ role: "fastReply", goal: "Answer the simple conversational prompt directly.", reason: "The prompt is short conversational text." }],
      requiresReview: false,
      reason: "Short conversational prompt routed to fastReply.",
    })
  }

  if (matched.length === 0) {
    return normalizeAgentRoutingPlan({
      primaryRole: "coding",
      workers: [{ role: "coding", goal: "Implement or modify code according to the user's request.", reason: "No specialized role signal was stronger than the default coding path." }],
      requiresReview: Boolean(brain?.routing.requireReviewForFileEdits && fileEditRiskPattern.test(normalized)),
      reason: "No specialized signal matched; defaulting to coding.",
    })
  }

  const implementationRequested = implementationPattern.test(normalized)
  const workersByRole = new Map<RoutedAgentRole, AgentWorkerPlan>()
  if (implementationRequested) {
    workersByRole.set("coding", { role: "coding", goal: "Implement the requested code changes and integrate specialist guidance when needed.", reason: "The prompt asks for implementation or code changes." })
  }
  for (const signal of matched) {
    workersByRole.set(signal.role, { role: signal.role, goal: signal.goal, reason: signal.reason })
  }

  const maxWorkers = Math.max(1, brain?.routing.maxParallelAgents ?? 1)
  const workers = Array.from(workersByRole.values()).slice(0, maxWorkers)
  const primaryRole = workers.find((worker) => worker.role === "coding")?.role ?? workers[0]?.role ?? "coding"

  return normalizeAgentRoutingPlan({
    primaryRole,
    workers,
    requiresReview: Boolean(brain?.routing.requireReviewForFileEdits && fileEditRiskPattern.test(normalized)),
    reason: workers.length > 1 ? "Multiple specialized role signals matched the prompt." : workers[0]?.reason ?? "Routed by role signal.",
  })
}

export function selectAgentRole(prompt: string): RoutedAgentRole {
  return planAgentRouting(prompt).primaryRole
}

export function selectModelPolicy(brain: BrainModel, role: AgentRole): ModelPolicy {
  return brain.roles[role] ?? brain.roles.coding
}
