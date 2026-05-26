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

export function selectAgentRole(prompt: string): AgentRole {
  const normalized = prompt.toLowerCase()
  if (/\b(frontend|front-end|ui|ux|react|vue|svelte|css|html|页面|前端|界面)\b/.test(normalized)) return "frontend"
  if (/\b(backend|back-end|api|server|service|后端|接口|服务端)\b/.test(normalized)) return "backend"
  if (/\b(design|designer|visual|mockup|wireframe|style|品牌|设计|视觉|原型)\b/.test(normalized)) return "designer"
  if (/\b(database|db|dba|sql|postgres|mysql|sqlite|schema|migration|数据库|索引|迁移)\b/.test(normalized)) return "dba"
  if (/\b(devops|deploy|deployment|docker|kubernetes|k8s|ci|cd|infra|ops|部署|运维|流水线)\b/.test(normalized)) return "devops"
  if (/\b(security|secure|auth|permission|vulnerability|threat|安全|权限|漏洞|鉴权)\b/.test(normalized)) return "security"
  if (/\b(test|tests|testing|qa|e2e|unit test|integration test|测试|质量)\b/.test(normalized)) return "qa"
  if (/\b(review|audit|inspect|check)\b/.test(normalized)) return "review"
  if (/\b(summarize|summary|recap)\b/.test(normalized)) return "summarize"
  if (/\b(research|find|search|investigate)\b/.test(normalized)) return "research"
  if (/\b(hi|hello|thanks|thank you)\b/.test(normalized) && normalized.length < 120) return "fastReply"
  return "coding"
}

export function selectModelPolicy(brain: BrainModel, role: AgentRole): ModelPolicy {
  return brain.roles[role] ?? brain.roles.coding
}
