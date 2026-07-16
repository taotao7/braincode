import { debugLog } from "@braincode/shared"

// Lightweight pre-first-token phase timing. Measures the wall-clock cost of
// each prep phase between prompt submission and the primary agent's first
// LLM call, so slow-start regressions are attributable to a specific phase
// (router LLM call, config reads, git, MCP connect, support workers, ...).
// Emitted via debugLog("timing", ...) — zero overhead unless BRAINCODE_DEBUG
// is enabled, aside from a few performance.now() calls and an array push.
export type PhaseTimer = {
  // Measure an awaited step. Returns the promise's value untouched.
  // Concurrent measures are safe: each span is timed from its own start.
  // This is the only way to record a span — a "time since some implicit
  // earlier point" marker would silently absorb every concurrent await
  // between the two points and misattribute it to a tiny step.
  measure<T>(phase: string, work: () => Promise<T>): Promise<T>
  // Emit the collected breakdown (call right before the primary LLM prompt).
  report(context: Record<string, unknown>): void
}

// 0.1ms precision shared by every span so standalone spans and PhaseTimer
// breakdowns stay correlatable in the timing logs.
function roundMs(ms: number): number {
  return Math.round(ms * 10) / 10
}

// Standalone span for call sites without a PhaseTimer in scope (e.g. the
// router LLM round-trip inside buildRuntimePlan).
export async function measureTimingSpan<T>(label: string, context: Record<string, unknown>, work: () => Promise<T>): Promise<T> {
  const begin = performance.now()
  try {
    return await work()
  } finally {
    debugLog("timing", label, { ...context, ms: roundMs(performance.now() - begin) })
  }
}

export function createPhaseTimer(scope: string): PhaseTimer {
  const started = performance.now()
  const phases: Array<{ phase: string; ms: number }> = []

  return {
    async measure(phase, work) {
      const begin = performance.now()
      try {
        return await work()
      } finally {
        phases.push({ phase, ms: roundMs(performance.now() - begin) })
      }
    },
    report(context) {
      debugLog("timing", `${scope} phase breakdown`, {
        ...context,
        totalMs: roundMs(performance.now() - started),
        phases,
      })
    },
  }
}
