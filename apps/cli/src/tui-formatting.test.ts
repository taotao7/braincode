import { expect, test } from "bun:test"
import type { FinalReport, RuntimePlan } from "@braincode/agent-runtime"
import {
  formatHelp,
  formatPlanMetadataLine,
  formatPlanPreviewSummary,
  formatPlanWorkersBudgetLine,
  formatTuiFinalReportCompact,
  formatTuiFinalReportSections,
} from "./tui"

test("formatHelp includes dynamically loaded skill commands", () => {
  const help = formatHelp([
    { name: "help", label: "/help", hint: "List all slash commands" },
    {
      name: "docs",
      label: "/docs",
      hint: "Skill (project) - invoke /docs <task>",
      insert: "/docs ",
      skill: {
        id: "docs",
        scope: "project",
        content: "# Docs",
        path: "/repo/.agents/skills/docs/SKILL.md",
      },
    },
  ])

  expect(help).toContain("/help")
  expect(help).toContain("/docs")
  expect(help).toContain("Skill (project)")
})

test("plan preview formatting exposes role, model, routing, workers, and budget", () => {
  const plan = {
    mode: "radical",
    brain: { id: "brain", name: "Brain" },
    role: "backend",
    piModel: { provider: "anthropic", id: "claude-sonnet" },
    toolExecution: "parallel",
    routing: {
      source: "router-brain",
      confidence: 0.86,
      reason: "API and schema work",
      maxWorkerAgents: 4,
      maxParallelAgents: 4,
      maxTodos: 8,
    },
    workers: [{ role: "backend" }, { role: "librarian" }],
    todos: [],
  } as unknown as RuntimePlan

  expect(formatPlanPreviewSummary(plan)).toContain("primary backend")
  expect(formatPlanMetadataLine(plan)).toContain("mode=radical")
  expect(formatPlanMetadataLine(plan)).toContain("model=anthropic/claude-sonnet")
  expect(formatPlanMetadataLine(plan)).toContain("routing=routeBrain")
  expect(formatPlanMetadataLine(plan)).toContain("confidence 86%")
  expect(formatPlanWorkersBudgetLine(plan)).toContain("backend (primary), librarian")
  expect(formatPlanWorkersBudgetLine(plan)).toContain("budget: workers 4, parallel 4, todos 8")
})

test("final report formatting exposes compact and expandable run facts", () => {
  const report = {
    version: 1,
    status: "changes_requested",
    task: "fix failing auth test",
    sessionId: "session-abcdef",
    brain: { id: "brain", name: "Brain", mode: "auto" },
    routing: {
      source: "router-brain",
      primaryRole: "backend",
      confidence: 0.91,
      workers: [
        { role: "librarian", phase: "support", status: "completed" },
        { role: "backend", phase: "primary", status: "completed" },
        { role: "review", phase: "review", status: "changes_requested" },
      ],
    },
    todos: [
      { id: "fix", title: "Fix bug", role: "backend", status: "completed" },
    ],
    patch: {
      changedFiles: [{ path: "src/auth.ts", status: "M" }],
      preExistingChangedFiles: [],
      diffStats: {
        filesChanged: 1,
        insertions: 8,
        deletions: 2,
        untrackedFiles: 0,
        raw: "1 file changed",
        unstagedRaw: "1 file changed",
        stagedRaw: "",
      },
    },
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
    planReview: {
      status: "approved",
      approver: "runtime_policy",
      requiredReview: true,
      proposedSideEffects: [{ kind: "file_edit", target: "project files via edit_file", risk: "medium" }],
      validationChecks: ["smart package-script selection"],
      riskTriggers: ["project file mutation exposed"],
      residualPreExecutionRisks: [],
    },
    review: {
      decision: "changes_requested",
      confidence: 0.76,
      rationale: "Tests are failing.",
      findings: [],
      requiredChanges: ["Fix failing test."],
      blockingIssues: [],
      residualRisks: [],
    },
    metrics: {
      tokens: {
        total: { input: 1000, output: 250, cacheRead: 0, cacheWrite: 0, total: 1250, calls: 2 },
        byPhase: [
          { phase: "router", input: 100, output: 50, cacheRead: 0, cacheWrite: 0, total: 150, calls: 1 },
          { phase: "primary", input: 900, output: 200, cacheRead: 0, cacheWrite: 0, total: 1100, calls: 1 },
        ],
        byModel: [],
      },
      toolCalls: { total: 3, failed: 0, byPhase: [{ phase: "primary", calls: 3, failed: 0 }] },
    },
    modelSummary: "Updated validation logic.",
    warnings: ["Failed checks override review approval."],
  } as FinalReport

  expect(formatTuiFinalReportCompact(report)).toContain("Braincode Run Report · changes_requested")
  expect(formatTuiFinalReportCompact(report)).toContain("patch 1 file, +8 -2")
  expect(formatTuiFinalReportCompact(report)).toContain("plan approved by runtime_policy")
  expect(formatTuiFinalReportCompact(report)).toContain("review changes_requested (76%)")
  expect(formatTuiFinalReportCompact(report)).toContain("usage 1.3k tokens; 3 tool calls")

  const sections = formatTuiFinalReportSections(report).join("\n")
  expect(sections).toContain("Workers: librarian completed, backend completed, review changes_requested")
  expect(sections).toContain("Changed: M src/auth.ts")
  expect(sections).toContain("Check details: test failed")
  expect(sections).toContain("Plan review: approved by runtime_policy · 1 side effect · review required")
  expect(sections).toContain("Planned side effects: file_edit:project files via edit_file")
  expect(sections).toContain("Review: changes_requested (76%)")
  expect(sections).toContain("Usage: 1.3k tokens; 3 tool calls")
  expect(sections).toContain("Token phases: router 150, primary 1.1k")
  expect(sections).toContain("Warnings:")
})
