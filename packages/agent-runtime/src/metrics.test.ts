import { expect, test } from "bun:test"
import { buildRuntimeMetricsSummary, createRuntimeToolCallMetricsTracker } from "./metrics"

test("runtime metrics summarize tool calls and token usage by phase without estimating cost", () => {
  const tracker = createRuntimeToolCallMetricsTracker()
  tracker.onEvent("support", { type: "tool_execution_start", toolCallId: "read-1", toolName: "read_file", args: {} } as never)
  tracker.onEvent("primary", { type: "tool_execution_start", toolCallId: "edit-1", toolName: "edit_file", args: {} } as never)
  tracker.onEvent("primary", { type: "tool_execution_end", toolCallId: "edit-1", toolName: "edit_file", isError: true, result: {} } as never)

  const metrics = buildRuntimeMetricsSummary({
    sessionId: "session-1",
    totals: { input: 120, output: 30, cacheRead: 5, cacheWrite: 0, total: 155, calls: 2 },
    byPhase: [
      { id: "primary", label: "primary", phase: "primary", input: 100, output: 20, cacheRead: 5, cacheWrite: 0, total: 125, calls: 1 },
      { id: "router", label: "router", phase: "router", input: 20, output: 10, cacheRead: 0, cacheWrite: 0, total: 30, calls: 1 },
    ],
    byModel: [
      { id: "provider/model", label: "provider/model", modelId: "provider/model", provider: "provider", input: 120, output: 30, cacheRead: 5, cacheWrite: 0, total: 155, calls: 2 },
    ],
    byRole: [],
    records: [],
  }, tracker.summary())

  expect(metrics.tokens.total.total).toBe(155)
  expect(metrics.tokens.byPhase.map((phase) => [phase.phase, phase.total])).toEqual([
    ["router", 30],
    ["primary", 125],
  ])
  expect(metrics.toolCalls).toEqual({
    total: 2,
    failed: 1,
    byPhase: [
      { phase: "support", calls: 1, failed: 0 },
      { phase: "primary", calls: 1, failed: 1 },
    ],
  })
  expect("estimatedCost" in metrics.tokens).toBe(false)
})
