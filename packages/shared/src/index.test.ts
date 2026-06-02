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
  const dir = mkdtempSync(join(tmpdir(), "braincode-debug-redact-"))
  const debugFile = join(dir, "debug.log")
  try {
    process.env.BRAINCODE_DEBUG = "false"
    process.env.BRAINCODE_DEBUG_FILE = debugFile
    expect(isDebugEnabled()).toBe(false)
    debugLog("test", "hidden", { apiKey: "secret" })

    process.env.BRAINCODE_DEBUG = "true"
    expect(isDebugEnabled()).toBe(true)
    debugLog("test", "visible", {
      apiKey: "secret",
      nested: { authorization: "bearer", keep: "value" },
      values: [{ token: "token-value" }],
    })

    const content = readFileSync(debugFile, "utf8")
    expect(content).not.toContain("hidden")
    expect(content).toContain("[braincode:debug:test] visible")
    expect(content).toContain('"apiKey":"[redacted]"')
    expect(content).toContain('"authorization":"[redacted]"')
    expect(content).toContain('"token":"[redacted]"')
    expect(content).toContain('"keep":"value"')
    expect(content).not.toContain("secret")
    expect(content).not.toContain("bearer")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
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
