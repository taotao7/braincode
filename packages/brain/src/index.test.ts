import { expect, test } from "bun:test"
import { getModePolicy, planAgentRouting, selectAgentRole, selectBrain, selectModelPolicy, type BrainModel } from "./index"

const brain: BrainModel = {
  id: "brain",
  name: "Brain",
  description: "Test brain",
  planner: { modelId: "planner", thinkingLevel: "medium" },
  roles: {
    routeBrain: { modelId: "planner", thinkingLevel: "xhigh" },
    coding: { modelId: "coding", thinkingLevel: "medium" },
    frontend: { modelId: "frontend", thinkingLevel: "medium" },
    backend: { modelId: "backend", thinkingLevel: "medium" },
    designer: { modelId: "designer", thinkingLevel: "medium" },
    dba: { modelId: "dba", thinkingLevel: "high" },
    devops: { modelId: "devops", thinkingLevel: "medium" },
    security: { modelId: "security", thinkingLevel: "high" },
    qa: { modelId: "qa", thinkingLevel: "low" },
    research: { modelId: "research", thinkingLevel: "low" },
    review: { modelId: "review", thinkingLevel: "high" },
    summarize: { modelId: "summarize", thinkingLevel: "low" },
    fastReply: { modelId: "fast", thinkingLevel: "minimal" },
    oracle: { modelId: "oracle", thinkingLevel: "xhigh" },
    librarian: { modelId: "librarian", thinkingLevel: "high" },
    rush: { modelId: "rush", thinkingLevel: "low" },
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
  expect(selectAgentRole("fix the frontend layout")).toBe("frontend")
  expect(selectAgentRole("optimize this SQL migration")).toBe("dba")
  expect(selectAgentRole("deep architecture tradeoff analysis")).toBe("oracle")
  expect(selectAgentRole("understand this external codebase architecture")).toBe("librarian")
  expect(selectAgentRole("hello")).toBe("fastReply")
  expect(selectAgentRole("implement the feature")).toBe("coding")
})

test("planAgentRouting returns workers and review requirements", () => {
  const plan = planAgentRouting("implement a secure frontend login flow with tests", brain)

  expect(plan.primaryRole).toBe("coding")
  expect(plan.workers.map((worker) => worker.role)).toEqual(["coding", "frontend"])
  expect(plan.requiresReview).toBe(true)
  expect(plan.reason).toBe("Multiple specialized role signals matched the prompt.")
})

test("planAgentRouting respects max parallel worker budget", () => {
  const plan = planAgentRouting("implement frontend backend security tests deployment", {
    ...brain,
    routing: { ...brain.routing, maxParallelAgents: 3 },
  })

  expect(plan.workers).toHaveLength(3)
})

test("selectBrain and selectModelPolicy return configured policies", () => {
  expect(selectBrain([brain], "brain")).toBe(brain)
  expect(selectModelPolicy(brain, "review")).toEqual({ modelId: "review", thinkingLevel: "high" })
})
