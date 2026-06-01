import { expect, test } from "bun:test"
import { buildFinalReport, resolveFinalReportStatus, type FinalReportRuntimePlan } from "./final-report"
import type { ExecutionPlanReviewRecord } from "./execution-plan-review"

function testPlan(overrides: Partial<FinalReportRuntimePlan> = {}): FinalReportRuntimePlan {
  return {
    mode: "auto",
    brain: { id: "brain", name: "Brain" },
    role: "backend",
    routing: { source: "router-brain", confidence: 0.8, reason: "backend change" },
    workers: [
      { role: "librarian", contextId: "ctx-librarian" },
      { role: "backend", contextId: "ctx-backend" },
      { role: "review", contextId: "ctx-review" },
    ],
    todos: [
      { id: "inspect", title: "Inspect code", role: "librarian", status: "completed" },
      { id: "implement", title: "Implement fix", role: "backend", status: "completed" },
      { id: "review", title: "Review patch", role: "review", status: "completed" },
    ],
    ...overrides,
  }
}

test("buildFinalReport uses runtime facts for routing, todos, workers, and model summary", () => {
  const report = buildFinalReport({
    task: "fix failing auth test",
    sessionId: "session-1",
    plan: testPlan(),
    workerResults: [
      { role: "librarian", taskId: "ctx-librarian", status: "completed" },
      { role: "review", taskId: "ctx-review", status: "completed", reviewDecision: approvedReview() },
    ],
    modelSummary: "Changed validation and ran tests.",
    patch: patchSummary(),
    checks: { status: "passed", results: [] },
    planReview: planReviewRecord(),
    review: approvedReview(),
    metrics: {
      tokens: {
        total: { input: 100, output: 40, cacheRead: 0, cacheWrite: 0, total: 140, calls: 2 },
        byPhase: [
          { phase: "router", input: 20, output: 10, cacheRead: 0, cacheWrite: 0, total: 30, calls: 1 },
          { phase: "primary", input: 80, output: 30, cacheRead: 0, cacheWrite: 0, total: 110, calls: 1 },
        ],
        byModel: [
          { modelId: "provider/model", provider: "provider", input: 100, output: 40, cacheRead: 0, cacheWrite: 0, total: 140, calls: 2 },
        ],
      },
      toolCalls: {
        total: 3,
        failed: 1,
        byPhase: [{ phase: "primary", calls: 3, failed: 1 }],
      },
    },
    runtimeToolCount: 4,
  })

  expect(report.status).toBe("approved")
  expect(report.version).toBe(1)
  expect(report.task).toBe("fix failing auth test")
  expect(report.brain).toEqual({ id: "brain", name: "Brain", mode: "auto" })
  expect(report.routing.source).toBe("router-brain")
  expect(report.routing.primaryRole).toBe("backend")
  expect(report.routing.workers).toEqual([
    { role: "librarian", phase: "support", status: "completed" },
    { role: "backend", phase: "primary", status: "completed" },
    { role: "review", phase: "review", status: "approved" },
  ])
  expect(report.todos.map((todo) => [todo.id, todo.status])).toEqual([
    ["inspect", "completed"],
    ["implement", "completed"],
    ["review", "completed"],
  ])
  expect(report.modelSummary).toBe("Changed validation and ran tests.")
  expect(report.metrics?.tokens.total.total).toBe(140)
  expect(report.metrics?.toolCalls.total).toBe(3)
  expect(report.planReview).toMatchObject({
    status: "approved",
    approver: "runtime_policy",
    requiredReview: true,
    validationChecks: ["smart package-script selection"],
  })
  expect(report.warnings).toEqual([])
  expect(JSON.parse(JSON.stringify(report)).sessionId).toBe("session-1")
})

function planReviewRecord(): ExecutionPlanReviewRecord {
  return {
    type: "execution_plan_review",
    planId: "session-1:plan",
    sessionId: "session-1",
    brainTaskId: "session-1",
    mode: "auto",
    status: "approved",
    approver: "runtime_policy",
    rationale: "allowed",
    brain: { id: "brain", name: "Brain", description: "Test brain" },
    primaryRole: "backend",
    routing: { source: "router-brain", confidence: 0.8, reason: "backend change" },
    requiredReview: true,
    workers: [],
    todos: [],
    dependencies: [],
    promptReferences: [],
    proposedSideEffects: [{ kind: "file_edit", target: "project files via edit_file", risk: "medium" }],
    validationPlan: {
      checks: ["smart package-script selection"],
      evidence: ["changed file summary"],
      successCriteria: ["Implement fix"],
    },
    riskTriggers: ["project file mutation exposed"],
    residualPreExecutionRisks: [],
  }
}

test("resolveFinalReportStatus makes failed checks override review approval", () => {
  const status = resolveFinalReportStatus({
    patch: patchSummary(),
    checks: {
      status: "failed",
      results: [
        {
          name: "test",
          command: "bun",
          args: ["test"],
          status: "failed",
          exitCode: 1,
          signal: null,
          durationMs: 10,
          stdout: "",
          stderr: "failed",
          timedOut: false,
        },
      ],
    },
    review: approvedReview(),
  })

  expect(status).toBe("changes_requested")
})

test("buildFinalReport marks clarification pauses explicitly", () => {
  const clarification = {
    required: true as const,
    reason: "The target is missing.",
    question: "Which part should change?",
    missing: ["target"],
    options: [
      { id: "plan-first", label: "Plan first", description: "Return a plan." },
      { id: "provide-details", label: "Provide details", description: "Wait for details." },
    ],
  }
  const report = buildFinalReport({
    task: "fix it",
    sessionId: "session-clarify",
    plan: testPlan({
      role: "rush",
      routing: { source: "heuristic", reason: "clarification needed" },
      workers: [{ role: "rush", contextId: "ctx-rush" }],
      todos: [{ id: "clarify", title: "Clarify request", role: "rush", status: "blocked" }],
    }),
    workerResults: [],
    modelSummary: "I need clarification.",
    clarification,
  })

  expect(report.status).toBe("needs_clarification")
  expect(report.clarification).toBe(clarification)
  expect(report.warnings).toEqual(["Execution paused for user clarification before specialist handoff."])
})

test("buildFinalReport surfaces fix budget exhaustion when checks still fail", () => {
  const report = buildFinalReport({
    task: "fix failing test",
    sessionId: "session-fix",
    plan: testPlan(),
    workerResults: [],
    modelSummary: "Attempted fix.",
    patch: patchSummary(),
    checks: {
      status: "failed",
      results: [{
        name: "test",
        command: "bun",
        args: ["test"],
        status: "failed",
        exitCode: 1,
        signal: null,
        durationMs: 10,
        stdout: "",
        stderr: "still failing",
        timedOut: false,
      }],
    },
    fixIterations: 1,
  })

  expect(report.fixIterations).toBe(1)
  expect(report.warnings).toContain("Fix budget exhausted after 1 iteration(s); checks still failing.")
})

test("buildFinalReport omits fixIterations when zero and adds no exhaustion warning", () => {
  const report = buildFinalReport({
    task: "fix passing test",
    sessionId: "session-fix-2",
    plan: testPlan(),
    workerResults: [],
    modelSummary: "Fixed it.",
    patch: patchSummary(),
    checks: { status: "passed", results: [] },
    review: approvedReview(),
    fixIterations: 0,
  })

  expect(report.fixIterations).toBeUndefined()
  expect(report.warnings).toEqual([])
})

test("buildFinalReport reports no patch activity instead of inventing patch facts", () => {
  const report = buildFinalReport({
    task: "answer a question",
    sessionId: "session-2",
    plan: testPlan({
      role: "rush",
      routing: { source: "heuristic", reason: "simple answer" },
      workers: [{ role: "rush", contextId: "ctx-rush" }],
      todos: [{ id: "answer", title: "Answer directly", role: "rush", status: "completed" }],
    }),
    workerResults: [],
    modelSummary: "The answer is 42.",
    runtimeToolCount: 0,
  })

  expect(report.status).toBe("answered")
  expect(report.patch).toBeUndefined()
  expect(report.warnings).toEqual(["No patch activity detected."])
})

function patchSummary() {
  return {
    changedFiles: [{ path: "src/auth.ts", status: "M" }],
    preExistingChangedFiles: [],
    diffStats: {
      filesChanged: 1,
      insertions: 8,
      deletions: 2,
      untrackedFiles: 0,
      raw: "1 file changed, 8 insertions(+), 2 deletions(-)",
      unstagedRaw: "1 file changed, 8 insertions(+), 2 deletions(-)",
      stagedRaw: "",
    },
  }
}

function approvedReview() {
  return {
    decision: "approved" as const,
    rationale: "No defect found.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
  }
}
