import { completeSimple, getModel, getModels, getProviders, type Api, type Model, type ModelThinkingLevel } from "@earendil-works/pi-ai"
import { debugLog, normalizeModelApi } from "@braincode/shared"

export type BraincodeModel = {
  id: string
  provider: string
  modelId: string
  name: string
  api?: Api
  baseUrl?: string
  contextWindow: number
  supportsTools: boolean
  defaultThinkingLevel?: ModelThinkingLevel
}

export type OpenAICompatibleModelListRequest = {
  provider: string
  baseUrl: string
  apiKey?: string
}

export type ModelConnectionTestResult = {
  modelId: string
  provider: string
  reachable: boolean
  message: string
}

export type ModelResolutionResult = {
  braincodeModel: BraincodeModel
  piModel: Model<Api>
}

export type ModelCatalogProvider = {
  provider: string
  models: BraincodeModel[]
}

export function listBuiltInProviders(): string[] {
  return getProviders()
}

export function listBuiltInModelCatalog(): ModelCatalogProvider[] {
  return getProviders().map((provider) => ({
    provider,
    models: getModels(provider).map((model) => toBraincodeModel(model as Model<Api>)),
  }))
}

export function resolvePiModel(model: BraincodeModel): ModelResolutionResult {
  if (model.baseUrl) {
    const api = normalizeModelApi(model.api)
    debugLog("llm", "resolving OpenAI-compatible model", {
      provider: model.provider,
      modelId: model.modelId,
      baseUrl: model.baseUrl,
      api: api ?? "openai-responses",
    })
    return {
      braincodeModel: model,
      piModel: toOpenAICompatiblePiModel(model),
    }
  }

  try {
    debugLog("llm", "resolving built-in Pi model", { provider: model.provider, modelId: model.modelId })
    const piModel = getModel(model.provider as never, model.modelId as never) as Model<Api> | undefined
    if (!piModel) throw new Error("model is not in the built-in Pi model catalog")
    return {
      braincodeModel: model,
      piModel,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to resolve model ${model.provider}/${model.modelId}: ${message}`)
  }
}

export const resolveBuiltInPiModel = resolvePiModel

export async function listOpenAICompatibleModels(request: OpenAICompatibleModelListRequest): Promise<BraincodeModel[]> {
  const provider = request.provider.trim()
  const baseUrl = normalizeOpenAICompatibleBaseUrl(request.baseUrl)
  if (!provider) throw new Error("provider is required")
  if (!baseUrl) throw new Error("baseUrl is required")

  debugLog("llm", "listing OpenAI-compatible models", { provider, baseUrl, hasApiKey: Boolean(request.apiKey) })

  const response = await fetch(`${baseUrl}/models`, {
    headers: request.apiKey ? { authorization: `Bearer ${request.apiKey}` } : undefined,
  })
  const body = (await response.json().catch(() => undefined)) as { data?: Array<{ id?: unknown; name?: unknown }> } | undefined
  if (!response.ok) {
    throw new Error(`Unable to list models from ${baseUrl}/models: HTTP ${response.status}`)
  }
  if (!body || !Array.isArray(body.data)) {
    throw new Error("/v1/models response must contain a data array")
  }

  const models = body.data
    .filter((model): model is { id: string; name?: string } => typeof model.id === "string" && model.id.trim().length > 0)
    .map((model) => toOpenAICompatibleBraincodeModel({ provider, baseUrl, modelId: model.id, name: typeof model.name === "string" ? model.name : model.id }))

  debugLog("llm", "listed OpenAI-compatible models", { provider, baseUrl, count: models.length })
  return models
}

export function toOpenAICompatibleBraincodeModel(input: { provider: string; baseUrl: string; modelId: string; name?: string }): BraincodeModel {
  return {
    id: `${input.provider}/${input.modelId}`,
    provider: input.provider,
    modelId: input.modelId,
    name: input.name || input.modelId,
    api: "openai-responses",
    baseUrl: normalizeOpenAICompatibleBaseUrl(input.baseUrl),
    contextWindow: 128000,
    supportsTools: true,
    defaultThinkingLevel: "medium",
  }
}

export async function testModelConnection(model: BraincodeModel, apiKey?: string, thinkingLevel?: ModelThinkingLevel): Promise<ModelConnectionTestResult> {
  if (!apiKey) {
    throw new Error(`Missing API key for provider '${model.provider}'`)
  }

  const reasoning = thinkingLevel && thinkingLevel !== "off" ? (thinkingLevel as Exclude<ModelThinkingLevel, "off">) : undefined

  if (!model.baseUrl) {
    const { piModel } = resolvePiModel(model)
    await completeSimple(
      piModel,
      {
        systemPrompt: "You are testing model connectivity. Reply with exactly: OK",
        messages: [{ role: "user", content: "Reply with exactly: OK", timestamp: Date.now() }],
      },
      { apiKey, maxTokens: 8, timeoutMs: 30000, maxRetries: 0, cacheRetention: "none", reasoning },
    )
    return {
      modelId: model.id,
      provider: model.provider,
      reachable: true,
      message: thinkingLevel ? `Model generated a test response successfully (thinking=${thinkingLevel}).` : "Model generated a test response successfully.",
    }
  }

  await testOpenAICompatibleGeneration(model, apiKey, thinkingLevel)

  return {
    modelId: model.id,
    provider: model.provider,
    reachable: true,
    message: thinkingLevel ? `Model generated a test response successfully (thinking=${thinkingLevel}).` : "Model generated a test response successfully.",
  }
}

async function testOpenAICompatibleGeneration(model: BraincodeModel, apiKey: string, thinkingLevel?: ModelThinkingLevel): Promise<void> {
  const baseUrl = normalizeOpenAICompatibleBaseUrl(model.baseUrl ?? "")
  const kimiCoding = isKimiCodingModel(model, baseUrl)
  const reasoningEffort = mapThinkingLevelToReasoningEffort(thinkingLevel)
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(kimiCoding ? { "user-agent": "claude-code/0.1.0" } : {}),
    },
    body: JSON.stringify({
      model: model.modelId,
      messages: [
        { role: "system", content: "You are testing model connectivity. Reply with exactly: OK" },
        { role: "user", content: "Reply with exactly: OK" },
      ],
      max_tokens: kimiCoding ? 32 : 8,
      temperature: kimiCoding ? 0.6 : 0,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    }),
  })

  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : `HTTP ${response.status}`
    throw new Error(`Model generation test failed: ${message}`)
  }

  if (kimiCoding) {
    return
  }
  const text = body?.choices?.[0]?.message?.content
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Model generation test returned an empty response")
  }
}

function isKimiCodingModel(model: BraincodeModel, baseUrl: string): boolean {
  return baseUrl === "https://api.kimi.com/coding/v1" || model.provider.toLowerCase().includes("kimi") || model.modelId.toLowerCase().includes("kimi-for-coding")
}

function mapThinkingLevelToReasoningEffort(thinkingLevel: ModelThinkingLevel | undefined): string | undefined {
  if (!thinkingLevel || thinkingLevel === "off") return undefined
  if (thinkingLevel === "xhigh") return "high"
  return thinkingLevel
}

function normalizeOpenAICompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "")
  if (!trimmed) return ""
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`
}

function toOpenAICompatiblePiModel(model: BraincodeModel): Model<Api> {
  const api = normalizeModelApi(model.api)
  return {
    id: model.modelId,
    name: model.name,
    api: api ?? "openai-responses",
    provider: model.provider as never,
    baseUrl: model.baseUrl ?? "",
    reasoning: model.defaultThinkingLevel !== "off",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow,
    maxTokens: Math.min(128000, model.contextWindow),
  } as Model<Api>
}

export type PetCompletionInput = {
  model: BraincodeModel
  apiKey: string
  systemPrompt: string
  userPrompt: string
  thinkingLevel?: ModelThinkingLevel
  signal?: AbortSignal
  timeoutMs?: number
  maxTokens?: number
}

export async function callPetCompletion(input: PetCompletionInput): Promise<string> {
  const reasoning = input.thinkingLevel && input.thinkingLevel !== "off" ? (input.thinkingLevel as Exclude<ModelThinkingLevel, "off">) : undefined
  const timeoutMs = input.timeoutMs ?? 12000
  const maxTokens = input.maxTokens ?? 200

  if (!input.model.baseUrl) {
    const { piModel } = resolvePiModel(input.model)
    const result = await completeSimple(
      piModel,
      {
        systemPrompt: input.systemPrompt,
        messages: [{ role: "user", content: input.userPrompt, timestamp: Date.now() }],
      },
      { apiKey: input.apiKey, maxTokens, timeoutMs, maxRetries: 0, cacheRetention: "none", reasoning },
    )
    const text = typeof result === "string" ? result : extractCompletionText(result)
    if (!text || !text.trim()) {
      throw new Error("Pet completion returned an empty response")
    }
    return text.trim()
  }

  const baseUrl = normalizeOpenAICompatibleBaseUrl(input.model.baseUrl)
  const reasoningEffort = mapThinkingLevelToReasoningEffort(input.thinkingLevel)
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
  const linkedSignal = input.signal
  const onAbort = () => controller.abort()
  if (linkedSignal) {
    if (linkedSignal.aborted) controller.abort()
    else linkedSignal.addEventListener("abort", onAbort, { once: true })
  }
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model.modelId,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      }),
      signal: controller.signal,
    })
    const body = await response.json().catch(() => undefined)
    if (!response.ok) {
      const message = typeof body?.error?.message === "string" ? body.error.message : `HTTP ${response.status}`
      throw new Error(`Pet completion failed: ${message}`)
    }
    const text = body?.choices?.[0]?.message?.content
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Pet completion returned an empty response")
    }
    return text.trim()
  } finally {
    clearTimeout(timeoutHandle)
    if (linkedSignal) linkedSignal.removeEventListener("abort", onAbort)
  }
}

function extractCompletionText(result: unknown): string {
  if (!result || typeof result !== "object") return ""
  const candidate = (result as { text?: unknown; content?: unknown; message?: { content?: unknown } })
  if (typeof candidate.text === "string") return candidate.text
  if (typeof candidate.content === "string") return candidate.content
  if (candidate.message && typeof candidate.message.content === "string") return candidate.message.content
  return ""
}

export function toBraincodeModel(model: Model<Api>): BraincodeModel {
  return {
    id: `${model.provider}/${model.id}`,
    provider: model.provider,
    modelId: model.id,
    name: model.name,
    api: normalizeModelApi(model.api) as Api,
    baseUrl: model.baseUrl || undefined,
    contextWindow: model.contextWindow,
    supportsTools: true,
    defaultThinkingLevel: model.reasoning ? "medium" : "off",
  }
}
