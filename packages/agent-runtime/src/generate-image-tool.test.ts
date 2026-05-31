import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createGenerateImageTool, GENERATE_IMAGE_TOOL_NAME } from "./generate-image-tool"

function makeTool(home: string) {
  return createGenerateImageTool({
    models: [],
    home,
    sessionId: "session-under-test",
    imagePolicy: { modelId: "openai/gpt-image-2", thinkingLevel: "off" },
  })
}

test("createGenerateImageTool exposes generate_image metadata and schema", () => {
  const tool = makeTool("/tmp/does-not-matter")
  expect(tool.name).toBe(GENERATE_IMAGE_TOOL_NAME)
  expect(tool.executionMode).toBe("sequential")
  expect(tool.description.toLowerCase()).toContain("image")
})

test("prepareArguments requires a non-empty prompt and trims size", () => {
  const tool = makeTool("/tmp/does-not-matter")
  expect(() => tool.prepareArguments?.({})).toThrow(/non-empty 'prompt'/)
  expect(() => tool.prepareArguments?.({ prompt: "   " })).toThrow(/non-empty 'prompt'/)
  expect(tool.prepareArguments?.({ prompt: "  a cat  ", size: " 1024x1024 " })).toEqual({ prompt: "a cat", size: "1024x1024" })
  expect(tool.prepareArguments?.({ prompt: "a cat" })).toEqual({ prompt: "a cat", size: undefined })
})

test("execute returns a graceful message when no image-generation model is configured", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-generate-image-tool-test-"))
  try {
    const tool = makeTool(home)
    const result = await tool.execute("call-1", { prompt: "a hero banner" })
    const text = result.content.map((part) => (part.type === "text" ? part.text : "")).join("")
    expect(text).toContain("No image-generation-capable model is configured")
    expect((result.details as { artifactPath?: string }).artifactPath).toBeUndefined()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
