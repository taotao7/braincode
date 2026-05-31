import { describe, expect, test } from "bun:test"
import type { AgentMessage } from "@earendil-works/pi-agent-core"
import { createRuntimeCompactor, deriveCompactionPolicy, findUserBoundaryCut, shouldEnableCompaction } from "./compaction"

function userMsg(text: string): AgentMessage {
  return { role: "user", content: [{ type: "text", text }], timestamp: 0 }
}

function assistantMsg(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "test",
    model: "test",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, totalTokens: 0, cost: 0 },
    stopReason: "stop",
    timestamp: 0,
  } as unknown as AgentMessage
}

function toolResultMsg(text: string): AgentMessage {
  return { role: "toolResult", toolCallId: "t1", toolName: "read", content: [{ type: "text", text }], isError: false, timestamp: 0 } as unknown as AgentMessage
}

describe("shouldEnableCompaction", () => {
  test("auto and aggressive enable compaction; manual disables", () => {
    expect(shouldEnableCompaction("auto")).toBe(true)
    expect(shouldEnableCompaction("aggressive")).toBe(true)
    expect(shouldEnableCompaction("manual")).toBe(false)
  })
})

describe("deriveCompactionPolicy", () => {
  test("returns undefined for manual mode (preserves explicit-handoff default)", () => {
    expect(deriveCompactionPolicy({ maxInputTokens: 120000, compaction: "manual" })).toBeUndefined()
  })

  test("returns a policy for auto mode with the configured budget", () => {
    expect(deriveCompactionPolicy({ maxInputTokens: 90000, compaction: "auto" })).toEqual({ maxInputTokens: 90000, mode: "auto" })
  })

  test("falls back to a default budget when maxInputTokens is missing or invalid", () => {
    expect(deriveCompactionPolicy({ compaction: "aggressive" })).toEqual({ maxInputTokens: 120000, mode: "aggressive" })
    expect(deriveCompactionPolicy({ maxInputTokens: 0, compaction: "auto" })).toEqual({ maxInputTokens: 120000, mode: "auto" })
  })

  test("returns undefined when no context policy is provided", () => {
    expect(deriveCompactionPolicy(undefined)).toBeUndefined()
  })
})

describe("findUserBoundaryCut", () => {
  test("snaps the cut forward to a user message so tool pairs are never orphaned", () => {
    const messages = [
      userMsg("first task"),
      assistantMsg("calling tool"),
      toolResultMsg("big result ".repeat(5000)),
      userMsg("second task"),
      assistantMsg("done"),
    ]
    // keepRecentTokens small enough that the recent slice starts mid-turn,
    // forcing a forward snap to the "second task" user message at index 3.
    const cut = findUserBoundaryCut(messages, 50)
    expect(messages[cut]?.role).toBe("user")
    expect(cut).toBe(3)
  })

  test("returns 0 when there is no user boundary after the candidate index", () => {
    const messages = [userMsg("task"), assistantMsg("a"), toolResultMsg("b")]
    // A huge keep budget means the candidate index walks to 0, which is a user
    // message, so the whole transcript is kept (cut at 0).
    expect(findUserBoundaryCut(messages, 1_000_000)).toBe(0)
  })
})

describe("createRuntimeCompactor", () => {
  test("returns undefined when compaction is disabled", () => {
    expect(createRuntimeCompactor({ policy: { maxInputTokens: 1000, mode: "manual" }, model: {} as never })).toBeUndefined()
  })

  test("passes through messages below the token budget without summarizing", async () => {
    let summarizerCalled = false
    const compactor = createRuntimeCompactor({
      policy: { maxInputTokens: 1_000_000, mode: "auto" },
      model: { provider: "test" } as never,
      getApiKey: () => { summarizerCalled = true; return "key" },
    })
    const messages = [userMsg("hello"), assistantMsg("hi")]
    const result = await compactor!.transform(messages)
    expect(result).toBe(messages)
    expect(summarizerCalled).toBe(false)
  })

  test("passes through unchanged when no api key is available even over budget", async () => {
    const compactor = createRuntimeCompactor({
      policy: { maxInputTokens: 1, mode: "auto" },
      model: { provider: "test" } as never,
      getApiKey: () => undefined,
    })
    const messages = [userMsg("a ".repeat(100)), userMsg("b ".repeat(100)), userMsg("c ".repeat(100))]
    const result = await compactor!.transform(messages)
    expect(result).toBe(messages)
  })
})
