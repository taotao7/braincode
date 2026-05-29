import { expect, test } from "bun:test"
import { buildReviewPrompt, mergeReviewResult, normalizeReviewDecisionText } from "./review"

test("buildReviewPrompt includes patch checks diff and untracked previews", () => {
  const prompt = buildReviewPrompt(
    "add a helper",
    "Implemented helper.",
    [],
    {
      id: "handoff-1",
      task: {
        id: "review-task",
        parentId: "brain-task",
      },
    } as never,
    "Project support context from /tmp/project:\nAGENTS.md:\nFollow local rules.\n",
    {
      patch: {
        changedFiles: [{ path: "src/helper.ts", status: "M" }],
        preExistingChangedFiles: [],
        diffStats: {
          filesChanged: 2,
          insertions: 3,
          deletions: 1,
          untrackedFiles: 1,
          raw: "2 files changed, 3 insertions(+), 1 deletion(-) | 1 untracked file",
          unstagedRaw: "1 file changed",
          stagedRaw: "",
        },
      },
      checks: {
        status: "failed",
        results: [{
          name: "test",
          command: "bun",
          args: ["run", "test"],
          status: "failed",
          exitCode: 1,
          signal: null,
          durationMs: 25,
          stdout: "",
          stderr: "expected true",
          timedOut: false,
        }],
      },
      diff: {
        stat: "src/helper.ts | 4 +++-",
        diff: "diff --git a/src/helper.ts b/src/helper.ts",
        truncated: true,
      },
      untrackedPreviews: [
        { path: "src/new-helper.ts", text: "export const value = 1", truncated: false, binary: false, size: 22 },
        { path: "assets/icon.png", truncated: false, binary: true, size: 128 },
      ],
    },
  )

  expect(prompt).toContain("Project support context")
  expect(prompt).toContain("Checks: failed")
  expect(prompt).toContain("Git diff (truncated)")
  expect(prompt).toContain("src/new-helper.ts")
  expect(prompt).toContain("export const value = 1")
  expect(prompt).toContain("assets/icon.png")
  expect(prompt).toContain("binary content omitted")
})

test("normalizeReviewDecisionText and mergeReviewResult keep failed checks from approving", () => {
  const decision = normalizeReviewDecisionText(JSON.stringify({
    decision: "approved",
    rationale: "Looks good.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
  }), {
    summary: "Looks good.",
    progress: { status: "completed" },
    risks: [],
    artifacts: [],
    nextQuestions: [],
  } as never, {
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
      stderr: "failure",
      timedOut: false,
    }],
  })

  const merged = mergeReviewResult("Primary summary", { summary: "Review summary", risks: [], reviewDecision: decision })

  expect(decision.decision).toBe("changes_requested")
  expect(decision.requiredChanges[0]).toContain("test")
  expect(merged).toContain("Decision: changes_requested")
  expect(merged).toContain("Fix failing checks")
})
