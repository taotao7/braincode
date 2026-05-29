import type { AgentMessage } from "@earendil-works/pi-agent-core"

const PROVIDER_MESSAGE_SIZE_LIMIT_BYTES = 2 * 1024 * 1024
const PROVIDER_MESSAGE_SIZE_GUARD_BYTES = Math.floor(PROVIDER_MESSAGE_SIZE_LIMIT_BYTES * 0.88)
const AUTO_HANDOFF_SUMMARY_CHARS = 24 * 1024
const AUTO_HANDOFF_MESSAGE_CHARS = 1600

export class ContextHandoffRequiredError extends Error {
  readonly estimatedBytes: number
  readonly limitBytes: number
  readonly sessionId?: string
  readonly handoffSummary?: string

  constructor(input: { estimatedBytes: number; limitBytes: number; sessionId?: string; handoffSummary?: string }) {
    super(`Braincode handoff required: active message context is ${input.estimatedBytes} bytes, exceeding the ${input.limitBytes} byte safety budget.`)
    this.name = "ContextHandoffRequiredError"
    this.estimatedBytes = input.estimatedBytes
    this.limitBytes = input.limitBytes
    this.sessionId = input.sessionId
    this.handoffSummary = input.handoffSummary
  }
}

export function isHandoffRequiredError(error: unknown): boolean {
  if (error instanceof ContextHandoffRequiredError) return true
  const message = error instanceof Error ? error.message : String(error)
  return /Braincode handoff required|Context handoff required/i.test(message)
}

export function isProviderMessageSizeLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /total message size\s+\d+\s+exceeds limit\s+\d+/i.test(message)
    || /message payload is too large/i.test(message)
}

export function enforceHandoffContextBudget(
  messages: AgentMessage[],
  options: { systemPrompt: string; sessionId?: string },
): AgentMessage[] {
  const estimatedBytes = estimateProviderContextBytes(messages, options.systemPrompt)
  if (estimatedBytes <= PROVIDER_MESSAGE_SIZE_GUARD_BYTES) return messages
  const handoffSummary = buildAutomaticHandoffSummary(messages, {
    estimatedBytes,
    limitBytes: PROVIDER_MESSAGE_SIZE_GUARD_BYTES,
    sessionId: options.sessionId,
  })
  throw new ContextHandoffRequiredError({
    estimatedBytes,
    limitBytes: PROVIDER_MESSAGE_SIZE_GUARD_BYTES,
    sessionId: options.sessionId,
    handoffSummary,
  })
}

export function estimateProviderContextBytes(messages: AgentMessage[], systemPrompt: string): number {
  return utf8ByteLength(safeStringify({ systemPrompt, messages: sanitizeMessagesForContextBudget(messages) }))
}

function sanitizeMessagesForContextBudget(messages: AgentMessage[]): unknown[] {
  return messages.map((message) => sanitizeContextBudgetValue(message))
}

function sanitizeContextBudgetValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeContextBudgetValue(item))
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  if (isImageLikeContextBlock(record)) {
    const sanitized: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(record)) {
      if (key === "data" && typeof entry === "string") {
        sanitized[key] = `[image data omitted from context budget: ${entry.length} chars]`
      } else if (key === "image_url") {
        sanitized[key] = summarizeImageUrlForContextBudget(entry)
      } else if (key === "url" && typeof entry === "string" && entry.startsWith("data:image/")) {
        sanitized[key] = `[image data URL omitted from context budget: ${entry.length} chars]`
      } else {
        sanitized[key] = sanitizeContextBudgetValue(entry)
      }
    }
    return sanitized
  }
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, sanitizeContextBudgetValue(entry)]))
}

function isImageLikeContextBlock(record: Record<string, unknown>): boolean {
  const type = typeof record.type === "string" ? record.type.toLowerCase() : ""
  if (type === "image" || type === "input_image" || type === "image_url") return true
  return typeof record.data === "string" && typeof record.mimeType === "string" && record.mimeType.startsWith("image/")
}

function summarizeImageUrlForContextBudget(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:image/")
      ? `[image data URL omitted from context budget: ${value.length} chars]`
      : value
  }
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
    if (key === "url" && typeof entry === "string" && entry.startsWith("data:image/")) {
      return [key, `[image data URL omitted from context budget: ${entry.length} chars]`]
    }
    return [key, sanitizeContextBudgetValue(entry)]
  }))
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "unknown size"
  if (bytes >= 1024 * 1024) return `${trimTrailingZero((bytes / 1024 / 1024).toFixed(1))} MB`
  if (bytes >= 1024) return `${trimTrailingZero((bytes / 1024).toFixed(1))} KB`
  return `${Math.max(0, Math.round(bytes))} bytes`
}

function trimTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value
}

function buildAutomaticHandoffSummary(
  messages: AgentMessage[],
  input: { estimatedBytes: number; limitBytes: number; sessionId?: string },
): string {
  const lines = [
    "Auto handoff generated by Braincode because the active agent context reached the provider message-size boundary.",
    input.sessionId ? `Session: ${input.sessionId}` : "",
    `Estimated active context: ${formatBytes(input.estimatedBytes)}; safety budget: ${formatBytes(input.limitBytes)}.`,
    "Continue from this packet instead of copying the full transcript or raw tool output forward.",
    "",
    "Recent visible context:",
  ].filter(Boolean)
  const selected = selectMessagesForAutomaticHandoff(messages)
  for (const message of selected) {
    const entry = formatMessageForAutomaticHandoff(message)
    if (!entry) continue
    const next = [...lines, entry].join("\n")
    if (next.length > AUTO_HANDOFF_SUMMARY_CHARS) {
      lines.push(`- Additional context omitted from this automatic handoff after ${selected.length} selected messages.`)
      break
    }
    lines.push(entry)
  }
  return clipTextForHandoff(lines.join("\n"), AUTO_HANDOFF_SUMMARY_CHARS)
}

function selectMessagesForAutomaticHandoff(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= 40) return messages
  const firstUser = messages.find((message) => message.role === "user")
  const recent = messages.slice(-39)
  return firstUser && !recent.includes(firstUser) ? [firstUser, ...recent] : recent
}

function formatMessageForAutomaticHandoff(message: AgentMessage): string | undefined {
  if (message.role === "user") {
    return `- user: ${clipTextForHandoff(messageContentText(message.content), AUTO_HANDOFF_MESSAGE_CHARS)}`
  }
  if (message.role === "assistant") {
    const text = assistantTextForHandoff(message)
    const toolCalls = assistantToolCallsForHandoff(message)
    const parts = [
      text ? `text: ${clipTextForHandoff(text, AUTO_HANDOFF_MESSAGE_CHARS)}` : "",
      toolCalls.length > 0 ? `tool calls: ${toolCalls.join("; ")}` : "",
      message.errorMessage ? `error: ${clipTextForHandoff(message.errorMessage, 800)}` : "",
      message.stopReason ? `stop: ${message.stopReason}` : "",
    ].filter(Boolean)
    return parts.length > 0 ? `- assistant: ${parts.join(" | ")}` : undefined
  }
  if (message.role === "toolResult") {
    return `- tool result ${message.toolName}: ${clipTextForHandoff(messageContentText(message.content), AUTO_HANDOFF_MESSAGE_CHARS)}`
  }
  return undefined
}

function assistantTextForHandoff(message: Extract<AgentMessage, { role: "assistant" }>): string {
  return message.content
    .map((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "text" && typeof (block as { text?: unknown }).text === "string" ? (block as { text: string }).text : "")
    .filter(Boolean)
    .join("\n")
    .trim()
}

function assistantToolCallsForHandoff(message: Extract<AgentMessage, { role: "assistant" }>): string[] {
  return message.content
    .filter((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "toolCall")
    .map((block) => {
      const record = block as unknown as Record<string, unknown>
      const name = typeof record.name === "string" ? record.name : "tool"
      const args = "arguments" in record ? ` ${clipTextForHandoff(safeStringify(record.arguments), 600)}` : ""
      return `${name}${args}`
    })
}

function messageContentText(content: unknown): string {
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return safeStringify(content)
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return ""
      const record = block as Record<string, unknown>
      if (typeof record.text === "string") return record.text
      if (record.type === "image") return "[image input]"
      return ""
    })
    .filter(Boolean)
    .join("\n")
    .trim()
}

function clipTextForHandoff(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 32))}\n...[truncated ${text.length - limit} chars]`
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return String(value)
  }
}
