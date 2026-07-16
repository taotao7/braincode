import type { AgentEvent } from "./pi-agent"
import type { TokenUsageTotals, UsageStatsBucket, SessionTokenUsageSummary } from "@braincode/config"

export type RuntimeMetricsPhase = "router" | "support" | "primary" | "review" | "pet" | "unknown"

export type RuntimeToolCallPhaseSummary = {
  phase: RuntimeMetricsPhase
  calls: number
  failed: number
}

export type RuntimeToolCallSummary = {
  total: number
  failed: number
  byPhase: RuntimeToolCallPhaseSummary[]
}

export type RuntimeTokenUsageSummary = {
  total: TokenUsageTotals
  byPhase: Array<Pick<UsageStatsBucket, "phase" | "input" | "output" | "cacheRead" | "cacheWrite" | "total" | "calls">>
  byModel: Array<Pick<UsageStatsBucket, "modelId" | "provider" | "input" | "output" | "cacheRead" | "cacheWrite" | "total" | "calls">>
}

export type RuntimeMetricsSummary = {
  tokens: RuntimeTokenUsageSummary
  toolCalls: RuntimeToolCallSummary
}

export type RuntimeToolCallMetricsTracker = {
  onEvent: (phase: RuntimeMetricsPhase, event: AgentEvent) => void
  summary: () => RuntimeToolCallSummary
}

export function createRuntimeToolCallMetricsTracker(): RuntimeToolCallMetricsTracker {
  const byPhase = new Map<RuntimeMetricsPhase, RuntimeToolCallPhaseSummary>()

  const phaseBucket = (phase: RuntimeMetricsPhase) => {
    const bucket = byPhase.get(phase) ?? { phase, calls: 0, failed: 0 }
    byPhase.set(phase, bucket)
    return bucket
  }

  return {
    onEvent: (phase, event) => {
      if (event.type === "tool_execution_start") {
        phaseBucket(phase).calls += 1
      } else if (event.type === "tool_execution_end" && event.isError) {
        phaseBucket(phase).failed += 1
      }
    },
    summary: () => {
      const phases = Array.from(byPhase.values())
        .filter((bucket) => bucket.calls > 0 || bucket.failed > 0)
        .sort((left, right) => phaseOrder(left.phase) - phaseOrder(right.phase) || left.phase.localeCompare(right.phase))
      return {
        total: phases.reduce((total, bucket) => total + bucket.calls, 0),
        failed: phases.reduce((total, bucket) => total + bucket.failed, 0),
        byPhase: phases,
      }
    },
  }
}

export function buildRuntimeMetricsSummary(
  usage: SessionTokenUsageSummary,
  toolCalls: RuntimeToolCallSummary,
): RuntimeMetricsSummary {
  return {
    tokens: {
      total: usage.totals,
      byPhase: usage.byPhase
        .map((bucket) => ({
          phase: bucket.phase,
          input: bucket.input,
          output: bucket.output,
          cacheRead: bucket.cacheRead,
          cacheWrite: bucket.cacheWrite,
          total: bucket.total,
          calls: bucket.calls,
        }))
        .sort((left, right) => phaseOrder(left.phase) - phaseOrder(right.phase) || (left.phase ?? "").localeCompare(right.phase ?? "")),
      byModel: usage.byModel.map((bucket) => ({
        modelId: bucket.modelId,
        provider: bucket.provider,
        input: bucket.input,
        output: bucket.output,
        cacheRead: bucket.cacheRead,
        cacheWrite: bucket.cacheWrite,
        total: bucket.total,
        calls: bucket.calls,
      })),
    },
    toolCalls,
  }
}

function phaseOrder(phase: RuntimeMetricsPhase | string | undefined): number {
  switch (phase) {
    case "router": return 0
    case "support": return 1
    case "primary": return 2
    case "review": return 3
    case "pet": return 4
    case "unknown": return 5
  }
  return 99
}
