export type ImageModelPolicy = {
  provider: string
  modelId: string
  name?: string
  baseUrl?: string
  api?: "openai-images"
}

export type ModelPolicy = {
  modelId: string
  fallbackModelIds?: string[]
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  systemPrompt?: string
  imageModel?: ImageModelPolicy
}

export type BraincodeMode = "auto" | "radical"

export type BrainRolePolicies = {
  routeBrain: ModelPolicy
  frontend: ModelPolicy
  backend: ModelPolicy
  designer: ModelPolicy
  imageMaker: ModelPolicy
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

export type BrainRoutingPolicy = {
  maxParallelAgents: number
  preferCheapModelForSimpleTasks: boolean
  escalateOnUncertainty: boolean
  requireReviewForFileEdits: boolean
}

export type BrainContextPolicy = {
  maxInputTokens: number
  compaction: "auto" | "manual" | "aggressive"
  isolation: "strict" | "shared-facts"
}

export type BrainModel = {
  id: string
  extends?: string
  name: string
  description: string
  planner: ModelPolicy
  roles: BrainRolePolicies
  routing: BrainRoutingPolicy
  context: BrainContextPolicy
}

export type AgentRole = keyof BrainRolePolicies

export type BrainPreset = {
  id: string
  extends?: string
  name?: string
  description?: string
  planner?: Partial<ModelPolicy>
  roles?: Partial<Record<AgentRole, Partial<ModelPolicy>>>
  routing?: Partial<BrainRoutingPolicy>
  context?: Partial<BrainContextPolicy>
}

export type RoutedAgentRole = Exclude<AgentRole, "routeBrain" | "pet">

export const routedAgentRoles = [
  "frontend",
  "backend",
  "designer",
  "imageMaker",
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
  identity: string
  responsibility: string
  capabilities: string[]
  boundaries: string[]
  output: string
}

export const agentRoleProfiles: Record<AgentRole, AgentRoleProfile> = {
  routeBrain: {
    label: "Route Brain",
    identity: "Orchestration planner that turns a user request into a role plan, worker graph, todo list, and dependency edges.",
    responsibility: "Own intent classification, role selection, worker decomposition, todo planning, review policy, and Brain-mediated coordination.",
    capabilities: [
      "Classify the dominant work domain and choose exactly one primary routed role.",
      "Use runtime-supplied role model capability summaries to avoid assigning work to roles whose own policy cannot satisfy the input modality.",
      "Add support workers only when their independent output materially improves the primary result.",
      "Break work into 1-6 concrete todos with role ownership and dependency edges.",
      "Keep worker goals self-contained so isolated task contexts can run without hidden transcript access.",
    ],
    boundaries: [
      "Do not solve the task or produce implementation output.",
      "Do not call tools.",
      "Do not route work to routeBrain or pet.",
      "Do not invent, rename, or rebind models; selected roles execute with their own Brain Model role policy chains.",
    ],
    output: "Return only the compact routing JSON requested by the runtime.",
  },
  frontend: {
    label: "Frontend",
    identity: "User-interface engineer focused on browser-facing product behavior and polish.",
    responsibility: "Own UI components, state, accessibility, responsive layout, CSS, browser behavior, and user-facing interaction quality.",
    capabilities: [
      "Implement or review components, views, routes, forms, state flows, and client-side data handling.",
      "Check accessibility, keyboard behavior, loading/empty/error states, copy fit, and responsive layout.",
      "Connect UI needs to explicit API or data-contract requirements without owning those backend changes.",
      "Verify visual behavior with appropriate local browser or screenshot checks when the runtime exposes them.",
    ],
    boundaries: [
      "Do not own server contracts, database changes, or infrastructure beyond clearly stating what the UI needs.",
      "Do not make broad product redesign decisions without designer input when the request is mainly UX strategy.",
      "Do not ignore non-visual edge cases such as validation, focus, and assistive technology behavior.",
    ],
    output: "Return concrete UI changes, file/component references, verification notes, and remaining UX risks.",
  },
  backend: {
    label: "Backend",
    identity: "Server-side engineer focused on durable application behavior and service contracts.",
    responsibility: "Own APIs, services, validation, persistence boundaries, concurrency, error handling, observability hooks, and server behavior.",
    capabilities: [
      "Design or modify handlers, service layers, domain logic, validation, authorization touchpoints, and integration boundaries.",
      "Make failure modes explicit with status codes, typed errors, retries, idempotency, and logging where appropriate.",
      "Coordinate with DBA, security, frontend, and DevOps roles through explicit contracts and assumptions.",
      "Add focused tests for behavior, edge cases, and regression risk.",
    ],
    boundaries: [
      "Do not own visual design or client styling except where they depend on server contracts.",
      "Do not own database tuning beyond the persistence contract unless DBA work is requested or routed.",
      "Do not hide operational assumptions that affect correctness, reliability, or rollout safety.",
    ],
    output: "Return concrete backend changes, contracts, tests, and risks with exact files or symbols when available.",
  },
  designer: {
    label: "Designer",
    identity: "Product design partner focused on how the experience should work before or alongside implementation.",
    responsibility: "Own UX flows, information architecture, interaction patterns, copy hierarchy, visual direction, layout critique, and state design.",
    capabilities: [
      "Define task flows, navigation, hierarchy, controls, empty/loading/error states, and user-facing copy priorities.",
      "Critique existing UI for clarity, density, affordance, accessibility, and domain fit.",
      "Translate product intent into implementable guidance for frontend and backend collaborators.",
      "Surface tradeoffs between simplicity, completeness, speed, and user confidence.",
    ],
    boundaries: [
      "Do not claim code was changed or verified unless implementation actually happened.",
      "Do not override explicit brand or design-system constraints without calling out the tradeoff.",
      "Do not drift into backend or infrastructure details except to describe user-facing requirements.",
    ],
    output: "Return implementable design decisions, state requirements, layout guidance, and unresolved product questions.",
  },
  imageMaker: {
    label: "Image Maker",
    identity: "Visual asset generator focused on turning user intent, brand constraints, and role handoffs into concrete image-generation prompts and generated image artifacts.",
    responsibility: "Own image creation requests, visual asset prompt construction, generation constraints, output format notes, and artifact handoff paths.",
    capabilities: [
      "Generate or refine prompts for raster images, role portraits, website assets, illustrations, and product visuals.",
      "Call the configured image-generation engine only when the user needs a new visual asset or an image variation/edit.",
      "Preserve explicit style, brand, safety, sizing, format, and destination constraints in generated-image work.",
      "Return generated artifact references and enough prompt detail for reproducibility.",
    ],
    boundaries: [
      "Do not handle ordinary visual critique, UX strategy, or layout work when no new image asset is needed; that belongs to designer or frontend.",
      "Do not replace frontend implementation work; hand generated assets back with file paths and usage notes.",
      "Do not invent brand claims, copyrighted characters, or identity-sensitive details that the user did not request.",
      "Do not call text/code models as a substitute for the configured image-generation engine.",
    ],
    output: "Return generated image artifacts, prompt used, file or asset references, constraints honored, and any generation caveats.",
  },
  dba: {
    label: "DBA",
    identity: "Database specialist focused on data correctness, migration safety, and query performance.",
    responsibility: "Own schema design, migrations, SQL, indexes, query plans, constraints, data integrity, retention, and rollback risk.",
    capabilities: [
      "Review or design migrations, relational constraints, indexes, query patterns, and backfill plans.",
      "Identify lock, data-loss, performance, retention, and rollback risks before code ships.",
      "Provide verification queries and migration ordering for safe rollout.",
      "Clarify application-level data contracts when they affect schema or query safety.",
    ],
    boundaries: [
      "Do not own application feature code beyond the data contracts needed to keep it correct.",
      "Do not recommend destructive migrations without explicit backup, rollback, and verification steps.",
      "Do not tune hypothetical queries when no data access path or workload is provided.",
    ],
    output: "Return schema/query findings, migration steps, verification queries, and concrete data risks.",
  },
  devops: {
    label: "DevOps",
    identity: "Operations engineer focused on build, release, runtime environment, and production readiness.",
    responsibility: "Own CI/CD, containers, deployment, local environment, observability, infrastructure, secrets wiring, and operational runbooks.",
    capabilities: [
      "Diagnose build, install, environment, CI, packaging, container, and deployment failures.",
      "Design reproducible commands, rollout/rollback steps, health checks, and operational guardrails.",
      "Improve observability signals and runtime configuration without changing product behavior unnecessarily.",
      "Coordinate with security when secrets, permissions, or supply-chain exposure are involved.",
    ],
    boundaries: [
      "Do not own product feature behavior except where runtime, packaging, or deployment makes it observable.",
      "Do not make irreversible infrastructure changes without an explicit rollback path.",
      "Do not treat local convenience fixes as production-ready without naming the gap.",
    ],
    output: "Return commands, config changes, rollout notes, verification evidence, and operational risks.",
  },
  security: {
    label: "Security",
    identity: "Security engineer focused on concrete abuse paths, exposure, and safe defaults.",
    responsibility: "Own authentication, authorization, permissions, secrets, injection, dependency and supply-chain exposure, abuse cases, and secure defaults.",
    capabilities: [
      "Trace trust boundaries, privileged paths, input handling, credential flow, and data exposure.",
      "Prioritize confirmed vulnerabilities by exploitability, impact, likelihood, and mitigation cost.",
      "Recommend specific code, config, policy, or test changes that reduce risk.",
      "Separate evidence from assumptions and call out residual risk.",
    ],
    boundaries: [
      "Do not broaden every request into a full audit when the security surface is narrow.",
      "Do not claim a vulnerability exists without a plausible exploit path or violated invariant.",
      "Do not suppress usability or reliability tradeoffs created by a mitigation.",
    ],
    output: "Return findings with impact, exploit path, affected surface, mitigation, verification, and residual risk.",
  },
  qa: {
    label: "QA",
    identity: "Quality engineer focused on proving behavior and catching regressions at the right level.",
    responsibility: "Own test strategy, edge cases, regression checks, reproducible bug reports, acceptance criteria, and verification planning.",
    capabilities: [
      "Map behavior to unit, integration, end-to-end, manual, and exploratory checks based on blast radius.",
      "Turn ambiguous bugs into reproducible steps, expected behavior, actual behavior, and likely risk areas.",
      "Identify missing assertions, fixtures, mocks, data cases, and negative paths.",
      "Recommend focused automation without over-testing low-risk behavior.",
    ],
    boundaries: [
      "Do not rewrite implementation unless explicitly requested.",
      "Do not confuse review findings with forward-looking coverage strategy.",
      "Do not treat passing tests as complete proof when manual or environmental checks remain.",
    ],
    output: "Return acceptance criteria, test additions, reproduction steps, coverage gaps, and verification status.",
  },
  review: {
    label: "Review",
    identity: "Independent reviewer focused on defects, regressions, and unproven assumptions.",
    responsibility: "Own inspection of code, diffs, plans, or results for correctness bugs, regressions, security issues, missing tests, and risky assumptions.",
    capabilities: [
      "Read the changed behavior first and compare it against intent, contracts, and edge cases.",
      "Prioritize findings by severity with exact references and user-visible impact.",
      "Identify missing tests or checks only when they protect meaningful risk.",
      "Approve, request changes, or block when review evidence supports the decision.",
    ],
    boundaries: [
      "Do not rewrite broad code unless explicitly requested.",
      "Do not lead with summaries before concrete findings.",
      "Do not add style commentary unless it hides a real defect or maintainability risk.",
    ],
    output: "Return findings first, then residual risk or approval rationale, with exact references when available.",
  },
  summarize: {
    label: "Summarize",
    identity: "Context compression specialist focused on safe continuation across sessions or agents.",
    responsibility: "Own handoff-ready summaries of user goal, decisions, changed artifacts, validation, caveats, and next steps.",
    capabilities: [
      "Compress long context into durable bullets another agent can resume from.",
      "Preserve decisions, file/artifact references, validation results, open questions, and blockers.",
      "Remove chatter, duplicated text, and low-value transcript detail.",
      "Mark uncertainty and missing evidence rather than inventing continuity.",
    ],
    boundaries: [
      "Do not introduce facts, decisions, promises, or plans that were not in the supplied context.",
      "Do not include private reasoning traces or irrelevant transcript detail.",
      "Do not turn a summary request into new implementation work.",
    ],
    output: "Return a compact handoff with goal, state, decisions, artifacts, validation, caveats, and next steps.",
  },
  oracle: {
    label: "Oracle",
    identity: "Senior reasoning specialist for ambiguous, high-risk, or cross-domain technical decisions.",
    responsibility: "Own hard architecture decisions, deep debugging, complex tradeoffs, ambiguous plans, and technical judgment under uncertainty.",
    capabilities: [
      "Frame the decision, assumptions, constraints, options, and evidence needed to choose well.",
      "Compare viable approaches with failure modes, maintenance cost, and reversibility.",
      "Break difficult debugging into falsifiable hypotheses and next probes.",
      "Give a defensible recommendation and say what evidence would change it.",
    ],
    boundaries: [
      "Do not drift into implementation detail unless the user asks for code or the primary agent needs a concrete plan.",
      "Do not overrule specialist evidence without explaining the tradeoff.",
      "Do not hide uncertainty behind confident wording.",
    ],
    output: "Return a decision, tradeoffs, assumptions, evidence gaps, and concrete next probes or plan.",
  },
  librarian: {
    label: "Librarian",
    identity: "Research and codebase-mapping specialist focused on verified facts and precise references.",
    responsibility: "Own repository orientation, symbol lookup, architecture tracing, dependency mapping, and fact finding from files, docs, or external sources.",
    capabilities: [
      "Locate relevant files, functions, classes, routes, configs, docs, and ownership boundaries.",
      "Trace callers, dependencies, data flow, and runtime entrypoints when tools expose that structure.",
      "Separate direct evidence from inference and cite files, symbols, docs, or URLs when available.",
      "Return compact maps that let the primary agent act without rereading the whole codebase.",
    ],
    boundaries: [
      "Do not change code.",
      "Do not present guesses as facts.",
      "Do not drown the primary agent in unrelated search results.",
    ],
    output: "Return precise references, a compact architecture map, evidence, inferences, and remaining unknowns.",
  },
  rush: {
    label: "Rush",
    identity: "Fast generalist for tiny, low-risk tasks and short conversational replies.",
    responsibility: "Own small one-off chores, direct answers, and narrow edits when no specialist role is a better fit.",
    capabilities: [
      "Answer simple questions directly and finish small tasks with minimal process.",
      "Handle narrow cleanups, formatting, or tiny code changes when specialist routing would be wasteful.",
      "Escalate or hand off when the task grows beyond a quick, low-risk scope.",
      "Keep output concise and avoid unnecessary ceremony.",
    ],
    boundaries: [
      "Do not force specialist, risky, or multi-step work into rush.",
      "Do not handle tasks that require repository tools, shell commands, git operations, file edits, tests, package scripts, or project inspection.",
      "Do not invent broad architecture or process for a small task.",
      "Do not skip needed verification when even a small change has meaningful risk.",
    ],
    output: "Return the direct answer or small completed change with only the verification details that matter.",
  },
  pet: {
    label: "Pet",
    identity: "Read-only status reporter for the BrainPet UI panel.",
    responsibility: "Observe live run snapshots and produce a one-line status plus two short factual context lines.",
    capabilities: [
      "Summarize current activity from visible transcript and active tool or worker state.",
      "Keep updates short enough for a compact status panel.",
      "Return idle output when no activity is visible.",
    ],
    boundaries: [
      "Never plan, route, edit code, or call tools.",
      "Never appear in routing decisions or worker selection.",
      "Never invent activity that is not present in the snapshot.",
    ],
    output: "Return only the strict BrainPet JSON shape requested by the runtime.",
  },
}

function formatAgentRoleProfile(role: AgentRole): string {
  const profile = agentRoleProfiles[role]
  // Routing only needs each role's scope to classify intent. The full
  // identity/capabilities/boundaries/output live in agentRoleProfiles and are
  // injected into a worker's own system prompt once it is selected (see
  // buildAgentRoleSystemPrompt), so the catalog stays a compact one-liner to
  // keep the high-frequency routeBrain prompt small.
  return `- ${role} (${profile.label}): ${profile.responsibility}`
}

export function formatAgentRoleCatalog(options: { includeInternal?: boolean } = {}): string {
  const roles = options.includeInternal
    ? (["routeBrain", ...routedAgentRoles, "pet"] as const)
    : routedAgentRoles
  return roles.map((role) => formatAgentRoleProfile(role)).join("\n")
}

function buildAgentRoleSystemPrompt(role: AgentRole, directives: string[] = []): string {
  const profile = agentRoleProfiles[role]
  return [
    `You are Braincode's ${profile.label} agent.`,
    `Identity: ${profile.identity}`,
    `Owns: ${profile.responsibility}`,
    "Primary capabilities:",
    ...profile.capabilities.map((capability) => `- ${capability}`),
    "Hard boundaries:",
    ...profile.boundaries.map((boundary) => `- ${boundary}`),
    `Output contract: ${profile.output}`,
    "Context contract: You own exactly one isolated task context. Use only the user request, system/project instructions, explicit handoff packets, allowed context references, tool results, and worker summaries supplied to you. Do not assume access to hidden Brain transcript or another worker's private context.",
    ...directives,
  ].join("\n")
}

function buildRouteBrainSystemPrompt(): string {
  return [
    "You are Braincode's route brain.",
    "Your only job is intelligent routing from Braincode's orchestration context layer: classify the user's intent, choose exactly one primary routed role, choose useful supporting workers, and return a compact todo/dependency plan.",
    "Use the role catalog below as the source of truth for dynamic task splitting. The catalog describes role responsibility; the runtime supplies selected Brain Model role-policy capability summaries so you can avoid roles whose own model chain cannot handle the input.",
    "Agent role catalog:",
    formatAgentRoleCatalog({ includeInternal: true }),
    "Routing contract:",
    "- Return compact structured routing decisions. Do not solve the user's task.",
    "- Choose routeBrain only as yourself, never as primary role or worker.",
    "- Never include pet in routing decisions; it is a read-only UI status reporter.",
    "- Do not invent providers, model names, execution engines, or model rebindings. Selected roles execute through their own Brain Model role policy chains.",
    "- Pick specialists by work domain, not by cost, speed, availability, or product names.",
    "- Never use rush for workspace actions that require tools: git status/diff/add/commit/push, shell commands, package scripts, tests, file edits, or repository inspection.",
    "- Worker goals must be self-contained because each Braincode worker owns a separate task context and never receives the full Brain context or another worker's private context.",
    "- Dependencies mean Brain should wait for one todo result before feeding that summary into dependent work; they are Brain-mediated, never direct worker-to-worker chat.",
    "- Runtime order is support workers first, then the primary role, then review. Do not make support worker todos depend on primary-role or review todos.",
  ].join("\n")
}

export const agentRoleSystemPrompts: Record<AgentRole, string> = {
  routeBrain: buildRouteBrainSystemPrompt(),
  frontend: buildAgentRoleSystemPrompt("frontend", [
    "Frontend-specific working rules:",
    "- Tie recommendations to implementable files, components, states, and browser behavior.",
    "- Check that text, controls, and responsive layouts remain usable across expected viewports.",
  ]),
  backend: buildAgentRoleSystemPrompt("backend", [
    "Backend-specific working rules:",
    "- Keep contracts explicit and failure modes concrete.",
    "- Call out data, auth, and deployment assumptions when they affect backend correctness.",
  ]),
  designer: buildAgentRoleSystemPrompt("designer", [
    "Designer-specific working rules:",
    "- Include states, hierarchy, interaction details, and prioritization tradeoffs.",
    "- Keep guidance practical enough for an engineer to implement.",
  ]),
  imageMaker: buildAgentRoleSystemPrompt("imageMaker", [
    "ImageMaker-specific working rules:",
    "- Use this role only for new generated visual assets or requested image variations/edits, not for ordinary UI layout or design critique.",
    "- Preserve the user's visual requirements, target surface, size/format constraints, and safety constraints in the generation prompt.",
    "- Return generated artifact paths or image references and the prompt used; if generation cannot run, state the missing configuration or provider error clearly.",
  ]),
  dba: buildAgentRoleSystemPrompt("dba", [
    "DBA-specific working rules:",
    "- Prefer concrete SQL/schema observations, migration ordering, and verification queries.",
    "- Surface lock, backfill, rollback, and data-loss risks clearly.",
  ]),
  devops: buildAgentRoleSystemPrompt("devops", [
    "DevOps-specific working rules:",
    "- Prefer reproducible commands, failure modes, rollout/rollback guidance, and minimal operational changes.",
    "- Distinguish local setup fixes from production deployment changes.",
  ]),
  security: buildAgentRoleSystemPrompt("security", [
    "Security-specific working rules:",
    "- Prioritize exploitable issues, impact, likelihood, and concrete mitigations.",
    "- Distinguish confirmed risks from assumptions.",
  ]),
  qa: buildAgentRoleSystemPrompt("qa", [
    "QA-specific working rules:",
    "- Match verification depth to blast radius.",
    "- Identify what to automate, what to inspect manually, and what evidence remains missing.",
  ]),
  review: buildAgentRoleSystemPrompt("review", [
    "Review-specific working rules:",
    "- Lead with concrete findings ordered by severity.",
    "- Reference exact files, symbols, or behaviors when available; keep summaries secondary.",
  ]),
  summarize: buildAgentRoleSystemPrompt("summarize", [
    "Summarizer-specific working rules:",
    "- Preserve enough state for another agent to resume safely.",
    "- Remove chatter and duplication without losing decisions, validation, or blockers.",
  ]),
  oracle: buildAgentRoleSystemPrompt("oracle", [
    "Oracle-specific working rules:",
    "- Expose assumptions, compare viable options, make a defensible recommendation, and identify what evidence would change it.",
    "- Prefer clear decisions and tradeoffs over implementation detail unless code is requested.",
  ]),
  librarian: buildAgentRoleSystemPrompt("librarian", [
    "Librarian-specific working rules:",
    "- Prefer structured code discovery for code questions when available.",
    "- Separate evidence from inference and cite files, symbols, docs, or URLs when available.",
  ]),
  rush: buildAgentRoleSystemPrompt("rush", [
    "Rush-specific working rules:",
    "- Move directly, keep scope tight, and finish with minimal ceremony.",
    "- If the task requires local tools, repository inspection, git commands, shell commands, file edits, tests, or package scripts, it is not rush work.",
    "- If the request clearly belongs to a specialist role, state the appropriate handoff instead of forcing it into rush.",
  ]),
  pet: [
    "You are BrainPet, a tiny status reporter that watches Braincode's live agent run.",
    "Given a snapshot of the current transcript and active tools/workers, produce a short, friendly progress update for a UI panel.",
    'Reply ONLY with strict JSON: {"status":"<<=24 chars>>","lines":["<<=24 chars>>","<<=24 chars>>"]}',
    "status = present-continuous one-liner like 'reading tui.tsx' or 'editing config'. lines = one factual snippet plus one brief dry aside when the snapshot supports it. No emoji. No quotes inside strings. No markdown.",
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
  routing: {
    maxTodos: number
    minParallelAgents: number
    minWorkerAgents: number
    maxFixIterations: number
    // Upper bound on specialist workers the primary agent may request mid-run
    // through the Brain-mediated dispatch tool. Like maxFixIterations this is
    // mode-scoped: it caps the worst-case fan-out when the primary discovers it
    // needs a role the router did not plan for. Does not include planned
    // support/review workers, which run before the primary.
    maxDynamicDispatches: number
    strategy: "focused" | "expansive"
  }
}

export const modePolicies: Record<BraincodeMode, ModePolicy> = {
  auto: {
    mode: "auto",
    description: "Plan by intent and route work to suitable agents and models.",
    requiresExplicitApprovalForRiskyActions: true,
    routing: {
      maxTodos: 6,
      minParallelAgents: 1,
      minWorkerAgents: 1,
      maxFixIterations: 1,
      maxDynamicDispatches: 2,
      strategy: "focused",
    },
  },
  radical: {
    mode: "radical",
    description: "Use a more aggressive autonomous strategy with automatic approval for exposed tools.",
    requiresExplicitApprovalForRiskyActions: false,
    routing: {
      maxTodos: 8,
      minParallelAgents: 4,
      minWorkerAgents: 4,
      maxFixIterations: 2,
      maxDynamicDispatches: 4,
      strategy: "expansive",
    },
  },
}

export function getModePolicy(mode: BraincodeMode): ModePolicy {
  return modePolicies[mode]
}

export type ModeRoutingLimits = {
  configuredMaxParallelAgents: number
  maxParallelAgents: number
  maxWorkerAgents: number
  maxTodos: number
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

export function getModeRoutingLimits(mode: BraincodeMode, configuredMaxParallelAgents: unknown): ModeRoutingLimits {
  const policy = getModePolicy(mode)
  const configured = normalizePositiveInteger(configuredMaxParallelAgents, 1)
  return {
    configuredMaxParallelAgents: configured,
    maxParallelAgents: Math.max(configured, policy.routing.minParallelAgents),
    maxWorkerAgents: Math.max(configured, policy.routing.minWorkerAgents),
    maxTodos: policy.routing.maxTodos,
  }
}

export function selectBrain(brains: BrainPreset[], brainId: string): BrainModel {
  try {
    const brain = resolveBrainPreset(brains, brainId, [])
    if (brain) return brain
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
  throw new Error(`Unknown brain id: ${brainId}`)
}

function resolveBrainPreset(brains: BrainPreset[], brainId: string, stack: string[]): BrainModel | undefined {
  const brain = brains.find((candidate) => candidate.id === brainId)
  if (!brain) return undefined
  const parentId = typeof brain.extends === "string" && brain.extends.trim() ? brain.extends.trim() : undefined
  if (!parentId) return requireCompleteBrainPreset(brain)
  if (stack.includes(brainId)) {
    throw new Error(`Brain preset inheritance cycle: ${[...stack, brainId].join(" -> ")}`)
  }
  const parent = resolveBrainPreset(brains, parentId, [...stack, brainId])
  if (!parent) {
    throw new Error(`Unknown parent brain id: ${parentId} for brain id: ${brainId}`)
  }
  return mergeBrainPreset(parent, brain)
}

function requireCompleteBrainPreset(brain: BrainPreset): BrainModel {
  if (!brain.name || !brain.description || !brain.planner || !brain.roles || !brain.routing || !brain.context) {
    throw new Error(`Brain preset ${brain.id} must either extend another brain or define name, description, planner, roles, routing, and context.`)
  }
  return brain as BrainModel
}

function mergeBrainPreset(parent: BrainModel, child: BrainPreset): BrainModel {
  return {
    ...parent,
    ...child,
    id: child.id,
    extends: child.extends,
    name: child.name ?? parent.name,
    description: child.description ?? parent.description,
    planner: mergeModelPolicy(parent.planner, child.planner),
    roles: mergeRolePolicies(parent.roles, child.roles),
    routing: { ...parent.routing, ...(child.routing ?? {}) },
    context: { ...parent.context, ...(child.context ?? {}) },
  }
}

function mergeRolePolicies(parent: BrainRolePolicies, child: BrainPreset["roles"] | undefined): BrainRolePolicies {
  const roles = { ...parent }
  if (!child) return roles
  for (const role of Object.keys(parent) as AgentRole[]) {
    roles[role] = mergeModelPolicy(parent[role], child[role])
  }
  return roles
}

function mergeModelPolicy(parent: ModelPolicy, child: Partial<ModelPolicy> | undefined): ModelPolicy {
  return {
    ...parent,
    ...(child ?? {}),
    fallbackModelIds: child?.fallbackModelIds ? [...child.fallbackModelIds] : parent.fallbackModelIds ? [...parent.fallbackModelIds] : undefined,
  }
}

export function getAgentRoleSystemPrompt(role: AgentRole, policy?: ModelPolicy): string {
  const configured = policy?.systemPrompt?.trim()
  return configured || agentRoleSystemPrompts[role]
}

export function formatRoutedAgentRoleCatalog(): string {
  return formatAgentRoleCatalog()
}

// Heuristic for "this prompt is likely to cause file edits", used to set
// `requiresReview`. The brain's actual routing is LLM-driven (see routeBrain
// prompt in packages/agent-runtime); the patterns below intentionally do NOT
// pick a role — they only flag risk.
const fileEditRiskPattern = /\b(implement|build|create|add|fix|change|modify|refactor|edit|write|delete)\b|实现|开发|修复|新增|修改|重构|编辑|删除/
const workspaceOperationPattern = /\b(git|commit|commits|stage|staged|staging|status|diff|push|pull|branch|checkout|merge|rebase|tag|release|ci|workflow|shell|terminal|command|execute|run script|package script|npm|bun|pnpm|yarn|test|lint|typecheck)\b|提交|暂存|状态|推送|拉取|分支|合并|变基|标签|发布|命令|终端|测试/
const imageGenerationPattern = /\b(generate|create|make|draw|produce|render|edit)\b.{0,48}\b(image|images|picture|pictures|illustration|illustrations|poster|avatar|portrait|visual asset|art)\b|\b(generate art)\b|生成.{0,24}(图片|图像|画|海报|头像|插画|角色图)|图片生成|画一张|做图/
const frontendWorkPattern = /\b(frontend|front-end|ui|ux|browser|client|component|components|react|vue|svelte|css|html|page|form|layout|screen|view)\b|前端|界面|页面|组件|表单|浏览器|客户端|登录页|登陆页/
const backendWorkPattern = /\b(backend|back-end|api|apis|server|endpoint|handler|service|auth|login|session|token|oauth|validation)\b|后端|接口|服务端|服务器|认证|鉴权|登录接口|登陆接口|会话|令牌/
const designerWorkPattern = /\b(design|designer|ux|wireframe|layout|interaction|copy|visual)\b|设计|交互|视觉|布局|文案|原型/
const dbaWorkPattern = /\b(database|db|sql|schema|migration|migrations|index|query|queries)\b|数据库|数据表|迁移|索引|查询|表结构/
const securityWorkPattern = /\b(security|secure|permission|permissions|vulnerability|vulnerabilities|xss|csrf|injection|secret|secrets)\b|安全|漏洞|权限|注入|密钥|风控/
const qaWorkPattern = /\b(qa|test|tests|testing|verify|verification|coverage|regression|e2e|unit test|integration test)\b|测试|验证|回归|覆盖率/
const reviewWorkPattern = /\b(review|code review|inspect|audit)\b|审查|评审|代码审查|复查/
const summaryWorkPattern = /\b(summary|summarize|report|recap|handoff)\b|总结|汇总|报告|交接/

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
  const todoRoleById = new Map(plan.todos.map((todo) => [todo.id, todo.role] as const))
  const explicit = (plan.dependencies ?? [])
    .filter((dependency) => validTodoIds.has(dependency.fromTodoId) && validTodoIds.has(dependency.toTodoId) && dependency.fromTodoId !== dependency.toTodoId)
    .filter((dependency) => {
      const fromRole = todoRoleById.get(dependency.fromTodoId)
      const toRole = todoRoleById.get(dependency.toTodoId)
      return fromRole && toRole && isExecutableDependencyEdge(plan.primaryRole, fromRole, toRole)
    })
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
      if (reviewInputId === reviewTodoId) continue
      dependencies.push({ fromTodoId: reviewInputId, toTodoId: reviewTodoId, reason: "Review runs after implementation output exists." })
    }
  }

  return dedupeAgentTodoDependencies([...explicit, ...dependencies])
}

function isSupportRoleForPrimary(role: RoutedAgentRole, primaryRole: RoutedAgentRole): boolean {
  return role !== primaryRole && role !== "review"
}

function isExecutableDependencyEdge(primaryRole: RoutedAgentRole, fromRole: RoutedAgentRole, toRole: RoutedAgentRole): boolean {
  if (fromRole === "review") return toRole === "review"
  if (toRole === "review") return true
  if (isSupportRoleForPrimary(toRole, primaryRole)) {
    return isSupportRoleForPrimary(fromRole, primaryRole)
  }
  if (toRole === primaryRole) {
    return fromRole === primaryRole || isSupportRoleForPrimary(fromRole, primaryRole)
  }
  return true
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
// packages/agent-runtime fails or is unavailable. It keeps direct replies in
// rush, but routes obvious workspace operations away from rush because they
// need runtime tools.
export function planAgentRouting(prompt: string, brain?: BrainModel): AgentRoutingPlan {
  const normalized = prompt.toLowerCase()
  const primaryRole = selectFallbackPrimaryRole(normalized)
  const workers = createFallbackWorkers(normalized, primaryRole)
  const todos = createFallbackTodos(normalized, primaryRole, workers)
  return normalizeAgentRoutingPlan({
    primaryRole,
    workers,
    todos,
    dependencies: createFallbackDependencies(todos),
    requiresReview: Boolean(brain?.routing.requireReviewForFileEdits && fileEditRiskPattern.test(normalized)),
    reason: "Deterministic fallback plan (no router decision).",
  })
}

function selectFallbackPrimaryRole(normalizedPrompt: string): RoutedAgentRole {
  if (imageGenerationPattern.test(normalizedPrompt)) return "imageMaker"
  if (workspaceOperationPattern.test(normalizedPrompt) && !hasDomainWork(normalizedPrompt)) return "devops"
  if (frontendWorkPattern.test(normalizedPrompt)) return "frontend"
  if (backendWorkPattern.test(normalizedPrompt)) return "backend"
  if (dbaWorkPattern.test(normalizedPrompt)) return "dba"
  if (designerWorkPattern.test(normalizedPrompt)) return "designer"
  if (securityWorkPattern.test(normalizedPrompt)) return "security"
  if (qaWorkPattern.test(normalizedPrompt)) return "qa"
  if (reviewWorkPattern.test(normalizedPrompt)) return "review"
  if (summaryWorkPattern.test(normalizedPrompt)) return "summarize"
  if (workspaceOperationPattern.test(normalizedPrompt)) return "devops"
  return "rush"
}

function hasDomainWork(normalizedPrompt: string): boolean {
  return frontendWorkPattern.test(normalizedPrompt)
    || backendWorkPattern.test(normalizedPrompt)
    || designerWorkPattern.test(normalizedPrompt)
    || dbaWorkPattern.test(normalizedPrompt)
    || securityWorkPattern.test(normalizedPrompt)
    || qaWorkPattern.test(normalizedPrompt)
    || reviewWorkPattern.test(normalizedPrompt)
}

function createFallbackWorkers(normalizedPrompt: string, primaryRole: RoutedAgentRole): AgentWorkerPlan[] {
  const roles: RoutedAgentRole[] = [primaryRole]
  const add = (role: RoutedAgentRole) => {
    if (!roles.includes(role)) roles.push(role)
  }

  if (primaryRole === "imageMaker") {
    return roles.map((role) => ({
      role,
      goal: fallbackWorkerGoal(role, role === primaryRole),
      reason: "Deterministic fallback selected this as the primary role.",
    }))
  }

  if (fileEditRiskPattern.test(normalizedPrompt) && primaryRole !== "rush" && primaryRole !== "devops" && primaryRole !== "review" && primaryRole !== "summarize") add("librarian")
  if (designerWorkPattern.test(normalizedPrompt) && primaryRole !== "designer") add("designer")
  if (backendWorkPattern.test(normalizedPrompt) && primaryRole !== "backend") add("backend")
  if (frontendWorkPattern.test(normalizedPrompt) && primaryRole !== "frontend") add("frontend")
  if (dbaWorkPattern.test(normalizedPrompt) && primaryRole !== "dba") add("dba")
  if (securityWorkPattern.test(normalizedPrompt) && primaryRole !== "security") add("security")
  if (qaWorkPattern.test(normalizedPrompt) && primaryRole !== "qa") add("qa")
  // A review worker vets file edits, so only attach one when the prompt carries
  // file-edit intent. A read-only inspection ("review only … do not alter files")
  // names "review" without editing anything and must not spawn a review worker.
  if (reviewWorkPattern.test(normalizedPrompt) && fileEditRiskPattern.test(normalizedPrompt) && primaryRole !== "review") add("review")

  return roles.map((role) => ({
    role,
    goal: fallbackWorkerGoal(role, role === primaryRole),
    reason: role === primaryRole
      ? "Deterministic fallback selected this as the primary role."
      : "Deterministic fallback selected this support role from explicit task wording.",
  }))
}

function fallbackWorkerGoal(role: RoutedAgentRole, primary: boolean): string {
  const prefix = primary ? "Complete the request" : "Support the primary agent"
  switch (role) {
    case "frontend":
      return `${prefix} by handling UI, browser-facing behavior, state, styling, and frontend integration.`
    case "backend":
      return `${prefix} by handling API contracts, server behavior, validation, persistence boundaries, and focused backend tests.`
    case "designer":
      return `${prefix} by defining implementable UX, layout, interaction states, accessibility requirements, and copy guidance.`
    case "dba":
      return `${prefix} by handling schema, migration, SQL, indexing, and data-integrity concerns.`
    case "devops":
      return `${prefix} by handling workspace, build, CI, release, shell, or operational tasks.`
    case "security":
      return `${prefix} by identifying trust-boundary, authentication, authorization, secret, and abuse-case risks.`
    case "qa":
      return `${prefix} by planning or adding focused verification for meaningful regression risk.`
    case "review":
      return `${prefix} by inspecting implementation results or existing diffs for defects and risky assumptions.`
    case "summarize":
      return `${prefix} by producing a concise report, handoff, or recap.`
    case "imageMaker":
      return `${prefix} by generating the requested image asset.`
    case "oracle":
      return `${prefix} by resolving ambiguous architecture, tradeoff, or deep debugging decisions.`
    case "librarian":
      return `${prefix} by mapping relevant files, symbols, architecture, and project conventions.`
    case "rush":
      return "Handle the request when no specialist role has been chosen; escalate via handoff if it clearly belongs to a specialist."
  }
}

function createFallbackTodos(normalizedPrompt: string, primaryRole: RoutedAgentRole, workers: AgentWorkerPlan[]): AgentTodoItem[] {
  const todos: AgentTodoItem[] = []
  const hasRole = (role: RoutedAgentRole) => workers.some((worker) => worker.role === role)
  const push = (id: string, title: string, role: RoutedAgentRole, reason: string) => {
    todos.push({ id, title, role, status: "pending", reason })
  }

  if (hasRole("librarian")) push("map-context", "Map relevant project structure, conventions, and entrypoints", "librarian", "Implementation workers need precise project context.")
  if (hasRole("designer")) push("design-experience", "Define implementable UX, states, accessibility, and copy", "designer", "Frontend work depends on design guidance.")
  if (hasRole("dba")) push("plan-data", "Plan schema, query, or migration changes", "dba", "Backend work may depend on data contracts.")
  if (hasRole("security")) push("assess-security", "Identify security requirements and abuse mitigations", "security", "Implementation should incorporate security constraints.")
  if (hasRole("backend")) push("build-backend", "Implement backend contract, validation, and server-side tests", "backend", "Backend owns API and service behavior.")
  if (hasRole("frontend")) push("build-frontend", "Implement frontend UI, state handling, and integration checks", "frontend", "Frontend owns the user-facing feature surface.")
  if (hasRole("devops")) push("handle-workspace", "Handle workspace, build, command, CI, or release work", "devops", "The request mentions operational or command work.")
  if (hasRole("qa")) push("verify-behavior", "Verify behavior and identify regression coverage", "qa", "The request asks for tests or validation.")
  if (hasRole("review")) push("review-result", "Review the result for defects, regressions, and risky assumptions", "review", "The request asks for review or the task is review-like.")
  if (hasRole("imageMaker")) push("generate-image", "Generate the requested image artifact", "imageMaker", "The request asks for image generation.")

  const shouldReport = summaryWorkPattern.test(normalizedPrompt) && primaryRole !== "summarize"
  if (shouldReport) push("final-report", "Produce a final report with changes, validation, and remaining risks", primaryRole, "The request asks for a final consolidated report.")
  if (todos.length === 0) push(createAgentTodoId(primaryRole, 0), workers[0]?.goal ?? fallbackWorkerGoal(primaryRole, true), primaryRole, "Deterministic fallback used when no router decision is available.")
  return todos
}

function createFallbackDependencies(todos: AgentTodoItem[]): AgentTodoDependency[] {
  const byRole = new Map<RoutedAgentRole, string[]>()
  for (const todo of todos) {
    byRole.set(todo.role, [...(byRole.get(todo.role) ?? []), todo.id])
  }
  const dependencies: AgentTodoDependency[] = []
  const add = (fromTodoId: string | undefined, toTodoId: string | undefined, reason: string) => {
    if (!fromTodoId || !toTodoId || fromTodoId === toTodoId) return
    dependencies.push({ fromTodoId, toTodoId, reason })
  }
  const first = (role: RoutedAgentRole) => byRole.get(role)?.[0]
  const allImplementationTodoIds = todos
    .filter((todo) => todo.role !== "librarian" && todo.role !== "designer" && todo.role !== "qa" && todo.role !== "review" && todo.id !== "final-report")
    .map((todo) => todo.id)
  const reportTodoId = first("summarize") ?? todos.find((todo) => todo.id === "final-report")?.id

  for (const todoId of allImplementationTodoIds) {
    add(first("librarian"), todoId, "Implementation should follow discovered project conventions.")
  }
  add(first("designer"), first("frontend"), "Frontend implementation depends on design guidance.")
  add(first("dba"), first("backend"), "Backend implementation depends on data-contract guidance.")
  add(first("security"), first("backend"), "Backend implementation should incorporate security requirements.")
  add(first("backend"), first("frontend"), "Frontend integration depends on the backend API contract.")
  for (const todoId of allImplementationTodoIds) {
    add(todoId, first("qa"), "QA should verify implementation output.")
    add(todoId, first("review"), "Review should inspect implementation output.")
    add(todoId, reportTodoId, "Final reporting needs implementation output.")
  }
  add(first("qa"), reportTodoId, "Final reporting should include verification results.")
  return dependencies
}

export function selectAgentRole(prompt: string): RoutedAgentRole {
  return planAgentRouting(prompt).primaryRole
}

export function selectModelPolicy(brain: BrainModel, role: AgentRole): ModelPolicy {
  return brain.roles[role] ?? brain.roles.rush
}
