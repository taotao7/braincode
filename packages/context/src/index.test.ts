import { expect, test } from "bun:test"
import { agentToBrainContextTransfer, brainToAgentContextTransfer, createBrainTaskContext, createHandoffAgentMessage, createWorkerResultAgentMessage, nextDevelopmentPhaseStep, validateDevelopmentPhaseGate, type DevelopmentPhaseContract, type HandoffPacket, type WorkerResult } from "./index"

test("context packets keep Brain parent context separate from agent task context", () => {
  const handoff: HandoffPacket = {
    ...brainToAgentContextTransfer,
    id: "handoff-1",
    task: {
      id: "agent-task-1",
      parentId: "brain-task-1233",
      layer: "agent",
      agentRole: "librarian",
      goal: "Map the relevant codebase structure.",
      progress: { status: "pending" },
      contextRefs: [],
    },
    constraints: ["Use only this isolated task context."],
    expectedResult: "Structured result for Brain.",
  }

  const result: WorkerResult = {
    ...agentToBrainContextTransfer,
    handoffId: handoff.id,
    taskId: handoff.task.id,
    parentId: handoff.task.parentId,
    progress: { status: "completed", summary: "Mapped the requested structure." },
    summary: "Relevant files and package boundaries identified.",
    artifacts: [],
    risks: [],
    nextQuestions: [],
  }

  expect(handoff.fromLayer).toBe("brain")
  expect(handoff.task.parentId).toBe("brain-task-1233")
  expect(result.fromLayer).toBe("agent")
  expect(result.taskId).toBe(handoff.task.id)
  expect(result.parentId).toBe(handoff.task.parentId)
})

test("context helpers create Brain context and AgentMessage envelopes", () => {
  const brainContext = createBrainTaskContext({
    id: "brain-task-1",
    goal: "Coordinate a backend change.",
    childContextIds: ["agent-task-1"],
    contextRefs: [{ kind: "file", uri: "AGENTS.md", label: "project instructions" }],
  })
  const handoff: HandoffPacket = {
    ...brainToAgentContextTransfer,
    id: "handoff-1",
    task: {
      id: "agent-task-1",
      parentId: brainContext.id,
      layer: "agent",
      agentRole: "backend",
      goal: "Inspect the API contract.",
      progress: { status: "pending" },
      contextRefs: brainContext.contextRefs,
    },
    constraints: ["Use only this isolated task context."],
    expectedResult: "Structured result for Brain.",
  }
  const result: WorkerResult = {
    ...agentToBrainContextTransfer,
    handoffId: handoff.id,
    taskId: handoff.task.id,
    parentId: brainContext.id,
    progress: { status: "completed", summary: "API contract checked." },
    summary: "No contract issue found.",
    artifacts: [],
    risks: [],
    nextQuestions: [],
  }

  expect(brainContext.layer).toBe("brain")
  expect(brainContext.childContextIds).toEqual(["agent-task-1"])
  expect(createHandoffAgentMessage(handoff, "message-1")).toMatchObject({
    id: "message-1",
    parentId: "brain-task-1",
    from: "brain",
    to: "backend",
    kind: "handoff",
  })
  expect(createWorkerResultAgentMessage(result, { from: "backend", messageId: "message-2" })).toMatchObject({
    id: "message-2",
    parentId: "handoff-1",
    from: "backend",
    to: "orchestrator",
    kind: "result",
  })
})

test("development phase gates require durable artifacts before execution steps", () => {
  const contract: DevelopmentPhaseContract = {
    id: "phase-01",
    title: "Add runtime workflow contracts",
    goal: "Represent project-level phase progress independently from one agent transcript.",
    currentStep: "execute",
    acceptanceCriteria: ["Execution never starts without a reviewed plan artifact."],
    artifacts: [{ kind: "decision_context", uri: "docs/development-workflow.md" }],
  }

  expect(validateDevelopmentPhaseGate(contract, "plan")).toMatchObject({
    ok: true,
    missing: [],
    nextStep: "execute",
  })
  expect(validateDevelopmentPhaseGate(contract, "execute")).toMatchObject({
    ok: false,
    missing: ["execution_plan"],
  })
  expect(validateDevelopmentPhaseGate({
    ...contract,
    artifacts: [...contract.artifacts, { kind: "execution_plan", uri: "docs/project-structure.md#remaining-work" }],
  }, "execute")).toMatchObject({
    ok: true,
    missing: [],
    nextStep: "verify",
  })
})

test("development phase gates surface blockers and terminal next-step state", () => {
  const contract: DevelopmentPhaseContract = {
    id: "phase-02",
    title: "Ship review gate improvements",
    goal: "Close the review workflow gap.",
    currentStep: "ship",
    acceptanceCriteria: ["Verification passed."],
    artifacts: [{ kind: "verification", uri: "docs/review-and-audit.md" }],
    blockers: ["Waiting for human approval policy."],
  }

  expect(validateDevelopmentPhaseGate(contract)).toMatchObject({
    ok: false,
    targetStep: "ship",
    blockers: ["Waiting for human approval policy."],
  })
  expect(nextDevelopmentPhaseStep("ship")).toBeUndefined()
})
