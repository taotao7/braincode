import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"

type ToolEvidenceCacheEntry = {
  result: AgentToolResult<any>
  createdAt: number
  lastAccessedAt: number
  approxBytes: number
}

export type ToolEvidenceCacheOptions = {
  maxEntries?: number
  maxBytes?: number
  ttlMs?: number
}

export type ToolEvidenceCache = {
  entries: Map<string, ToolEvidenceCacheEntry>
  counts: Map<string, number>
  options: Required<ToolEvidenceCacheOptions>
  approxBytes: number
  evictedEntries: number
  lastKey?: string
  consecutiveCount: number
}

const CACHEABLE_EVIDENCE_TOOLS = new Set(["list_files", "read_file", "search_files", "git_diff", "get_changed_files"])
// Read-only tools whose names collide with the write/exec invalidation heuristic
// but must not reset the cache.
const NON_INVALIDATING_TOOLS = new Set(["dispatch_specialist"])
// Single source of truth for "this tool name mutates state" — used both to
// EXCLUDE mutating MCP tools from caching and to INVALIDATE the cache after a
// mutating call runs. Keeping one predicate means a browser tool like
// `navigate_page`/`click` is consistently treated as a mutation on both paths;
// previously the invalidation list was narrower than the caching-exclusion list,
// so a mutation could run without resetting a cached read (stale snapshot).
// Substrings are matched unanchored: `write` covers `filesystem__write`, `create`
// covers `create_file`/`create-file`, `run`/`command` cover `run_command`/
// `run_script`, `patch` covers `apply_patch` (and `dispatch_specialist`, which is
// guarded by NON_INVALIDATING_TOOLS above).
const MUTATING_TOOL_NAME = /(edit|write|patch|delete|remove|rm_|rename|move|create|update|insert|put|post|exec|execute|run|command|terminal|bash|zsh|cmd|powershell|shell|spawn|subprocess|kill|navigate|click|fill|upload|drag|press|hover|emulate|publish|deploy|commit|push|reset)/
// Read-only verbs that make an MCP tool safe to dedup by identical arguments.
const READ_ONLY_TOOL_NAME = /(search|query|read|get|list|find|fetch|snapshot|trace|inspect|lookup|describe|show|view|status|diff|log|grep)/
const EVIDENCE_CACHE_SUPPRESS_CONTENT_AFTER_CONSECUTIVE = 8
// Consecutive identical calls at which the cache stops merely warning and starts
// hard-blocking: the wrapper returns the cached evidence (or a synthetic stop
// result when nothing was cacheable) instead of re-running the tool, forcing the
// model to change direction. Kept below the 5-count "strong reminder" so a soft
// nudge still precedes the block once.
const EVIDENCE_CACHE_HARD_BLOCK_AFTER_CONSECUTIVE = 4
const DEFAULT_EVIDENCE_CACHE_OPTIONS: Required<ToolEvidenceCacheOptions> = {
  maxEntries: 200,
  maxBytes: 8 * 1024 * 1024,
  ttlMs: 10 * 60 * 1000,
}

export function createToolEvidenceCache(options: ToolEvidenceCacheOptions = {}): ToolEvidenceCache {
  return {
    entries: new Map(),
    counts: new Map(),
    options: normalizeToolEvidenceCacheOptions(options),
    approxBytes: 0,
    evictedEntries: 0,
    consecutiveCount: 0,
  }
}

export function wrapToolsWithEvidenceCache(tools: AgentTool[], cache: ToolEvidenceCache): AgentTool[] {
  return tools.map((tool) => {
    const wrapped: AgentTool = {
      ...tool,
      execute: async (toolCallId, params, signal, onUpdate) => {
        const key = toolEvidenceKey(tool.name, params)
        pruneExpiredToolEvidenceCacheEntries(cache, Date.now())
        const count = recordToolEvidenceCall(cache, key)
        const cacheable = isCacheableEvidenceToolCall(tool.name, params)
        const cached = cacheable ? cache.entries.get(key) : undefined
        const overThreshold = cache.consecutiveCount >= EVIDENCE_CACHE_HARD_BLOCK_AFTER_CONSECUTIVE
        if (cached) {
          touchToolEvidenceCacheEntry(cache, key, cached)
          // Past the hard-block threshold we stop re-serving the cached result as
          // a normal success and instead return it flagged blocked so the agent
          // loop is forced to change direction rather than spin on the same call.
          // The real tool is not re-invoked.
          return annotateToolEvidenceResult(cached.result, {
            toolName: tool.name,
            reused: true,
            blocked: overThreshold,
            callCount: count,
            consecutiveCount: cache.consecutiveCount,
            cacheAgeMs: Date.now() - cached.createdAt,
            cache,
          })
        }

        // Cacheable but nothing stored (result too large to cache, or evicted):
        // without this, identical large-result calls would re-run forever and the
        // hard block could never fire. Block on the threshold using a synthetic
        // result so the loop is still interrupted even with no cached evidence.
        if (cacheable && overThreshold) {
          return annotateToolEvidenceResult(emptyEvidenceResult(), {
            toolName: tool.name,
            reused: false,
            blocked: true,
            hasEvidence: false,
            callCount: count,
            consecutiveCount: cache.consecutiveCount,
            cache,
          })
        }

        const result = await tool.execute(toolCallId, params as never, signal, onUpdate as never)
        if (toolInvalidatesEvidenceCache(tool.name, params)) {
          resetToolEvidenceCache(cache)
        } else if (cacheable) {
          setToolEvidenceCacheEntry(cache, key, result, Date.now())
        }

        return annotateToolEvidenceResult(result, {
          toolName: tool.name,
          reused: false,
          blocked: false,
          callCount: count,
          consecutiveCount: cache.consecutiveCount,
          cache,
        })
      },
    }
    return wrapped
  })
}

function normalizeToolEvidenceCacheOptions(options: ToolEvidenceCacheOptions): Required<ToolEvidenceCacheOptions> {
  return {
    maxEntries: normalizeNonNegativeInteger(options.maxEntries, DEFAULT_EVIDENCE_CACHE_OPTIONS.maxEntries),
    maxBytes: normalizeNonNegativeInteger(options.maxBytes, DEFAULT_EVIDENCE_CACHE_OPTIONS.maxBytes),
    ttlMs: normalizeNonNegativeInteger(options.ttlMs, DEFAULT_EVIDENCE_CACHE_OPTIONS.ttlMs),
  }
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function recordToolEvidenceCall(cache: ToolEvidenceCache, key: string): number {
  const count = (cache.counts.get(key) ?? 0) + 1
  cache.counts.set(key, count)
  cache.consecutiveCount = cache.lastKey === key ? cache.consecutiveCount + 1 : 1
  cache.lastKey = key
  return count
}

function resetToolEvidenceCache(cache: ToolEvidenceCache): void {
  cache.entries.clear()
  cache.counts.clear()
  cache.approxBytes = 0
  cache.lastKey = undefined
  cache.consecutiveCount = 0
}

function setToolEvidenceCacheEntry(cache: ToolEvidenceCache, key: string, result: AgentToolResult<any>, now: number): void {
  const approxBytes = estimateToolEvidenceResultContentBytes(result)
  if (cache.options.maxEntries === 0 || cache.options.maxBytes === 0 || approxBytes > cache.options.maxBytes) {
    return
  }

  const previous = cache.entries.get(key)
  if (previous) {
    cache.approxBytes -= previous.approxBytes
    cache.entries.delete(key)
  }

  cache.entries.set(key, {
    result,
    createdAt: now,
    lastAccessedAt: now,
    approxBytes,
  })
  cache.approxBytes += approxBytes
  enforceToolEvidenceCacheLimits(cache)
}

function touchToolEvidenceCacheEntry(cache: ToolEvidenceCache, key: string, entry: ToolEvidenceCacheEntry): void {
  cache.entries.delete(key)
  cache.entries.set(key, { ...entry, lastAccessedAt: Date.now() })
}

function enforceToolEvidenceCacheLimits(cache: ToolEvidenceCache): void {
  while (cache.entries.size > cache.options.maxEntries || cache.approxBytes > cache.options.maxBytes) {
    const oldestKey = cache.entries.keys().next().value as string | undefined
    if (!oldestKey) return
    evictToolEvidenceCacheEntry(cache, oldestKey)
  }
}

function pruneExpiredToolEvidenceCacheEntries(cache: ToolEvidenceCache, now: number): void {
  if (cache.options.ttlMs === 0) {
    for (const key of [...cache.entries.keys()]) evictToolEvidenceCacheEntry(cache, key)
    return
  }
  for (const [key, entry] of cache.entries) {
    if (now - entry.createdAt > cache.options.ttlMs) evictToolEvidenceCacheEntry(cache, key)
  }
}

function evictToolEvidenceCacheEntry(cache: ToolEvidenceCache, key: string): void {
  const entry = cache.entries.get(key)
  if (!entry) return
  cache.entries.delete(key)
  cache.approxBytes = Math.max(0, cache.approxBytes - entry.approxBytes)
  cache.evictedEntries += 1
}

function estimateToolEvidenceResultContentBytes(result: AgentToolResult<any>): number {
  return result.content.reduce((total, part) => total + estimateJsonBytes(part), 0)
}

function estimateJsonBytes(value: unknown): number {
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? "").byteLength
  } catch {
    return new TextEncoder().encode(String(value)).byteLength
  }
}

function toolEvidenceKey(toolName: string, args: unknown): string {
  return `${toolName.toLowerCase()}:${canonicalToolArgs(args)}`
}

function canonicalToolArgs(value: unknown): string {
  try {
    return JSON.stringify(toStableJsonValue(value, new WeakSet())) ?? ""
  } catch {
    return safeStringify(value)
  }
}

function toStableJsonValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (Array.isArray(value)) return value.map((item) => toStableJsonValue(item, seen))
  if (typeof value !== "object") return String(value)
  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    output[key] = toStableJsonValue((value as Record<string, unknown>)[key], seen)
  }
  seen.delete(value)
  return output
}

function isCacheableEvidenceToolCall(toolName: string, _args: unknown): boolean {
  const name = toolName.toLowerCase()
  if (CACHEABLE_EVIDENCE_TOOLS.has(name)) return true
  return isReadOnlyEvidenceTool(name)
}

// web_search and read-only MCP tools (mcp__server__tool) are safe to dedup. We
// classify by the bare tool name: web_search is always read-only, and an MCP tool
// counts as read-only when its trailing segment reads like a query/fetch verb and
// carries no mutating verb. Non-MCP, non-allowlisted tools are never treated as
// cacheable here so local edit/exec tools keep their existing pass-through path.
function isReadOnlyEvidenceTool(name: string): boolean {
  if (name === "web_search") return true
  if (!name.startsWith("mcp__") || name === "mcp__connect") return false
  const bare = mcpBareToolName(name)
  if (MUTATING_TOOL_NAME.test(bare)) return false
  return READ_ONLY_TOOL_NAME.test(bare)
}

function mcpBareToolName(name: string): string {
  const parts = name.split("__")
  return (parts.length > 1 ? parts[parts.length - 1] : name) ?? name
}

function toolInvalidatesEvidenceCache(toolName: string, args: unknown): boolean {
  if (isCacheableEvidenceToolCall(toolName, args)) return false
  const name = toolName.toLowerCase()
  // Brain-mediated, read-only tools must never reset the cache even when their
  // name happens to contain a mutating substring. `dispatch_specialist` matches
  // /patch/ but only ever spawns read-only specialist workers, so it does not
  // change the primary's workspace.
  if (NON_INVALIDATING_TOOLS.has(name)) return false
  // Match against the bare tool name for MCP tools so the same mutating-verb set
  // that excludes them from caching (isReadOnlyEvidenceTool) also resets the
  // cache here — a mutating MCP call must invalidate prior cached reads.
  const bare = name.startsWith("mcp__") ? mcpBareToolName(name) : name
  return MUTATING_TOOL_NAME.test(bare)
}

function annotateToolEvidenceResult<TDetails>(
  result: AgentToolResult<TDetails>,
  evidence: {
    toolName: string
    reused: boolean
    blocked: boolean
    // False when the block fired without any cached evidence to serve (result was
    // too large to cache). Drives wording so we don't point at evidence that
    // isn't attached. Defaults to true (the normal cached-hit path).
    hasEvidence?: boolean
    callCount: number
    consecutiveCount: number
    cacheAgeMs?: number
    cache: ToolEvidenceCache
  },
): AgentToolResult<TDetails> {
  const hasEvidence = evidence.hasEvidence !== false
  const suppress = evidence.blocked && hasEvidence && evidence.consecutiveCount >= EVIDENCE_CACHE_SUPPRESS_CONTENT_AFTER_CONSECUTIVE
  const warning = evidence.blocked
    ? formatEvidenceCacheBlock(evidence, suppress, hasEvidence)
    : formatEvidenceCacheReminder(evidence)
  const { cache, hasEvidence: _omitHasEvidence, ...cacheEvidence } = evidence
  const details = addEvidenceCacheDetails(result.details, {
    ...cacheEvidence,
    warning,
    evictedEntries: cache.evictedEntries,
    currentEntries: cache.entries.size,
    approxBytes: cache.approxBytes,
  })
  // A hard block returns the cached evidence with a forceful stop instruction
  // and a `blocked` detail flag so the agent loop and the TUI both treat the
  // repeated call as intercepted. The real tool was not re-invoked; the cached
  // content is still attached (suppressed once the streak is long, or absent when
  // nothing was cacheable) so the model can answer from it instead of retrying.
  if (evidence.blocked && warning) {
    const [first, ...rest] = result.content
    const content = suppress || !(first && first.type === "text" && typeof first.text === "string")
      ? [{ type: "text" as const, text: suppress ? `${warning}\n\nNo new tool output is included because this duplicate read-only call has already been answered in this turn.` : warning }]
      : [{ ...first, text: `${warning}\n\n${first.text}` }, ...rest]
    return { ...result, details, content }
  }
  if (!warning) return { ...result, details }
  if (evidence.reused && evidence.consecutiveCount >= EVIDENCE_CACHE_SUPPRESS_CONTENT_AFTER_CONSECUTIVE) {
    return {
      ...result,
      details,
      content: [
        {
          type: "text",
          text: `${warning}\n\nNo new tool output is included because this duplicate read-only call has already been answered in this turn.`,
        },
      ],
    }
  }

  const [first, ...rest] = result.content
  if (first && first.type === "text" && typeof first.text === "string") {
    return {
      ...result,
      details,
      content: [{ ...first, text: `${warning}\n\n${first.text}` }, ...rest],
    }
  }
  return {
    ...result,
    details,
    content: [{ type: "text", text: warning }, ...result.content],
  }
}

function addEvidenceCacheDetails<TDetails>(details: TDetails, evidenceCache: Record<string, unknown>): TDetails {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return { ...(details as Record<string, unknown>), evidenceCache } as TDetails
  }
  return { value: details, evidenceCache } as TDetails
}

function formatEvidenceCacheBlock(evidence: { toolName: string; consecutiveCount: number; cacheAgeMs?: number }, suppress: boolean, hasEvidence: boolean): string {
  const age = evidence.cacheAgeMs === undefined ? "" : ` (${evidence.cacheAgeMs}ms old)`
  const evidencePointer = !hasEvidence
    ? "No cached output is available because this result was too large to retain, so change direction now"
    : suppress
      ? "Use the evidence you already gathered this turn and change direction now"
      : `Use the cached evidence below${age} and change direction now`
  return `[Braincode evidence cache] Blocked: ${evidence.toolName} was called with identical arguments ${evidence.consecutiveCount} times in a row. This call was intercepted and the tool was not run again. ${evidencePointer} — call a different tool, change the arguments, or answer from the information you already have.`
}

// Synthetic empty result used when a hard block fires with no cached evidence to
// serve (the tool's result was too large to cache). The forceful stop text is
// added by annotateToolEvidenceResult; this just provides an empty content/detail
// shell to annotate.
function emptyEvidenceResult(): AgentToolResult<unknown> {
  return { content: [], details: undefined }
}

function formatEvidenceCacheReminder(evidence: { toolName: string; reused: boolean; callCount: number; consecutiveCount: number; cacheAgeMs?: number }): string | undefined {
  if (evidence.callCount <= 1) return undefined
  const age = evidence.cacheAgeMs === undefined ? "" : ` (${evidence.cacheAgeMs}ms old)`
  if (evidence.consecutiveCount >= 8) {
    return `[Braincode evidence cache] Repeated ${evidence.toolName} with identical arguments ${evidence.consecutiveCount} times in a row. Stop repeating this call; use the cached evidence${age} or change the arguments.`
  }
  if (evidence.consecutiveCount >= 5) {
    return `[Braincode evidence cache] Strong duplicate reminder: ${evidence.toolName} has identical arguments ${evidence.consecutiveCount} times in a row. Reuse the existing evidence${age} unless inputs changed.`
  }
  if (evidence.consecutiveCount >= 3) {
    return `[Braincode evidence cache] Duplicate reminder: ${evidence.toolName} has identical arguments ${evidence.consecutiveCount} times in a row. Avoid looping over the same evidence.`
  }
  return evidence.reused
    ? `[Braincode evidence cache] Reusing cached read-only result for duplicate ${evidence.toolName} call${age}.`
    : `[Braincode evidence cache] Duplicate ${evidence.toolName} call detected; reuse prior evidence unless the arguments need to change.`
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return String(value)
  }
}
