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

export type DevelopmentPhaseStep = "discuss" | "design" | "plan" | "execute" | "verify" | "ship"

export const developmentPhaseSteps = [
  "discuss",
  "design",
  "plan",
  "execute",
  "verify",
  "ship",
] as const satisfies readonly DevelopmentPhaseStep[]

export type DevelopmentPhaseArtifactKind =
  | "decision_context"
  | "ui_spec"
  | "research"
  | "execution_plan"
  | "execution_summary"
  | "verification"
  | "release_record"

export type DevelopmentPhaseArtifact = {
  kind: DevelopmentPhaseArtifactKind
  uri: string
  label?: string
  phaseId?: string
  planId?: string
}

export type DevelopmentPhaseContract = {
  id: string
  title: string
  goal: string
  currentStep: DevelopmentPhaseStep
  requirements?: string[]
  decisions?: string[]
  acceptanceCriteria: string[]
  artifacts: DevelopmentPhaseArtifact[]
  blockers?: string[]
}

export type DevelopmentPhaseGateResult = {
  ok: boolean
  targetStep: DevelopmentPhaseStep
  missing: string[]
  blockers: string[]
  nextStep?: DevelopmentPhaseStep
}

export const requiredDevelopmentPhaseArtifacts: Record<DevelopmentPhaseStep, readonly DevelopmentPhaseArtifactKind[]> = {
  discuss: [],
  design: ["decision_context"],
  plan: ["decision_context"],
  execute: ["execution_plan"],
  verify: ["execution_summary"],
  ship: ["verification"],
}

export function nextDevelopmentPhaseStep(step: DevelopmentPhaseStep): DevelopmentPhaseStep | undefined {
  const index = developmentPhaseSteps.indexOf(step)
  return index >= 0 ? developmentPhaseSteps[index + 1] : undefined
}

export function validateDevelopmentPhaseGate(
  contract: DevelopmentPhaseContract,
  targetStep: DevelopmentPhaseStep = contract.currentStep,
): DevelopmentPhaseGateResult {
  const missing = new Set<string>()
  const phaseId = contract.id.trim()
  const goal = contract.goal.trim()
  if (!phaseId) missing.add("phase id")
  if (!goal) missing.add("phase goal")
  if (targetStep !== "discuss" && contract.acceptanceCriteria.length === 0) {
    missing.add("acceptance criteria")
  }
  for (const artifactKind of requiredDevelopmentPhaseArtifacts[targetStep]) {
    if (!contract.artifacts.some((artifact) => artifact.kind === artifactKind && artifact.uri.trim())) {
      missing.add(artifactKind)
    }
  }
  const blockers = [...(contract.blockers ?? [])].filter((blocker) => blocker.trim())
  return {
    ok: missing.size === 0 && blockers.length === 0,
    targetStep,
    missing: [...missing],
    blockers,
    nextStep: nextDevelopmentPhaseStep(targetStep),
  }
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

export function createHandoffAgentMessage(handoff: HandoffPacket, messageId: string = crypto.randomUUID()): AgentMessage {
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
