import { expect, test } from "bun:test"
import { agentToBrainContextTransfer, brainToAgentContextTransfer, type HandoffPacket, type WorkerResult } from "./index"

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
