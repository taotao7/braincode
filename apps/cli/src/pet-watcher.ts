import { useEffect, useRef, useState } from "react"
import { resolvePetRuntime, type ResolvedPetRuntime } from "@braincode/agent-runtime"
import { callPetCompletion } from "@braincode/llm"

export type PetWatcherSnapshotItem = {
  kind: string
  text: string
  toolName?: string
  toolStatus?: "running" | "ok" | "failed"
  workerStatus?: "running" | "completed" | "failed"
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
          setState({ status: parsed.status, lines: parsed.lines, source: "model" })
        } else {
          setState({ source: "error" })
        }
      } catch {
        if (!stopped) setState((previous) => ({ ...previous, source: "error" }))
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

  return state
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
