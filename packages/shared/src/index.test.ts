import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { debugLog, isDebugEnabled, normalizeModelApi, OPENAI_COMPLETIONS_API } from "./index"

const originalDebug = process.env.BRAINCODE_DEBUG
const originalDebugFile = process.env.BRAINCODE_DEBUG_FILE

afterEach(() => {
  if (originalDebug === undefined) delete process.env.BRAINCODE_DEBUG
  else process.env.BRAINCODE_DEBUG = originalDebug
  if (originalDebugFile === undefined) delete process.env.BRAINCODE_DEBUG_FILE
  else process.env.BRAINCODE_DEBUG_FILE = originalDebugFile
})

test("normalizeModelApi migrates legacy OpenAI chat completions id", () => {
  expect(normalizeModelApi("openai-chat-completions")).toBe(OPENAI_COMPLETIONS_API)
  expect(normalizeModelApi("openai-responses")).toBe("openai-responses")
  expect(normalizeModelApi("anthropic")).toBe("anthropic-messages")
  expect(normalizeModelApi("google")).toBe("google-generative-ai")
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

test("debugLog writes to BRAINCODE_DEBUG_FILE instead of stderr", () => {
  const dir = mkdtempSync(join(tmpdir(), "braincode-debug-"))
  const debugFile = join(dir, "debug.log")
  const calls: string[] = []
  const originalError = console.error
  console.error = (message?: unknown) => { calls.push(String(message)) }
  try {
    process.env.BRAINCODE_DEBUG = "true"
    process.env.BRAINCODE_DEBUG_FILE = debugFile
    debugLog("test", "file sink", { password: "secret", keep: "value" })
  } finally {
    console.error = originalError
  }

  const content = readFileSync(debugFile, "utf8")
  expect(calls).toEqual([])
  expect(content).toContain("[braincode:debug:test] file sink")
  expect(content).toContain('"password":"[redacted]"')
  expect(content).toContain('"keep":"value"')
  expect(content).not.toContain("secret")
  rmSync(dir, { recursive: true, force: true })
})
