import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, mock, test } from "bun:test"
import { writeProviderApiKey, writeProviderOAuthCredentials } from "@braincode/config"
import type { BraincodeModel } from "../src/index"

const fakePiModels = {
  anthropic: [
    {
      id: "claude-sonnet-4-5-20250929",
      name: "Claude Sonnet 4.5",
      api: "anthropic",
      provider: "anthropic",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 8192,
    },
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      api: "anthropic",
      provider: "anthropic",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 8192,
    },
  ],
  google: [
    {
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview",
      api: "google",
      provider: "google",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1000000,
      maxTokens: 8192,
    },
  ],
  "azure-openai-responses": [
    {
      id: "gpt-5.5",
      name: "GPT 5.5",
      api: "openai-responses",
      provider: "azure-openai-responses",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 256000,
      maxTokens: 8192,
    },
  ],
} as const

let completeSimpleCalls: unknown[][] = []
let completeSimpleResult: unknown = "OK"
let completeSimpleError: unknown
let oauthRefreshCalls = 0
const tempHomes: string[] = []

async function makeTempHome() {
  const home = await mkdtemp(join(tmpdir(), "braincode-llm-test-"))
  tempHomes.push(home)
  return home
}

function assistantMessage(content: unknown, stopReason = "stop", errorMessage?: string): unknown {
  return {
    role: "assistant",
    content,
    api: "openai-responses",
    provider: "proxy",
    model: "model",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
    timestamp: Date.now(),
  }
}

class MockEventStream<TEvent = unknown, TResult = unknown> {
  push(_event: TEvent) {}
  end(_result?: TResult) {}
  error(_error: unknown) {}
  async *[Symbol.asyncIterator](): AsyncGenerator<TEvent, TResult | undefined> {
    return undefined
  }
}

mock.module("@earendil-works/pi-ai", () => ({
  EventStream: MockEventStream,
  getProviders: () => Object.keys(fakePiModels),
  getModels: (provider: keyof typeof fakePiModels) => fakePiModels[provider] ?? [],
  getModel: (provider: keyof typeof fakePiModels, modelId: string) => fakePiModels[provider]?.find((model) => model.id === modelId),
  completeSimple: async (...args: unknown[]) => {
    completeSimpleCalls.push(args)
    if (completeSimpleError) throw completeSimpleError
    return completeSimpleResult
  },
  streamSimple: () => new MockEventStream(),
  parseStreamingJson: () => new MockEventStream(),
  validateToolArguments: (_tool: unknown, toolCall: { arguments?: unknown }) => toolCall.arguments,
}))

mock.module("@earendil-works/pi-ai/oauth", () => ({
  getOAuthProviders: () => [
    { id: "anthropic", name: "Anthropic (Claude Pro/Max)", usesCallbackServer: true },
    { id: "openai-codex", name: "ChatGPT Plus/Pro (Codex Subscription)", usesCallbackServer: true },
    { id: "github-copilot", name: "GitHub Copilot" },
  ],
  getOAuthProvider: (id: string) => {
    if (!["anthropic", "openai-codex", "github-copilot"].includes(id)) return undefined
    return {
      id,
      name: id,
      usesCallbackServer: id !== "github-copilot",
      login: async () => ({ access: "login", refresh: "refresh", expires: Date.now() + 60000 }),
      refreshToken: async (credentials: { refresh: string }) => {
        oauthRefreshCalls += 1
        return { access: "refreshed", refresh: credentials.refresh, expires: Date.now() + 60000 }
      },
      getApiKey: (credentials: { access: string }) => `oauth-${credentials.access}`,
    }
  },
}))

const {
  callPetCompletion,
  generateImage,
  getBraincodeOAuthProvider,
  isImageGenerationModel,
  listBuiltInModelCatalog,
  listBuiltInProviders,
  listOAuthProviderSummaries,
  listOpenAICompatibleModels,
  listProviderModels,
  readProviderRuntimeApiKey,
  resolvePiModel,
  testModelConnection,
  toBraincodeModel,
  toOpenAICompatibleBraincodeModel,
} = await import("../src/index")

const originalFetch = globalThis.fetch

afterEach(async () => {
  globalThis.fetch = originalFetch
  completeSimpleCalls = []
  completeSimpleResult = "OK"
  completeSimpleError = undefined
  oauthRefreshCalls = 0
  await Promise.all(tempHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

test("listBuiltInProviders exposes Pi providers", () => {
  expect(listBuiltInProviders()).toContain("anthropic")
})

test("listBuiltInModelCatalog exposes selectable provider models", () => {
  const catalog = listBuiltInModelCatalog()
  const anthropic = catalog.find((entry) => entry.provider === "anthropic")

  expect(anthropic?.models.some((model) => model.modelId === "claude-sonnet-4-5-20250929")).toBe(true)
})

test("listOAuthProviderSummaries exposes Pi OAuth subscriptions", () => {
  expect(listOAuthProviderSummaries().map((provider) => provider.id)).toEqual(["anthropic", "openai-codex", "github-copilot"])
  expect(getBraincodeOAuthProvider("openai-codex")?.name).toBe("openai-codex")
})

test("readProviderRuntimeApiKey prefers API keys and refreshes expired OAuth credentials", async () => {
  const home = await makeTempHome()

  await writeProviderApiKey("anthropic", "api-key", home)
  await expect(readProviderRuntimeApiKey("anthropic", home)).resolves.toBe("api-key")

  await writeProviderOAuthCredentials("openai-codex", "openai-codex", { access: "old", refresh: "refresh", expires: Date.now() - 1 }, home)
  await expect(readProviderRuntimeApiKey("openai-codex", home)).resolves.toBe("oauth-refreshed")
  expect(oauthRefreshCalls).toBe(1)

  await expect(readProviderRuntimeApiKey("openai-codex", home)).resolves.toBe("oauth-refreshed")
  expect(oauthRefreshCalls).toBe(1)
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
    builtIn: true,
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

  const anthropic = resolvePiModel({
    id: "proxy/claude",
    provider: "proxy",
    modelId: "claude",
    name: "Claude via proxy",
    api: "anthropic",
    baseUrl: "http://localhost:9999",
    contextWindow: 128000,
    supportsTools: true,
  })
  expect(anthropic.piModel.api).toBe("anthropic-messages")

  const kimi = resolvePiModel({
    id: "kimi-coding/kimi-for-coding",
    provider: "kimi-coding",
    modelId: "kimi-for-coding",
    name: "Kimi For Coding",
    api: "anthropic-messages",
    baseUrl: "https://api.kimi.com/coding/v1",
    contextWindow: 262144,
    supportsTools: true,
  })
  expect(kimi.piModel.api).toBe("anthropic-messages")
  expect((kimi.piModel as { baseUrl?: string }).baseUrl).toBe("https://api.kimi.com/coding")
  expect((kimi.piModel as { headers?: Record<string, string> }).headers).toEqual({ "User-Agent": "KimiCLI/1.5" })
})

test("resolvePiModel resolves built-ins and reports missing catalog models", () => {
  const builtIn: BraincodeModel = {
    id: "anthropic/claude-sonnet-4-5-20250929",
    provider: "anthropic",
    modelId: "claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: true,
  }

  expect(resolvePiModel(builtIn).piModel.id).toBe("claude-sonnet-4-5-20250929")
  const builtInWithBaseUrl = resolvePiModel({ ...builtIn, baseUrl: "https://example.test", builtIn: true }).piModel
  expect(builtInWithBaseUrl.id).toBe("claude-sonnet-4-5-20250929")
  expect((builtInWithBaseUrl as { baseUrl?: string }).baseUrl).toBeUndefined()
  expect(() => resolvePiModel({ ...builtIn, modelId: "missing", id: "anthropic/missing" })).toThrow("Unable to resolve model anthropic/missing")
})

test("OpenAI-compatible catalog models default to text-only input", () => {
  const model = toOpenAICompatibleBraincodeModel({
    provider: "proxy",
    baseUrl: "https://proxy.example/v1",
    modelId: "text-model",
  })

  const { piModel } = resolvePiModel(model)

  expect(model.api).toBe("openai-completions")
  expect(piModel.api).toBe("openai-completions")
  expect(model.supportsVision).toBe(false)
  expect(piModel.input).toEqual(["text"])
})

test("built-in connection and pet completion use Pi completions", async () => {
  const model: BraincodeModel = {
    id: "anthropic/claude-sonnet-4-5-20250929",
    provider: "anthropic",
    modelId: "claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: true,
  }

  completeSimpleResult = assistantMessage([{ type: "text", text: "OK" }])
  await expect(testModelConnection(model, "key", "xhigh")).resolves.toMatchObject({ reachable: true })
  expect(completeSimpleCalls).toHaveLength(1)
  expect(((completeSimpleCalls[0]?.[1] as { messages: Array<{ content: unknown }> }).messages[0]?.content)).toBeArray()
  expect((completeSimpleCalls[0]?.[2] as { reasoning?: string }).reasoning).toBe("xhigh")

  completeSimpleResult = assistantMessage([{ type: "text", text: " pi pet " }])
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("pi pet")

  completeSimpleResult = " direct pet "
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("direct pet")

  completeSimpleResult = { text: " text pet " }
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("text pet")

  completeSimpleResult = { content: " content pet " }
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("content pet")

  completeSimpleResult = { message: { content: " message pet " } }
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("message pet")

  completeSimpleResult = assistantMessage([], "error", "provider exploded")
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).rejects.toThrow("provider exploded")

  completeSimpleResult = {}
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).rejects.toThrow("empty response")
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

  completeSimpleError = new Error("User location is not supported for the API use.")

  const result = await testModelConnection(model, "test-key", "high")

  expect(result.reachable).toBe(false)
  expect(result.failureKind).toBe("unsupported-location")
  expect(result.detail).toContain("User location is not supported")
  expect(result.message).toContain("request location is not supported")
})

test("listOpenAICompatibleModels normalizes base URL and maps valid model entries", async () => {
  const requests: string[] = []
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
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
  expect(models.map((model) => model.api)).toEqual(["openai-completions", "openai-completions"])
})

test("listProviderModels supports Anthropic-compatible model listing", async () => {
  const requests: Array<{ url: string; headers: Headers }> = []
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) })
    return new Response(JSON.stringify({ data: [{ id: "claude-test", display_name: "Claude Test" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch

  const models = await listProviderModels({
    provider: "anthropic-proxy",
    api: "anthropic",
    baseUrl: "https://anthropic.example/v1",
    apiKey: "key",
  })

  expect(requests[0]?.url).toBe("https://anthropic.example/v1/models")
  expect(requests[0]?.headers.get("x-api-key")).toBe("key")
  expect(requests[0]?.headers.get("anthropic-version")).toBe("2023-06-01")
  expect(models).toEqual([
    {
      id: "anthropic-proxy/claude-test",
      provider: "anthropic-proxy",
      modelId: "claude-test",
      name: "Claude Test",
      api: "anthropic-messages",
      baseUrl: "https://anthropic.example",
      contextWindow: 200000,
      supportsTools: true,
      supportsVision: false,
      defaultThinkingLevel: "medium",
    },
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

  globalThis.fetch = (async () =>
    new Response("not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

  await expect(listOpenAICompatibleModels({ provider: "proxy", baseUrl: "https://proxy.example" })).rejects.toThrow("data array")

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "nope" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

  await expect(listOpenAICompatibleModels({ provider: "proxy", baseUrl: "https://proxy.example" })).rejects.toThrow("HTTP 500")
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

  await expect(testModelConnection(model, undefined)).resolves.toMatchObject({ reachable: false, failureKind: "missing-api-key" })
  completeSimpleResult = "OK"
  await expect(testModelConnection(model, "key", "low")).resolves.toMatchObject({ reachable: true, message: "Model generated a test response successfully (thinking=low)." })

  completeSimpleResult = assistantMessage([{ type: "text", text: "OK" }])
  await expect(testModelConnection(model, "key", "low")).resolves.toMatchObject({ reachable: true })

  completeSimpleResult = ""
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "invalid-response" })

  completeSimpleResult = "OK"
  completeSimpleError = new Error("429 rate limit exceeded")
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "rate-limit" })

  completeSimpleError = new Error("forbidden")
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "auth" })

  completeSimpleError = new Error("fetch failed network timeout")
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "network" })

  completeSimpleError = new Error("strange failure")
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "unknown", message: expect.stringContaining("strange failure") })

  completeSimpleError = new Error("HTTP 502")
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "unknown", detail: expect.stringContaining("HTTP 502") })
})

test("testModelConnection handles OpenAI-compatible vision and Kimi coding behavior", async () => {
  const visionModel: BraincodeModel = {
    id: "proxy/vision",
    provider: "proxy",
    modelId: "vision",
    name: "Vision",
    baseUrl: "https://proxy.example",
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: true,
  }

  completeSimpleError = new Error("image content type unsupported")

  const visionResult = await testModelConnection(visionModel, "key", "medium")
  expect(((completeSimpleCalls[0]?.[1] as { messages: Array<{ content: unknown }> }).messages[0]?.content)).toBeArray()
  expect(visionResult.detail).toContain("vision input rejected")

  const kimiModel: BraincodeModel = {
    ...visionModel,
    id: "kimi-coding/kimi-for-coding",
    provider: "kimi-coding",
    modelId: "kimi-for-coding",
    baseUrl: "https://api.kimi.com/coding/v1",
  }
  completeSimpleError = undefined
  completeSimpleResult = assistantMessage([], "error", "Kimi For Coding is currently only available for Coding Agents such as Kimi CLI, Claude Code, Roo Code, Kilo Code, etc.")

  await expect(testModelConnection(kimiModel, "key", "low")).resolves.toMatchObject({
    reachable: false,
    failureKind: "unsupported-client",
    message: expect.stringContaining("specific coding-agent clients"),
    detail: expect.stringContaining("Kimi For Coding is currently only available"),
  })
  expect((completeSimpleCalls.at(-1)?.[2] as { maxTokens?: number }).maxTokens).toBe(128)
  const testedKimiModel = completeSimpleCalls.at(-1)?.[0] as { baseUrl?: string; headers?: Record<string, string> }
  expect(testedKimiModel.baseUrl).toBe("https://api.kimi.com/coding")
  expect(testedKimiModel.headers).toEqual({ "User-Agent": "KimiCLI/1.5" })
})

test("image generation models use the OpenAI-compatible Images API shape", async () => {
  const model: BraincodeModel = {
    id: "minimax/image-model",
    provider: "minimax",
    modelId: "image-model",
    name: "Minimax Image Model",
    api: "openai-images",
    baseUrl: "https://api.minimax.example",
    contextWindow: 32000,
    supportsTools: false,
    supportsVision: false,
    supportsImageGeneration: true,
  }
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="
  const requests: Array<{ url: string; body: unknown }> = []
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify({ data: [{ b64_json: pngBase64, revised_prompt: "ok" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch

  expect(isImageGenerationModel(model)).toBe(true)
  const generated = await generateImage(model, "key", { prompt: "Generate a role poster." })
  expect(generated).toMatchObject({
    provider: "minimax",
    modelId: "minimax/image-model",
    mimeType: "image/png",
    revisedPrompt: "ok",
  })
  expect(generated.bytes).toBeGreaterThan(0)
  expect(requests[0]).toEqual({
    url: "https://api.minimax.example/v1/images/generations",
    body: { model: "image-model", prompt: "Generate a role poster.", n: 1 },
  })

  await expect(testModelConnection(model, "key")).resolves.toMatchObject({
    reachable: true,
    generatedImage: { mimeType: "image/png" },
  })
  expect(requests[1]?.body).toEqual({
    model: "image-model",
    prompt: "A simple black square centered on a plain white background. No text, no watermark.",
    n: 1,
  })
})

test("image generation accepts URL image responses from compatible providers", async () => {
  const model: BraincodeModel = {
    id: "proxy/image",
    provider: "proxy",
    modelId: "image",
    name: "Proxy Image",
    api: "openai-images",
    baseUrl: "https://proxy.example/v1/",
    contextWindow: 32000,
    supportsTools: false,
  }
  const requests: string[] = []
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith("/images/generations")) {
      return new Response(JSON.stringify({ data: [{ url: "https://cdn.proxy.example/result.jpg" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    })
  }) as unknown as typeof fetch

  const generated = await generateImage(model, "key", { prompt: "poster" })

  expect(requests).toEqual([
    "https://proxy.example/v1/images/generations",
    "https://cdn.proxy.example/result.jpg",
  ])
  expect(generated.mimeType).toBe("image/jpeg")
  expect(generated.base64).toBe("/9j/2Q==")
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

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).rejects.toThrow("empty response")

  globalThis.fetch = (async () =>
    new Response("not json", {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).rejects.toThrow("HTTP 503")
})

test("callPetCompletion links caller abort signals", async () => {
  const model: BraincodeModel = {
    id: "proxy/model",
    provider: "proxy",
    modelId: "model",
    name: "Model",
    baseUrl: "https://proxy.example/v1",
    contextWindow: 128000,
    supportsTools: true,
  }
  const signals: AbortSignal[] = []
  let abortDuringFetch: AbortController | undefined
  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (init?.signal) signals.push(init.signal)
    abortDuringFetch?.abort()
    return new Response(JSON.stringify({ choices: [{ message: { content: "pet ok" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch

  const active = new AbortController()
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user", signal: active.signal })).resolves.toBe("pet ok")
  expect(signals[0]?.aborted).toBe(false)

  const aborted = new AbortController()
  aborted.abort()
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user", signal: aborted.signal })).resolves.toBe("pet ok")
  expect(signals[1]?.aborted).toBe(true)

  abortDuringFetch = new AbortController()
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user", signal: abortDuringFetch.signal })).resolves.toBe("pet ok")
  expect(signals[2]?.aborted).toBe(true)
})
