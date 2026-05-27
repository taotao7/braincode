import type { AgentMessage, ContextRef } from "@braincode/protocol"

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

export type CreateBrainTaskContextInput = {
  id: string
  goal: string
  childContextIds?: string[]
  contextRefs?: ContextRef[]
  progress?: TaskProgress
}

export function createBrainTaskContext(input: CreateBrainTaskContextInput): BrainTaskContext {
  return {
    id: input.id,
    layer: "brain",
    goal: input.goal,
    progress: input.progress ?? { status: "pending", summary: "Brain orchestration context is planned." },
    childContextIds: input.childContextIds ?? [],
    contextRefs: input.contextRefs ?? [],
  }
}

export function createHandoffAgentMessage(handoff: HandoffPacket, messageId = crypto.randomUUID()): AgentMessage {
  return {
    id: messageId,
    parentId: handoff.task.parentId,
    from: "brain",
    to: handoff.task.agentRole,
    kind: "handoff",
    payload: handoff,
    contextRefs: handoff.task.contextRefs,
  }
}

export function createWorkerResultAgentMessage(
  result: WorkerResult,
  options: { from?: string; messageId?: string } = {},
): AgentMessage {
  return {
    id: options.messageId ?? crypto.randomUUID(),
    parentId: result.handoffId,
    from: options.from ?? result.taskId,
    to: "orchestrator",
    kind: result.progress.status === "failed" ? "error" : "result",
    payload: result,
    contextRefs: result.artifacts,
  }
}
