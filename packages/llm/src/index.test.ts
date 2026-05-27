import { afterEach, expect, test } from "bun:test"
import { callPetCompletion, listBuiltInModelCatalog, listBuiltInProviders, listOpenAICompatibleModels, resolvePiModel, testModelConnection, toBraincodeModel, toOpenAICompatibleBraincodeModel, type BraincodeModel } from "./index"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

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
  expect(piModel.input).toEqual(["text"])
})

test("OpenAI-compatible catalog models default to text-only input", () => {
  const model = toOpenAICompatibleBraincodeModel({
    provider: "proxy",
    baseUrl: "https://proxy.example/v1",
    modelId: "text-model",
  })

  const { piModel } = resolvePiModel(model)

  expect(model.supportsVision).toBe(false)
  expect(piModel.input).toEqual(["text"])
})

test("testModelConnection returns a diagnostic result for unsupported locations", async () => {
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

  const result = await testModelConnection(model, "test-key", "high")

  expect(result.reachable).toBe(false)
  expect(result.failureKind).toBe("unsupported-location")
  expect(result.detail).toContain("User location is not supported")
  expect(result.message).toContain("request location is not supported")
})

test("listOpenAICompatibleModels normalizes base URL and maps valid model entries", async () => {
  const requests: string[] = []
  globalThis.fetch = (async (input) => {
    requests.push(String(input))
    return new Response(JSON.stringify({ data: [{ id: "alpha", name: "Alpha" }, { id: "" }, { id: "beta" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch

  const models = await listOpenAICompatibleModels({
    provider: "proxy",
    baseUrl: "https://proxy.example/",
    apiKey: "key",
  })

  expect(requests[0]).toBe("https://proxy.example/v1/models")
  expect(models.map((model) => [model.id, model.name, model.baseUrl])).toEqual([
    ["proxy/alpha", "Alpha", "https://proxy.example/v1"],
    ["proxy/beta", "beta", "https://proxy.example/v1"],
  ])
})

test("listOpenAICompatibleModels rejects invalid inputs and malformed responses", async () => {
  await expect(listOpenAICompatibleModels({ provider: "", baseUrl: "https://proxy.example" })).rejects.toThrow("provider is required")
  await expect(listOpenAICompatibleModels({ provider: "proxy", baseUrl: " " })).rejects.toThrow("baseUrl is required")

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ object: "list" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

  await expect(listOpenAICompatibleModels({ provider: "proxy", baseUrl: "https://proxy.example" })).rejects.toThrow("data array")
})

test("testModelConnection reports OpenAI-compatible success and failed response classes", async () => {
  const model: BraincodeModel = {
    id: "proxy/model",
    provider: "proxy",
    modelId: "model",
    name: "Model",
    baseUrl: "https://proxy.example",
    contextWindow: 128000,
    supportsTools: true,
  }

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
  await expect(testModelConnection(model, undefined)).resolves.toMatchObject({ reachable: false, failureKind: "missing-api-key" })
  await expect(testModelConnection(model, "key", "low")).resolves.toMatchObject({ reachable: true, message: "Model generated a test response successfully (thinking=low)." })

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "invalid-response" })

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "429 rate limit exceeded" } }), {
      status: 429,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "rate-limit" })
})

test("callPetCompletion handles OpenAI-compatible success and errors", async () => {
  const model: BraincodeModel = {
    id: "proxy/model",
    provider: "proxy",
    modelId: "model",
    name: "Model",
    baseUrl: "https://proxy.example/v1",
    contextWindow: 128000,
    supportsTools: true,
  }

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: " pet ok " } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

  await expect(callPetCompletion({
    model,
    apiKey: "key",
    systemPrompt: "system",
    userPrompt: "user",
    thinkingLevel: "xhigh",
    timeoutMs: 1000,
  })).resolves.toBe("pet ok")

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "bad key" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).rejects.toThrow("bad key")
})
