import type { HandoffPacket, WorkerResult } from "@braincode/context"
import type { ContextRef } from "@braincode/protocol"
import type { PatchCheckSummary, PatchRiskTier } from "./checks"
import type { PatchDiffSnapshot, PatchSummary, UntrackedFilePreview } from "./patch"
import { formatReadOnlyToolAccess } from "./tool-discipline"

export type PatchReviewArtifacts = {
  patch?: PatchSummary
  checks?: PatchCheckSummary
  diff?: PatchDiffSnapshot
  untrackedPreviews?: UntrackedFilePreview[]
}

export type MissingReviewArtifactsPolicy = "changes_requested" | "blocked"

export type ReviewMode = "normal" | "strict" | "hostile"

export function reviewModeForRiskTier(tier: PatchRiskTier): ReviewMode {
  if (tier === "critical") return "hostile"
  if (tier === "high") return "strict"
  return "normal"
}

export type ReviewIndependenceLevel = "strong" | "moderate" | "weak" | "none"

export type ReviewIndependenceParticipant = {
  modelId?: string
  provider?: string
}

export type ReviewIndependence = {
  primary: ReviewIndependenceParticipant
  reviewer: ReviewIndependenceParticipant
  sameModel: boolean
  sameProvider: boolean
  level: ReviewIndependenceLevel
}

export function evaluateReviewIndependence(
  primary: ReviewIndependenceParticipant,
  reviewer: ReviewIndependenceParticipant,
): ReviewIndependence {
  const sameModel = Boolean(primary.modelId && reviewer.modelId && primary.modelId === reviewer.modelId)
  const sameProvider = Boolean(primary.provider && reviewer.provider && primary.provider === reviewer.provider)
  let level: ReviewIndependenceLevel
  if (!reviewer.modelId) level = "none"
  else if (sameModel) level = "weak"
  else if (sameProvider) level = "moderate"
  else level = "strong"
  return { primary, reviewer, sameModel, sameProvider, level }
}

export type ReviewGateOptions = {
  missingArtifacts?: MissingReviewArtifactsPolicy
  riskTier?: PatchRiskTier
  independence?: ReviewIndependence
  changedFiles?: string[]
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

export type ReviewCoverageStatus = "inspected" | "partially_inspected" | "skipped"

export type ReviewCoverageEntry = {
  file: string
  status: ReviewCoverageStatus
  reason?: string
}

export type ReviewDecision = {
  decision: ReviewDecisionStatus
  confidence?: number
  rationale: string
  findings: ReviewFinding[]
  requiredChanges: string[]
  blockingIssues: string[]
  residualRisks: string[]
  coverage?: ReviewCoverageEntry[]
  mode?: ReviewMode
  independence?: ReviewIndependence
  riskTier?: PatchRiskTier
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
  artifacts?: ContextRef[]
}

export type ReviewMergeResult = {
  summary: string
  risks: string[]
  reviewDecision?: ReviewDecision
}

export type ReviewPacket = {
  intent: {
    userGoal: string
    primaryClaim: string
  }
  changeSet: {
    filesChanged: string[]
    patchKind?: string
    diffStats: string
  }
  verification: {
    checksRun: string[]
    checksPassed: boolean
    checkFailures: string[]
  }
  risks: string[]
}

export function buildReviewPrompt(
  originalPrompt: string,
  primarySummary: string,
  workerResults: PromptWorkerResult[],
  handoff: HandoffPacket,
  projectSupportContext = "",
  artifacts?: PatchReviewArtifacts,
  environmentSection = "",
  options: {
    mode?: ReviewMode
    riskTier?: PatchRiskTier
    independence?: ReviewIndependence
  } = {},
): string {
  const patchArtifacts = formatPatchReviewArtifacts(artifacts)
  const mode = options.mode ?? "normal"
  const tier = options.riskTier
  const independence = options.independence
  const changedFiles = artifacts?.patch?.changedFiles.map((change) => change.path) ?? []
  const modeFraming = formatReviewModeFraming(mode)
  const independenceFraming = formatReviewIndependenceFraming(independence)
  const coverageRequirement = formatReviewCoverageRequirement(changedFiles, mode, tier)
  
  const reviewPacket: ReviewPacket = {
    intent: {
      userGoal: originalPrompt,
      primaryClaim: primarySummary,
    },
    changeSet: {
      filesChanged: changedFiles,
      patchKind: artifacts?.checks?.patchKind,
      diffStats: artifacts?.patch?.diffStats.raw ?? "no diff stats",
    },
    verification: {
      checksRun: artifacts?.checks?.results.map((r) => r.name) ?? [],
      checksPassed: artifacts?.checks?.status === "passed",
      checkFailures: artifacts?.checks?.results.filter((r) => r.status === "failed").map((r) => r.name) ?? [],
    },
    risks: workerResults.flatMap((w) => w.risks),
  }

  return `Review this Braincode run as an isolated review agent.

${environmentSection}${projectSupportContext}
${formatReadOnlyToolAccess()}

${modeFraming}${independenceFraming}${tier ? `Patch risk tier: ${tier}\n` : ""}

Review packet (structured intent and verification context):
${JSON.stringify(reviewPacket, null, 2)}

Supporting worker results:
${workerResults.length > 0 ? formatWorkerResults(workerResults) : "No supporting worker results."}

Patch artifacts:
${patchArtifacts}

Handoff packet:
${JSON.stringify(handoff, null, 2)}

${coverageRequirement}Review output rules:
- Put concrete findings first; do not lead with a generic summary.
- If no concrete defect is found, return an empty findings array and a precise approval rationale.
- If the git diff is marked truncated, include that as a residual risk.
- If checks are skipped, include that as a residual risk.
- If checks failed, request changes and name the failing checks.
- If required patch/check/diff artifacts are missing, block or request changes instead of approving.
- Set confidence as a number from 0 to 1 based on the evidence quality available to you.
- You see the primary agent's final summary, not its private chain-of-thought; do not rely on reasoning that is not evidenced by artifacts.

Return only JSON in this shape:
{"taskId":"${handoff.task.id}","parentId":"${handoff.task.parentId}","progress":{"status":"completed|blocked","summary":"brief progress"},"decision":"approved|changes_requested|blocked","confidence":0.0,"rationale":"brief reason for the decision","findings":[{"severity":"low|medium|high","file":"optional project-relative path","line":1,"evidence":"short evidence","issue":"specific issue","suggestion":"specific fix"}],"requiredChanges":["specific change required before approval"],"blockingIssues":["issue that prevents review completion"],"residualRisks":["risk that remains after review"],"coverage":[{"file":"project-relative path","status":"inspected|partially_inspected|skipped","reason":"why this status"}],"summary":"review findings or clear statement that no concrete issue was found","artifacts":[{"kind":"file|thread|summary|artifact","uri":"reference uri","label":"optional label"}],"risks":["confirmed risk"],"nextQuestions":["question only if blocked"]}`
}

function formatReviewModeFraming(mode: ReviewMode): string {
  if (mode === "hostile") {
    return [
      "Review mode: hostile (adversarial).",
      "You are not here to validate the primary agent. Find concrete reasons this patch should NOT be approved.",
      "Enumerate plausible attack vectors that apply to the changed code (auth bypass, injection, secret exfiltration, supply-chain, privilege escalation, SSRF, CSRF). For each, state whether the patch artifacts rule it out and cite the file:line evidence; if you cannot rule it out, request changes.",
      "",
    ].join("\n")
  }
  if (mode === "strict") {
    return [
      "Review mode: strict.",
      "Enumerate approval blockers explicitly. Do not rely on the primary agent's claims unless the patch/diff/checks evidence supports them. If any blocker fires, return changes_requested with required changes.",
      "",
    ].join("\n")
  }
  return "Review mode: normal.\n\n"
}

function formatReviewIndependenceFraming(independence: ReviewIndependence | undefined): string {
  if (!independence) return ""
  const lines = [
    `Review independence: ${independence.level}`,
    `- primary model: ${independence.primary.modelId ?? "unknown"} (provider: ${independence.primary.provider ?? "unknown"})`,
    `- review model: ${independence.reviewer.modelId ?? "unknown"} (provider: ${independence.reviewer.provider ?? "unknown"})`,
    `- same model: ${independence.sameModel ? "yes" : "no"}, same provider: ${independence.sameProvider ? "yes" : "no"}`,
  ]
  if (independence.sameModel) {
    lines.push("Because the same model wrote and is reviewing this patch, be especially skeptical of self-consistent reasoning; require artifact evidence for each claim.")
  }
  lines.push("")
  return lines.join("\n")
}

function formatReviewCoverageRequirement(changedFiles: string[], mode: ReviewMode, tier: PatchRiskTier | undefined): string {
  if (changedFiles.length === 0) return ""
  const requireAll = mode !== "normal" || tier === "high" || tier === "critical"
  const lead = requireAll
    ? "Coverage requirement: every changed file MUST appear in `coverage` with status inspected, partially_inspected (with reason), or skipped (with reason). Missing files will force changes_requested."
    : "Coverage: list each changed file in `coverage` with inspected/partially_inspected/skipped and a short reason."
  return `${lead}\nChanged files:\n${changedFiles.map((file) => `- ${file}`).join("\n")}\n\n`
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

export type PrimaryFixReason = {
  checks?: PatchCheckSummary
  reviewDecision?: ReviewDecision
}

export function fixLoopTrigger(
  checks: PatchCheckSummary | undefined,
  reviewDecision: ReviewDecision | undefined,
): "checks_failed" | "changes_requested" | undefined {
  if (checks?.status === "failed") return "checks_failed"
  if (reviewDecision?.decision === "changes_requested") return "changes_requested"
  return undefined
}

export function buildPrimaryFixPrompt(reason: PrimaryFixReason, iteration: number): string {
  const sections: string[] = []
  const failedChecks = reason.checks?.results.filter((result) => result.status === "failed") ?? []
  if (failedChecks.length > 0) {
    const lines = failedChecks.map((result) => {
      const output = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode ?? "n/a"}`
      return `- ${result.name}: ${clipContextText(output, 1600)}`
    })
    sections.push(`Failing checks:\n${lines.join("\n")}`)
  }
  const decision = reason.reviewDecision
  if (decision?.decision === "changes_requested") {
    if (decision.requiredChanges.length > 0) {
      sections.push(`Required changes from review:\n${decision.requiredChanges.map((change) => `- ${change}`).join("\n")}`)
    }
    if (decision.findings.length > 0) {
      const findings = decision.findings.map((finding) => {
        const location = finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""
        const suggestion = finding.suggestion ? ` Suggestion: ${finding.suggestion}` : ""
        return `- [${finding.severity}]${location} ${finding.issue}${suggestion}`
      })
      sections.push(`Review findings:\n${findings.join("\n")}`)
    }
  }

  return `Your previous changes did not pass. This is fix iteration ${iteration}.

${sections.join("\n\n")}

Fix the underlying cause of the issues above. Make the minimal edits needed; do not restate or rewrite the whole solution, and do not re-explain unchanged work. After editing, produce the final user-facing result.`
}

export function formatWorkerResults(workerResults: PromptWorkerResult[]): string {
  return workerResults
    .map((result) => {
      const risks = result.risks.length > 0 ? `\nRisks:\n${result.risks.map((risk) => `- ${risk}`).join("\n")}` : ""
      const questions = result.nextQuestions.length > 0 ? `\nOpen questions:\n${result.nextQuestions.map((question) => `- ${question}`).join("\n")}` : ""
      const artifacts = result.artifacts && result.artifacts.length > 0
        ? `\nArtifacts:\n${result.artifacts.map((artifact) => `- ${artifact.uri}${artifact.label ? ` (${artifact.label})` : ""}`).join("\n")}`
        : ""
      const progress = result.progress.summary ? `${result.progress.status}: ${result.progress.summary}` : result.progress.status
      return `### ${result.role} (${result.status})\nTask: ${result.taskId} -> ${result.parentId}\nGoal: ${result.goal}\nProgress: ${progress}\nSummary: ${result.summary}${artifacts}${risks}${questions}`
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
  const coverage = normalizeReviewCoverage(parsedRecord?.coverage)
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
    ...(coverage.length > 0 ? { coverage } : {}),
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
  const tier = gateOptions.riskTier

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
    if ((tier === "high" || tier === "critical") && gated.decision !== "blocked") {
      const issue = "Checks were skipped on high/critical risk patch; cannot approve without verification."
      gated = {
        ...gated,
        decision: "changes_requested",
        requiredChanges: uniqueStrings([...gated.requiredChanges, issue]),
      }
    }
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

  // Coverage gate: for high/critical tiers (or any strict/hostile review with
  // changed files known), every changed file must appear in the coverage map.
  const requireFullCoverage = tier === "high" || tier === "critical"
  const changedFiles = gateOptions.changedFiles ?? []
  if (requireFullCoverage && changedFiles.length > 0) {
    const covered = new Set((gated.coverage ?? []).map((entry) => entry.file))
    const missingCoverage = changedFiles.filter((file) => !covered.has(file))
    if (missingCoverage.length > 0) {
      const issue = `Review coverage missing for ${missingCoverage.length} changed file(s): ${missingCoverage.slice(0, 5).join(", ")}${missingCoverage.length > 5 ? ", ..." : ""}.`
      if (gated.decision !== "blocked") {
        gated = {
          ...gated,
          decision: "changes_requested",
          requiredChanges: uniqueStrings([...gated.requiredChanges, issue]),
        }
      }
      residualRisks.push(issue)
    }
  }

  // Independence gate: for high/critical tier same-model reviewer is insufficient;
  // for critical tier same-provider reviewer is insufficient.
  const independence = gateOptions.independence
  if (independence) {
    if ((tier === "high" || tier === "critical") && independence.sameModel && gated.decision === "approved") {
      const issue = `Reviewer used the same model as the primary; ${tier}-risk patches require a different model for approval.`
      gated = {
        ...gated,
        decision: "changes_requested",
        requiredChanges: uniqueStrings([...gated.requiredChanges, issue]),
      }
      residualRisks.push(issue)
    }
    if (tier === "critical" && independence.sameProvider && gated.decision !== "blocked") {
      const issue = "Reviewer used the same provider as the primary; critical-risk patches require a different provider."
      gated = {
        ...gated,
        decision: "blocked",
        blockingIssues: uniqueStrings([...gated.blockingIssues, issue]),
      }
      residualRisks.push(issue)
    }
    // Self-review (same model) on medium+ caps confidence at 0.5 to discourage
    // silent trust in self-consistent reasoning.
    if (independence.sameModel && (tier === "medium" || tier === "high" || tier === "critical")) {
      const cappedConfidence = gated.confidence === undefined ? 0.5 : Math.min(gated.confidence, 0.5)
      gated = { ...gated, confidence: cappedConfidence }
      residualRisks.push("Self-review bias risk: primary and reviewer share the same model; confidence capped.")
    }
  }

  return {
    ...gated,
    residualRisks: uniqueStrings(residualRisks),
    ...(independence ? { independence } : {}),
    ...(tier ? { riskTier: tier } : {}),
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

function normalizeReviewCoverage(value: unknown): ReviewCoverageEntry[] {
  if (!Array.isArray(value)) return []
  const entries: ReviewCoverageEntry[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const file = stringValue(record.file)
    if (!file || seen.has(file)) continue
    const statusRaw = stringValue(record.status)
    if (!isReviewCoverageStatus(statusRaw)) continue
    const reason = stringValue(record.reason)
    seen.add(file)
    entries.push({ file, status: statusRaw, ...(reason ? { reason } : {}) })
  }
  return entries
}

function isReviewCoverageStatus(value: string | undefined): value is ReviewCoverageStatus {
  return value === "inspected" || value === "partially_inspected" || value === "skipped"
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
