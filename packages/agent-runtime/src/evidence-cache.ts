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
const EVIDENCE_CACHE_SUPPRESS_CONTENT_AFTER_CONSECUTIVE = 8
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
        if (cached) {
          touchToolEvidenceCacheEntry(cache, key, cached)
          return annotateToolEvidenceResult(cached.result, {
            toolName: tool.name,
            reused: true,
            callCount: count,
            consecutiveCount: cache.consecutiveCount,
            cacheAgeMs: Date.now() - cached.createdAt,
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
  return false
}

function toolInvalidatesEvidenceCache(toolName: string, args: unknown): boolean {
  if (isCacheableEvidenceToolCall(toolName, args)) return false
  const name = toolName.toLowerCase()
  return /(apply_patch|edit|write|patch|delete|remove|rm_|rename|move|create_file|create-file|filesystem__write|shell|exec|execute|run_command|run-command|terminal|bash|zsh|cmd|powershell|spawn|subprocess|run_script)/.test(name)
}

function annotateToolEvidenceResult<TDetails>(
  result: AgentToolResult<TDetails>,
  evidence: {
    toolName: string
    reused: boolean
    callCount: number
    consecutiveCount: number
    cacheAgeMs?: number
    cache: ToolEvidenceCache
  },
): AgentToolResult<TDetails> {
  const warning = formatEvidenceCacheReminder(evidence)
  const { cache, ...cacheEvidence } = evidence
  const details = addEvidenceCacheDetails(result.details, {
    ...cacheEvidence,
    warning,
    evictedEntries: cache.evictedEntries,
    currentEntries: cache.entries.size,
    approxBytes: cache.approxBytes,
  })
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
