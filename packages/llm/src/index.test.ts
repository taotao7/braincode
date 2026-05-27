import { afterEach, expect, mock, test } from "bun:test"
import type { BraincodeModel } from "./index"

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

const {
  callPetCompletion,
  listBuiltInModelCatalog,
  listBuiltInProviders,
  listOpenAICompatibleModels,
  resolvePiModel,
  testModelConnection,
  toBraincodeModel,
  toOpenAICompatibleBraincodeModel,
} = await import("./index")

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  completeSimpleCalls = []
  completeSimpleResult = "OK"
  completeSimpleError = undefined
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
  expect(() => resolvePiModel({ ...builtIn, modelId: "missing", id: "anthropic/missing" })).toThrow("Unable to resolve model anthropic/missing")
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

  await expect(testModelConnection(model, "key", "xhigh")).resolves.toMatchObject({ reachable: true })
  expect(completeSimpleCalls).toHaveLength(1)
  expect(((completeSimpleCalls[0]?.[1] as { messages: Array<{ content: unknown }> }).messages[0]?.content)).toBeArray()
  expect((completeSimpleCalls[0]?.[2] as { reasoning?: string }).reasoning).toBe("xhigh")

  completeSimpleResult = " direct pet "
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("direct pet")

  completeSimpleResult = { text: " text pet " }
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("text pet")

  completeSimpleResult = { content: " content pet " }
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("content pet")

  completeSimpleResult = { message: { content: " message pet " } }
  await expect(callPetCompletion({ model, apiKey: "key", systemPrompt: "system", userPrompt: "user" })).resolves.toBe("message pet")

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

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "forbidden" } }), {
      status: 403,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "auth" })

  globalThis.fetch = (async () => {
    throw new Error("fetch failed network timeout")
  }) as unknown as typeof fetch
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "network" })

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "strange failure" } }), {
      status: 418,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
  await expect(testModelConnection(model, "key")).resolves.toMatchObject({ reachable: false, failureKind: "unknown", message: expect.stringContaining("strange failure") })

  globalThis.fetch = (async () =>
    new Response("not json", {
      status: 502,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
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
  const requests: Array<{ body?: string; userAgent?: string }> = []

  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push({ body: String(init?.body), userAgent: new Headers(init?.headers).get("user-agent") ?? undefined })
    return new Response(JSON.stringify({ error: { message: "image content type unsupported" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch

  const visionResult = await testModelConnection(visionModel, "key", "medium")
  expect(requests[0]?.body).toContain("image_url")
  expect(visionResult.detail).toContain("vision input rejected")

  const kimiModel: BraincodeModel = {
    ...visionModel,
    id: "kimi/kimi-for-coding",
    provider: "kimi",
    modelId: "kimi-for-coding",
    baseUrl: "https://api.kimi.com/coding/v1",
  }
  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push({ body: String(init?.body), userAgent: new Headers(init?.headers).get("user-agent") ?? undefined })
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch

  await expect(testModelConnection(kimiModel, "key", "low")).resolves.toMatchObject({ reachable: true })
  expect(requests.at(-1)?.body).toContain('"max_tokens":32')
  expect(requests.at(-1)?.userAgent).toBe("claude-code/0.1.0")
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
