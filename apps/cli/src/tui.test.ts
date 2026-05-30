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
    review: {
      decision: "changes_requested",
      rationale: "Tests are failing.",
      findings: [],
      requiredChanges: ["Fix failing test."],
      blockingIssues: [],
      residualRisks: [],
    },
    modelSummary: "Updated validation logic.",
    warnings: ["Failed checks override review approval."],
  } as FinalReport

  expect(formatTuiFinalReportCompact(report)).toContain("Braincode Run Report · changes_requested")
  expect(formatTuiFinalReportCompact(report)).toContain("patch 1 file, +8 -2")
  expect(formatTuiFinalReportCompact(report)).toContain("review changes_requested")

  const sections = formatTuiFinalReportSections(report).join("\n")
  expect(sections).toContain("Workers: librarian completed, backend completed, review changes_requested")
  expect(sections).toContain("Changed: M src/auth.ts")
  expect(sections).toContain("Check details: test failed")
  expect(sections).toContain("Warnings:")
})
