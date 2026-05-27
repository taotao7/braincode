import { expect, test } from "bun:test"
import { agentRoleSystemPrompts, createAgentTodoId, formatRoutedAgentRoleCatalog, getAgentRoleSystemPrompt, getModePolicy, normalizeAgentRoutingPlan, normalizeAgentTodos, planAgentRouting, routedAgentRoles, selectAgentRole, selectBrain, selectModelPolicy, type AgentTodoItem, type AgentWorkerPlan, type BrainModel } from "./index"

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
  expect(selectModelPolicy({ ...brain, roles: { ...brain.roles, qa: undefined as never } }, "qa")).toEqual({ modelId: "rush", thinkingLevel: "low" })
  expect(() => selectBrain([brain], "missing")).toThrow("Unknown brain id")
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
