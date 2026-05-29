import { expect, test } from "bun:test"
import { ContextHandoffRequiredError, enforceHandoffContextBudget } from "./context-budget"

test("enforceHandoffContextBudget throws with an automatic handoff summary over the provider guard", () => {
  const messages = [
    {
      role: "user",
      content: [{ type: "text", text: `important context ${"x".repeat(2_000_000)}` }],
    },
  ] as never

  let thrown: unknown
  try {
    enforceHandoffContextBudget(messages, { systemPrompt: "system", sessionId: "session-1" })
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(ContextHandoffRequiredError)
  const error = thrown as ContextHandoffRequiredError
  expect(error.sessionId).toBe("session-1")
  expect(error.estimatedBytes).toBeGreaterThan(error.limitBytes)
  expect(error.handoffSummary).toContain("Session: session-1")
  expect(error.handoffSummary).toContain("important context")
  expect(error.handoffSummary).toContain("truncated")
})
