import type { AgentMessage } from "@earendil-works/pi-agent-core"
import { estimateContextTokens, generateSummary } from "@earendil-works/pi-agent-core"
import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai"
import { debugLog } from "@braincode/shared"

// Tokens reserved for the summarization prompt and its output, matching
// pi-agent-core's DEFAULT_COMPACTION_SETTINGS.reserveTokens.
const RESERVE_TOKENS = 16384
// Approximate recent-context tokens to keep verbatim after compaction.
const KEEP_RECENT_TOKENS = 20000

export type CompactionMode = "auto" | "manual" | "aggressive"

export type RuntimeCompactionPolicy = {
  // Soft token budget for active context. Compaction triggers when the
  // estimated context exceeds this. Comes from BrainContextPolicy.maxInputTokens.
  maxInputTokens: number
  mode: CompactionMode
}

// Derive the runtime compaction policy from a Brain's context policy. Returns
// undefined when compaction is disabled (mode "manual") so callers can skip
// wiring entirely and preserve the explicit-handoff default.
export function deriveCompactionPolicy(context: { maxInputTokens?: number; compaction?: string } | undefined): RuntimeCompactionPolicy | undefined {
  if (!context) return undefined
  const mode = normalizeCompactionMode(context.compaction)
  if (!shouldEnableCompaction(mode)) return undefined
  const maxInputTokens = typeof context.maxInputTokens === "number" && context.maxInputTokens > 0 ? context.maxInputTokens : 120000
  return { maxInputTokens, mode }
}

function normalizeCompactionMode(value: string | undefined): CompactionMode {
  return value === "auto" || value === "manual" || value === "aggressive" ? value : "manual"
}

export type RuntimeCompactionOptions = {
  policy: RuntimeCompactionPolicy
  model: Model<Api>
  thinkingLevel?: ThinkingLevel
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined
  sessionId?: string
}

// Compaction is a soft, non-destructive context reducer applied inside
// transformContext: it only changes the message list sent to the provider for
// one turn and never mutates the agent's own transcript or the persisted
// session jsonl. The byte-size handoff guard (context-budget.ts) still runs
// after it as the hard provider-payload backstop.
export type RuntimeCompactor = {
  transform: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>
}

export function shouldEnableCompaction(mode: CompactionMode): boolean {
  return mode === "auto" || mode === "aggressive"
}

// "aggressive" compacts earlier (at 70% of budget) so long runs spend less on
// uncompacted history; "auto" waits until the full budget is reached.
function compactionTriggerTokens(policy: RuntimeCompactionPolicy): number {
  const budget = Math.max(1, policy.maxInputTokens)
  return policy.mode === "aggressive" ? Math.floor(budget * 0.7) : budget
}

export function createRuntimeCompactor(options: RuntimeCompactionOptions): RuntimeCompactor | undefined {
  if (!shouldEnableCompaction(options.policy.mode)) return undefined

  const trigger = compactionTriggerTokens(options.policy)
  // Cache the most recent summary plus how many leading messages it already
  // covers, so a stable transcript is not re-summarized on every turn.
  let cachedSummary: string | undefined
  let summarizedThrough = 0

  const transform = async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> => {
    if (messages.length === 0) return messages
    const estimate = estimateContextTokens(messages)
    if (estimate.tokens <= trigger) return messages

    const cut = findUserBoundaryCut(messages, KEEP_RECENT_TOKENS)
    // No safe cut point (e.g. a single huge turn): leave it to the byte guard.
    if (cut <= 0) return messages

    const head = messages.slice(0, cut)
    const tail = messages.slice(cut)

    // Reuse the cached summary when the head we would summarize has not changed.
    if (!cachedSummary || cut !== summarizedThrough) {
      const apiKey = options.getApiKey ? await options.getApiKey(options.model.provider) : undefined
      if (!apiKey) {
        debugLog("runtime", "compaction skipped: no api key", { sessionId: options.sessionId, provider: options.model.provider })
        return messages
      }
      const result = await generateSummary(
        head,
        options.model,
        RESERVE_TOKENS,
        apiKey,
        undefined,
        signal,
        undefined,
        cachedSummary,
        options.thinkingLevel,
      )
      if (!result.ok) {
        debugLog("runtime", "compaction summary failed", { sessionId: options.sessionId, error: result.error.message })
        return messages
      }
      cachedSummary = result.value
      summarizedThrough = cut
    }

    debugLog("runtime", "compaction applied", {
      sessionId: options.sessionId,
      mode: options.policy.mode,
      tokensBefore: estimate.tokens,
      trigger,
      headMessages: head.length,
      tailMessages: tail.length,
    })

    return [buildSummaryMessage(cachedSummary), ...tail]
  }

  return { transform }
}

// Find the index of the first kept message: walk back from the end until the
// recent slice reaches keepRecentTokens, then snap forward to the next `user`
// message so we never start the kept tail on an orphaned toolResult or
// assistant toolCall (providers reject unmatched tool-call pairs).
export function findUserBoundaryCut(messages: AgentMessage[], keepRecentTokens: number): number {
  let accumulated = 0
  let index = messages.length
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    accumulated += estimateMessageTokens(messages[i])
    index = i
    if (accumulated >= keepRecentTokens) break
  }
  // Snap forward to the first user message at or after the candidate index.
  for (let i = index; i < messages.length; i += 1) {
    if (messages[i]?.role === "user") return i
  }
  return 0
}

function buildSummaryMessage(summary: string): AgentMessage {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `[Earlier conversation compacted to save context. Summary of prior turns:]\n\n${summary}`,
      },
    ],
    timestamp: Date.now(),
  }
}

// Conservative character-based estimate, mirroring pi-agent-core's estimateTokens
// fallback for messages without provider usage.
function estimateMessageTokens(message: AgentMessage): number {
  const text = JSON.stringify((message as { content?: unknown }).content ?? message)
  return Math.ceil(text.length / 4)
}
