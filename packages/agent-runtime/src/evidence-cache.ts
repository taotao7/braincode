import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"

type ToolEvidenceCacheEntry = {
  result: AgentToolResult<any>
  createdAt: number
}

export type ToolEvidenceCache = {
  entries: Map<string, ToolEvidenceCacheEntry>
  counts: Map<string, number>
  lastKey?: string
  consecutiveCount: number
}

const CACHEABLE_EVIDENCE_TOOLS = new Set(["list_files", "read_file", "search_files", "git_diff", "get_changed_files"])
const EVIDENCE_CACHE_SUPPRESS_CONTENT_AFTER_CONSECUTIVE = 8

export function createToolEvidenceCache(): ToolEvidenceCache {
  return {
    entries: new Map(),
    counts: new Map(),
    consecutiveCount: 0,
  }
}

export function wrapToolsWithEvidenceCache(tools: AgentTool[], cache: ToolEvidenceCache): AgentTool[] {
  return tools.map((tool) => {
    const wrapped: AgentTool = {
      ...tool,
      execute: async (toolCallId, params, signal, onUpdate) => {
        const key = toolEvidenceKey(tool.name, params)
        const count = recordToolEvidenceCall(cache, key)
        const cacheable = isCacheableEvidenceToolCall(tool.name, params)
        const cached = cacheable ? cache.entries.get(key) : undefined
        if (cached) {
          return annotateToolEvidenceResult(cached.result, {
            toolName: tool.name,
            reused: true,
            callCount: count,
            consecutiveCount: cache.consecutiveCount,
            cacheAgeMs: Date.now() - cached.createdAt,
          })
        }

        const result = await tool.execute(toolCallId, params as never, signal, onUpdate as never)
        if (toolInvalidatesEvidenceCache(tool.name, params)) {
          resetToolEvidenceCache(cache)
        } else if (cacheable) {
          cache.entries.set(key, { result, createdAt: Date.now() })
        }

        return annotateToolEvidenceResult(result, {
          toolName: tool.name,
          reused: false,
          callCount: count,
          consecutiveCount: cache.consecutiveCount,
        })
      },
    }
    return wrapped
  })
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
  cache.lastKey = undefined
  cache.consecutiveCount = 0
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
  },
): AgentToolResult<TDetails> {
  const warning = formatEvidenceCacheReminder(evidence)
  const details = addEvidenceCacheDetails(result.details, { ...evidence, warning })
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
