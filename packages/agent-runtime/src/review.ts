import type { HandoffPacket, WorkerResult } from "@braincode/context"
import type { PatchCheckSummary } from "./checks"
import type { PatchDiffSnapshot, PatchSummary, UntrackedFilePreview } from "./patch"

export type PatchReviewArtifacts = {
  patch?: PatchSummary
  checks?: PatchCheckSummary
  diff?: PatchDiffSnapshot
  untrackedPreviews?: UntrackedFilePreview[]
}

export type MissingReviewArtifactsPolicy = "changes_requested" | "blocked"

export type ReviewGateOptions = {
  missingArtifacts?: MissingReviewArtifactsPolicy
}

export type ReviewDecisionStatus = "approved" | "changes_requested" | "blocked"

export type ReviewFindingSeverity = "low" | "medium" | "high"

export type ReviewFinding = {
  severity: ReviewFindingSeverity
  issue: string
  file?: string
  line?: number
  evidence?: string
  suggestion?: string
}

export type ReviewDecision = {
  decision: ReviewDecisionStatus
  confidence?: number
  rationale: string
  findings: ReviewFinding[]
  requiredChanges: string[]
  blockingIssues: string[]
  residualRisks: string[]
}

export type PromptWorkerResult = {
  role: string
  status: string
  taskId: string
  parentId: string
  goal: string
  progress: {
    status: string
    summary?: string
  }
  summary: string
  risks: string[]
  nextQuestions: string[]
}

export type ReviewMergeResult = {
  summary: string
  risks: string[]
  reviewDecision?: ReviewDecision
}

export function buildReviewPrompt(
  originalPrompt: string,
  primarySummary: string,
  workerResults: PromptWorkerResult[],
  handoff: HandoffPacket,
  projectSupportContext = "",
  artifacts?: PatchReviewArtifacts,
): string {
  const patchArtifacts = formatPatchReviewArtifacts(artifacts)
  return `Review this Braincode run as an isolated review agent.

${projectSupportContext}
Tool access:
Read-only project tools may be available. Use them to verify changed files, inspect diffs, and check specific source evidence. Do not edit files or execute commands.

Original user request:
${originalPrompt}

Primary agent result:
${primarySummary}

Supporting worker results:
${workerResults.length > 0 ? formatWorkerResults(workerResults) : "No supporting worker results."}

Patch artifacts:
${patchArtifacts}

Handoff packet:
${JSON.stringify(handoff, null, 2)}

Review output rules:
- Put concrete findings first; do not lead with a generic summary.
- If no concrete defect is found, return an empty findings array and a precise approval rationale.
- If the git diff is marked truncated, include that as a residual risk.
- If checks are skipped, include that as a residual risk.
- If checks failed, request changes and name the failing checks.
- If required patch/check/diff artifacts are missing, block or request changes instead of approving.
- Set confidence as a number from 0 to 1 based on the evidence quality available to you.

Return only JSON in this shape:
{"taskId":"${handoff.task.id}","parentId":"${handoff.task.parentId}","progress":{"status":"completed|blocked","summary":"brief progress"},"decision":"approved|changes_requested|blocked","confidence":0.0,"rationale":"brief reason for the decision","findings":[{"severity":"low|medium|high","file":"optional project-relative path","line":1,"evidence":"short evidence","issue":"specific issue","suggestion":"specific fix"}],"requiredChanges":["specific change required before approval"],"blockingIssues":["issue that prevents review completion"],"residualRisks":["risk that remains after review"],"summary":"review findings or clear statement that no concrete issue was found","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["confirmed risk"],"nextQuestions":["question only if blocked"]}`
}

export function formatPatchReviewArtifacts(artifacts: PatchReviewArtifacts | undefined): string {
  if (!artifacts?.patch && !artifacts?.checks && !artifacts?.diff && !artifacts?.untrackedPreviews?.length) return "No patch artifacts were collected."
  const sections: string[] = []
  if (artifacts.patch) {
    const changed = artifacts.patch.changedFiles.length > 0
      ? artifacts.patch.changedFiles.map((change) => `- ${change.status} ${change.path}`).join("\n")
      : "(no new changed files)"
    const preExisting = artifacts.patch.preExistingChangedFiles.length > 0
      ? `\nPre-existing changed files:\n${artifacts.patch.preExistingChangedFiles.map((change) => `- ${change.status} ${change.path}`).join("\n")}`
      : ""
    sections.push(`Changed files:\n${changed}${preExisting}\nDiff stats: ${artifacts.patch.diffStats.raw || "no textual diff stats"}`)
  }
  if (artifacts.checks) {
    const lines = artifacts.checks.results.map((result) => {
      const output = [
        result.stdout.trim() ? `stdout: ${clipContextText(result.stdout.trim(), 1200)}` : "",
        result.stderr.trim() ? `stderr: ${clipContextText(result.stderr.trim(), 1200)}` : "",
      ].filter(Boolean).join("\n  ")
      return `- ${result.name}: ${result.status} (exit ${result.exitCode ?? "n/a"}, ${result.durationMs}ms)${output ? `\n  ${output}` : ""}`
    })
    sections.push(`Checks: ${artifacts.checks.status}${artifacts.checks.reason ? ` (${artifacts.checks.reason})` : ""}\n${lines.length > 0 ? lines.join("\n") : "(no checks ran)"}`)
  }
  if (artifacts.diff) {
    sections.push(`Git diff stat:\n${artifacts.diff.stat || "(no diff stat)"}\n\nGit diff${artifacts.diff.truncated ? " (truncated)" : ""}:\n${artifacts.diff.diff || "(no textual diff)"}`)
  }
  if (artifacts.untrackedPreviews?.length) {
    const previews = artifacts.untrackedPreviews.map((preview) => {
      const marker = [
        `${preview.size} bytes`,
        preview.binary ? "binary" : "text",
        preview.truncated ? "truncated" : "",
      ].filter(Boolean).join(", ")
      if (preview.binary) return `- ${preview.path} (${marker})\n  (binary content omitted)`
      return `- ${preview.path} (${marker})\n${preview.text || "(empty file)"}`
    })
    sections.push(`Untracked file previews:\n${previews.join("\n\n")}`)
  }
  return sections.join("\n\n")
}

export function formatWorkerResults(workerResults: PromptWorkerResult[]): string {
  return workerResults
    .map((result) => {
      const risks = result.risks.length > 0 ? `\nRisks:\n${result.risks.map((risk) => `- ${risk}`).join("\n")}` : ""
      const questions = result.nextQuestions.length > 0 ? `\nOpen questions:\n${result.nextQuestions.map((question) => `- ${question}`).join("\n")}` : ""
      const progress = result.progress.summary ? `${result.progress.status}: ${result.progress.summary}` : result.progress.status
      return `### ${result.role} (${result.status})\nTask: ${result.taskId} -> ${result.parentId}\nGoal: ${result.goal}\nProgress: ${progress}\nSummary: ${result.summary}${risks}${questions}`
    })
    .join("\n\n")
}

export function normalizeReviewDecisionText(
  text: string,
  review: WorkerResult,
  checks?: PatchCheckSummary,
  artifacts?: PatchReviewArtifacts,
  gateOptions?: ReviewGateOptions,
): ReviewDecision {
  let parsedRecord: Record<string, unknown> | undefined
  try {
    const parsed = extractJsonObject(text)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsedRecord = parsed as Record<string, unknown>
  } catch {
    // Review text without JSON falls back to worker result fields.
  }

  const explicitDecision = normalizeReviewDecisionStatus(parsedRecord?.decision)
  const confidence = normalizeConfidence(parsedRecord?.confidence)
  const rationale = stringValue(parsedRecord?.rationale) ?? review.summary
  const findings = normalizeReviewFindings(parsedRecord?.findings)
  const requiredChanges = normalizeStringArray(parsedRecord?.requiredChanges)
  const blockingIssues = normalizeStringArray(parsedRecord?.blockingIssues)
  const residualRisks = uniqueStrings([...normalizeStringArray(parsedRecord?.residualRisks), ...review.risks])
  const missingDecisionChange = explicitDecision
    ? undefined
    : "Review did not provide an explicit structured decision; rerun or inspect review output before treating this as approved."
  const fallbackDecision = missingDecisionChange
    ? fallbackReviewDecisionWithoutExplicitDecision(review)
    : fallbackReviewDecision(review, checks)
  return applyReviewGatesToReviewDecision({
    decision: explicitDecision ?? fallbackDecision,
    ...(confidence !== undefined ? { confidence } : {}),
    rationale,
    findings,
    requiredChanges: missingDecisionChange ? uniqueStrings([...requiredChanges, missingDecisionChange]) : requiredChanges,
    blockingIssues,
    residualRisks,
  }, checks, artifacts, gateOptions)
}

export function applyCheckGateToReviewDecision(
  decision: ReviewDecision,
  checks?: PatchCheckSummary,
  artifacts?: PatchReviewArtifacts,
  gateOptions?: ReviewGateOptions,
): ReviewDecision {
  return applyReviewGatesToReviewDecision(decision, checks, artifacts, gateOptions)
}

export function applyReviewGatesToReviewDecision(
  decision: ReviewDecision,
  checks?: PatchCheckSummary,
  artifacts?: PatchReviewArtifacts,
  gateOptions: ReviewGateOptions = {},
): ReviewDecision {
  let gated = decision

  if (checks?.status === "failed" && gated.decision !== "blocked") {
    const failedChecks = checks.results.filter((result) => result.status === "failed").map((result) => result.name)
    const checkChange = failedChecks.length > 0
      ? `Fix failing checks before approval: ${failedChecks.join(", ")}.`
      : "Fix failing checks before approval."
    gated = {
      ...gated,
      decision: "changes_requested",
      findings: appendUniqueFinding(gated.findings, {
        severity: "high",
        issue: checkChange,
        evidence: checks.results
          .filter((result) => result.status === "failed")
          .map((result) => `${result.name}: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode ?? "n/a"}`}`)
          .join("\n"),
        suggestion: "Run and fix the failing checks before approval.",
      }),
      requiredChanges: uniqueStrings([...gated.requiredChanges, checkChange]),
    }
  }

  const residualRisks = [...gated.residualRisks]
  if (checks?.status === "skipped") {
    residualRisks.push(checks.reason ? `Checks were skipped: ${checks.reason}` : "Checks were skipped.")
  }
  if (artifacts?.diff?.truncated) {
    residualRisks.push("Git diff was truncated; review may not cover omitted changes.")
  }

  const missingArtifactIssue = artifacts !== undefined || gateOptions.missingArtifacts !== undefined
    ? reviewArtifactMissingIssue(artifacts)
    : undefined
  if (missingArtifactIssue) {
    residualRisks.push(missingArtifactIssue)
    const policy = gateOptions.missingArtifacts ?? "changes_requested"
    if (policy === "blocked") {
      gated = {
        ...gated,
        decision: "blocked",
        blockingIssues: uniqueStrings([...gated.blockingIssues, missingArtifactIssue]),
      }
    } else if (gated.decision !== "blocked") {
      gated = {
        ...gated,
        decision: "changes_requested",
        requiredChanges: uniqueStrings([...gated.requiredChanges, missingArtifactIssue]),
      }
    }
  }

  return {
    ...gated,
    residualRisks: uniqueStrings(residualRisks),
  }
}

function reviewArtifactMissingIssue(artifacts: PatchReviewArtifacts | undefined): string | undefined {
  if (!artifacts) return "Review artifacts were not collected; reviewer could not verify patch, check, or diff evidence."
  if (artifacts.patch?.changedFiles.length && !artifacts.diff) {
    return "Review diff artifact was not collected for changed files; reviewer could not verify the full patch."
  }
  return undefined
}

function appendUniqueFinding(findings: ReviewFinding[], finding: ReviewFinding): ReviewFinding[] {
  if (findings.some((candidate) => candidate.issue === finding.issue)) return findings
  return [...findings, finding]
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value))
}

export function mergeReviewResult(summary: string, review: ReviewMergeResult | undefined, reviewDecision?: ReviewDecision): string {
  if (!review) return summary
  const decision = reviewDecision ?? review.reviewDecision
  const decisionText = decision
    ? [
        `Decision: ${decision.decision}`,
        `Rationale: ${decision.rationale}`,
        decision.requiredChanges.length > 0 ? `Required changes:\n${decision.requiredChanges.map((change) => `- ${change}`).join("\n")}` : "",
        decision.blockingIssues.length > 0 ? `Blocking issues:\n${decision.blockingIssues.map((issue) => `- ${issue}`).join("\n")}` : "",
      ].filter(Boolean).join("\n")
    : review.summary
  const findings = decision?.findings.length
    ? `\nFindings:\n${decision.findings.map((finding) => {
        const location = finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""
        const suggestion = finding.suggestion ? ` Suggestion: ${finding.suggestion}` : ""
        return `- [${finding.severity}]${location} ${finding.issue}${suggestion}`
      }).join("\n")}`
    : ""
  const residualRisks = decision?.residualRisks.length
    ? `\nResidual risks:\n${decision.residualRisks.map((risk) => `- ${risk}`).join("\n")}`
    : ""
  const risks = !decision && review.risks.length > 0 ? `\nRisks:\n${review.risks.map((risk) => `- ${risk}`).join("\n")}` : ""
  return `${summary}\n\nReview:\n${decisionText}${findings}${residualRisks}${risks}`
}

function normalizeReviewFindings(value: unknown): ReviewFinding[] {
  if (!Array.isArray(value)) return []
  const findings: ReviewFinding[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const issue = stringValue(record.issue)
    if (!issue) continue
    const severity = normalizeReviewFindingSeverity(record.severity)
    const file = stringValue(record.file)
    const evidence = stringValue(record.evidence)
    const suggestion = stringValue(record.suggestion)
    const line = typeof record.line === "number" && Number.isInteger(record.line) && record.line > 0
      ? record.line
      : undefined
    findings.push({
      severity,
      issue,
      ...(file ? { file } : {}),
      ...(line ? { line } : {}),
      ...(evidence ? { evidence } : {}),
      ...(suggestion ? { suggestion } : {}),
    })
  }
  return findings
}

function normalizeReviewFindingSeverity(value: unknown): ReviewFindingSeverity {
  return value === "low" || value === "medium" || value === "high" ? value : "medium"
}

function normalizeReviewDecisionStatus(value: unknown): ReviewDecisionStatus | undefined {
  return value === "approved" || value === "changes_requested" || value === "blocked" ? value : undefined
}

function fallbackReviewDecision(review: WorkerResult, checks?: PatchCheckSummary): ReviewDecisionStatus {
  if (review.progress.status === "blocked" || review.progress.status === "failed") return "blocked"
  if (checks?.status === "failed") return "changes_requested"
  return review.risks.length > 0 ? "changes_requested" : "approved"
}

function fallbackReviewDecisionWithoutExplicitDecision(review: WorkerResult): ReviewDecisionStatus {
  if (review.progress.status === "blocked" || review.progress.status === "failed") return "blocked"
  return "changes_requested"
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
  return JSON.parse(candidate)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    output.push(trimmed)
  }
  return output
}

function clipContextText(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1))}...`
}
