import { expect, test } from "bun:test"
import { agentRoleSystemPrompts, formatRoutedAgentRoleCatalog, getModePolicy, planAgentRouting, routedAgentRoles, selectBrain, selectModelPolicy, type BrainModel } from "./index"

const brain: BrainModel = {
  id: "brain",
  name: "Brain",
  description: "Test brain",
  planner: { modelId: "planner", thinkingLevel: "medium" },
  roles: {
    routeBrain: { modelId: "planner", thinkingLevel: "xhigh" },
    frontend: { modelId: "frontend", thinkingLevel: "medium" },
    backend: { modelId: "backend", thinkingLevel: "medium" },
    designer: { modelId: "designer", thinkingLevel: "medium" },
    dba: { modelId: "dba", thinkingLevel: "high" },
    devops: { modelId: "devops", thinkingLevel: "medium" },
    security: { modelId: "security", thinkingLevel: "high" },
    qa: { modelId: "qa", thinkingLevel: "low" },
    review: { modelId: "review", thinkingLevel: "high" },
    summarize: { modelId: "summarize", thinkingLevel: "low" },
    oracle: { modelId: "oracle", thinkingLevel: "xhigh" },
    librarian: { modelId: "librarian", thinkingLevel: "high" },
    rush: { modelId: "rush", thinkingLevel: "low" },
    pet: { modelId: "pet", thinkingLevel: "minimal" },
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

test("planAgentRouting falls back to rush deterministically (LLM-driven routing lives in agent-runtime)", () => {
  const plan = planAgentRouting("review this patch", brain)
  expect(plan.primaryRole).toBe("rush")
  expect(plan.workers.map((worker) => worker.role)).toEqual(["rush"])
})

test("planAgentRouting flags requiresReview when file-edit risk words appear", () => {
  const edit = planAgentRouting("implement a new feature", brain)
  expect(edit.requiresReview).toBe(true)

  const benign = planAgentRouting("hello there", brain)
  expect(benign.requiresReview).toBe(false)
})

test("planAgentRouting honors requireReviewForFileEdits=false", () => {
  const looseBrain: BrainModel = { ...brain, routing: { ...brain.routing, requireReviewForFileEdits: false } }
  const plan = planAgentRouting("implement a new feature", looseBrain)
  expect(plan.requiresReview).toBe(false)
})

test("routedAgentRoles contains exactly the 12 routed roles (no coding/fastReply/research)", () => {
  expect(routedAgentRoles).toEqual([
    "frontend", "backend", "designer", "dba", "devops", "security", "qa",
    "review", "summarize", "oracle", "librarian", "rush",
  ])
  for (const role of routedAgentRoles) {
    expect(role).not.toBe("coding")
    expect(role).not.toBe("fastReply")
    expect(role).not.toBe("research")
  }
})

test("agent role prompts cover every routed role and the router", () => {
  expect(agentRoleSystemPrompts.routeBrain).toContain("intelligent routing")
  for (const role of routedAgentRoles) {
    expect(agentRoleSystemPrompts[role]).toContain("Braincode")
  }
})

test("formatRoutedAgentRoleCatalog lists each routed role exactly once", () => {
  const catalog = formatRoutedAgentRoleCatalog()
  for (const role of routedAgentRoles) {
    expect(catalog).toContain(`- ${role} `)
  }
  // Removed roles should not appear in the LLM-facing catalog.
  expect(catalog).not.toMatch(/^- coding /m)
  expect(catalog).not.toMatch(/^- fastReply /m)
  expect(catalog).not.toMatch(/^- research /m)
})

test("selectBrain and selectModelPolicy return configured policies", () => {
  expect(selectBrain([brain], "brain")).toBe(brain)
  expect(selectModelPolicy(brain, "review")).toEqual({ modelId: "review", thinkingLevel: "high" })
})
