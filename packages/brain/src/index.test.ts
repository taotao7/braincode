import { expect, test } from "bun:test"
import { getModePolicy, selectAgentRole, selectBrain, selectModelPolicy, type BrainModel } from "./index"

const brain: BrainModel = {
  id: "default",
  name: "Default",
  description: "Test brain",
  planner: { modelId: "planner", thinkingLevel: "medium" },
  roles: {
    coding: { modelId: "coding", thinkingLevel: "medium" },
    research: { modelId: "research", thinkingLevel: "low" },
    review: { modelId: "review", thinkingLevel: "high" },
    summarize: { modelId: "summarize", thinkingLevel: "low" },
    fastReply: { modelId: "fast", thinkingLevel: "minimal" },
  },
  routing: {
    maxParallelAgents: 2,
    preferCheapModelForSimpleTasks: true,
    escalateOnUncertainty: true,
    requireReviewForFileEdits: true,
  },
  context: {
    maxInputTokens: 1000,
    compaction: "auto",
    isolation: "strict",
  },
}

test("mode policies distinguish auto and radical", () => {
  expect(getModePolicy("auto").mode).toBe("auto")
  expect(getModePolicy("radical").mode).toBe("radical")
})

test("selectAgentRole uses simple intent heuristics", () => {
  expect(selectAgentRole("review this patch")).toBe("review")
  expect(selectAgentRole("summarize the work")).toBe("summarize")
  expect(selectAgentRole("research pi agent runtime")).toBe("research")
  expect(selectAgentRole("hello")).toBe("fastReply")
  expect(selectAgentRole("implement the feature")).toBe("coding")
})

test("selectBrain and selectModelPolicy return configured policies", () => {
  expect(selectBrain([brain], "default")).toBe(brain)
  expect(selectModelPolicy(brain, "review")).toEqual({ modelId: "review", thinkingLevel: "high" })
})
