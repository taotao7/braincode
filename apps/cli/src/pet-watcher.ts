import { useEffect, useRef, useState } from "react"
import { resolvePetRuntime, type ResolvedPetRuntime } from "@braincode/agent-runtime"
import { callPetCompletion } from "@braincode/llm"

export type PetWatcherSnapshotItem = {
  kind: string
  text: string
  toolName?: string
  toolStatus?: "running" | "ok" | "failed"
  workerStatus?: "running" | "completed" | "blocked" | "failed"
}

export type PetWatcherInput = {
  thinking: boolean
  recentItems: ReadonlyArray<PetWatcherSnapshotItem>
  queueLength: number
  pollIntervalMs?: number
}

export type PetWatcherState = {
  status?: string
  lines?: string[]
  source: "default" | "model" | "error"
}

const DEFAULT_INTERVAL_MS = 8000
const SNAPSHOT_MAX_ITEMS = 6
const TEXT_TRUNCATE = 140

export function usePetWatcher(input: PetWatcherInput): PetWatcherState {
  const [state, setState] = useState<PetWatcherState>({ source: "default" })
  const [runtime, setRuntime] = useState<ResolvedPetRuntime | null | undefined>(undefined)
  const inFlight = useRef<AbortController | null>(null)
  const latestRef = useRef(input)
  latestRef.current = input
  const fallback = buildDefaultPetState(input)

  useEffect(() => {
    let cancelled = false
    void resolvePetRuntime().then((resolved) => {
      if (!cancelled) setRuntime(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!input.thinking) {
      inFlight.current?.abort()
      inFlight.current = null
      return
    }
    if (!runtime) return

    const interval = input.pollIntervalMs ?? DEFAULT_INTERVAL_MS
    let stopped = false

    const tick = async () => {
      if (stopped) return
      if (inFlight.current) return
      const snapshot = buildSnapshot(latestRef.current)
      const controller = new AbortController()
      inFlight.current = controller
      try {
        const text = await callPetCompletion({
          model: runtime.model,
          apiKey: runtime.apiKey,
          systemPrompt: runtime.systemPrompt,
          userPrompt: snapshot,
          thinkingLevel: runtime.policy.thinkingLevel,
          signal: controller.signal,
          maxTokens: 160,
        })
        if (stopped) return
        const parsed = parsePetResponse(text)
        if (parsed) {
          setState((previous) => samePetState(previous, parsed) ? previous : { status: parsed.status, lines: parsed.lines, source: "model" })
        } else {
          setState((previous) => previous.source === "error" ? previous : { source: "error" })
        }
      } catch {
        if (!stopped) setState((previous) => previous.source === "error" ? previous : { ...previous, source: "error" })
      } finally {
        if (inFlight.current === controller) inFlight.current = null
      }
    }

    void tick()
    const handle = setInterval(() => {
      void tick()
    }, interval)
    return () => {
      stopped = true
      clearInterval(handle)
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [input.thinking, runtime, input.pollIntervalMs])

  if (input.thinking && state.source === "model") return state
  if (state.source === "error") return { ...fallback, source: "error" }
  return fallback
}

function samePetState(previous: PetWatcherState, next: { status: string; lines: string[] }): boolean {
  return previous.source === "model"
    && previous.status === next.status
    && sameLines(previous.lines, next.lines)
}

function sameLines(left: string[] | undefined, right: string[]): boolean {
  if (!left || left.length !== right.length) return false
  return left.every((line, index) => line === right[index])
}

function buildSnapshot(input: PetWatcherInput): string {
  const recent = input.recentItems.slice(-SNAPSHOT_MAX_ITEMS).map((item) => formatSnapshotItem(item))
  const activeTools = input.recentItems.filter((item) => item.kind === "tool" && item.toolStatus === "running").map((item) => item.toolName || "tool")
  const activeWorkers = input.recentItems.filter((item) => item.kind === "worker" && item.workerStatus === "running").map((item) => item.text)
  const lines = [
    `agent_state: ${input.thinking ? "running" : "idle"}`,
    `queue_length: ${input.queueLength}`,
    activeTools.length > 0 ? `active_tools: ${activeTools.join(", ")}` : "active_tools: none",
    activeWorkers.length > 0 ? `active_workers: ${activeWorkers.join("; ")}` : "active_workers: none",
    "",
    "recent (oldest first):",
    ...recent,
  ]
  return lines.join("\n")
}

function buildDefaultPetState(input: PetWatcherInput): PetWatcherState {
  if (!input.thinking) {
    return {
      source: "default",
      status: input.queueLength > 0 ? "queue watching" : "idle",
      lines: input.queueLength > 0
        ? [`${input.queueLength} queued`, "waiting for Enter"]
        : ["waiting for prompt", "desk is suspiciously calm"],
    }
  }

  const activeTool = lastMatching(
    input.recentItems,
    (item) => item.kind === "tool" && item.toolStatus === "running",
  )
  if (activeTool) {
    const toolName = activeTool.toolName ?? "tool"
    return {
      source: "default",
      status: shortPetText(`running ${toolName}`, 24),
      lines: [shortPetText(activeTool.text || toolName, 28), toolQuip(toolName)],
    }
  }

  const activeWorker = lastMatching(
    input.recentItems,
    (item) => item.kind === "worker" && item.workerStatus === "running",
  )
  if (activeWorker) {
    return {
      source: "default",
      status: "worker running",
      lines: [shortPetText(activeWorker.text, 28), "handoff in progress"],
    }
  }

  const latest = input.recentItems[input.recentItems.length - 1]
  if (latest?.kind === "tool") {
    if (latest.toolStatus === "failed") {
      return {
        source: "default",
        status: "tool complained",
        lines: [shortPetText(latest.toolName ?? "tool", 28), "reading the smoke"],
      }
    }
    if (latest.toolStatus === "ok") {
      return {
        source: "default",
        status: "tool done",
        lines: [shortPetText(latest.toolName ?? "tool", 28), toolQuip(latest.toolName ?? "")],
      }
    }
  }

  if (latest?.kind === "todo") {
    return {
      source: "default",
      status: "todo moving",
      lines: [shortPetText(latest.text, 28), "checkbox diplomacy"],
    }
  }

  if (latest?.kind === "assistant") {
    return {
      source: "default",
      status: "drafting reply",
      lines: [shortPetText(latest.text, 28), "words are lining up"],
    }
  }

  return {
    source: "default",
    status: "watching run",
    lines: input.queueLength > 0
      ? [`${input.queueLength} queued`, "queue has opinions"]
      : ["waiting on events", "terminal looks busy"],
  }
}

function lastMatching<T>(items: ReadonlyArray<T>, predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!
    if (predicate(item)) return item
  }
  return undefined
}

function shortPetText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function toolQuip(toolName: string): string {
  const lower = toolName.toLowerCase()
  if (/^(exec_command|shell|run_script|write_stdin)$/.test(lower)) return "terminal is noisy"
  if (/git|diff|patch/.test(lower)) return "diff has opinions"
  if (/test|check|tsc|lint/.test(lower)) return "tests negotiating"
  if (/read|search|grep|rg|list|get/.test(lower)) return "digging through files"
  if (/write|edit|apply/.test(lower)) return "patch dust settling"
  return "keeping one eye open"
}

function formatSnapshotItem(item: PetWatcherSnapshotItem): string {
  const text = item.text.replace(/\s+/g, " ").trim().slice(0, TEXT_TRUNCATE)
  if (item.kind === "tool") {
    return `- tool[${item.toolName ?? "?"}/${item.toolStatus ?? "?"}]: ${text}`
  }
  if (item.kind === "worker") {
    return `- worker[${item.workerStatus ?? "?"}]: ${text}`
  }
  return `- ${item.kind}: ${text}`
}

function parsePetResponse(raw: string): { status: string; lines: string[] } | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? sliceJsonObject(trimmed)
  if (!candidate) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const value = parsed as { status?: unknown; lines?: unknown }
  const status = typeof value.status === "string" ? value.status.trim() : ""
  const lines = Array.isArray(value.lines)
    ? value.lines.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim())
    : []
  if (!status && lines.length === 0) return null
  return { status, lines }
}

function sliceJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}
