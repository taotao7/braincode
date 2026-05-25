export type ModelPolicy = {
  modelId: string
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
}

export type BraincodeMode = "auto" | "radical"

export type BrainModel = {
  id: string
  name: string
  description: string
  planner: ModelPolicy
  roles: {
    coding: ModelPolicy
    research: ModelPolicy
    review: ModelPolicy
    summarize: ModelPolicy
    fastReply: ModelPolicy
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
