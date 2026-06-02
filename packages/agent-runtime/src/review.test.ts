import { expect, test } from "bun:test"
import { applyReviewGatesToReviewDecision, buildPrimaryFixPrompt, buildReviewPrompt, evaluateReviewIndependence, fixLoopTrigger, formatWorkerResults, mergeReviewResult, normalizeReviewDecisionText, type PromptWorkerResult, type ReviewDecision } from "./review"
import type { PatchCheckSummary } from "./checks"

const failedChecks: PatchCheckSummary = {
  status: "failed",
  results: [{
    name: "test",
    command: "bun",
    args: ["run", "test"],
    status: "failed",
    exitCode: 1,
    signal: null,
    durationMs: 10,
    stdout: "",
    stderr: "AssertionError: expected 2 to equal 3",
    timedOut: false,
  }],
}

const passedChecks: PatchCheckSummary = { status: "passed", results: [] }

const changesRequested: ReviewDecision = {
  decision: "changes_requested",
  rationale: "needs fixes",
  findings: [{ severity: "high", issue: "null deref", file: "src/a.ts", line: 4, suggestion: "guard the value" }],
  requiredChanges: ["Add a null guard before access"],
  blockingIssues: [],
  residualRisks: [],
}

const blocked: ReviewDecision = {
  decision: "blocked",
  rationale: "cannot verify",
  findings: [],
  requiredChanges: [],
  blockingIssues: ["missing artifacts"],
  residualRisks: [],
}

test("fixLoopTrigger fires on failed checks", () => {
  expect(fixLoopTrigger(failedChecks, undefined)).toBe("checks_failed")
})

test("fixLoopTrigger fires on changes_requested review", () => {
  expect(fixLoopTrigger(passedChecks, changesRequested)).toBe("changes_requested")
})

test("fixLoopTrigger does not fire on blocked review", () => {
  expect(fixLoopTrigger(passedChecks, blocked)).toBeUndefined()
})

test("fixLoopTrigger does not fire on passed checks and approved review", () => {
  expect(fixLoopTrigger(passedChecks, { ...changesRequested, decision: "approved" })).toBeUndefined()
  expect(fixLoopTrigger(undefined, undefined)).toBeUndefined()
})

test("fixLoopTrigger prioritizes failing checks over review", () => {
  expect(fixLoopTrigger(failedChecks, changesRequested)).toBe("checks_failed")
})

test("buildPrimaryFixPrompt includes failing check evidence and required changes", () => {
  const prompt = buildPrimaryFixPrompt({ checks: failedChecks, reviewDecision: changesRequested }, 1)
  expect(prompt).toContain("fix iteration 1")
  expect(prompt).toContain("test:")
  expect(prompt).toContain("AssertionError")
  expect(prompt).toContain("Add a null guard before access")
  expect(prompt).toContain("null deref")
  expect(prompt).toContain("minimal edits")
})

test("buildPrimaryFixPrompt omits review section when review approved", () => {
  const prompt = buildPrimaryFixPrompt({ checks: failedChecks }, 2)
  expect(prompt).toContain("fix iteration 2")
  expect(prompt).toContain("Failing checks")
  expect(prompt).not.toContain("Required changes from review")
})

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
  expect(prompt).toContain("Put concrete findings first")
  expect(prompt).toContain('"confidence":0.0')
  expect(prompt).toContain("src/new-helper.ts")
  expect(prompt).toContain("export const value = 1")
  expect(prompt).toContain("assets/icon.png")
  expect(prompt).toContain("binary content omitted")
  // Review reuses the shared read-only tool discipline.
  expect(prompt).toContain("Tool access:")
  expect(prompt).toContain("search before reading")
})

test("normalizeReviewDecisionText and mergeReviewResult keep failed checks from approving", () => {
  const decision = normalizeReviewDecisionText(JSON.stringify({
    decision: "approved",
    confidence: 0.82,
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
  expect(decision.confidence).toBe(0.82)
  expect(decision.requiredChanges[0]).toContain("test")
  expect(merged).toContain("Decision: changes_requested")
  expect(merged).toContain("Fix failing checks")
})

test("applyReviewGatesToReviewDecision records skipped checks and truncated diff residual risks", () => {
  const decision = applyReviewGatesToReviewDecision({
    decision: "approved",
    rationale: "No concrete issue found.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
  }, {
    status: "skipped",
    reason: "docs-only patch",
    results: [],
  }, {
    checks: {
      status: "skipped",
      reason: "docs-only patch",
      results: [],
    },
    diff: {
      stat: "src/file.ts | 2 +",
      diff: "diff --git a/src/file.ts b/src/file.ts",
      truncated: true,
    },
  })

  expect(decision.decision).toBe("approved")
  expect(decision.residualRisks).toContain("Checks were skipped: docs-only patch")
  expect(decision.residualRisks).toContain("Git diff was truncated; review may not cover omitted changes.")
})

test("applyReviewGatesToReviewDecision can block missing review artifacts by policy", () => {
  const decision = applyReviewGatesToReviewDecision({
    decision: "approved",
    rationale: "No concrete issue found.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
  }, undefined, undefined, { missingArtifacts: "blocked" })

  expect(decision.decision).toBe("blocked")
  expect(decision.blockingIssues[0]).toContain("Review artifacts were not collected")
  expect(decision.residualRisks[0]).toContain("Review artifacts were not collected")
})

test("applyReviewGatesToReviewDecision downgrades same-model reviewer on high-risk patch", () => {
  const decision = applyReviewGatesToReviewDecision({
    decision: "approved",
    rationale: "No defect found.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
  }, passedChecks, undefined, {
    riskTier: "high",
    independence: {
      primary: { modelId: "anthropic/sonnet", provider: "anthropic" },
      reviewer: { modelId: "anthropic/sonnet", provider: "anthropic" },
      sameModel: true,
      sameProvider: true,
      level: "weak",
    },
  })

  expect(decision.decision).toBe("changes_requested")
  expect(decision.requiredChanges.join("\n")).toContain("same model")
  expect(decision.independence?.level).toBe("weak")
  expect(decision.riskTier).toBe("high")
  expect(decision.confidence).toBeLessThanOrEqual(0.5)
})

test("applyReviewGatesToReviewDecision blocks same-provider reviewer on critical-risk patch", () => {
  const decision = applyReviewGatesToReviewDecision({
    decision: "approved",
    rationale: "No defect found.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
  }, passedChecks, undefined, {
    riskTier: "critical",
    independence: {
      primary: { modelId: "anthropic/sonnet", provider: "anthropic" },
      reviewer: { modelId: "anthropic/opus", provider: "anthropic" },
      sameModel: false,
      sameProvider: true,
      level: "moderate",
    },
  })

  expect(decision.decision).toBe("blocked")
  expect(decision.blockingIssues.join("\n")).toContain("different provider")
})

test("applyReviewGatesToReviewDecision flags missing coverage on high-risk patch", () => {
  const decision = applyReviewGatesToReviewDecision({
    decision: "approved",
    rationale: "No defect found.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
    coverage: [{ file: "src/auth/login.ts", status: "inspected" }],
  }, passedChecks, undefined, {
    riskTier: "high",
    changedFiles: ["src/auth/login.ts", "src/auth/session.ts"],
    independence: {
      primary: { modelId: "anthropic/sonnet", provider: "anthropic" },
      reviewer: { modelId: "openai/gpt-5", provider: "openai" },
      sameModel: false,
      sameProvider: false,
      level: "strong",
    },
  })

  expect(decision.decision).toBe("changes_requested")
  expect(decision.requiredChanges.join("\n")).toContain("src/auth/session.ts")
})

test("normalizeReviewDecisionText treats malformed coverage status as missing coverage", () => {
  const review = {
    fromLayer: "agent",
    toLayer: "brain",
    handoffId: "h1",
    taskId: "review-task",
    parentId: "brain-task",
    progress: { status: "completed", summary: "reviewed" },
    summary: "No issue found.",
    artifacts: [],
    risks: [],
    nextQuestions: [],
  } as never
  const decision = normalizeReviewDecisionText(JSON.stringify({
    decision: "approved",
    confidence: 0.9,
    rationale: "No issue found.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
    coverage: [
      { file: "src/auth/login.ts", status: "inspectd" },
      { file: "src/auth/session.ts" },
    ],
    summary: "No issue found.",
  }), review, passedChecks, undefined, {
    riskTier: "high",
    changedFiles: ["src/auth/login.ts"],
    independence: {
      primary: { modelId: "anthropic/sonnet", provider: "anthropic" },
      reviewer: { modelId: "openai/gpt-5", provider: "openai" },
      sameModel: false,
      sameProvider: false,
      level: "strong",
    },
  })

  expect(decision.coverage).toBeUndefined()
  expect(decision.decision).toBe("changes_requested")
  expect(decision.requiredChanges.join("\n")).toContain("src/auth/login.ts")
})

test("buildReviewPrompt injects hostile mode framing and coverage requirement for critical tier", () => {
  const prompt = buildReviewPrompt(
    "add a payment endpoint",
    "Added endpoint.",
    [],
    {
      id: "h",
      task: { id: "t", parentId: "p" },
    } as never,
    "",
    {
      patch: {
        changedFiles: [{ path: "src/payment/charge.ts", status: "M" }],
        preExistingChangedFiles: [],
        diffStats: { filesChanged: 1, insertions: 1, deletions: 0, untrackedFiles: 0, raw: "", unstagedRaw: "", stagedRaw: "" },
      },
    },
    "",
    {
      mode: "hostile",
      riskTier: "critical",
      independence: {
        primary: { modelId: "anthropic/sonnet", provider: "anthropic" },
        reviewer: { modelId: "openai/gpt-5", provider: "openai" },
        sameModel: false,
        sameProvider: false,
        level: "strong",
      },
    },
  )

  expect(prompt).toContain("Review mode: hostile")
  expect(prompt).toContain("attack vectors")
  expect(prompt).toContain("Patch risk tier: critical")
  expect(prompt).toContain("Coverage requirement")
  expect(prompt).toContain("src/payment/charge.ts")
  expect(prompt).toContain("Review independence: strong")
})

test("evaluateReviewIndependence classifies model/provider overlap", () => {
  expect(evaluateReviewIndependence({ modelId: "a/1", provider: "a" }, { modelId: "a/1", provider: "a" }).level).toBe("weak")
  expect(evaluateReviewIndependence({ modelId: "a/1", provider: "a" }, { modelId: "a/2", provider: "a" }).level).toBe("moderate")
  expect(evaluateReviewIndependence({ modelId: "a/1", provider: "a" }, { modelId: "b/1", provider: "b" }).level).toBe("strong")
  expect(evaluateReviewIndependence({ modelId: "a/1", provider: "a" }, {}).level).toBe("none")
})

test("formatWorkerResults lists artifact uris on their own lines", () => {
  const result: PromptWorkerResult = {
    role: "imageMaker",
    status: "completed",
    taskId: "t1",
    parentId: "p1",
    goal: "make a hero image",
    progress: { status: "completed", summary: "done" },
    summary: "Generated image artifact at /tmp/hero.png.",
    risks: [],
    nextQuestions: [],
    artifacts: [{ kind: "artifact", uri: "/tmp/hero.png", label: "Generated image" }],
  }
  const text = formatWorkerResults([result])
  expect(text).toContain("Artifacts:\n- /tmp/hero.png (Generated image)")
})

test("formatWorkerResults omits the Artifacts section when there are none", () => {
  const result: PromptWorkerResult = {
    role: "backend",
    status: "completed",
    taskId: "t2",
    parentId: "p2",
    goal: "add endpoint",
    progress: { status: "completed" },
    summary: "added /users",
    risks: [],
    nextQuestions: [],
  }
  expect(formatWorkerResults([result])).not.toContain("Artifacts:")
})
