export type ModelPolicy = {
  modelId: string
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
    research: ModelPolicy
    review: ModelPolicy
    summarize: ModelPolicy
    fastReply: ModelPolicy
    oracle: ModelPolicy
    librarian: ModelPolicy
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
  if (/\b(review|audit|inspect|check)\b/.test(normalized)) return "review"
  if (/\b(summarize|summary|recap)\b/.test(normalized)) return "summarize"
  if (/\b(research|find|search|investigate)\b/.test(normalized)) return "research"
  if (/\b(hi|hello|thanks|thank you)\b/.test(normalized) && normalized.length < 120) return "fastReply"
  return "coding"
}

export function selectModelPolicy(brain: BrainModel, role: AgentRole): ModelPolicy {
  return brain.roles[role]
}
