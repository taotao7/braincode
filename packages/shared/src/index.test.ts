import { afterEach, expect, test } from "bun:test"
import { debugLog, isDebugEnabled, normalizeModelApi, OPENAI_COMPLETIONS_API } from "./index"

const originalDebug = process.env.BRAINCODE_DEBUG

afterEach(() => {
  if (originalDebug === undefined) delete process.env.BRAINCODE_DEBUG
  else process.env.BRAINCODE_DEBUG = originalDebug
})

test("normalizeModelApi migrates legacy OpenAI chat completions id", () => {
  expect(normalizeModelApi("openai-chat-completions")).toBe(OPENAI_COMPLETIONS_API)
  expect(normalizeModelApi("openai-responses")).toBe("openai-responses")
  expect(normalizeModelApi(undefined)).toBeUndefined()
})

test("debugLog redacts sensitive nested values when debug is enabled", () => {
  const calls: string[] = []
  const originalError = console.error
  console.error = (message?: unknown) => { calls.push(String(message)) }
  try {
    process.env.BRAINCODE_DEBUG = "false"
    expect(isDebugEnabled()).toBe(false)
    debugLog("test", "hidden", { apiKey: "secret" })
    expect(calls).toEqual([])

    process.env.BRAINCODE_DEBUG = "true"
    expect(isDebugEnabled()).toBe(true)
    debugLog("test", "visible", {
      apiKey: "secret",
      nested: { authorization: "bearer", keep: "value" },
      values: [{ token: "token-value" }],
    })
  } finally {
    console.error = originalError
  }

  expect(calls).toHaveLength(1)
  expect(calls[0]).toContain("[braincode:debug:test] visible")
  expect(calls[0]).toContain('"apiKey":"[redacted]"')
  expect(calls[0]).toContain('"authorization":"[redacted]"')
  expect(calls[0]).toContain('"token":"[redacted]"')
  expect(calls[0]).toContain('"keep":"value"')
  expect(calls[0]).not.toContain("secret")
  expect(calls[0]).not.toContain("bearer")
})
