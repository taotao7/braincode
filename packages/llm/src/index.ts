import { completeSimple, getModel, getModels, getProviders, type Api, type Model, type ModelThinkingLevel } from "@earendil-works/pi-ai"
import { getOAuthProvider, getOAuthProviders, type OAuthCredentials, type OAuthProviderInterface } from "@earendil-works/pi-ai/oauth"
import { getProviderApiKey, getProviderOAuthCredentials, readAuth, writeProviderOAuthCredentials, type BraincodeOAuthCredentials } from "@braincode/config"
import { debugLog, normalizeModelApi } from "@braincode/shared"

export type BraincodeModel = {
  id: string
  provider: string
  modelId: string
  name: string
  api?: Api | "openai-images"
  baseUrl?: string
  headers?: Record<string, string>
  builtIn?: boolean
  contextWindow: number
  supportsTools: boolean
  supportsVision?: boolean
  supportsImageGeneration?: boolean
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
  failureKind?: ModelConnectionFailureKind
  detail?: string
  generatedImage?: {
    bytes: number
    mimeType: string
  }
}

export type ModelConnectionFailureKind = "missing-api-key" | "unsupported-location" | "unsupported-client" | "auth" | "rate-limit" | "invalid-response" | "network" | "unknown"

export type ModelResolutionResult = {
  braincodeModel: BraincodeModel
  piModel: Model<Api>
}

export type ModelCatalogProvider = {
  provider: string
  models: BraincodeModel[]
}

export type OAuthProviderSummary = {
  id: string
  name: string
  usesCallbackServer: boolean
}

export type ImageGenerationOptions = {
  prompt?: string
  size?: string
  quality?: "low" | "medium" | "high" | "auto"
  outputFormat?: "png" | "jpeg" | "webp"
  timeoutMs?: number
  signal?: AbortSignal
}

export type ImageGenerationResult = {
  modelId: string
  provider: string
  base64: string
  bytes: number
  mimeType: string
  url?: string
  revisedPrompt?: string
}

export function isImageGenerationModel(model: BraincodeModel): boolean {
  return model.supportsImageGeneration === true || model.api === "openai-images"
}

export function listBuiltInProviders(): string[] {
  return getProviders()
}

export function listOAuthProviderSummaries(): OAuthProviderSummary[] {
  return getOAuthProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
    usesCallbackServer: provider.usesCallbackServer === true,
  }))
}

export function getBraincodeOAuthProvider(providerId: string): OAuthProviderInterface | undefined {
  return getOAuthProvider(providerId)
}

export async function readProviderRuntimeApiKey(provider: string, home?: string): Promise<string | undefined> {
  const auth = await readAuth(home)
  const apiKey = getProviderApiKey(auth, provider)
  if (apiKey) return apiKey

  const oauth = getProviderOAuthCredentials(auth, provider)
  if (!oauth) return undefined

  const oauthProvider = getOAuthProvider(oauth.providerId)
  if (!oauthProvider) {
    throw new Error(`Unknown OAuth provider: ${oauth.providerId}`)
  }

  let credentials = oauth.credentials as OAuthCredentials
  if (Date.now() >= credentials.expires) {
    credentials = await oauthProvider.refreshToken(credentials)
    await writeProviderOAuthCredentials(provider, oauth.providerId, toBraincodeOAuthCredentials(credentials), home)
  }

  return oauthProvider.getApiKey(credentials)
}

export function listBuiltInModelCatalog(): ModelCatalogProvider[] {
  return getProviders().map((provider) => ({
    provider,
    models: getModels(provider).map((model) => toBraincodeModel(model as Model<Api>)),
  }))
}

export function resolvePiModel(model: BraincodeModel): ModelResolutionResult {
  if (model.baseUrl && model.builtIn !== true) {
    const piModel = toOpenAICompatiblePiModel(model)
    debugLog("llm", "resolving custom model", {
      provider: model.provider,
      modelId: model.modelId,
      baseUrl: piModel.baseUrl,
      configuredBaseUrl: model.baseUrl,
      api: piModel.api,
    })
    return {
      braincodeModel: model,
      piModel,
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
    headers: {
      "user-agent": "BrainCode",
      ...(request.apiKey ? { authorization: `Bearer ${request.apiKey}` } : {}),
    },
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
    api: "openai-completions",
    baseUrl: normalizeOpenAICompatibleBaseUrl(input.baseUrl),
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: false,
    defaultThinkingLevel: "medium",
  }
}

export async function testModelConnection(model: BraincodeModel, apiKey?: string, thinkingLevel?: ModelThinkingLevel): Promise<ModelConnectionTestResult> {
  if (!apiKey) {
    return connectionFailure(model, `Missing API key for provider '${model.provider}'`)
  }

  if (isImageGenerationModel(model)) {
    return testImageGenerationConnection(model, apiKey)
  }

  const reasoning = thinkingLevel && thinkingLevel !== "off" ? (thinkingLevel as Exclude<ModelThinkingLevel, "off">) : undefined
  const maxTokens = reasoning ? 128 : 16

  try {
    const { piModel } = resolvePiModel(model)
    const includeImage = model.supportsVision !== false && piModel.input?.includes("image")
    const userContent = includeImage
      ? [
          { type: "text" as const, text: "Reply with exactly: OK" },
          { type: "image" as const, data: TEST_IMAGE_PNG_BASE64, mimeType: "image/png" },
        ]
      : "Reply with exactly: OK"
    const result = await completeSimple(
      piModel,
      {
        systemPrompt: "You are testing model connectivity. Reply with exactly: OK",
        messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
      },
      { apiKey, maxTokens, timeoutMs: 30000, maxRetries: 0, cacheRetention: "none", reasoning },
    )
    debugLog("llm", "connection test completion", summarizeCompletionResult(result))
    const completionError = extractCompletionError(result)
    if (completionError) {
      throw new Error(completionError)
    }
    const text = typeof result === "string" ? result : extractCompletionText(result)
    if (!text.trim()) {
      throw new Error("Model generation test returned an empty response: provider returned no visible text content. Check the model API type; for custom proxies use openai for /v1/chat/completions-compatible endpoints or anthropic for Anthropic Messages-compatible endpoints, and for reasoning models try a lower/off thinking level.")
    }
    return connectionSuccess(model, thinkingLevel)
  } catch (error) {
    return connectionFailure(model, error)
  }
}

function connectionSuccess(model: BraincodeModel, thinkingLevel?: ModelThinkingLevel): ModelConnectionTestResult {
  return {
    modelId: model.id,
    provider: model.provider,
    reachable: true,
    message: thinkingLevel ? `Model generated a test response successfully (thinking=${thinkingLevel}).` : "Model generated a test response successfully.",
  }
}

function imageConnectionSuccess(model: BraincodeModel, result: ImageGenerationResult): ModelConnectionTestResult {
  return {
    modelId: model.id,
    provider: model.provider,
    reachable: true,
    message: `Image generated successfully (${formatBytes(result.bytes)} ${result.mimeType}).`,
    generatedImage: {
      bytes: result.bytes,
      mimeType: result.mimeType,
    },
  }
}

async function testImageGenerationConnection(model: BraincodeModel, apiKey: string): Promise<ModelConnectionTestResult> {
  try {
    const result = await generateImage(model, apiKey, {
      prompt: "A simple black square centered on a plain white background. No text, no watermark.",
      timeoutMs: 120000,
    })
    return imageConnectionSuccess(model, result)
  } catch (error) {
    return connectionFailure(model, error)
  }
}

export async function generateImage(model: BraincodeModel, apiKey: string, options: ImageGenerationOptions = {}): Promise<ImageGenerationResult> {
  if (!apiKey) throw new Error(`Missing API key for provider '${model.provider}'`)
  if (!isImageGenerationModel(model)) throw new Error(`Model ${model.id} is not configured for image generation`)

  const baseUrl = normalizeImageGenerationBaseUrl(model.baseUrl)
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000)
  const linkedSignal = options.signal
  const onAbort = () => controller.abort()
  if (linkedSignal) {
    if (linkedSignal.aborted) controller.abort()
    else linkedSignal.addEventListener("abort", onAbort, { once: true })
  }
  const prompt = options.prompt?.trim() || "A simple abstract technical poster image. No text, no watermark."
  const requestBody: Record<string, unknown> = {
    model: model.modelId,
    prompt,
    n: 1,
  }
  if (options.size) requestBody.size = options.size
  if (options.quality) requestBody.quality = options.quality
  if (options.outputFormat) requestBody.output_format = options.outputFormat
  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "user-agent": "BrainCode",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    const body = await response.json().catch(() => undefined) as {
      data?: Array<{ b64_json?: unknown; url?: unknown; revised_prompt?: unknown }>
      error?: { message?: unknown }
    } | undefined
    if (!response.ok) {
      const message = typeof body?.error?.message === "string" ? body.error.message : `HTTP ${response.status}`
      throw new Error(`Image generation failed: ${message}`)
    }
    const first = body?.data?.[0]
    const sourceUrl = typeof first?.url === "string" ? first.url : undefined
    const base64 = typeof first?.b64_json === "string" && first.b64_json.trim()
      ? first.b64_json
      : sourceUrl
        ? await fetchImageUrlAsBase64(sourceUrl, controller.signal)
        : ""
    if (!base64.trim()) {
      throw new Error("Image generation returned no base64 image data or fetchable image URL")
    }
    const bytes = Buffer.from(base64, "base64").byteLength
    if (bytes <= 0) {
      throw new Error("Image generation returned invalid base64 image data")
    }
    return {
      modelId: model.id,
      provider: model.provider,
      base64,
      bytes,
      mimeType: inferImageMimeType(base64, sourceUrl, options.outputFormat),
      url: sourceUrl,
      revisedPrompt: typeof first?.revised_prompt === "string" ? first.revised_prompt : undefined,
    }
  } finally {
    clearTimeout(timeoutHandle)
    linkedSignal?.removeEventListener("abort", onAbort)
  }
}

async function fetchImageUrlAsBase64(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Image generation returned a URL, but image download failed: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  return bytes.toString("base64")
}

function inferImageMimeType(base64: string, url: string | undefined, outputFormat: ImageGenerationOptions["outputFormat"] | undefined): string {
  if (outputFormat) return `image/${outputFormat === "jpeg" ? "jpeg" : outputFormat}`
  if (base64.startsWith("/9j/")) return "image/jpeg"
  if (base64.startsWith("UklGR")) return "image/webp"
  const extension = url?.split("?")[0]?.split(".").pop()?.toLowerCase()
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
  if (extension === "webp") return "image/webp"
  return "image/png"
}

function connectionFailure(model: BraincodeModel, error: unknown): ModelConnectionTestResult {
  const rawDetail = error instanceof Error ? error.message : String(error)
  const detail = model.supportsVision === true && /image|vision|multimodal|content type/i.test(rawDetail)
    ? `${rawDetail} (vision input rejected — uncheck Vision in the model form if this model is text-only)`
    : rawDetail
  const failureKind = classifyConnectionFailure(detail)
  return {
    modelId: model.id,
    provider: model.provider,
    reachable: false,
    failureKind,
    detail,
    message: explainConnectionFailure(failureKind, detail),
  }
}

function classifyConnectionFailure(message: string): ModelConnectionFailureKind {
  if (/missing api key/i.test(message)) return "missing-api-key"
  if (/user location is not supported|location.*not supported|unsupported.*region|region.*unsupported/i.test(message)) return "unsupported-location"
  if (/Kimi For Coding is currently only available for Coding Agents/i.test(message)) return "unsupported-client"
  if (/\b(401|403)\b|unauthorized|forbidden|invalid api key|incorrect api key|permission denied/i.test(message)) return "auth"
  if (/\b429\b|rate limit|quota exceeded|too many requests/i.test(message)) return "rate-limit"
  if (/empty response|invalid response|response must contain/i.test(message)) return "invalid-response"
  if (/fetch failed|network|timeout|timed out|econnrefused|enotfound|econnreset/i.test(message)) return "network"
  return "unknown"
}

function explainConnectionFailure(kind: ModelConnectionFailureKind, detail: string): string {
  if (kind === "missing-api-key") return detail
  if (kind === "unsupported-location") {
    return "The provider rejected this request because the API account or request location is not supported. Use a provider or base URL available in your region, or route this provider through a supported OpenAI-compatible proxy."
  }
  if (kind === "unsupported-client") {
    return "The provider rejected this request because this model endpoint only accepts specific coding-agent clients. Choose another model/provider for Braincode, or remove this model from Brain role fallbacks."
  }
  if (kind === "auth") return "The provider rejected the request. Check the API key, provider account permissions, and model access."
  if (kind === "rate-limit") return "The provider rejected the request due to rate limit or quota. Try again later or use a different key/model."
  if (kind === "invalid-response") return "The provider responded, but the test response was empty or malformed."
  if (kind === "network") return "The provider could not be reached. Check the base URL, network, and local proxy settings."
  return detail
}

const TEST_IMAGE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="

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

function normalizeImageGenerationBaseUrl(baseUrl: string | undefined): string {
  const trimmed = (baseUrl ?? "https://api.openai.com/v1").trim().replace(/\/+$/, "")
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

const OPENAI_COMPATIBLE_APIS = new Set<string>(["openai-responses", "openai-completions", "openai-codex-responses", "azure-openai-responses"])

function normalizeBaseUrlForApi(baseUrl: string | undefined, api: string): string | undefined {
  const trimmed = (baseUrl ?? "").trim().replace(/\/+$/, "")
  if (!trimmed) return undefined
  if (api === "anthropic-messages") return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed
  if (api === "google-generative-ai") return trimmed
  if (OPENAI_COMPATIBLE_APIS.has(api)) return normalizeOpenAICompatibleBaseUrl(trimmed)
  return trimmed
}

function providerStaticHeaders(provider: string): Record<string, string> | undefined {
  if (provider === "kimi-coding") return { "User-Agent": "KimiCLI/1.5" }
  return undefined
}

function defaultApiForProvider(provider: string): Api {
  if (provider === "kimi-coding") return "anthropic-messages"
  return "openai-completions"
}

function mergeModelHeaders(...headers: Array<Record<string, string> | undefined>): Record<string, string> | undefined {
  const merged = Object.assign({}, ...headers.filter(Boolean))
  return Object.keys(merged).length > 0 ? merged : undefined
}

function toOpenAICompatiblePiModel(model: BraincodeModel): Model<Api> {
  if (isImageGenerationModel(model)) {
    throw new Error(`Model ${model.id} uses the Image API and cannot be resolved as a text agent model`)
  }
  const api = (normalizeModelApi(model.api) ?? defaultApiForProvider(model.provider)) as Api
  const input: ("text" | "image")[] = model.supportsVision === true ? ["text", "image"] : ["text"]
  const headers = mergeModelHeaders(providerStaticHeaders(model.provider), model.headers)
  return {
    id: model.modelId,
    name: model.name,
    api,
    provider: model.provider as never,
    baseUrl: normalizeBaseUrlForApi(model.baseUrl, api) ?? "",
    ...(headers ? { headers } : {}),
    reasoning: model.defaultThinkingLevel !== "off",
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow,
    maxTokens: Math.min(128000, model.contextWindow),
  } as Model<Api>
}

function toBraincodeOAuthCredentials(credentials: OAuthCredentials): BraincodeOAuthCredentials {
  return {
    ...credentials,
    refresh: credentials.refresh,
    access: credentials.access,
    expires: credentials.expires,
  }
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
    debugLog("llm", "pet completion", summarizeCompletionResult(result))
    const completionError = extractCompletionError(result)
    if (completionError) {
      throw new Error(completionError)
    }
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
        "user-agent": "BrainCode",
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
  if (typeof result === "string") return result
  if (!result || typeof result !== "object") return ""
  const candidate = (result as { text?: unknown; content?: unknown; message?: { content?: unknown } })
  if (typeof candidate.text === "string") return candidate.text
  if (typeof candidate.content === "string") return candidate.content
  if (Array.isArray(candidate.content)) {
    return candidate.content
      .map((block) => {
        if (typeof block === "string") return block
        if (!block || typeof block !== "object") return ""
        const record = block as { type?: unknown; text?: unknown; content?: unknown }
        if ((record.type === "text" || record.type === "output_text" || record.type === undefined) && typeof record.text === "string") {
          return record.text
        }
        if (typeof record.content === "string") return record.content
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  if (candidate.message && typeof candidate.message.content === "string") return candidate.message.content
  if (candidate.message && Array.isArray(candidate.message.content)) return extractCompletionText({ content: candidate.message.content })
  return ""
}

function extractCompletionError(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined
  const candidate = result as { stopReason?: unknown; errorMessage?: unknown }
  if (typeof candidate.errorMessage === "string" && candidate.errorMessage.trim()) return candidate.errorMessage
  if (candidate.stopReason === "error") return "Provider returned an error without a message"
  if (candidate.stopReason === "aborted") return "Provider request was aborted"
  return undefined
}

function summarizeCompletionResult(result: unknown): Record<string, unknown> {
  if (typeof result === "string") return { kind: "string", textLength: result.length }
  if (!result || typeof result !== "object") return { kind: typeof result }
  const record = result as Record<string, unknown>
  const content = Array.isArray(record.content) ? record.content : undefined
  return {
    kind: "object",
    role: record.role,
    api: record.api,
    provider: record.provider,
    model: record.model,
    stopReason: record.stopReason,
    errorMessage: record.errorMessage,
    content: content
      ? {
          count: content.length,
          types: content.map((block) => (block && typeof block === "object" ? (block as { type?: unknown }).type ?? "object" : typeof block)),
          textLength: content.reduce((total, block) => {
            if (!block || typeof block !== "object") return total
            const text = (block as { text?: unknown }).text
            return total + (typeof text === "string" ? text.length : 0)
          }, 0),
        }
      : typeof record.content,
  }
}

export function toBraincodeModel(model: Model<Api>): BraincodeModel {
  const headers = (model as Model<Api> & { headers?: Record<string, string> }).headers
  return {
    id: `${model.provider}/${model.id}`,
    provider: model.provider,
    modelId: model.id,
    name: model.name,
    api: normalizeModelApi(model.api) as Api,
    baseUrl: model.baseUrl || undefined,
    ...(headers ? { headers } : {}),
    builtIn: true,
    contextWindow: model.contextWindow,
    supportsTools: true,
    supportsVision: model.input?.includes("image") ?? false,
    defaultThinkingLevel: model.reasoning ? "medium" : "off",
  }
}
