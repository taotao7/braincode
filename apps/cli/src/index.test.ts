import { expect, test } from "bun:test"
import type { FinalReport } from "@braincode/agent-runtime"
import { formatRunReport } from "./index"

test("formatRunReport renders runtime-owned final report facts", () => {
  const report: FinalReport = {
    status: "changes_requested",
    task: "fix failing auth test",
    sessionId: "session-1",
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
      { id: "inspect", title: "Inspect code", role: "librarian", status: "completed" },
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
          durationMs: 20,
          stdout: "",
          stderr: "failed",
          timedOut: false,
        },
      ],
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
    modelSummary: "Updated validation logic.",
    warnings: ["Failed checks override review approval."],
  }

  const text = formatRunReport(report)

  expect(text).toContain("Braincode Run Report")
  expect(text).toContain("Status: changes_requested")
  expect(text).toContain("Routing: router-brain -> backend (91%)")
  expect(text).toContain("Patch: 1 file, +8 -2")
  expect(text).toContain("Checks: failed (test failed)")
  expect(text).toContain("Review: changes_requested (76%)")
  expect(text).toContain("Session: session-1")
  expect(text).toContain("Updated validation logic.")
})
