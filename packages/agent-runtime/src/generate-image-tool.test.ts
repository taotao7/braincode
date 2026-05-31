import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeProviderApiKey } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { createGenerateImageTool, GENERATE_IMAGE_TOOL_NAME } from "./generate-image-tool"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function makeTool(home: string) {
  return createGenerateImageTool({
    models: [],
    home,
    sessionId: "session-under-test",
    imagePolicy: { modelId: "openai/gpt-image-2", thinkingLevel: "off" },
  })
}

const imageModel: BraincodeModel = {
  id: "openai/gpt-image-2",
  provider: "openai",
  modelId: "gpt-image-2",
  name: "GPT Image 2",
  api: "openai-images",
  baseUrl: "https://api.openai.com/v1",
  contextWindow: 32000,
  supportsTools: false,
  supportsVision: false,
  supportsImageGeneration: true,
  defaultThinkingLevel: "off",
}

function makeConfiguredTool(home: string) {
  return createGenerateImageTool({
    models: [imageModel],
    home,
    sessionId: "session-under-test",
    imagePolicy: { modelId: imageModel.id, thinkingLevel: "off" },
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

test("execute generates and stores an image artifact with model details", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-generate-image-tool-success-test-"))
  try {
    await writeProviderApiKey("openai", "test-key", home)
    const pngBase64 = Buffer.from("image-bytes").toString("base64")
    const requests: Array<{ url: string; body: unknown; authorization: string | null }> = []
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const headers = new Headers(init?.headers)
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)), authorization: headers.get("authorization") })
      return new Response(JSON.stringify({ data: [{ b64_json: pngBase64, revised_prompt: "a revised prompt" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as unknown as typeof fetch

    const tool = makeConfiguredTool(home)
    const result = await tool.execute("call-1", { prompt: "a hero banner", size: "1024x1024" })
    const text = result.content.map((part) => (part.type === "text" ? part.text : "")).join("")
    const details = result.details as { artifactPath?: string; provider?: string; modelId?: string; bytes?: number }

    expect(text).toContain("Generated image artifact")
    expect(text).toContain("Provider revised prompt: a revised prompt")
    expect(details.provider).toBe("openai")
    expect(details.modelId).toBe("openai/gpt-image-2")
    expect(details.bytes).toBe("image-bytes".length)
    expect(details.artifactPath).toStartWith(join(home, "generated-images", "session-under-test"))
    expect(await Bun.file(details.artifactPath!).text()).toBe("image-bytes")
    expect(requests).toEqual([
      {
        url: "https://api.openai.com/v1/images/generations",
        body: { model: "gpt-image-2", prompt: "a hero banner", n: 1, size: "1024x1024" },
        authorization: "Bearer test-key",
      },
    ])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("execute reports candidate failures without exposing an artifact", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-generate-image-tool-failure-test-"))
  try {
    await writeProviderApiKey("openai", "test-key", home)
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "image model unavailable" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch

    const tool = makeConfiguredTool(home)
    const result = await tool.execute("call-1", { prompt: "a hero banner" })
    const text = result.content.map((part) => (part.type === "text" ? part.text : "")).join("")

    expect(text).toContain("Image generation failed across 1 candidate model(s)")
    expect(text).toContain("openai/gpt-image-2: Image generation failed: image model unavailable")
    expect((result.details as { artifactPath?: string }).artifactPath).toBeUndefined()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
