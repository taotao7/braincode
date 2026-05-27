import { expect, test } from "bun:test"
import { listBuiltInModelCatalog, listBuiltInProviders, resolvePiModel, testModelConnection, toBraincodeModel, type BraincodeModel } from "./index"

test("listBuiltInProviders exposes Pi providers", () => {
  expect(listBuiltInProviders()).toContain("anthropic")
})

test("listBuiltInModelCatalog exposes selectable provider models", () => {
  const catalog = listBuiltInModelCatalog()
  const anthropic = catalog.find((entry) => entry.provider === "anthropic")

  expect(anthropic?.models.some((model) => model.modelId === "claude-sonnet-4-5-20250929")).toBe(true)
})

test("toBraincodeModel maps a Pi model into Braincode metadata", () => {
  const model = {
    id: "example-model",
    name: "Example Model",
    api: "example-api",
    provider: "example-provider",
    baseUrl: "https://example.test",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000,
    maxTokens: 100,
  } as never

  expect(toBraincodeModel(model)).toEqual({
    id: "example-provider/example-model",
    provider: "example-provider",
    modelId: "example-model",
    name: "Example Model",
    api: "example-api",
    baseUrl: "https://example.test",
    contextWindow: 1000,
    supportsTools: true,
    supportsVision: false,
    defaultThinkingLevel: "off",
  })
})

test("resolvePiModel maps legacy OpenAI chat completions API id", () => {
  const { piModel } = resolvePiModel({
    id: "proxy/gemini",
    provider: "proxy",
    modelId: "gemini",
    name: "Gemini via proxy",
    api: "openai-chat-completions",
    baseUrl: "http://localhost:9999/v1",
    contextWindow: 128000,
    supportsTools: true,
  })

  expect(piModel.api).toBe("openai-completions")
})

test("testModelConnection returns a diagnostic result for unsupported locations", async () => {
  const originalFetch = globalThis.fetch
  const model: BraincodeModel = {
    id: "clipro/gemini-3.1-pro-low",
    provider: "clipro",
    modelId: "gemini-3.1-pro-low",
    name: "Gemini 3.1 Pro Low",
    baseUrl: "https://example.test/v1",
    contextWindow: 128000,
    supportsTools: true,
  }

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "User location is not supported for the API use." } }), {
      status: 403,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

  try {
    const result = await testModelConnection(model, "test-key", "high")

    expect(result.reachable).toBe(false)
    expect(result.failureKind).toBe("unsupported-location")
    expect(result.detail).toContain("User location is not supported")
    expect(result.message).toContain("request location is not supported")
  } finally {
    globalThis.fetch = originalFetch
  }
})
