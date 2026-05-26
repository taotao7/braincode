import type { ContextRef } from "@braincode/protocol"

export type ContextLayer = "brain" | "agent"

export type BrainToAgentContextTransfer = {
  fromLayer: "brain"
  toLayer: "agent"
}

export type AgentToBrainContextTransfer = {
  fromLayer: "agent"
  toLayer: "brain"
}

export const brainToAgentContextTransfer: BrainToAgentContextTransfer = {
  fromLayer: "brain",
  toLayer: "agent",
}

export const agentToBrainContextTransfer: AgentToBrainContextTransfer = {
  fromLayer: "agent",
  toLayer: "brain",
}

export type TaskProgressStatus = "pending" | "running" | "completed" | "blocked" | "failed"

export type TaskProgress = {
  status: TaskProgressStatus
  summary?: string
  currentStep?: string
  completedSteps?: string[]
  percent?: number
}

export type BrainTaskContext = {
  id: string
  layer: "brain"
  goal: string
  progress: TaskProgress
  childContextIds: string[]
  contextRefs: ContextRef[]
}

export type AgentTaskContext = {
  id: string
  parentId: string
  layer: "agent"
  agentRole: string
  goal: string
  progress: TaskProgress
  contextRefs: ContextRef[]
}

export type HandoffPacket = BrainToAgentContextTransfer & {
  id: string
  task: AgentTaskContext
  constraints: string[]
  expectedResult: string
}

export type WorkerResult = AgentToBrainContextTransfer & {
  handoffId: string
  taskId: string
  parentId: string
  progress: TaskProgress
  summary: string
  artifacts: ContextRef[]
  risks: string[]
  nextQuestions: string[]
}
