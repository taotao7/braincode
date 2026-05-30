import type { AgentTodoStatus, BraincodeMode, RoutedAgentRole } from "@braincode/brain"
import type { PatchCheckSummary } from "./checks"
import { hasPatchActivity, type PatchSummary } from "./patch"
import type { ReviewDecision, ReviewDecisionStatus } from "./review"
import type { RuntimeMetricsSummary } from "./metrics"

export type FinalReportStatus = ReviewDecisionStatus | "answered" | "read_only"

export type FinalReport = {
  version: 1
  status: FinalReportStatus
  task: string
  sessionId: string
  brain: {
    id: string
    name: string
    mode: BraincodeMode
  }
  routing: {
    source: "router-brain" | "heuristic"
    primaryRole: RoutedAgentRole
    workers: Array<{
      role: RoutedAgentRole
      phase: "support" | "primary" | "review"
      status?: string
    }>
    confidence?: number
    reason?: string
  }
  todos: Array<{
    id: string
    title: string
    role: RoutedAgentRole
    status: AgentTodoStatus
  }>
  patch?: PatchSummary
  checks?: PatchCheckSummary
  review?: ReviewDecision
  metrics?: RuntimeMetricsSummary
  modelSummary: string
  fixIterations?: number
  warnings: string[]
}

export type FinalReportRuntimePlan = {
  mode: BraincodeMode
  brain: {
    id: string
    name: string
  }
  role: RoutedAgentRole
  routing: {
    source: "router-brain" | "heuristic"
    confidence?: number
    reason?: string
  }
  workers: Array<{
    role: RoutedAgentRole
    contextId: string
  }>
  todos: Array<{
    id: string
    title: string
    role: RoutedAgentRole
    status: AgentTodoStatus
  }>
}

export type FinalReportWorkerResult = {
  role: RoutedAgentRole
  taskId: string
  status: string
  reviewDecision?: ReviewDecision
}

export type BuildFinalReportInput = {
  task: string
  sessionId: string
  plan: FinalReportRuntimePlan
  workerResults: FinalReportWorkerResult[]
  modelSummary: string
  patch?: PatchSummary
  checks?: PatchCheckSummary
  review?: ReviewDecision
  metrics?: RuntimeMetricsSummary
  runtimeToolCount?: number
  fixIterations?: number
}

export function buildFinalReport(input: BuildFinalReportInput): FinalReport {
  const warnings = finalReportWarnings(input)
  return {
    version: 1,
    status: resolveFinalReportStatus(input),
    task: input.task,
    sessionId: input.sessionId,
    brain: {
      id: input.plan.brain.id,
      name: input.plan.brain.name,
      mode: input.plan.mode,
    },
    routing: {
      source: input.plan.routing.source,
      primaryRole: input.plan.role,
      workers: input.plan.workers.map((worker) => {
        const phase = worker.role === input.plan.role ? "primary" : worker.role === "review" ? "review" : "support"
        const result = input.workerResults.find((candidate) => candidate.taskId === worker.contextId)
          ?? input.workerResults.find((candidate) => candidate.role === worker.role)
        const status = phase === "primary"
          ? input.modelSummary.trim() ? "completed" : undefined
          : result?.reviewDecision?.decision ?? result?.status
        return {
          role: worker.role,
          phase,
          ...(status ? { status } : {}),
        }
      }),
      ...(input.plan.routing.confidence !== undefined ? { confidence: input.plan.routing.confidence } : {}),
      ...(input.plan.routing.reason ? { reason: input.plan.routing.reason } : {}),
    },
    todos: input.plan.todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      role: todo.role,
      status: todo.status,
    })),
    ...(input.patch ? { patch: input.patch } : {}),
    ...(input.checks ? { checks: input.checks } : {}),
    ...(input.review ? { review: input.review } : {}),
    ...(input.metrics ? { metrics: input.metrics } : {}),
    modelSummary: input.modelSummary,
    ...(input.fixIterations ? { fixIterations: input.fixIterations } : {}),
    warnings,
  }
}

export function resolveFinalReportStatus(input: Pick<BuildFinalReportInput, "patch" | "checks" | "review" | "runtimeToolCount">): FinalReportStatus {
  if (input.review?.decision === "blocked") return "blocked"
  if (input.checks?.status === "failed") return "changes_requested"
  if (input.review?.decision) return input.review.decision
  if (hasPatchActivity(input.patch)) return "approved"
  return (input.runtimeToolCount ?? 0) > 0 ? "read_only" : "answered"
}

function finalReportWarnings(input: Pick<BuildFinalReportInput, "patch" | "checks" | "review" | "fixIterations">): string[] {
  const warnings: string[] = []
  if (!hasPatchActivity(input.patch)) {
    warnings.push("No patch activity detected.")
  }
  if (input.checks?.status === "failed" && input.review?.decision === "approved") {
    warnings.push("Failed checks override review approval.")
  }
  if (input.checks?.status === "skipped") {
    warnings.push(input.checks.reason ? `Checks skipped: ${input.checks.reason}` : "Checks skipped.")
  }
  if (input.review?.decision === "blocked") {
    warnings.push("Review blocked final approval.")
  }
  if ((input.fixIterations ?? 0) > 0) {
    if (input.checks?.status === "failed") {
      warnings.push(`Fix budget exhausted after ${input.fixIterations} iteration(s); checks still failing.`)
    } else if (input.review?.decision === "changes_requested") {
      warnings.push(`Fix budget exhausted after ${input.fixIterations} iteration(s); review still requests changes.`)
    }
  }
  return uniqueStrings(warnings)
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    output.push(value)
  }
  return output
}
