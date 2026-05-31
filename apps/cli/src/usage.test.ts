import { describe, expect, test } from "bun:test"
import type { UsageStats } from "@braincode/config"
import { cacheReadRatio, formatUsageReport, parseUsageOptions } from "./usage"

function emptyTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, calls: 0 }
}

function sampleStats(): UsageStats {
  return {
    generatedAt: 0,
    sessions: 2,
    totals: { input: 1000, output: 200, cacheRead: 9000, cacheWrite: 0, total: 10200, calls: 5 },
    byPhase: [
      { id: "primary", label: "primary", phase: "primary", input: 800, output: 150, cacheRead: 8000, cacheWrite: 0, total: 8950, calls: 3 },
      { id: "router", label: "router", phase: "router", input: 200, output: 50, cacheRead: 1000, cacheWrite: 0, total: 1250, calls: 2 },
    ],
    byModel: [
      { id: "anthropic/claude", label: "anthropic/claude", modelId: "anthropic/claude", input: 1000, output: 200, cacheRead: 9000, cacheWrite: 0, total: 10200, calls: 5 },
    ],
    byRole: [
      { id: "primary", label: "primary", role: "primary", input: 1000, output: 200, cacheRead: 9000, cacheWrite: 0, total: 10200, calls: 5 },
    ],
    recent: [
      { sessionId: "s1", path: "/tmp/s1.jsonl", timestamp: 2, phase: "primary", modelId: "anthropic/claude", usage: { input: 100, output: 20, cacheRead: 900, cacheWrite: 0, total: 1020 } },
    ],
  }
}

describe("cacheReadRatio", () => {
  test("returns the share of cacheable input served from cache", () => {
    expect(cacheReadRatio({ input: 1000, output: 0, cacheRead: 9000, cacheWrite: 0, total: 10000 })).toBeCloseTo(0.9)
  })

  test("returns 0 when there is no cacheable input", () => {
    expect(cacheReadRatio({ input: 0, output: 50, cacheRead: 0, cacheWrite: 0, total: 50 })).toBe(0)
  })
})

describe("parseUsageOptions", () => {
  test("parses json, sessions, and recent flags", () => {
    const options = parseUsageOptions(["--json", "--sessions", "10", "--recent", "3"])
    expect(options.json).toBe(true)
    expect(options.sessionLimit).toBe(10)
    expect(options.recent).toBe(3)
  })

  test("ignores non-numeric flag values", () => {
    const options = parseUsageOptions(["--sessions", "--json"])
    expect(options.sessionLimit).toBeUndefined()
  })
})

describe("formatUsageReport", () => {
  test("renders totals, cache hit, and phase/model/role sections", () => {
    const lines = formatUsageReport(sampleStats(), { recent: 1 })
    const text = lines.join("\n")
    expect(text).toContain("Sessions with usage: 2")
    expect(text).toContain("Cache hit: 90%")
    expect(text).toContain("By phase:")
    expect(text).toContain("primary")
    expect(text).toContain("router")
    expect(text).toContain("Recent calls")
  })

  test("explains the empty state when no usage is recorded", () => {
    const empty: UsageStats = { generatedAt: 0, sessions: 0, totals: emptyTotals(), byPhase: [], byModel: [], byRole: [], recent: [] }
    const text = formatUsageReport(empty).join("\n")
    expect(text).toContain("No recorded token usage yet")
  })
})
