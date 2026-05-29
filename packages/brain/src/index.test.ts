import { expect, test } from "bun:test"
import { agentRoleSystemPrompts, createAgentTodoId, formatAgentRoleCatalog, formatRoutedAgentRoleCatalog, getAgentRoleSystemPrompt, getModePolicy, getModeRoutingLimits, normalizeAgentRoutingPlan, normalizeAgentTodos, planAgentRouting, routedAgentRoles, selectAgentRole, selectBrain, selectModelPolicy, type AgentTodoItem, type AgentWorkerPlan, type BrainModel, type BrainPreset } from "./index"

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
    imageMaker: { modelId: "image", thinkingLevel: "off" },
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
  expect(getModePolicy("auto").routing.strategy).toBe("focused")
  expect(getModePolicy("radical").routing.strategy).toBe("expansive")
  expect(getModePolicy("auto").requiresExplicitApprovalForRiskyActions).toBe(true)
  expect(getModePolicy("radical").requiresExplicitApprovalForRiskyActions).toBe(false)
})

test("mode routing limits make radical materially more parallel", () => {
  expect(getModeRoutingLimits("auto", 2)).toEqual({
    configuredMaxParallelAgents: 2,
    maxParallelAgents: 2,
    maxWorkerAgents: 2,
    maxTodos: 6,
  })
  expect(getModeRoutingLimits("radical", 2)).toEqual({
    configuredMaxParallelAgents: 2,
    maxParallelAgents: 4,
    maxWorkerAgents: 4,
    maxTodos: 8,
  })
})

test("planAgentRouting keeps tiny direct replies in rush", () => {
  const plan = planAgentRouting("hello there", brain)
  expect(plan.primaryRole).toBe("rush")
  expect(plan.workers.map((worker) => worker.role)).toEqual(["rush"])
})

test("planAgentRouting fallback routes obvious reviews to review", () => {
  const plan = planAgentRouting("review this patch", brain)
  expect(plan.primaryRole).toBe("review")
  expect(plan.workers.map((worker) => worker.role)).toEqual(["review"])
})

test("planAgentRouting fallback avoids rush for obvious workspace tool operations", () => {
  const plan = planAgentRouting("git status, add the changes, and commit them", brain)
  expect(plan.primaryRole).toBe("devops")
  expect(plan.workers.map((worker) => worker.role)).toEqual(["devops"])
})

test("planAgentRouting fallback routes obvious image generation to imageMaker", () => {
  const plan = planAgentRouting("生成一张前端角色图，用在网站轮播里", brain)
  expect(plan.primaryRole).toBe("imageMaker")
  expect(plan.workers.map((worker) => worker.role)).toEqual(["imageMaker"])
})

test("planAgentRouting fallback decomposes cross-stack UI/API/report work", () => {
  const plan = planAgentRouting("实现一个登录页，前端需要设计，后端需要接口，最后汇总报告", brain)

  expect(plan.primaryRole).toBe("frontend")
  expect(plan.workers.map((worker) => worker.role)).toEqual(["frontend", "librarian", "designer", "backend"])
  expect(plan.todos.map((todo) => [todo.id, todo.role])).toEqual([
    ["map-context", "librarian"],
    ["design-experience", "designer"],
    ["build-backend", "backend"],
    ["build-frontend", "frontend"],
    ["final-report", "frontend"],
  ])
  expect(plan.dependencies).toContainEqual({ fromTodoId: "design-experience", toTodoId: "build-frontend", reason: "Frontend implementation depends on design guidance." })
  expect(plan.dependencies).toContainEqual({ fromTodoId: "build-backend", toTodoId: "build-frontend", reason: "Frontend integration depends on the backend API contract." })
  expect(plan.dependencies).toContainEqual({ fromTodoId: "build-frontend", toTodoId: "final-report", reason: "Final reporting needs implementation output." })
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

test("routedAgentRoles contains exactly the 13 routed roles (no coding/fastReply/research)", () => {
  expect(routedAgentRoles).toEqual([
    "frontend", "backend", "designer", "imageMaker", "dba", "devops", "security", "qa",
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
  expect(agentRoleSystemPrompts.routeBrain).toContain("Agent role catalog")
  expect(agentRoleSystemPrompts.routeBrain).toContain("Never use rush for workspace actions")
  expect(agentRoleSystemPrompts.routeBrain).toContain("Runtime order is support workers first")
  expect(agentRoleSystemPrompts.rush).toContain("it is not rush work")
  for (const role of routedAgentRoles) {
    expect(agentRoleSystemPrompts[role]).toContain("Braincode")
    expect(agentRoleSystemPrompts.routeBrain).toContain(`- ${role} `)
  }
  expect(agentRoleSystemPrompts.routeBrain).toContain("- routeBrain ")
  expect(agentRoleSystemPrompts.routeBrain).toContain("- pet ")
  expect(agentRoleSystemPrompts.routeBrain).not.toMatch(/\b(GPT|Claude|Gemini|modelId|provider)\b/i)
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
  expect(catalog).not.toContain("modelId")
})

test("formatAgentRoleCatalog can include internal non-routed roles for routeBrain context", () => {
  const internalCatalog = formatAgentRoleCatalog({ includeInternal: true })
  expect(internalCatalog).toContain("- routeBrain ")
  expect(internalCatalog).toContain("- pet ")
  expect(internalCatalog).toContain("Boundaries:")
})

test("selectBrain and selectModelPolicy return configured policies", () => {
  expect(selectBrain([brain], "brain")).toBe(brain)
  expect(selectModelPolicy(brain, "review")).toEqual({ modelId: "review", thinkingLevel: "high" })
  expect(selectModelPolicy({ ...brain, roles: { ...brain.roles, qa: undefined as never } }, "qa")).toEqual({ modelId: "rush", thinkingLevel: "low" })
  expect(() => selectBrain([brain], "missing")).toThrow("Unknown brain id")
})

test("selectBrain resolves preset inheritance with focused overrides", () => {
  const presets: BrainPreset[] = [
    brain,
    {
      id: "safe-review",
      extends: "brain",
      name: "Safe Review",
      routing: { requireReviewForFileEdits: false },
      roles: {
        review: { modelId: "strong-review", thinkingLevel: "xhigh" },
      },
    },
  ]
  const derived = selectBrain(presets, "safe-review")

  expect(derived.id).toBe("safe-review")
  expect(derived.name).toBe("Safe Review")
  expect(derived.description).toBe("Test brain")
  expect(derived.routing).toMatchObject({
    maxParallelAgents: 2,
    requireReviewForFileEdits: false,
  })
  expect(derived.roles.review).toEqual({ modelId: "strong-review", thinkingLevel: "xhigh" })
  expect(derived.roles.backend).toEqual(brain.roles.backend)
  expect(derived.context).toEqual(brain.context)
})

test("role prompt and fallback role helpers normalize simple inputs", () => {
  expect(getAgentRoleSystemPrompt("review", { modelId: "review", thinkingLevel: "high", systemPrompt: " custom " })).toBe("custom")
  expect(getAgentRoleSystemPrompt("review")).toBe(agentRoleSystemPrompts.review)
  expect(createAgentTodoId("backend", 2)).toBe("todo-03-backend")
  expect(selectAgentRole("anything")).toBe("rush")
})

test("normalizeAgentTodos trims todos, repairs ids, and assigns workers", () => {
  const workers: AgentWorkerPlan[] = [
    { role: "backend", goal: "Implement API", reason: "needs backend" },
    { role: "review", goal: "Review patch", reason: "risky", todoIds: ["missing"] },
  ]
  const todos: AgentTodoItem[] = [
    { id: " Build API! ", title: " Build API ", role: "backend", status: "done" as never, reason: " because ", summary: " ok " },
    { id: "Build API", title: "Review", role: "review", status: "blocked" },
    { id: "empty", title: " ", role: "rush", status: "pending" },
  ]

  const normalized = normalizeAgentTodos(workers, todos)

  expect(normalized.todos.map((todo) => todo.id)).toEqual(["build-api", "build-api-2"])
  expect(normalized.todos[0]).toMatchObject({ title: "Build API", status: "pending", reason: "because", summary: "ok" })
  expect(normalized.todos[1]).toMatchObject({ title: "Review", status: "blocked" })
  expect(normalized.workers[0]?.todoIds).toEqual(["build-api"])
  expect(normalized.workers[1]?.todoIds).toEqual(["build-api-2"])
})

test("normalizeAgentRoutingPlan filters invalid dependencies and derives support/review edges", () => {
  const plan = normalizeAgentRoutingPlan({
    primaryRole: "backend",
    workers: [
      { role: "librarian", goal: "Find context", reason: "support" },
      { role: "backend", goal: "Implement", reason: "primary" },
      { role: "review", goal: "Review", reason: "review" },
    ],
    todos: [
      { id: "support", title: "Find context", role: "librarian", status: "pending" },
      { id: "primary", title: "Implement", role: "backend", status: "pending" },
      { id: "review", title: "Review", role: "review", status: "pending" },
    ],
    dependencies: [
      { fromTodoId: "support", toTodoId: "primary", reason: " explicit " },
      { fromTodoId: "support", toTodoId: "missing" },
      { fromTodoId: "review", toTodoId: "review" },
    ],
    requiresReview: true,
    reason: "test",
  })

  expect(plan.dependencies).toEqual([
    { fromTodoId: "support", toTodoId: "primary", reason: "explicit" },
    { fromTodoId: "primary", toTodoId: "review", reason: "Review runs after implementation output exists." },
  ])
})

test("normalizeAgentRoutingPlan drops primary-to-support dependencies the runtime cannot satisfy", () => {
  const plan = normalizeAgentRoutingPlan({
    primaryRole: "frontend",
    workers: [
      { role: "frontend", goal: "Implement UI", reason: "primary" },
      { role: "backend", goal: "Implement API", reason: "support" },
    ],
    todos: [
      { id: "frontend-plan", title: "Plan frontend", role: "frontend", status: "pending" },
      { id: "backend-api", title: "Build API", role: "backend", status: "pending" },
    ],
    dependencies: [
      { fromTodoId: "frontend-plan", toTodoId: "backend-api", reason: "unsupported reverse edge" },
    ],
    requiresReview: false,
    reason: "test",
  })

  expect(plan.dependencies).toEqual([
    { fromTodoId: "backend-api", toTodoId: "frontend-plan", reason: "Support worker output feeds the primary task." },
  ])
})

test("normalizeAgentRoutingPlan reviews non-review work when no primary todo exists", () => {
  const plan = normalizeAgentRoutingPlan({
    primaryRole: "backend",
    workers: [
      { role: "librarian", goal: "Find context", reason: "support" },
      { role: "review", goal: "Review", reason: "review" },
    ],
    todos: [
      { id: "support", title: "Find context", role: "librarian", status: "pending" },
      { id: "review", title: "Review", role: "review", status: "pending" },
    ],
    requiresReview: true,
    reason: "test",
  })

  expect(plan.dependencies).toEqual([
    { fromTodoId: "support", toTodoId: "review", reason: "Review runs after implementation output exists." },
  ])
})
