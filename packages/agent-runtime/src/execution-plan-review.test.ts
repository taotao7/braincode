import { expect, test } from "bun:test"
import { buildExecutionPlanReview } from "./execution-plan-review"
import type { RuntimePlan } from "./router"

const checkOptions = {
  enabled: true,
  scripts: [],
  strategy: "smart" as const,
  policies: {},
  timeoutMs: 180_000,
  maxOutputBytes: 24_000,
}

function createPlan(overrides: Partial<RuntimePlan> = {}): RuntimePlan {
  const model = {
    id: "custom/text",
    provider: "custom",
    modelId: "text",
    name: "Text",
    api: "openai-responses" as const,
    contextWindow: 128000,
    supportsTools: true,
  }
  const policy = { modelId: "custom/text", thinkingLevel: "low" as const }
  const todos = [
    { id: "todo-01-backend", title: "Update backend behavior", role: "backend" as const, status: "pending" as const },
    { id: "todo-02-review", title: "Review the patch", role: "review" as const, status: "pending" as const },
  ]

  return {
    mode: "auto",
    modeDescription: "Automatic",
    brain: { id: "brain", name: "Brain", description: "Test brain" },
    context: {
      id: "session-1",
      layer: "brain",
      goal: "Update backend behavior",
      progress: { status: "pending", summary: "planned" },
      childContextIds: ["worker-1", "review-1"],
      contextRefs: [],
    },
    role: "backend",
    agentPlan: {
      primaryRole: "backend",
      workers: [{ role: "backend", goal: "Implement the change", reason: "Backend task", todoIds: ["todo-01-backend"] }],
      todos,
      dependencies: [{ fromTodoId: "todo-01-backend", toTodoId: "todo-02-review", reason: "Review after implementation" }],
      requiresReview: true,
      reason: "File edits require review",
    },
    todos,
    dependencies: [{ fromTodoId: "todo-01-backend", toTodoId: "todo-02-review", reason: "Review after implementation" }],
    workers: [
      { role: "backend", goal: "Implement the change", reason: "Backend task", todoIds: ["todo-01-backend"], contextId: "worker-1", model, policy, piModel: { provider: "custom", id: "text", name: "Text", contextWindow: 128000 } },
      { role: "review", goal: "Review the patch", reason: "Policy requires review", todoIds: ["todo-02-review"], contextId: "review-1", model, policy, piModel: { provider: "custom", id: "text", name: "Text", contextWindow: 128000 } },
    ],
    routing: { source: "heuristic", reason: "test" },
    model,
    policy,
    piModel: { provider: "custom", id: "text", name: "Text", contextWindow: 128000 },
    toolExecution: "parallel",
    ...overrides,
  }
}

test("buildExecutionPlanReview records write-capable plans with validation evidence", () => {
  const record = buildExecutionPlanReview(createPlan(), {
    sessionId: "session-1",
    localToolMode: "read-write",
    hasApprovalCallback: true,
    promptReferences: [{ token: "@README.md", path: "/repo/README.md", kind: "text", size: 120 }],
    checkOptions,
    mcpServers: [],
  })

  expect(record?.type).toBe("execution_plan_review")
  expect(record?.status).toBe("approved")
  expect(record?.approver).toBe("runtime_policy")
  expect(record?.planId).toBe("session-1:plan")
  expect(record?.proposedSideEffects.map((effect) => effect.kind)).toEqual(["file_edit", "patch"])
  expect(record?.validationPlan.checks).toEqual(["smart package-script selection"])
  expect(record?.validationPlan.evidence).toContain("independent review_decision session record")
  expect(record?.riskTriggers).toContain("routing requires independent review")
  expect(record?.promptReferences[0]).toMatchObject({ kind: "text", token: "@README.md", size: 120 })
})

test("buildExecutionPlanReview skips purely read-only local runs", () => {
  const record = buildExecutionPlanReview(createPlan({ agentPlan: { ...createPlan().agentPlan, requiresReview: false } }), {
    sessionId: "session-1",
    localToolMode: "read-only",
    hasApprovalCallback: false,
    checkOptions,
    mcpServers: [],
  })

  expect(record).toBeUndefined()
})

test("buildExecutionPlanReview records radical MCP exposure as auto-approved by mode policy", () => {
  const record = buildExecutionPlanReview(createPlan({ mode: "radical" }), {
    sessionId: "session-1",
    localToolMode: "read-only",
    hasApprovalCallback: false,
    checkOptions: { ...checkOptions, enabled: false },
    mcpServers: [{ scope: "project", name: "filesystem" }],
  })

  expect(record?.status).toBe("auto_approved")
  expect(record?.approver).toBe("mode_policy")
  expect(record?.proposedSideEffects).toEqual([{ kind: "mcp", target: "project:filesystem", risk: "medium" }])
  expect(record?.riskTriggers).toContain("MCP tools exposed")
  expect(record?.riskTriggers).toContain("checks disabled")
  expect(record?.residualPreExecutionRisks).toContain("Automated checks are disabled by check policy.")
})
