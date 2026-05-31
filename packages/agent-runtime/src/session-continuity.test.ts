import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendSessionRecord, readSessionContext } from "@braincode/config"
import { applySessionContinuity } from "./index"

test("applySessionContinuity leaves the prompt unchanged on the first turn", () => {
  expect(applySessionContinuity("make it blue", undefined)).toBe("make it blue")
})

test("applySessionContinuity injects prior run history for follow-up turns", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-continuity-test-"))
  const sessionId = "continuity-session"
  try {
    // Simulate a completed first turn that generated an image.
    await appendSessionRecord(sessionId, { type: "run_start", prompt: "generate a hero image", attempt: 1 }, home)
    await appendSessionRecord(sessionId, { type: "run_end", summary: "Generated image artifact at /tmp/hero.png", attempt: 1 }, home)

    const priorContext = await readSessionContext(sessionId, home)
    expect(priorContext?.entries.some((entry) => entry.type === "run")).toBe(true)

    const effective = applySessionContinuity("try again", priorContext)
    expect(effective).toContain("Conversation so far")
    expect(effective).toContain("generate a hero image")
    expect(effective).toContain("Generated image artifact at /tmp/hero.png")
    expect(effective.endsWith("Current request:\ntry again")).toBe(true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("applySessionContinuity ignores a session with no completed runs", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-continuity-empty-test-"))
  const sessionId = "empty-session"
  try {
    // A session file that exists but has no run_start/run_end records yet.
    await appendSessionRecord(sessionId, { type: "mcp_connect", report: { servers: [] } }, home)
    const priorContext = await readSessionContext(sessionId, home)
    expect(applySessionContinuity("hello", priorContext)).toBe("hello")
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
