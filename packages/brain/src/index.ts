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

export type RoutedAgentRole = Exclude<AgentRole, "routeBrain">

export type AgentWorkerPlan = {
  role: RoutedAgentRole
  goal: string
  reason: string
}

export type AgentRoutingPlan = {
  primaryRole: RoutedAgentRole
  workers: AgentWorkerPlan[]
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

type RoleSignal = {
  role: RoutedAgentRole
  pattern: RegExp
  goal: string
  reason: string
}

const roleSignals: RoleSignal[] = [
  { role: "oracle", pattern: /\b(oracle|deep reasoning|architecture|architect|hard debugging|tradeoff|复杂架构|深入分析|疑难|架构)\b/, goal: "Provide deep reasoning, architecture guidance, or a hard-debugging plan.", reason: "The prompt asks for deep reasoning, architecture, or difficult debugging." },
  { role: "librarian", pattern: /\b(librarian|external codebase|large codebase|repository architecture|trace codebase|代码库理解|外部仓库|架构梳理)\b/, goal: "Understand the relevant codebase or repository structure and return concise findings.", reason: "The prompt asks for codebase or repository understanding." },
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

export function planAgentRouting(prompt: string, brain?: BrainModel): AgentRoutingPlan {
  const normalized = prompt.toLowerCase()
  const matched = roleSignals.filter((signal) => signal.pattern.test(normalized))

  if (matched.length === 0 && simpleConversationPattern.test(normalized) && normalized.length < 120) {
    return {
      primaryRole: "fastReply",
      workers: [{ role: "fastReply", goal: "Answer the simple conversational prompt directly.", reason: "The prompt is short conversational text." }],
      requiresReview: false,
      reason: "Short conversational prompt routed to fastReply.",
    }
  }

  if (matched.length === 0) {
    return {
      primaryRole: "coding",
      workers: [{ role: "coding", goal: "Implement or modify code according to the user's request.", reason: "No specialized role signal was stronger than the default coding path." }],
      requiresReview: Boolean(brain?.routing.requireReviewForFileEdits && fileEditRiskPattern.test(normalized)),
      reason: "No specialized signal matched; defaulting to coding.",
    }
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

  return {
    primaryRole,
    workers,
    requiresReview: Boolean(brain?.routing.requireReviewForFileEdits && fileEditRiskPattern.test(normalized)),
    reason: workers.length > 1 ? "Multiple specialized role signals matched the prompt." : workers[0]?.reason ?? "Routed by role signal.",
  }
}

export function selectAgentRole(prompt: string): RoutedAgentRole {
  return planAgentRouting(prompt).primaryRole
}

export function selectModelPolicy(brain: BrainModel, role: AgentRole): ModelPolicy {
  return brain.roles[role] ?? brain.roles.coding
}
