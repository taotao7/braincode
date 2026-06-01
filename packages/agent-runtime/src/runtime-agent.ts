import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core"
import type { AgentRole, BraincodeMode, ModelPolicy } from "@braincode/brain"
import { appendSessionRecord, appendTokenUsageRecord, normalizeTokenUsage, type TokenUsagePhase } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { resolveBuiltInPiModel } from "@braincode/llm"
import { debugLog, isDebugEnabled } from "@braincode/shared"
import {
  evaluateToolPermissionPolicy,
  formatPermissionPolicyDenial,
  summarizePermissionPolicyEvaluation,
  type PermissionPolicyDocument,
  type PermissionPolicyEvaluation,
} from "@braincode/tools"
import { ContextHandoffRequiredError, enforceHandoffContextBudget, isHandoffRequiredError } from "./context-budget"
import { createRuntimeCompactor, type RuntimeCompactionPolicy } from "./compaction"
import { wrapToolsWithEvidenceCache, type ToolEvidenceCache } from "./evidence-cache"
import type { RuntimeModelSelection } from "./model-selection"
import { recordToolApprovalDecision, recordToolExecutionEvent, summarizeJson, type ToolApprovalAuditApprover, type ToolAuditScope } from "./tool-audit"

export type ToolApprovalRequest = {
  toolCallId: string
  toolName: string
  args: unknown
  permissionPolicy?: ReturnType<typeof summarizePermissionPolicyEvaluation>
}

export type ToolApprovalDecision = {
  approved: boolean
  reason?: string
  approver?: ToolApprovalAuditApprover
}

export type BraincodeAgentRuntimeOptions = {
  mode: BraincodeMode
  systemPrompt: string
  model: BraincodeModel
  policy: ModelPolicy
  sessionId?: string
  tools?: AgentTool[]
  toolEvidenceCache?: ToolEvidenceCache
  permissionPolicy?: PermissionPolicyDocument
  onPermissionPolicyEvaluation?: (evaluation: PermissionPolicyEvaluation) => void | Promise<void>
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined
  onEvent?: (event: AgentEvent) => void | Promise<void>
  onToolApproval?: (request: ToolApprovalRequest, signal?: AbortSignal) => ToolApprovalDecision | Promise<ToolApprovalDecision>
  audit?: ToolAuditScope
  usage?: TokenUsageScope
  // Soft, non-destructive context compaction applied before the byte-size
  // handoff guard. When omitted, only the hard guard runs (legacy behavior).
  compaction?: RuntimeCompactionPolicy
}

export type TokenUsageScope = {
  sessionId: string
  home?: string
  role: AgentRole
  phase: TokenUsagePhase
  agentSessionId?: string
  taskId?: string
  parentId?: string
  attempt?: number
  brainId?: string
}

export type BraincodeAgentRuntime = {
  agent: Agent
  selection: RuntimeModelSelection
}

export function createRunAbortedError(): Error {
  const error = new Error("Braincode run interrupted by user.")
  error.name = "AbortError"
  return error
}

export function throwIfRunAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createRunAbortedError()
}

export function linkRuntimeAbort(runtime: BraincodeAgentRuntime, signal?: AbortSignal): () => void {
  if (!signal) return () => {}
  const abort = () => runtime.agent.abort()
  if (signal.aborted) {
    abort()
    return () => {}
  }
  signal.addEventListener("abort", abort, { once: true })
  return () => signal.removeEventListener("abort", abort)
}

export function createBraincodeAgentRuntime(options: BraincodeAgentRuntimeOptions): BraincodeAgentRuntime {
  const { piModel } = resolveBuiltInPiModel(options.model)
  const tools = options.toolEvidenceCache && options.tools
    ? wrapToolsWithEvidenceCache(options.tools, options.toolEvidenceCache)
    : options.tools ?? []
  const compactor = options.compaction
    ? createRuntimeCompactor({
        policy: options.compaction,
        model: piModel,
        thinkingLevel: normalizeSummarizerThinkingLevel(options.model, options.policy),
        getApiKey: options.getApiKey,
        sessionId: options.sessionId,
      })
    : undefined
  const agent = new Agent({
    sessionId: options.sessionId,
    initialState: {
      systemPrompt: options.systemPrompt,
      model: piModel,
      thinkingLevel: normalizeRuntimeThinkingLevel(options.model, options.policy),
      tools,
      messages: [],
    },
    transformContext: async (messages, signal) => {
      // Soft compaction reduces the message list sent this turn; the byte-size
      // guard then enforces the hard provider-payload limit as a final backstop.
      const compacted = compactor ? await compactor.transform(messages, signal) : messages
      return enforceHandoffContextBudget(compacted, {
        systemPrompt: options.systemPrompt,
        sessionId: options.sessionId,
      })
    },
    getApiKey: options.getApiKey,
    onPayload: (payload, model) => {
      if (!isDebugEnabled()) return undefined
      debugLog("runtime", "provider payload", {
        configuredModelId: options.model.id,
        provider: model.provider,
        modelId: model.id,
        api: model.api,
        payload: summarizeProviderPayload(payload),
      })
      return undefined
    },
    onResponse: (response, model) => {
      if (!isDebugEnabled()) return
      debugLog("runtime", "provider response", {
        configuredModelId: options.model.id,
        provider: model.provider,
        modelId: model.id,
        api: model.api,
        status: response.status,
        headers: summarizeProviderResponseHeaders(response.headers),
      })
    },
    // Always parallel: read-only tools fan out within a turn, while
    // state-changing tools (edit_file, apply_patch, exec_command, shell,
    // run_script, write_stdin) carry executionMode "sequential" and force the
    // whole batch to serialize in pi-agent-core. Approval (beforeToolCall) is
    // still collected per call during preparation, so the auto-mode UX is
    // unchanged while independent reads/searches stop blocking each other.
    toolExecution: "parallel",
    beforeToolCall: async (context, signal) => {
      const policyEvaluation = evaluateToolPermissionPolicy(context.toolCall.name, context.args, options.permissionPolicy)
      const permissionPolicy = policyEvaluation.matches.length > 0 ? summarizePermissionPolicyEvaluation(policyEvaluation) : undefined
      if (policyEvaluation.matches.length > 0) {
        await options.onPermissionPolicyEvaluation?.(policyEvaluation)
      }
      if (policyEvaluation.action === "deny") {
        const reason = formatPermissionPolicyDenial(policyEvaluation)
        await recordToolApprovalDecision(options.audit, {
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          decision: "denied",
          approver: "permission_policy",
          reason,
          argsSummary: summarizeJson(context.args),
          permissionPolicy,
        })
        return { block: true, reason }
      }
      const requiresApproval = toolCallRequiresApproval(context.toolCall.name, context.args, policyEvaluation)
      if (options.mode === "radical") {
        if (requiresApproval || permissionPolicy) {
          await recordToolApprovalDecision(options.audit, {
            toolCallId: context.toolCall.id,
            toolName: context.toolCall.name,
            decision: "auto_approved",
            approver: "mode_policy",
            reason: "auto-approved in radical mode",
            argsSummary: summarizeJson(context.args),
            permissionPolicy,
          })
        }
        return undefined
      }
      if (!requiresApproval && policyEvaluation.action === "allow" && permissionPolicy) {
        await recordToolApprovalDecision(options.audit, {
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          decision: "allowed",
          approver: "permission_policy",
          reason: "allowed by permission policy",
          argsSummary: summarizeJson(context.args),
          permissionPolicy,
        })
        return undefined
      }
      if (options.onToolApproval && requiresApproval) {
        const request = {
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          args: context.args,
          ...(permissionPolicy ? { permissionPolicy } : {}),
        }
        const decision = await options.onToolApproval(request, signal)
        await recordToolApprovalDecision(options.audit, {
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          decision: decision?.approved === false ? "blocked" : "approved",
          approver: decision?.approver ?? "human",
          reason: decision?.reason,
          argsSummary: summarizeJson(context.args),
          permissionPolicy,
        })
        if (decision?.approved === false) {
          return { block: true, reason: decision.reason ?? `User blocked tool call: ${context.toolCall.name}` }
        }
        return undefined
      }
      if (requiresApproval) {
        const reason = `Tool approval callback is required for risky tool call: ${context.toolCall.name}`
        await recordToolApprovalDecision(options.audit, {
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          decision: "blocked",
          approver: "runtime_policy",
          reason,
          argsSummary: summarizeJson(context.args),
          permissionPolicy,
        })
        return { block: true, reason }
      }
      return undefined
    },
  })

  agent.subscribe(async (event) => {
    if (isDebugEnabled() && shouldDebugAgentEvent(event)) {
      debugLog("runtime", "agent event", summarizeAgentEvent(event))
    }
    await recordToolExecutionEvent(options.audit, event)
    return options.onEvent?.(event)
  })

  return {
    agent,
    selection: {
      requested: options.policy,
      configured: options.model,
      piModel,
    },
  }
}

export async function recordAgentTokenUsage(
  messages: unknown[],
  scope: TokenUsageScope | undefined,
  model: BraincodeModel,
  startIndex = 0,
): Promise<void> {
  if (!scope) return
  let usageIndex = 0
  for (const [messageIndex, message] of messages.entries()) {
    if (messageIndex < startIndex) continue
    if (!message || typeof message !== "object") continue
    const usage = normalizeTokenUsage((message as { usage?: unknown }).usage)
    if (!usage) continue
    usageIndex += 1
    await appendTokenUsageRecord(
      scope.sessionId,
      {
        role: scope.role,
        phase: scope.phase,
        brainId: scope.brainId,
        modelId: model.id,
        provider: model.provider,
        agentSessionId: scope.agentSessionId,
        taskId: scope.taskId,
        parentId: scope.parentId,
        turnId: `${scope.agentSessionId ?? scope.sessionId}:${messageIndex}:${usageIndex}`,
        attempt: scope.attempt,
        usage,
      },
      scope.home,
    )
  }
}

export async function recordAutomaticHandoffIfNeeded(error: unknown, sessionId: string, home: string | undefined): Promise<void> {
  if (!(error instanceof ContextHandoffRequiredError) || !error.handoffSummary) return
  await appendSessionRecord(sessionId, {
    type: "handoff",
    summary: error.handoffSummary,
    focus: "automatic context-size guard",
    trigger: "auto",
    estimatedBytes: error.estimatedBytes,
    limitBytes: error.limitBytes,
  }, home)
}

export function extractAssistantText(messages: unknown[], debugContext: Record<string, unknown> = {}): string {
  const assistantMessages = messages.filter((message) => {
    return typeof message === "object" && message !== null && (message as { role?: unknown }).role === "assistant"
  })

  const lastAssistant = assistantMessages.at(-1) as { content?: unknown; errorMessage?: unknown; stopReason?: unknown } | undefined
  debugLog("runtime", "extract assistant text", {
    ...debugContext,
    messageCount: messages.length,
    assistantMessageCount: assistantMessages.length,
    assistant: summarizeAgentMessage(lastAssistant),
  })
  if (typeof lastAssistant?.errorMessage === "string" && lastAssistant.errorMessage.trim()) {
    throw new Error(lastAssistant.errorMessage)
  }
  if (lastAssistant?.stopReason === "error") {
    throw new Error("Provider returned an error without a message")
  }
  if (!lastAssistant || !Array.isArray(lastAssistant.content)) return ""

  return lastAssistant.content
    .filter((content): content is { type: "text"; text: string } => {
      return typeof content === "object" && content !== null && (content as { type?: unknown }).type === "text" && typeof (content as { text?: unknown }).text === "string"
    })
    .map((content) => content.text)
    .join("\n")
}

export function requireAssistantText(messages: unknown[], debugContext: Record<string, unknown>): string {
  const text = extractAssistantText(messages, debugContext)
  if (text.trim()) return text

  debugLog("runtime", "empty assistant response", {
    ...debugContext,
    messageCount: messages.length,
    messages: messages.slice(-4).map((message) => summarizeAgentMessage(message)),
  })

  const model = formatDebugModelLabel(debugContext)
  const api = debugContext.api ? ` via ${String(debugContext.api)}` : ""
  throw new Error(`Provider returned an empty assistant response${model ? ` from ${model}` : ""}${api}.`)
}

function summarizeProviderPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return { type: typeof payload }
  const record = payload as Record<string, unknown>
  return {
    model: record.model,
    stream: record.stream,
    input: summarizeProviderMessageList(record.input),
    messages: summarizeProviderMessageList(record.messages),
    tools: Array.isArray(record.tools)
      ? record.tools.map((tool) => summarizeProviderTool(tool)).slice(0, 12)
      : undefined,
    toolCount: Array.isArray(record.tools) ? record.tools.length : undefined,
    toolsTruncated: Array.isArray(record.tools) ? record.tools.length > 12 : undefined,
    reasoning: record.reasoning,
    temperature: record.temperature,
    maxTokens: record.max_tokens ?? record.max_completion_tokens ?? record.max_output_tokens,
    store: record.store,
  }
}

function summarizeProviderMessageList(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined
  return {
    count: value.length,
    items: value.slice(0, 12).map((item) => summarizeProviderMessageItem(item)),
    truncated: value.length > 12,
  }
}

function summarizeProviderMessageItem(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") return { type: typeof item }
  const record = item as Record<string, unknown>
  return {
    role: record.role,
    type: record.type,
    content: summarizeProviderContent(record.content),
    outputLength: typeof record.output === "string" ? record.output.length : undefined,
    name: record.name,
  }
}

function summarizeProviderContent(content: unknown): unknown {
  if (typeof content === "string") return { kind: "string", length: content.length }
  if (!Array.isArray(content)) return content === undefined ? undefined : { kind: typeof content }
  return {
    kind: "array",
    count: content.length,
    items: content.slice(0, 12).map((item) => {
      if (!item || typeof item !== "object") return { type: typeof item }
      const record = item as Record<string, unknown>
      return {
        type: record.type,
        textLength: typeof record.text === "string" ? record.text.length : undefined,
        image: typeof record.image_url === "string" ? "present" : undefined,
      }
    }),
    truncated: content.length > 12,
  }
}

function summarizeProviderTool(tool: unknown): Record<string, unknown> {
  if (!tool || typeof tool !== "object") return { type: typeof tool }
  const record = tool as Record<string, unknown>
  return {
    type: record.type,
    name: record.name,
    functionName: typeof record.function === "object" && record.function
      ? (record.function as Record<string, unknown>).name
      : undefined,
  }
}

function summarizeProviderResponseHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => {
      return /request|trace|content-type|ratelimit|cache|openai|cf-ray|x-/i.test(key)
    }),
  )
}

function summarizeAgentEvent(event: AgentEvent): Record<string, unknown> {
  switch (event.type) {
    case "agent_start":
    case "turn_start":
      return { type: event.type }
    case "agent_end":
      return { type: event.type, messageCount: event.messages.length }
    case "turn_end":
      return {
        type: event.type,
        message: summarizeAgentMessage(event.message),
        toolResultCount: event.toolResults.length,
      }
    case "message_start":
    case "message_end":
      return { type: event.type, message: summarizeAgentMessage(event.message) }
    case "message_update":
      return {
        type: event.type,
        update: summarizeAssistantMessageEvent(event.assistantMessageEvent),
        message: summarizeAgentMessage(event.message),
      }
    case "tool_execution_start":
      return {
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argKeys: event.args && typeof event.args === "object" ? Object.keys(event.args) : undefined,
      }
    case "tool_execution_update":
      return { type: event.type, toolCallId: event.toolCallId, toolName: event.toolName }
    case "tool_execution_end":
      return {
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
        result: summarizeToolResultForDebug(event.result),
      }
  }
}

function shouldDebugAgentEvent(event: AgentEvent): boolean {
  if (process.env.BRAINCODE_DEBUG_STREAM === "true") return true
  if (event.type !== "message_update") return true
  const update = event.assistantMessageEvent
  if (!update || typeof update !== "object") return true
  const updateType = (update as { type?: unknown }).type
  return updateType !== "text_delta" && updateType !== "thinking_delta"
}

function summarizeAssistantMessageEvent(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== "object") return { type: typeof event }
  const record = event as Record<string, unknown>
  return {
    type: record.type,
    contentIndex: record.contentIndex,
    deltaLength: typeof record.delta === "string" ? record.delta.length : undefined,
    reason: record.reason,
  }
}

function summarizeToolResultForDebug(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") return { type: typeof result }
  const record = result as Record<string, unknown>
  return {
    isError: record.isError,
    content: summarizeProviderContent(record.content),
    detailsType: record.details === undefined ? undefined : typeof record.details,
    terminate: record.terminate,
  }
}

function toolCallRequiresApproval(toolName: string, args: unknown, policyEvaluation?: PermissionPolicyEvaluation): boolean {
  if (policyEvaluation?.action === "ask") return true
  if (policyEvaluation?.action === "allow") return false
  const name = toolName.toLowerCase()
  if (name === "web_search" || name.startsWith("mcp__")) return false
  if (/(shell|exec|execute|run_command|run-command|terminal|bash|zsh|cmd|powershell|spawn|subprocess|run_script|kill_background)/.test(name)) return true
  if (/(apply_patch|edit|write|patch|delete|remove|rm_|rename|move|create_file|create-file|filesystem__write)/.test(name)) return true
  const serialized = safeStringify(args).toLowerCase()
  return /\b(rm\s+-rf|sudo|chmod|chown|git\s+push|git\s+reset|drop\s+table|delete\s+from|truncate\s+table|npm\s+publish|bun\s+publish)\b/.test(serialized)
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return String(value)
  }
}

function normalizeRuntimeThinkingLevel(model: BraincodeModel, policy: ModelPolicy): ModelPolicy["thinkingLevel"] {
  if (model.baseUrl && policy.thinkingLevel === "minimal") return "low"
  return policy.thinkingLevel
}

// pi-ai's ThinkingLevel excludes "off"; the summarizer expects undefined when
// thinking is disabled. Keep summary cost low by never inheriting "xhigh".
function normalizeSummarizerThinkingLevel(model: BraincodeModel, policy: ModelPolicy): Exclude<ModelPolicy["thinkingLevel"], "off"> | undefined {
  const level = normalizeRuntimeThinkingLevel(model, policy)
  if (!level || level === "off") return undefined
  return level === "xhigh" ? "high" : level
}

function formatDebugModelLabel(debugContext: Record<string, unknown>): string {
  const modelId = typeof debugContext.modelId === "string" ? debugContext.modelId : ""
  const provider = typeof debugContext.provider === "string" ? debugContext.provider : ""
  if (!modelId) return provider
  if (!provider || modelId.includes("/")) return modelId
  return `${provider}/${modelId}`
}

function summarizeAgentMessage(message: unknown): Record<string, unknown> {
  if (!message || typeof message !== "object") return { type: typeof message }
  const record = message as Record<string, unknown>
  const content = Array.isArray(record.content) ? record.content : undefined
  return {
    role: record.role,
    api: record.api,
    provider: record.provider,
    model: record.model,
    stopReason: record.stopReason,
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
    content: content ? summarizeAgentContent(content) : summarizeProviderContent(record.content),
    usage: summarizeUsage(record.usage),
  }
}

function summarizeAgentContent(content: unknown[]): Record<string, unknown> {
  return {
    count: content.length,
    types: content.map((block) => {
      if (!block || typeof block !== "object") return typeof block
      return (block as { type?: unknown }).type
    }),
    textLength: content.reduce<number>((total, block) => {
      if (!block || typeof block !== "object") return total
      const text = (block as { text?: unknown }).text
      return total + (typeof text === "string" ? text.length : 0)
    }, 0),
    thinkingLength: content.reduce<number>((total, block) => {
      if (!block || typeof block !== "object") return total
      const thinking = (block as { thinking?: unknown }).thinking
      return total + (typeof thinking === "string" ? thinking.length : 0)
    }, 0),
    toolCalls: content
      .filter((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "toolCall")
      .map((block) => {
        const record = block as Record<string, unknown>
        return {
          id: record.id,
          name: record.name,
          argKeys: record.arguments && typeof record.arguments === "object" ? Object.keys(record.arguments) : undefined,
        }
      }),
  }
}

function summarizeUsage(usage: unknown): Record<string, unknown> | undefined {
  if (!usage || typeof usage !== "object") return undefined
  const record = usage as Record<string, unknown>
  return {
    input: readDebugNumber(record.input),
    output: readDebugNumber(record.output),
    cacheRead: readDebugNumber(record.cacheRead),
    cacheWrite: readDebugNumber(record.cacheWrite),
    totalTokens: readDebugNumber(record.totalTokens),
    total: readDebugNumber(record.total),
  }
}

function readDebugNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
