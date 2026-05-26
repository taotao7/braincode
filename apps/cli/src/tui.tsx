import React, { useEffect, useMemo, useRef, useState } from "react"
import { Box, render, Text, useApp, useInput, useStdout } from "ink"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, relative } from "node:path"
import { executePromptFromConfig, planRuntimeFromConfig, type AgentEvent, type RuntimePlan, type WorkerLifecycleEvent } from "@braincode/agent-runtime"
import { extractMcpServerEntries, listSessions, readBrains, readHookSources, readProjectSupport, readSettings, readUserSupport, setHookHandlerEnabled, setMcpServerDisabled, writeSettings, type HookEventName, type HookHandler, type HookSource, type McpServerEntry, type ProjectSupport, type SessionSummary, type UserSupport } from "@braincode/config"
import type { BrainModel } from "@braincode/brain"
import { readClipboardImageOrText } from "./clipboard"
import { checkMcpHealth, type McpHealthResult } from "./mcp-health"
import { fuzzyFilter, listProjectFiles } from "./project-files"
import { BrainPet } from "./brain-pet"
import { usePetWatcher, type PetWatcherSnapshotItem } from "./pet-watcher"

type TranscriptItem = {
  id: string
  kind: "user" | "status" | "assistant" | "error" | "help" | "panel" | "tool" | "thinking" | "worker" | "queued"
  text: string
  plan?: RuntimePlan
  toolName?: string
  toolStatus?: "running" | "ok" | "failed"
  workerStatus?: "running" | "completed" | "failed"
  startedAt?: number
  finishedAt?: number
  queueId?: string
}

type QueuedTask = {
  id: string
  prompt: string
  displayText: string
  skipCommand: boolean
  forceRoles?: string[]
  itemId: string
}

type CommandDefinition = {
  name: string
  label: string
  hint: string
  insert?: string
  skill?: { id: string; scope: "user" | "project"; content: string; path: string }
}

const COMMANDS: CommandDefinition[] = [
  { name: "help", label: "/help", hint: "List all slash commands" },
  { name: "plan", label: "/plan", hint: "Preview Brain routing for a prompt", insert: "/plan " },
  { name: "mcp", label: "/mcp", hint: "Interactive MCP control panel" },
  { name: "hooks", label: "/hooks", hint: "Interactive hooks control panel" },
  { name: "sessions", label: "/sessions", hint: "Browse recent sessions" },
  { name: "resume", label: "/resume", hint: "Resume a session by id", insert: "/resume " },
  { name: "new", label: "/new", hint: "Start a fresh session (clears transcript)" },
  { name: "handoff", label: "/handoff", hint: "Fork a new session, carrying a brief of the current one", insert: "/handoff " },
  { name: "brain", label: "/brain", hint: "View Brain catalog and switch default brain" },
  { name: "team-test", label: "/team-test", hint: "Diagnostic: force every role to run the prompt in parallel", insert: "/team-test " },
  { name: "skill", label: "/skill", hint: "List project skills (.agents/skill)" },
  { name: "agents", label: "/agents", hint: "Show AGENTS.md location and length" },
  { name: "files", label: "/files", hint: "Refresh the @file index" },
  { name: "clear", label: "/clear", hint: "Clear transcript" },
  { name: "exit", label: "/exit", hint: "Quit the TUI" },
]

type Overlay =
  | { kind: "command"; filter: string; selected: number }
  | { kind: "file"; filter: string; selected: number; anchor: number }
  | { kind: "session"; filter: string; selected: number; anchor: number }
  | null

type McpPanelEntry = {
  scope: "user" | "project"
  filePath: string
  name: string
  entry: McpServerEntry
  health: "pending" | "skipped" | "ok" | "error"
  detail?: string
  toolCount?: number
  latencyMs?: number
  serverInfo?: { name?: string; version?: string }
}

type McpPanelState = {
  entries: McpPanelEntry[]
  selected: number
  message?: string
}

type HookPanelEntry = {
  scope: "user" | "project"
  filePath: string
  eventName: HookEventName
  matcher: string | undefined
  matcherIndex: number
  handlerIndex: number
  handler: HookHandler
}

type HookPanelState = {
  entries: HookPanelEntry[]
  selected: number
  message?: string
}

type SessionPanelState = {
  entries: SessionSummary[]
  selected: number
  message?: string
}

type BrainPanelState = {
  brains: BrainModel[]
  defaultBrainId: string
  selected: number
  message?: string
}

type BraincodeTuiProps = {
  initialPrompt?: string
}

export async function runTui(initialPrompt?: string): Promise<void> {
  const instance = render(<BraincodeTui initialPrompt={initialPrompt} />)
  await instance.waitUntilExit()
}

const INPUT_MAX_LINES = 6
const INPUT_RESERVED_COLUMNS = 4 // "› " prefix + cursor + a little padding

const BRAIN_LOGO: ReadonlyArray<string> = [
  "   ██████╗ ██████╗  █████╗ ██╗███╗   ██╗",
  "   ██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║",
  "   ██████╔╝██████╔╝███████║██║██╔██╗ ██║",
  "   ██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║",
  "   ██████╔╝██║  ██║██║  ██║██║██║ ╚████║",
  "   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝",
]

function BraincodeTui({ initialPrompt }: BraincodeTuiProps) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [terminalCols, setTerminalCols] = useState<number>(stdout?.columns ?? 80)
  useEffect(() => {
    if (!stdout) return
    const handler = () => setTerminalCols(stdout.columns ?? 80)
    stdout.on("resize", handler)
    return () => {
      stdout.off("resize", handler)
    }
  }, [stdout])
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID())
  const projectRoot = useMemo(() => process.cwd(), [])
  const [draft, setDraft] = useState(initialPrompt ?? "")
  const [cursor, setCursor] = useState((initialPrompt ?? "").length)
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [projectSupport, setProjectSupport] = useState<ProjectSupport | null>(null)
  const [userSupport, setUserSupport] = useState<UserSupport | null>(null)
  const [projectFiles, setProjectFiles] = useState<string[]>([])
  const [sessionSuggestions, setSessionSuggestions] = useState<SessionSummary[]>([])
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [mcpPanel, setMcpPanel] = useState<McpPanelState | null>(null)
  const [hookPanel, setHookPanel] = useState<HookPanelState | null>(null)
  const [sessionPanel, setSessionPanel] = useState<SessionPanelState | null>(null)
  const [brainPanel, setBrainPanel] = useState<BrainPanelState | null>(null)
  const [statusFlash, setStatusFlash] = useState<string>("")
  const initialRan = useRef(false)
  const lastEscapeAt = useRef(0)
  const DOUBLE_ESC_MS = 500
  const queueRef = useRef<QueuedTask[]>([])
  const [queueVersion, setQueueVersion] = useState(0)
  const bumpQueue = () => setQueueVersion((value) => value + 1)

  const petSnapshotItems = useMemo<PetWatcherSnapshotItem[]>(() => {
    return items.slice(-12).map((item) => ({
      kind: item.kind,
      text: item.text,
      toolName: item.toolName,
      toolStatus: item.toolStatus,
      workerStatus: item.workerStatus,
    }))
  }, [items])
  const petState = usePetWatcher({
    thinking: running,
    recentItems: petSnapshotItems,
    queueLength: queueRef.current.length,
  })

  const dynamicCommands = useMemo<CommandDefinition[]>(() => {
    const skills: CommandDefinition[] = []
    const seen = new Set<string>(COMMANDS.map((command) => command.name))
    const addSkills = (list: Array<{ id: string; path: string; content: string }> | undefined, scope: "user" | "project") => {
      if (!list) return
      for (const skill of list) {
        const safeId = skill.id.toLowerCase()
        if (seen.has(safeId)) continue
        seen.add(safeId)
        skills.push({
          name: safeId,
          label: `/${skill.id}`,
          hint: `Skill (${scope}) — invoke /${skill.id} <task>`,
          insert: `/${skill.id} `,
          skill: { id: skill.id, scope, content: skill.content, path: skill.path },
        })
      }
    }
    addSkills(projectSupport?.skills, "project")
    addSkills(userSupport?.skills, "user")
    return [...COMMANDS, ...skills]
  }, [projectSupport?.skills, userSupport?.skills])

  function filteredCommandsDynamic(filter: string): CommandDefinition[] {
    if (!filter) return dynamicCommands
    const lower = filter.toLowerCase()
    return dynamicCommands.filter((command) => command.name.startsWith(lower) || command.label.toLowerCase().includes(lower))
  }

  useEffect(() => {
    void (async () => {
      try {
        const support = await readProjectSupport(projectRoot)
        setProjectSupport(support)
      } catch (error) {
        appendItem({ kind: "error", text: `Failed to read project support: ${formatError(error)}` })
      }
      try {
        const support = await readUserSupport()
        setUserSupport(support)
      } catch (error) {
        appendItem({ kind: "error", text: `Failed to read user support: ${formatError(error)}` })
      }
      try {
        const files = await listProjectFiles(projectRoot)
        setProjectFiles(files)
      } catch (error) {
        appendItem({ kind: "error", text: `Failed to list project files: ${formatError(error)}` })
      }
      try {
        await refreshSessionSuggestions()
      } catch (error) {
        appendItem({ kind: "error", text: `Failed to list sessions: ${formatError(error)}` })
      }
    })()
  }, [projectRoot])

  useEffect(() => {
    if (initialRan.current) return
    initialRan.current = true
    if (initialPrompt?.trim()) {
      void submitPrompt(initialPrompt)
    }
  }, [])

  function appendItem(item: Omit<TranscriptItem, "id">) {
    setItems((previous) => [...previous, { id: crypto.randomUUID(), ...item }])
  }

  function flash(text: string) {
    setStatusFlash(text)
    setTimeout(() => setStatusFlash((current) => (current === text ? "" : current)), 2500)
  }

  function handleCommand(commandLine: string): boolean {
    const [commandRaw = "", ...rest] = commandLine.slice(1).trim().split(/\s+/)
    const command = commandRaw.toLowerCase()
    const argument = rest.join(" ").trim()

    const skillCommand = dynamicCommands.find((entry) => entry.name === command && entry.skill)
    if (skillCommand?.skill) {
      void invokeSkill(skillCommand.skill, argument)
      return true
    }

    switch (command) {
      case "help":
      case "?":
        appendItem({ kind: "help", text: formatHelp() })
        return true
      case "clear":
        setItems([])
        return true
      case "exit":
      case "quit":
        exit()
        return true
      case "plan":
        void previewPlan(argument)
        return true
      case "mcp":
        showMcpPanel(argument)
        return true
      case "hooks":
        void showHookPanel(argument)
        return true
      case "sessions":
        void showSessionPanel()
        return true
      case "resume":
        void resumeSession(argument)
        return true
      case "new":
        startNewSession()
        return true
      case "handoff":
      case "fork":
        void performHandoff(argument)
        return true
      case "brain":
        void showBrainPanel(argument)
        return true
      case "team-test":
        invokeTeamTest(argument)
        return true
      case "skill":
      case "skills":
        showSkillPanel(argument)
        return true
      case "agents":
        showAgentsPanel()
        return true
      case "files":
        void refreshFiles()
        return true
      default:
        appendItem({ kind: "error", text: `Unknown command: /${command}. Type /help for commands.` })
        return true
    }
  }

  async function refreshFiles() {
    appendItem({ kind: "status", text: "Refreshing project file index..." })
    try {
      const files = await listProjectFiles(projectRoot)
      setProjectFiles(files)
      flash(`Indexed ${files.length} files`)
    } catch (error) {
      appendItem({ kind: "error", text: `File index failed: ${formatError(error)}` })
    }
  }

  async function refreshSessionSuggestions(limit = 50): Promise<SessionSummary[]> {
    const sessions = await listSessions(undefined, limit)
    setSessionSuggestions(sessions)
    return sessions
  }

  function showAgentsPanel() {
    if (!projectSupport) {
      appendItem({ kind: "status", text: "Project support is still loading." })
      return
    }
    if (!projectSupport.agents) {
      appendItem({ kind: "panel", text: "AGENTS.md not found in this project." })
      return
    }
    const { path, content } = projectSupport.agents
    const lines = content.split(/\r?\n/).length
    appendItem({ kind: "panel", text: `AGENTS.md\n• path: ${path}\n• lines: ${lines}\n• bytes: ${content.length}` })
  }

  function collectMcpEntries(): McpPanelEntry[] {
    const entries: McpPanelEntry[] = []
    if (userSupport?.mcp) {
      for (const { name, entry } of extractMcpServerEntries(userSupport.mcp.config)) {
        entries.push({ scope: "user", filePath: userSupport.mcp.path, name, entry, health: "pending" })
      }
    }
    if (projectSupport?.mcp) {
      for (const { name, entry } of extractMcpServerEntries(projectSupport.mcp.config)) {
        entries.push({ scope: "project", filePath: projectSupport.mcp.path, name, entry, health: "pending" })
      }
    }
    return entries
  }

  function showMcpPanel(argument: string) {
    if (!projectSupport || !userSupport) {
      appendItem({ kind: "status", text: "Support config is still loading." })
      return
    }
    const entries = collectMcpEntries()
    if (entries.length === 0) {
      appendItem({ kind: "panel", text: "No MCP servers configured.\n• User-global: write ~/.braincode/mcp.json\n• Project-local: write .mcp.json (with `mcpServers` map)" })
      return
    }
    if (argument) {
      const target = [...entries].reverse().find((entry) => entry.name.toLowerCase() === argument.toLowerCase())
      if (!target) {
        appendItem({ kind: "error", text: `No MCP server named '${argument}'. Known: ${entries.map((entry) => entry.name).join(", ")}` })
        return
      }
      appendItem({
        kind: "panel",
        text: `${target.scope === "user" ? "User" : "Project"} · ${target.name}  →  ${target.filePath}\n${JSON.stringify(target.entry, null, 2)}`,
      })
      return
    }
    setOverlay(null)
    setMcpPanel({ entries, selected: 0 })
    for (let index = 0; index < entries.length; index++) {
      void runMcpHealth(index, entries[index]!)
    }
  }

  async function runMcpHealth(index: number, entry: McpPanelEntry) {
    if (entry.entry.disabled) {
      updateMcpEntry(entry.name, entry.filePath, () => ({ health: "skipped", detail: "disabled" }))
      return
    }
    const result = await checkMcpHealth({
      command: entry.entry.command,
      args: entry.entry.args,
      env: entry.entry.env,
      url: entry.entry.url,
      type: entry.entry.type,
    })
    updateMcpEntry(entry.name, entry.filePath, () => mergeHealth(result))
  }

  function updateMcpEntry(name: string, filePath: string, mutate: (entry: McpPanelEntry) => Partial<McpPanelEntry>) {
    setMcpPanel((previous) => {
      if (!previous) return previous
      const entries = previous.entries.map((entry) => {
        if (entry.name !== name || entry.filePath !== filePath) return entry
        return { ...entry, ...mutate(entry) }
      })
      return { ...previous, entries }
    })
  }

  async function toggleMcpEntry(target: McpPanelEntry) {
    const next = !target.entry.disabled
    try {
      await setMcpServerDisabled(target.filePath, target.name, next)
    } catch (error) {
      setMcpPanel((previous) => previous ? { ...previous, message: `Toggle failed: ${formatError(error)}` } : previous)
      return
    }
    updateMcpEntry(target.name, target.filePath, () => ({
      entry: { ...target.entry, disabled: next || undefined },
      health: next ? "skipped" : "pending",
      detail: next ? "disabled" : undefined,
      toolCount: undefined,
      latencyMs: undefined,
    }))
    setMcpPanel((previous) => previous ? { ...previous, message: `${target.name} ${next ? "disabled" : "enabled"}` } : previous)
    if (target.scope === "project" && projectSupport) {
      try {
        setProjectSupport(await readProjectSupport(projectRoot))
      } catch {
        // ignore reload error
      }
    }
    if (target.scope === "user") {
      try {
        setUserSupport(await readUserSupport())
      } catch {
        // ignore reload error
      }
    }
    if (!next) {
      const refreshed: McpPanelEntry = { ...target, entry: { ...target.entry, disabled: undefined }, health: "pending" }
      void runMcpHealth(0, refreshed)
    }
  }

  function viewMcpConfig(target: McpPanelEntry) {
    appendItem({
      kind: "panel",
      text: `${target.scope === "user" ? "User" : "Project"} · ${target.name}  →  ${target.filePath}\n${JSON.stringify(target.entry, null, 2)}`,
    })
  }

  function recheckMcp(target: McpPanelEntry) {
    if (target.entry.disabled) {
      setMcpPanel((previous) => previous ? { ...previous, message: `${target.name} is disabled; enable it first.` } : previous)
      return
    }
    updateMcpEntry(target.name, target.filePath, () => ({ health: "pending", detail: undefined, toolCount: undefined, latencyMs: undefined }))
    void runMcpHealth(0, { ...target, health: "pending" })
  }

  async function showHookPanel(argument: string) {
    let sources: HookSource[]
    try {
      sources = await readHookSources(undefined, projectRoot)
    } catch (error) {
      appendItem({ kind: "error", text: `Hook config failed: ${formatError(error)}` })
      return
    }
    const entries: HookPanelEntry[] = []
    for (const source of sources) {
      const eventNames = Object.keys(source.document.hooks) as HookEventName[]
      for (const eventName of eventNames.sort()) {
        const groups = source.document.hooks[eventName] ?? []
        groups.forEach((group, matcherIndex) => {
          group.hooks.forEach((handler, handlerIndex) => {
            entries.push({
              scope: source.kind,
              filePath: source.path,
              eventName,
              matcher: group.matcher,
              matcherIndex,
              handlerIndex,
              handler,
            })
          })
        })
      }
    }
    if (entries.length === 0) {
      appendItem({ kind: "panel", text: "No hooks configured.\n• User-global: ~/.braincode/hooks.json\n• Project-local: .agents/hooks.json" })
      return
    }
    if (argument) {
      const filter = argument.toLowerCase()
      const matches = entries.filter((entry) => entry.eventName.toLowerCase().includes(filter) || entry.handler.command?.toLowerCase().includes(filter))
      if (matches.length === 0) {
        appendItem({ kind: "error", text: `No hook matches '${argument}'.` })
        return
      }
      const lines = matches.map((entry) => `${entry.scope === "user" ? "user" : "proj"} · ${entry.eventName}${entry.matcher ? `[${entry.matcher}]` : ""} → ${entry.handler.command ?? "(no command)"}`)
      appendItem({ kind: "panel", text: lines.join("\n") })
      return
    }
    setMcpPanel(null)
    setOverlay(null)
    setHookPanel({ entries, selected: 0 })
  }

  async function toggleHookHandler(target: HookPanelEntry) {
    const nextEnabled = !(target.handler.enabled ?? true)
    try {
      await setHookHandlerEnabled(target.filePath, target.eventName, target.matcherIndex, target.handlerIndex, nextEnabled)
    } catch (error) {
      setHookPanel((previous) => previous ? { ...previous, message: `Toggle failed: ${formatError(error)}` } : previous)
      return
    }
    setHookPanel((previous) => {
      if (!previous) return previous
      const entries = previous.entries.map((entry, index) => {
        if (index !== previous.selected) return entry
        return { ...entry, handler: { ...entry.handler, enabled: nextEnabled } }
      })
      return { ...previous, entries, message: `${target.eventName} ${nextEnabled ? "enabled" : "disabled"}` }
    })
  }

  function viewHookHandler(target: HookPanelEntry) {
    appendItem({
      kind: "panel",
      text: `${target.scope === "user" ? "User" : "Project"} · ${target.eventName}${target.matcher ? ` [${target.matcher}]` : ""}  →  ${target.filePath}\n${JSON.stringify(target.handler, null, 2)}`,
    })
  }

  async function showSessionPanel() {
    let sessions: SessionSummary[]
    try {
      sessions = (await refreshSessionSuggestions(50)).slice(0, 25)
    } catch (error) {
      appendItem({ kind: "error", text: `Sessions failed: ${formatError(error)}` })
      return
    }
    if (sessions.length === 0) {
      appendItem({ kind: "panel", text: "No sessions recorded yet. Sessions land under ~/.braincode/sessions/." })
      return
    }
    setMcpPanel(null)
    setHookPanel(null)
    setOverlay(null)
    setSessionPanel({ entries: sessions, selected: 0 })
  }

  async function resumeSession(argument: string) {
    const trimmed = argument.trim()
    if (!trimmed) {
      void showSessionPanel()
      return
    }
    try {
      const sessions = await listSessions(undefined, 100)
      const target = sessions.find((entry) => entry.sessionId === trimmed || entry.sessionId.startsWith(trimmed))
      if (!target) {
        appendItem({ kind: "error", text: `Session '${trimmed}' not found.` })
        return
      }
      applyResume(target)
    } catch (error) {
      appendItem({ kind: "error", text: `Resume failed: ${formatError(error)}` })
    }
  }

  function applyResume(target: SessionSummary) {
    setSessionId(target.sessionId)
    setItems([
      { id: crypto.randomUUID(), kind: "status", text: `Resumed session ${target.sessionId.slice(0, 8)} (${target.status})` },
      ...(target.prompt ? [{ id: crypto.randomUUID(), kind: "user" as const, text: target.prompt }] : []),
      ...(target.summary ? [{ id: crypto.randomUUID(), kind: target.status === "failed" ? "error" as const : "assistant" as const, text: target.summary }] : []),
    ])
    setSessionPanel(null)
    flash(`Now writing to session ${target.sessionId.slice(0, 8)}`)
  }

  function resetSurfaces() {
    queueRef.current = []
    bumpQueue()
    setMcpPanel(null)
    setHookPanel(null)
    setSessionPanel(null)
    setBrainPanel(null)
    setOverlay(null)
  }

  function startNewSession() {
    if (running) {
      appendItem({ kind: "error", text: "Cannot start a new session while a task is running." })
      return
    }
    const newId = crypto.randomUUID()
    setSessionId(newId)
    resetSurfaces()
    setItems([
      { id: crypto.randomUUID(), kind: "status", text: `New session ${newId.slice(0, 8)}` },
    ])
    applyDraftChange("")
    flash("New session")
  }

  async function performHandoff(argument: string) {
    if (running) {
      appendItem({ kind: "error", text: "Cannot hand off while a task is running." })
      return
    }
    if (items.length === 0) {
      appendItem({ kind: "error", text: "Nothing to hand off yet — current session is empty." })
      return
    }

    const previousId = sessionId
    const focus = argument.trim()
    const summarizePrompt = [
      "You are producing a handoff brief so the next agent can continue this session.",
      "Read the prior turns of this session and output a concise brief covering:",
      "  1. The user's overall goal.",
      "  2. Key actions, decisions, and findings so far.",
      "  3. Current state / progress.",
      "  4. What remains to be done or any open questions.",
      "Format as short bullet points. Do not narrate that you are summarizing — output only the brief.",
      focus ? `\nExtra focus requested by the user: ${focus}` : "",
    ].filter(Boolean).join("\n")

    const statusId = crypto.randomUUID()
    setItems((previous) => [
      ...previous,
      { id: crypto.randomUUID(), kind: "user", text: focus ? `/handoff ${focus}` : "/handoff" },
      { id: statusId, kind: "status", text: "Summarizing this session for handoff..." },
    ])
    applyDraftChange("")
    setRunning(true)

    let summary = ""
    try {
      const result = await executePromptFromConfig({
        prompt: summarizePrompt,
        sessionId: previousId,
        projectRoot,
      })
      summary = (result.summary ?? "").trim()
    } catch (error) {
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        { id: crypto.randomUUID(), kind: "error", text: `Handoff summarization failed: ${humanizeRuntimeError(error)}` },
      ])
      setRunning(false)
      return
    }
    setRunning(false)

    if (!summary) {
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        { id: crypto.randomUUID(), kind: "error", text: "Summarization returned no text — aborting handoff." },
      ])
      return
    }

    const newId = crypto.randomUUID()
    setSessionId(newId)
    resetSurfaces()
    setItems([
      { id: crypto.randomUUID(), kind: "status", text: `Handoff ${previousId.slice(0, 8)} → ${newId.slice(0, 8)}` },
      { id: crypto.randomUUID(), kind: "panel", text: `Handoff brief (from prior session)\n\n${summary}` },
    ])
    const draftSeed = focus ? `@@${previousId} ${focus}` : `@@${previousId} `
    applyDraftChange(draftSeed)
    flash("Handoff ready — edit and submit to continue")
  }

  async function showBrainPanel(argument: string) {
    let document
    let settings
    try {
      ;[document, settings] = await Promise.all([readBrains(), readSettings()])
    } catch (error) {
      appendItem({ kind: "error", text: `Brain config failed: ${formatError(error)}` })
      return
    }
    const brains = (document.brains ?? []) as BrainModel[]
    if (brains.length === 0) {
      appendItem({ kind: "panel", text: "No brains in ~/.braincode/brains.json. Configure via `braincode config`." })
      return
    }
    if (argument) {
      const target = brains.find((brain) => brain.id.toLowerCase() === argument.toLowerCase())
      if (!target) {
        appendItem({ kind: "error", text: `Unknown brain '${argument}'. Known: ${brains.map((brain) => brain.id).join(", ")}` })
        return
      }
      appendItem({ kind: "panel", text: formatBrainDetail(target, settings.defaultBrainId) })
      return
    }
    const selected = Math.max(0, brains.findIndex((brain) => brain.id === settings.defaultBrainId))
    setSessionPanel(null)
    setHookPanel(null)
    setMcpPanel(null)
    setOverlay(null)
    setBrainPanel({ brains, defaultBrainId: settings.defaultBrainId, selected })
  }

  async function setDefaultBrain(target: BrainModel) {
    try {
      const current = await readSettings()
      if (current.defaultBrainId === target.id) {
        setBrainPanel((previous) => previous ? { ...previous, message: `${target.id} is already the default.` } : previous)
        return
      }
      await writeSettings({ ...current, defaultBrainId: target.id })
      setBrainPanel((previous) => previous ? { ...previous, defaultBrainId: target.id, message: `Default brain → ${target.id}` } : previous)
      flash(`Default brain → ${target.id}`)
    } catch (error) {
      setBrainPanel((previous) => previous ? { ...previous, message: `Update failed: ${formatError(error)}` } : previous)
    }
  }

  function viewBrainDetail(target: BrainModel) {
    appendItem({ kind: "panel", text: formatBrainDetail(target, brainPanel?.defaultBrainId ?? "") })
  }

  function showSkillPanel(argument: string) {
    if (!projectSupport || !userSupport) {
      appendItem({ kind: "status", text: "Support config is still loading." })
      return
    }
    const userSkills = userSupport.skills.map((skill) => ({ scope: "user" as const, ...skill }))
    const projectSkills = projectSupport.skills.map((skill) => ({ scope: "project" as const, ...skill }))
    const all = [...userSkills, ...projectSkills]
    if (all.length === 0) {
      appendItem({ kind: "panel", text: "No skills available.\n• User-global: ~/.braincode/skills/<id>/SKILL.md\n• Project-local: .agents/skill/<id>/SKILL.md" })
      return
    }
    if (!argument) {
      const lines: string[] = []
      if (userSkills.length > 0) {
        lines.push(`User skills (${userSkills.length}) — ${userSupport.home}/skills`)
        for (const skill of userSkills) {
          lines.push(`  • ${skill.id}  →  ${relative(userSupport.home, skill.path) || skill.path}`)
        }
        lines.push("")
      }
      if (projectSkills.length > 0) {
        lines.push(`Project skills (${projectSkills.length}) — ${projectSupport.root}`)
        for (const skill of projectSkills) {
          lines.push(`  • ${skill.id}  →  ${relative(projectRoot, skill.path) || skill.path}`)
        }
        lines.push("")
      }
      lines.push("Use /skill <id> to view the skill body (project shadows user when ids collide).")
      appendItem({ kind: "panel", text: lines.join("\n").trimEnd() })
      return
    }
    const target = [...projectSkills, ...userSkills].find((skill) => skill.id.toLowerCase() === argument.toLowerCase())
    if (!target) {
      appendItem({ kind: "error", text: `Unknown skill '${argument}'. Known: ${all.map((skill) => skill.id).join(", ")}` })
      return
    }
    const trimmed = target.content.length > 4000 ? `${target.content.slice(0, 4000)}\n…(truncated)` : target.content
    appendItem({ kind: "panel", text: `${target.scope === "user" ? "User" : "Project"} · ${target.id}  →  ${target.path}\n\n${trimmed}` })
  }

  const ALL_ROLES = ["coding", "frontend", "backend", "designer", "dba", "devops", "security", "qa", "research", "review", "summarize", "fastReply", "oracle", "librarian", "rush"]

  function invokeTeamTest(argument: string) {
    const promptArg = argument.trim()
    if (!promptArg) {
      appendItem({ kind: "error", text: "/team-test <prompt> needs a prompt to dispatch to every role." })
      return
    }
    const displayText = `/team-test ${promptArg}`
    if (!running) {
      appendItem({ kind: "panel", text: `Diagnostic /team-test · dispatching to ${ALL_ROLES.length} roles: ${ALL_ROLES.join(", ")}` })
    }
    void submitPrompt(promptArg, { displayText, skipCommand: true, forceRoles: ALL_ROLES })
  }

  async function invokeSkill(skill: { id: string; scope: "user" | "project"; content: string; path: string }, argument: string) {
    const task = argument.trim()
    const skillPrompt = [
      `[Skill activation: ${skill.id} (${skill.scope})]`,
      "Use the instructions below as your operating playbook for this task. Apply them when relevant; do not narrate the playbook back unless asked.",
      "",
      "----- SKILL INSTRUCTIONS -----",
      skill.content.trim(),
      "----- END SKILL INSTRUCTIONS -----",
      "",
      task ? `Task:\n${task}` : "Task: (no explicit user task — proceed using the skill defaults).",
    ].join("\n")
    const displayText = task
      ? `/${skill.id} ${task}`
      : `/${skill.id}  (skill: ${skill.scope})`
    void submitPrompt(skillPrompt, { displayText, skipCommand: true })
  }

  async function previewPlan(prompt: string) {
    const trimmed = prompt.trim()
    if (!trimmed) {
      appendItem({ kind: "error", text: "Usage: /plan <prompt>" })
      return
    }
    if (running) return

    const statusId = crypto.randomUUID()
    setItems((previous) => [
      ...previous,
      { id: crypto.randomUUID(), kind: "user", text: `/plan ${trimmed}` },
      { id: statusId, kind: "status", text: "Planning Braincode route..." },
    ])
    applyDraftChange("")
    setRunning(true)

    try {
      const plan = await planRuntimeFromConfig(trimmed)
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        {
          id: crypto.randomUUID(),
          kind: "status",
          text: `${plan.brain.id} → ${plan.role} → ${plan.piModel.provider}/${plan.piModel.id}`,
          plan,
        },
      ])
    } catch (error) {
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        { id: crypto.randomUUID(), kind: "error", text: formatError(error) },
      ])
    } finally {
      setRunning(false)
      void refreshSessionSuggestions()
    }
  }

  function enqueueTask(prompt: string, options: { displayText?: string; skipCommand?: boolean; forceRoles?: string[] } = {}): boolean {
    const trimmed = prompt.trim()
    if (!trimmed) return false
    const displayText = options.displayText ?? trimmed
    const itemId = crypto.randomUUID()
    const task: QueuedTask = {
      id: crypto.randomUUID(),
      prompt: trimmed,
      displayText,
      skipCommand: options.skipCommand ?? false,
      forceRoles: options.forceRoles,
      itemId,
    }
    queueRef.current = [...queueRef.current, task]
    setItems((previous) => [...previous, { id: itemId, kind: "queued", text: `queued · ${truncate(displayText.replace(/\s+/g, " ").trim(), 140)}`, queueId: task.id }])
    bumpQueue()
    applyDraftChange("")
    return true
  }

  async function drainQueue() {
    while (queueRef.current.length > 0) {
      const next = queueRef.current[0]!
      queueRef.current = queueRef.current.slice(1)
      bumpQueue()
      setItems((previous) => previous.filter((item) => item.id !== next.itemId))
      await submitPrompt(next.prompt, {
        displayText: next.displayText,
        skipCommand: next.skipCommand,
        forceRoles: next.forceRoles,
      })
    }
  }

  async function submitPrompt(prompt: string, options: { displayText?: string; skipCommand?: boolean; forceRoles?: string[] } = {}) {
    const trimmed = prompt.trim()
    if (!trimmed) return

    if (running) {
      enqueueTask(trimmed, options)
      flash(`Queued (${queueRef.current.length} pending)`)
      return
    }

    if (!options.skipCommand && trimmed.startsWith("/")) {
      applyDraftChange("")
      handleCommand(trimmed)
      return
    }

    const displayText = options.displayText ?? trimmed
    const userItem: TranscriptItem = { id: crypto.randomUUID(), kind: "user", text: displayText }
    const statusId = crypto.randomUUID()
    setItems((previous) => [
      ...previous,
      userItem,
      { id: statusId, kind: "status", text: "Routing through Braincode..." },
    ])
    applyDraftChange("")
    setRunning(true)

    const currentAssistant = { id: null as string | null, text: "" }
    const currentThinking = { id: null as string | null, text: "" }
    const toolItems = new Map<string, { itemId: string; toolName: string; startedAt: number; argsSummary: string }>()

    const updateItem = (itemId: string, patch: Partial<TranscriptItem>) => {
      setItems((previous) => previous.map((item) => item.id === itemId ? { ...item, ...patch } : item))
    }
    const appendItemRaw = (item: TranscriptItem) => {
      setItems((previous) => [...previous, item])
    }
    const updateStatus = (next: string) => {
      updateItem(statusId, { text: next })
    }
    const finalizeStreamingBuffers = () => {
      if (currentAssistant.id && currentAssistant.text.length === 0) {
        const id = currentAssistant.id
        setItems((previous) => previous.filter((item) => item.id !== id))
      }
      currentAssistant.id = null
      currentAssistant.text = ""
      if (currentThinking.id && currentThinking.text.length === 0) {
        const id = currentThinking.id
        setItems((previous) => previous.filter((item) => item.id !== id))
      }
      currentThinking.id = null
      currentThinking.text = ""
    }
    const ensureAssistantItem = () => {
      if (currentAssistant.id) return currentAssistant.id
      const id = crypto.randomUUID()
      currentAssistant.id = id
      currentAssistant.text = ""
      appendItemRaw({ id, kind: "assistant", text: "" })
      return id
    }
    const ensureThinkingItem = () => {
      if (currentThinking.id) return currentThinking.id
      const id = crypto.randomUUID()
      currentThinking.id = id
      currentThinking.text = ""
      appendItemRaw({ id, kind: "thinking", text: "" })
      return id
    }

    const onEvent = (event: AgentEvent) => {
      switch (event.type) {
        case "agent_start":
          updateStatus("Agent starting…")
          return
        case "turn_start":
          finalizeStreamingBuffers()
          updateStatus("Turn in progress…")
          return
        case "message_update": {
          const update = event.assistantMessageEvent
          if (update.type === "text_delta") {
            const id = ensureAssistantItem()
            currentAssistant.text += update.delta
            updateItem(id, { text: currentAssistant.text })
          } else if (update.type === "thinking_delta") {
            const id = ensureThinkingItem()
            currentThinking.text += update.delta
            updateItem(id, { text: truncateForStatus(currentThinking.text) })
          } else if (update.type === "toolcall_start") {
            updateStatus("Preparing tool call…")
          } else if (update.type === "toolcall_end") {
            const callName = update.toolCall?.name ?? ""
            if (callName) updateStatus(`Tool args ready: ${callName}`)
          }
          return
        }
        case "tool_execution_start": {
          finalizeStreamingBuffers()
          const itemId = crypto.randomUUID()
          const argsSummary = summarizeToolArgs(event.args)
          toolItems.set(event.toolCallId, { itemId, toolName: event.toolName, startedAt: Date.now(), argsSummary })
          appendItemRaw({
            id: itemId,
            kind: "tool",
            toolStatus: "running",
            toolName: event.toolName,
            startedAt: Date.now(),
            text: `${event.toolName}  ${argsSummary}`,
          })
          updateStatus(`Running tool: ${event.toolName}`)
          return
        }
        case "tool_execution_update": {
          const tracked = toolItems.get(event.toolCallId)
          if (!tracked) return
          updateStatus(`${event.toolName} · streaming…`)
          return
        }
        case "tool_execution_end": {
          const tracked = toolItems.get(event.toolCallId)
          if (!tracked) return
          toolItems.delete(event.toolCallId)
          const elapsed = Date.now() - tracked.startedAt
          updateItem(tracked.itemId, {
            toolStatus: event.isError ? "failed" : "ok",
            finishedAt: Date.now(),
            text: `${event.toolName}  ${tracked.argsSummary}  →  ${event.isError ? "failed" : "ok"} (${elapsed}ms)  ${summarizeToolResult(event.result)}`,
          })
          updateStatus(`${event.isError ? "Tool failed" : "Tool done"}: ${event.toolName}`)
          return
        }
        case "turn_end":
          finalizeStreamingBuffers()
          updateStatus("Turn complete · waiting for next step…")
          return
        case "agent_end":
          finalizeStreamingBuffers()
          updateStatus("Agent finished.")
          return
      }
    }

    const workerItems = new Map<string, { itemId: string; startedAt: number }>()
    const workerKey = (event: WorkerLifecycleEvent) => `${event.phase}:${event.role}`
    const onWorkerEvent = (event: WorkerLifecycleEvent) => {
      finalizeStreamingBuffers()
      const key = workerKey(event)
      if (event.type === "worker_start") {
        const itemId = crypto.randomUUID()
        workerItems.set(key, { itemId, startedAt: Date.now() })
        appendItemRaw({
          id: itemId,
          kind: "worker",
          workerStatus: "running",
          startedAt: Date.now(),
          text: `${event.phase === "review" ? "review" : "worker"} · ${event.role}  →  ${event.modelId}  ${event.goal ? `· goal: ${truncate(event.goal, 80)}` : ""}`,
        })
        updateStatus(`Worker ${event.role} running…`)
        return
      }
      // worker_end
      const tracked = workerItems.get(key)
      const itemId = tracked?.itemId
      const elapsed = tracked ? Date.now() - tracked.startedAt : undefined
      if (itemId) workerItems.delete(key)
      const text = event.status === "completed"
        ? `${event.phase === "review" ? "review" : "worker"} · ${event.role}  →  done${elapsed ? ` (${elapsed}ms)` : ""}  ${event.summary ? truncate(event.summary, 160) : ""}`
        : `${event.phase === "review" ? "review" : "worker"} · ${event.role}  →  failed${elapsed ? ` (${elapsed}ms)` : ""}  ${event.error ? truncate(event.error, 160) : ""}`
      if (itemId) {
        updateItem(itemId, {
          workerStatus: event.status,
          finishedAt: Date.now(),
          text,
        })
      } else {
        appendItemRaw({ id: crypto.randomUUID(), kind: "worker", workerStatus: event.status, finishedAt: Date.now(), text })
      }
      updateStatus(`Worker ${event.role} ${event.status}.`)
    }

    const onMcpReport = (report: import("@braincode/agent-runtime").McpHubConnectReport) => {
      if (report.toolCount === 0 && report.failed.length === 0 && report.skipped.length === 0) return
      const parts: string[] = []
      if (report.toolCount > 0) parts.push(`${report.toolCount} MCP tools from ${report.connected.length} server${report.connected.length === 1 ? "" : "s"}`)
      if (report.failed.length > 0) parts.push(`failed: ${report.failed.map((entry) => `${entry.name}(${truncate(entry.error, 40)})`).join(", ")}`)
      if (report.skipped.length > 0) parts.push(`skipped: ${report.skipped.map((entry) => `${entry.name}(${entry.reason})`).join(", ")}`)
      const text = `MCP · ${parts.join(" · ")}`
      setItems((previous) => previous.map((item) => item.id === statusId ? { ...item, text } : item))
    }

    try {
      const result = await executePromptFromConfig({ prompt: trimmed, sessionId, projectRoot, onEvent, onMcpReport, onWorkerEvent, forceRoles: options.forceRoles as never })
      finalizeStreamingBuffers()
      setItems((previous) => {
        const next = previous.filter((item) => item.id !== statusId)
        next.push({
          id: crypto.randomUUID(),
          kind: "status",
          text: `${result.plan.brain.id} → ${result.plan.role} → ${result.plan.piModel.provider}/${result.plan.piModel.id}`,
          plan: result.plan,
        })
        const trimmedSummary = (result.summary ?? "").trim()
        const hasMatchingAssistant = trimmedSummary && previous.some((item) => item.kind === "assistant" && item.text.trim() === trimmedSummary)
        const sawAssistantText = previous.some((item) => item.kind === "assistant" && item.text.trim().length > 0)
        if (trimmedSummary && !hasMatchingAssistant) {
          next.push({ id: crypto.randomUUID(), kind: "assistant", text: trimmedSummary })
        } else if (!trimmedSummary && !sawAssistantText) {
          next.push({ id: crypto.randomUUID(), kind: "assistant", text: "(model returned no text — check tool calls above or run /sessions to inspect)" })
        }
        return next
      })
    } catch (error) {
      finalizeStreamingBuffers()
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        { id: crypto.randomUUID(), kind: "error", text: humanizeRuntimeError(error) },
      ])
    } finally {
      setRunning(false)
    }
    if (queueRef.current.length > 0) {
      void drainQueue()
    }
  }

  function applyDraftChange(next: string, nextCursor?: number) {
    const cursorPosition = clamp(nextCursor ?? next.length, 0, next.length)
    setDraft(next)
    setCursor(cursorPosition)
    setOverlay(computeOverlay(next, cursorPosition, overlay))
  }

  function insertAtCursor(insertion: string) {
    const before = draft.slice(0, cursor)
    const after = draft.slice(cursor)
    applyDraftChange(`${before}${insertion}${after}`, cursor + insertion.length)
  }

  function deleteBeforeCursor() {
    if (cursor === 0) return
    const before = draft.slice(0, cursor - 1)
    const after = draft.slice(cursor)
    applyDraftChange(`${before}${after}`, cursor - 1)
  }

  function deleteAfterCursor() {
    if (cursor >= draft.length) return
    const before = draft.slice(0, cursor)
    const after = draft.slice(cursor + 1)
    applyDraftChange(`${before}${after}`, cursor)
  }

  function moveCursor(delta: number) {
    setCursor((current) => clamp(current + delta, 0, draft.length))
  }

  async function handlePaste() {
    const dir = join(homedir(), ".braincode", "sessions", sessionId)
    try {
      await mkdir(dir, { recursive: true })
    } catch {
      // ignore
    }
    const target = join(dir, `pasted-${Date.now()}.png`)
    const result = await readClipboardImageOrText(target)
    if (result.kind === "image") {
      const token = `@${result.path}`
      insertAtCursor(`${draft.length === 0 || draft.slice(0, cursor).endsWith(" ") ? "" : " "}${token} `)
      flash(`Pasted image → ${relative(projectRoot, result.path) || result.path}`)
      return
    }
    if (result.kind === "text") {
      insertAtCursor(result.text)
      return
    }
    if (result.kind === "empty") {
      flash("Clipboard is empty")
      return
    }
    appendItem({ kind: "error", text: `Paste failed: ${result.reason}` })
  }

  function acceptOverlay() {
    if (!overlay) return false
    if (overlay.kind === "command") {
      const filtered = filteredCommandsDynamic(overlay.filter)
      const command = filtered[overlay.selected] ?? filtered[0]
      if (!command) return false
      if (command.insert) {
        applyDraftChange(command.insert)
      } else {
        setDraft("")
        setOverlay(null)
        handleCommand(`/${command.name}`)
      }
      return true
    }
    if (overlay.kind === "file") {
      const matches = fuzzyFilter(projectFiles, overlay.filter, 12)
      const target = matches[overlay.selected] ?? matches[0]
      if (!target) return false
      const before = draft.slice(0, overlay.anchor)
      const tail = draft.slice(overlay.anchor + 1 + overlay.filter.length)
      const insertion = `@${target} `
      applyDraftChange(`${before}${insertion}${tail}`, before.length + insertion.length)
      return true
    }
    if (overlay.kind === "session") {
      const matches = filterSessions(sessionSuggestions, overlay.filter, 12)
      const target = matches[overlay.selected] ?? matches[0]
      if (!target) {
        void refreshSessionSuggestions()
        return false
      }
      const before = draft.slice(0, overlay.anchor)
      const tail = draft.slice(overlay.anchor + 2 + overlay.filter.length)
      const insertion = `@@${target.sessionId} `
      applyDraftChange(`${before}${insertion}${tail}`, before.length + insertion.length)
      return true
    }
    return false
  }

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }

    if (key.escape) {
      const now = Date.now()
      const closedOverlay = mcpPanel || hookPanel || sessionPanel || brainPanel || overlay
      if (closedOverlay) {
        setMcpPanel(null)
        setHookPanel(null)
        setSessionPanel(null)
        setBrainPanel(null)
        setOverlay(null)
        lastEscapeAt.current = now
        return
      }
      if (draft.length > 0 && now - lastEscapeAt.current <= DOUBLE_ESC_MS) {
        applyDraftChange("")
        lastEscapeAt.current = 0
        flash("Input cleared")
        return
      }
      lastEscapeAt.current = now
      if (draft.length > 0) flash("Press Esc again to clear input")
      return
    }

    if (mcpPanel) {
      const total = mcpPanel.entries.length
      const nextMove = key.downArrow || (key.ctrl && input === "n")
      const prevMove = key.upArrow || (key.ctrl && input === "p")
      if (total > 0 && (nextMove || prevMove)) {
        const delta = nextMove ? 1 : -1
        setMcpPanel({ ...mcpPanel, selected: (mcpPanel.selected + delta + total) % total, message: undefined })
        return
      }
      const target = mcpPanel.entries[mcpPanel.selected]
      if (!target) return
      if (key.return || (key.ctrl && input === "r")) {
        recheckMcp(target)
        return
      }
      if (input === " " || input === "e") {
        void toggleMcpEntry(target)
        return
      }
      if (input === "v") {
        viewMcpConfig(target)
        return
      }
      return
    }

    if (hookPanel) {
      if (key.escape) {
        setHookPanel(null)
        return
      }
      const total = hookPanel.entries.length
      const nextMove = key.downArrow || (key.ctrl && input === "n")
      const prevMove = key.upArrow || (key.ctrl && input === "p")
      if (total > 0 && (nextMove || prevMove)) {
        const delta = nextMove ? 1 : -1
        setHookPanel({ ...hookPanel, selected: (hookPanel.selected + delta + total) % total, message: undefined })
        return
      }
      const target = hookPanel.entries[hookPanel.selected]
      if (!target) return
      if (input === " " || input === "e") {
        void toggleHookHandler(target)
        return
      }
      if (input === "v" || key.return) {
        viewHookHandler(target)
        return
      }
      return
    }

    if (brainPanel) {
      if (key.escape) {
        setBrainPanel(null)
        return
      }
      const total = brainPanel.brains.length
      const nextMove = key.downArrow || (key.ctrl && input === "n")
      const prevMove = key.upArrow || (key.ctrl && input === "p")
      if (total > 0 && (nextMove || prevMove)) {
        const delta = nextMove ? 1 : -1
        setBrainPanel({ ...brainPanel, selected: (brainPanel.selected + delta + total) % total, message: undefined })
        return
      }
      const target = brainPanel.brains[brainPanel.selected]
      if (!target) return
      if (key.return || input === "s") {
        void setDefaultBrain(target)
        return
      }
      if (input === "v") {
        viewBrainDetail(target)
        return
      }
      return
    }

    if (sessionPanel) {
      if (key.escape) {
        setSessionPanel(null)
        return
      }
      const total = sessionPanel.entries.length
      const nextMove = key.downArrow || (key.ctrl && input === "n")
      const prevMove = key.upArrow || (key.ctrl && input === "p")
      if (total > 0 && (nextMove || prevMove)) {
        const delta = nextMove ? 1 : -1
        setSessionPanel({ ...sessionPanel, selected: (sessionPanel.selected + delta + total) % total, message: undefined })
        return
      }
      const target = sessionPanel.entries[sessionPanel.selected]
      if (!target) return
      if (key.return) {
        applyResume(target)
        return
      }
      if (input === "v") {
        appendItem({ kind: "panel", text: `${target.sessionId}\n  path: ${target.path}\n  status: ${target.status}\n  prompt: ${target.prompt ?? "(none)"}\n  summary: ${target.summary ?? "(none)"}` })
        return
      }
      return
    }

    if (key.ctrl && (input === "v" || input === "\x16")) {
      void handlePaste()
      return
    }

    if (overlay) {
      const total = overlay.kind === "command"
        ? filteredCommandsDynamic(overlay.filter).length
        : overlay.kind === "file"
          ? fuzzyFilter(projectFiles, overlay.filter, 12).length
          : filterSessions(sessionSuggestions, overlay.filter, 12).length
      const moveNext = key.downArrow || (key.ctrl && input === "n")
      const movePrev = key.upArrow || (key.ctrl && input === "p")
      if (total > 0 && (moveNext || movePrev)) {
        const delta = moveNext ? 1 : -1
        setOverlay({ ...overlay, selected: (overlay.selected + delta + total) % total })
        return
      }
    }

    if (overlay && key.tab) {
      if (acceptOverlay()) return
    }

    if (key.return) {
      if (overlay && acceptOverlay()) return
      void submitPrompt(draft)
      return
    }

    if (key.upArrow && !overlay && queueRef.current.length > 0) {
      const queue = queueRef.current
      const last = queue[queue.length - 1]!
      queueRef.current = queue.slice(0, -1)
      bumpQueue()
      setItems((previous) => previous.filter((item) => item.id !== last.itemId))
      applyDraftChange(last.displayText.startsWith("/") ? last.displayText : last.prompt)
      flash(`Editing queued task (${queueRef.current.length} still pending)`)
      return
    }

    if (key.leftArrow) {
      moveCursor(-1)
      return
    }
    if (key.rightArrow) {
      moveCursor(1)
      return
    }
    if (key.ctrl && input === "a") {
      setCursor(0)
      return
    }
    if (key.ctrl && input === "e") {
      setCursor(draft.length)
      return
    }
    if (key.ctrl && input === "u") {
      applyDraftChange(draft.slice(cursor), 0)
      return
    }
    if (key.ctrl && input === "k") {
      applyDraftChange(draft.slice(0, cursor), cursor)
      return
    }
    if (key.ctrl && input === "w") {
      if (cursor === 0) return
      const before = draft.slice(0, cursor)
      const after = draft.slice(cursor)
      const trimmedBefore = before.replace(/[^\s]*\s*$/u, "")
      applyDraftChange(`${trimmedBefore}${after}`, trimmedBefore.length)
      return
    }
    if (key.backspace || key.delete) {
      deleteBeforeCursor()
      return
    }
    if (key.ctrl && input === "d") {
      deleteAfterCursor()
      return
    }

    if (!key.ctrl && !key.meta && input && !key.escape) {
      insertAtCursor(input)
    }
  })

  const commandMatches = overlay?.kind === "command" ? filteredCommandsDynamic(overlay.filter) : []
  const fileMatches = overlay?.kind === "file" ? fuzzyFilter(projectFiles, overlay.filter, 12) : []
  const sessionMatches = overlay?.kind === "session" ? filterSessions(sessionSuggestions, overlay.filter, 12) : []
  const projectMcpCount = projectSupport?.mcp?.serverNames.length ?? 0
  const userMcpCount = userSupport?.mcp?.serverNames.length ?? 0
  const projectSkillCount = projectSupport?.skills.length ?? 0
  const userSkillCount = userSupport?.skills.length ?? 0

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Box flexDirection="column">
          <Text color="cyan" bold>BRAIN / CODE</Text>
          <Text color="gray">
            session {sessionId.slice(0, 8)} · {relative(homedir(), projectRoot) || projectRoot}
          </Text>
          <Text color="gray">
            project: {projectSupport ? `AGENTS.md ${projectSupport.agents ? "✓" : "·"}  mcp:${projectMcpCount}  skills:${projectSkillCount}` : "loading…"}
          </Text>
          <Text color="gray">
            user: {userSupport ? `mcp:${userMcpCount}  skills:${userSkillCount}` : "loading…"}
          </Text>
        </Box>
      </Box>

      {items.length === 0 ? (
        <Box flexDirection="column" alignItems="center" marginY={1}>
          {BRAIN_LOGO.map((line, index) => (
            <Text key={`logo-${index}`} color="cyan" bold>{line}</Text>
          ))}
          <Box marginTop={1}>
            <Text color="gray">type a prompt to begin · / for commands · @ for files · @@ for sessions</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          {items.map((item) => (
            <Box key={item.id} flexDirection="column" marginBottom={1}>
              <Text color={colorFor(item)}>{labelFor(item)} {item.text}</Text>
              {item.plan ? <Text color="gray">mode={item.plan.mode} routing={item.plan.routing.source} toolExecution={item.plan.toolExecution}</Text> : null}
            </Box>
          ))}
        </Box>
      )}

      {brainPanel ? (
        <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} marginBottom={1}>
          <Text color="cyan" bold>Brains</Text>
          {brainPanel.brains.map((brain, index) => (
            <Box key={brain.id} flexDirection="column">
              <Text color={index === brainPanel.selected ? "green" : undefined}>
                {index === brainPanel.selected ? "›" : " "} {brain.id === brainPanel.defaultBrainId ? "★" : " "} {brain.id} · planner={brain.planner.modelId} · coding={brain.roles.coding.modelId}
              </Text>
              <Text color="gray">    {truncate(brain.description ?? "", 120)}</Text>
            </Box>
          ))}
          {brainPanel.message ? <Text color="cyan">{brainPanel.message}</Text> : null}
          <Text color="gray">↑↓ / Ctrl+P/N navigate · Enter/s set as default · v show roles · Esc close</Text>
        </Box>
      ) : null}

      {sessionPanel ? (
        <Box borderStyle="round" borderColor="blue" flexDirection="column" paddingX={1} marginBottom={1}>
          <Text color="blue" bold>Sessions</Text>
          {sessionPanel.entries.map((entry, index) => (
            <Box key={entry.sessionId} flexDirection="column">
              <Text color={index === sessionPanel.selected ? "green" : undefined}>
                {index === sessionPanel.selected ? "›" : " "} {sessionStatusGlyph(entry.status)} {entry.sessionId.slice(0, 8)} · {formatTimestamp(entry.updatedAt)}{entry.role ? ` · ${entry.role}` : ""}
              </Text>
              {entry.prompt ? <Text color="gray">    {truncate(entry.prompt.replace(/\s+/g, " ").trim(), 120)}</Text> : null}
            </Box>
          ))}
          {sessionPanel.message ? <Text color="cyan">{sessionPanel.message}</Text> : null}
          <Text color="gray">↑↓ / Ctrl+P/N navigate · Enter resume · v details · Esc close</Text>
        </Box>
      ) : null}

      {hookPanel ? (
        <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1} marginBottom={1}>
          <Text color="yellow" bold>Hooks</Text>
          {hookPanel.entries.map((entry, index) => (
            <Box key={`${entry.scope}:${entry.eventName}:${entry.matcherIndex}:${entry.handlerIndex}`} flexDirection="column">
              <Text color={index === hookPanel.selected ? "green" : undefined}>
                {index === hookPanel.selected ? "›" : " "} {entry.handler.enabled === false ? "○" : "●"} {entry.scope === "user" ? "user" : "proj"} · {entry.eventName}{entry.matcher ? `[${entry.matcher}]` : ""}{entry.handler.trusted ? " · trusted" : ""}
              </Text>
              <Text color="gray">    {truncate(entry.handler.command ?? entry.handler.commandWindows ?? entry.handler.command_windows ?? "(no command)", 120)}</Text>
            </Box>
          ))}
          {hookPanel.message ? <Text color="cyan">{hookPanel.message}</Text> : null}
          <Text color="gray">↑↓ / Ctrl+P/N navigate · Enter/v view · Space/e enable·disable · Esc close</Text>
        </Box>
      ) : null}

      {mcpPanel ? (
        <Box borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1} marginBottom={1}>
          <Text color="magenta" bold>MCP servers</Text>
          {mcpPanel.entries.map((entry, index) => (
            <Box key={`${entry.scope}:${entry.name}`} flexDirection="column">
              <Text color={index === mcpPanel.selected ? "green" : undefined}>
                {index === mcpPanel.selected ? "›" : " "} {healthGlyph(entry)} {entry.scope === "user" ? "user" : "proj"} · {entry.name}{entry.entry.disabled ? " (disabled)" : ""}
              </Text>
              <Text color="gray">    {describeMcpEntry(entry.entry)} — {describeHealth(entry)}</Text>
            </Box>
          ))}
          {mcpPanel.message ? <Text color="cyan">{mcpPanel.message}</Text> : null}
          <Text color="gray">↑↓ / Ctrl+P/N navigate · Enter recheck · Space/e enable·disable · v view config · Esc close</Text>
        </Box>
      ) : null}

      {overlay?.kind === "command" ? (
        <Box borderStyle="single" borderColor="magenta" flexDirection="column" paddingX={1} marginBottom={1}>
          <Text color="magenta">Commands {overlay.filter ? `(/${overlay.filter})` : ""}</Text>
          {commandMatches.length === 0 ? (
            <Text color="gray">No matching command</Text>
          ) : (
            commandMatches.map((command, index) => (
              <Text key={command.name} color={index === overlay.selected ? "green" : undefined}>
                {index === overlay.selected ? "› " : "  "}
                {command.label} — {command.hint}
              </Text>
            ))
          )}
          <Text color="gray">Tab / Enter to accept · Esc to dismiss</Text>
        </Box>
      ) : null}

      {overlay?.kind === "file" ? (
        <Box borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1} marginBottom={1}>
          <Text color="yellow">Files {overlay.filter ? `(@${overlay.filter})` : ""}</Text>
          {fileMatches.length === 0 ? (
            <Text color="gray">{projectFiles.length === 0 ? "Project index still loading…" : "No matches"}</Text>
          ) : (
            fileMatches.map((path, index) => (
              <Text key={path} color={index === overlay.selected ? "green" : undefined}>
                {index === overlay.selected ? "› " : "  "}
                {path}
              </Text>
            ))
          )}
          <Text color="gray">Tab / Enter to insert · Esc to dismiss</Text>
        </Box>
      ) : null}

      {overlay?.kind === "session" ? (
        <Box borderStyle="single" borderColor="blue" flexDirection="column" paddingX={1} marginBottom={1}>
          <Text color="blue">Sessions {overlay.filter ? `(@@${overlay.filter})` : ""}</Text>
          {sessionMatches.length === 0 ? (
            <Text color="gray">{sessionSuggestions.length === 0 ? "No sessions indexed yet" : "No matches"}</Text>
          ) : (
            sessionMatches.map((entry, index) => (
              <Box key={entry.sessionId} flexDirection="column">
                <Text color={index === overlay.selected ? "green" : undefined}>
                  {index === overlay.selected ? "› " : "  "}
                  {entry.sessionId.slice(0, 8)} · {sessionStatusGlyph(entry.status)} · {formatTimestamp(entry.updatedAt)}{entry.role ? ` · ${entry.role}` : ""}
                </Text>
                {entry.prompt ? <Text color="gray">    {truncate(entry.prompt.replace(/\s+/g, " ").trim(), 110)}</Text> : null}
              </Box>
            ))
          )}
          <Text color="gray">Tab / Enter to insert · Esc to dismiss</Text>
        </Box>
      ) : null}

      <Box justifyContent="flex-end">
        <BrainPet thinking={running} status={petState.status} lines={petState.lines} />
      </Box>
      <Box borderStyle="single" borderColor={running ? "gray" : "green"} paddingX={1} flexDirection="column">
        {running ? (
          <Text color="gray">… wait for the current run to finish</Text>
        ) : (
          (() => {
            const innerWidth = Math.max(20, terminalCols - INPUT_RESERVED_COLUMNS)
            const window = clipDraftToWindow(draft, cursor, innerWidth, INPUT_MAX_LINES)
            return (
              <>
                {window.hiddenAbove > 0 ? <Text color="gray">↑ {window.hiddenAbove} more line{window.hiddenAbove === 1 ? "" : "s"}</Text> : null}
                {window.lines.map((line, index) => (
                  <Text key={index} color="green" wrap="truncate-end">{line || " "}</Text>
                ))}
                {window.hiddenBelow > 0 ? <Text color="gray">↓ {window.hiddenBelow} more line{window.hiddenBelow === 1 ? "" : "s"}</Text> : null}
              </>
            )
          })()
        )}
      </Box>
      <Text color="gray">
        Enter submits · / commands · @ files · @@ sessions · ↑ edits queued · Ctrl+V paste · Esc dismisses · Ctrl+C exits
      </Text>
      {queueRef.current.length > 0 ? (
        <Text color="yellow">
          {queueRef.current.length} task{queueRef.current.length === 1 ? "" : "s"} queued · ↑ to edit the most recent
        </Text>
      ) : null}
      {statusFlash ? <Text color="cyan">{statusFlash}</Text> : null}
    </Box>
  )
}

function filteredCommands(filter: string): CommandDefinition[] {
  if (!filter) return COMMANDS
  const lower = filter.toLowerCase()
  return COMMANDS.filter((command) => command.name.startsWith(lower) || command.label.includes(lower))
}

function computeOverlay(draft: string, cursor: number, current: Overlay): Overlay {
  const head = draft.slice(0, cursor)
  if (draft.startsWith("/") && !head.includes(" ")) {
    const filter = head.slice(1)
    const previous = current?.kind === "command" ? current.selected : 0
    return { kind: "command", filter, selected: Math.max(0, previous) }
  }
  const ref = lastReferenceTrigger(head)
  if (ref) {
    const segment = head.slice(ref.anchor + ref.marker.length)
    if (!segment.includes(" ")) {
      if (ref.marker === "@@") {
        const previous = current?.kind === "session" ? current.selected : 0
        return { kind: "session", filter: segment, selected: previous, anchor: ref.anchor }
      }
      const previous = current?.kind === "file" ? current.selected : 0
      return { kind: "file", filter: segment, selected: previous, anchor: ref.anchor }
    }
  }
  return null
}

function lastReferenceTrigger(head: string): { anchor: number; marker: "@" | "@@" } | null {
  for (let index = head.length - 1; index >= 0; index--) {
    const ch = head[index]
    if (ch === " ") return null
    if (ch === "@") {
      if (index > 0 && head[index - 1] === "@") {
        const anchor = index - 1
        if (anchor === 0 || head[anchor - 1] === " ") return { anchor, marker: "@@" }
        return null
      }
      if (index === 0 || head[index - 1] === " ") return { anchor: index, marker: "@" }
      return null
    }
  }
  return null
}

function sessionSearchText(entry: SessionSummary): string {
  return [
    entry.sessionId,
    entry.sessionId.slice(0, 8),
    entry.prompt,
    entry.summary,
    entry.role,
    entry.brainId,
    entry.status,
  ].filter(Boolean).join(" ").toLowerCase()
}

function filterSessions(sessions: SessionSummary[], filter: string, limit: number): SessionSummary[] {
  if (!filter) return sessions.slice(0, limit)
  const lower = filter.toLowerCase()
  return sessions.filter((entry) => sessionSearchText(entry).includes(lower)).slice(0, limit)
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function composeDraftLine(draft: string, cursor: number): string {
  const position = clamp(cursor, 0, draft.length)
  const head = draft.slice(0, position)
  const tail = draft.slice(position)
  return `› ${head}|${tail}`
}

function isWideChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  )
}

function wrapByVisualWidth(text: string, width: number): string[] {
  if (width <= 0) return [text]
  const lines: string[] = []
  let current = ""
  let currentWidth = 0
  for (const char of text) {
    if (char === "\n") {
      lines.push(current)
      current = ""
      currentWidth = 0
      continue
    }
    const charWidth = isWideChar(char) ? 2 : 1
    if (currentWidth + charWidth > width) {
      lines.push(current)
      current = ""
      currentWidth = 0
    }
    current += char
    currentWidth += charWidth
  }
  lines.push(current)
  return lines
}

function locateCursorRow(text: string, cursor: number, width: number): number {
  if (width <= 0) return 0
  let row = 0
  let col = 0
  let index = 0
  for (const char of text) {
    if (index >= cursor) return row
    if (char === "\n") {
      row++
      col = 0
    } else {
      const w = isWideChar(char) ? 2 : 1
      if (col + w > width) {
        row++
        col = 0
      }
      col += w
    }
    index += char.length
  }
  return row
}

type DraftWindow = {
  lines: string[]
  hiddenAbove: number
  hiddenBelow: number
}

function clipDraftToWindow(draft: string, cursor: number, width: number, maxLines: number): DraftWindow {
  const composed = composeDraftLine(draft, cursor)
  const lines = wrapByVisualWidth(composed, width)
  if (lines.length <= maxLines) {
    return { lines, hiddenAbove: 0, hiddenBelow: 0 }
  }
  // Cursor position: head length + 1 for caret offset, then "› " adds 2 chars.
  const cursorOffsetInComposed = 2 + clamp(cursor, 0, draft.length)
  const cursorRow = locateCursorRow(composed, cursorOffsetInComposed, width)
  let start = Math.max(0, cursorRow - Math.floor(maxLines / 2))
  let end = start + maxLines
  if (end > lines.length) {
    end = lines.length
    start = Math.max(0, end - maxLines)
  }
  if (cursorRow < start) {
    start = cursorRow
    end = Math.min(lines.length, start + maxLines)
  }
  if (cursorRow >= end) {
    end = Math.min(lines.length, cursorRow + 1)
    start = Math.max(0, end - maxLines)
  }
  return {
    lines: lines.slice(start, end),
    hiddenAbove: start,
    hiddenBelow: lines.length - end,
  }
}

function labelFor(item: TranscriptItem): string {
  switch (item.kind) {
    case "user": return "You:"
    case "assistant": return "Braincode:"
    case "error": return "Error:"
    case "status": return "Status:"
    case "help": return "Help:"
    case "panel": return ""
    case "thinking": return "Thinking:"
    case "tool": {
      switch (item.toolStatus) {
        case "ok": return "✓"
        case "failed": return "✗"
        default: return "→"
      }
    }
    case "worker": {
      switch (item.workerStatus) {
        case "completed": return "◉"
        case "failed": return "◌"
        default: return "◎"
      }
    }
    case "queued": return "»"
  }
}

function colorFor(item: TranscriptItem): "blue" | "cyan" | "green" | "red" | "yellow" | "magenta" | "gray" {
  switch (item.kind) {
    case "user": return "blue"
    case "assistant": return "green"
    case "error": return "red"
    case "status": return "cyan"
    case "help": return "yellow"
    case "panel": return "magenta"
    case "thinking": return "gray"
    case "tool": {
      switch (item.toolStatus) {
        case "ok": return "cyan"
        case "failed": return "red"
        default: return "yellow"
      }
    }
    case "worker": {
      switch (item.workerStatus) {
        case "completed": return "magenta"
        case "failed": return "red"
        default: return "yellow"
      }
    }
    case "queued": return "yellow"
  }
}

function formatHelp(): string {
  return [
    "Commands:",
    ...COMMANDS.map((command) => `  ${command.label.padEnd(10)} — ${command.hint}`),
    "",
    "Tips:",
    "  • Start typing / to open the command palette.",
    "  • Use @<path> to attach project files (Tab to accept).",
    "  • Use @@<session-id> to attach a compact session context (Tab to accept).",
    "  • Ctrl+V pastes a clipboard image or text from the system clipboard.",
    "  • Models are picked by Brain routing; use `braincode config` to change providers.",
  ].join("\n")
}

function describeMcpEntry(entry: McpServerEntry): string {
  if (entry.url) return entry.url
  if (entry.command) {
    const args = (entry.args ?? []).join(" ")
    return args ? `${entry.command} ${args}` : entry.command
  }
  if (entry.type) return entry.type
  return "(no command/url)"
}

function mergeHealth(result: McpHealthResult): Partial<McpPanelEntry> {
  if (result.status === "ok") {
    return {
      health: "ok",
      toolCount: result.toolCount,
      latencyMs: result.latencyMs,
      serverInfo: result.serverInfo,
      detail: result.error,
    }
  }
  if (result.status === "skipped") {
    return { health: "skipped", detail: result.error }
  }
  return { health: "error", detail: result.error }
}

function describeHealth(entry: McpPanelEntry): string {
  switch (entry.health) {
    case "pending":
      return "checking…"
    case "ok": {
      const parts: string[] = []
      if (typeof entry.toolCount === "number") parts.push(`${entry.toolCount} tools`)
      if (typeof entry.latencyMs === "number") parts.push(`${entry.latencyMs}ms`)
      if (entry.serverInfo?.name) parts.push(entry.serverInfo.name)
      const tail = parts.length > 0 ? ` (${parts.join(" · ")})` : ""
      return `healthy${tail}${entry.detail ? ` — note: ${truncate(entry.detail, 80)}` : ""}`
    }
    case "skipped":
      return entry.detail ?? "skipped"
    case "error":
      return entry.detail ? truncate(entry.detail, 120) : "error"
  }
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}

function truncateForStatus(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  return truncate(collapsed, 80)
}

function summarizeToolArgs(args: unknown): string {
  if (args === undefined || args === null) return ""
  if (typeof args === "string") return `"${truncate(args.replace(/\s+/g, " ").trim(), 80)}"`
  if (typeof args !== "object") return String(args)
  try {
    const entries = Object.entries(args as Record<string, unknown>)
    if (entries.length === 0) return "{}"
    const parts = entries.slice(0, 4).map(([key, value]) => `${key}=${summarizeArgValue(value)}`)
    if (entries.length > 4) parts.push(`+${entries.length - 4} more`)
    return `{${parts.join(", ")}}`
  } catch {
    return "{...}"
  }
}

function summarizeArgValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (typeof value === "string") return `"${truncate(value.replace(/\s+/g, " "), 40)}"`
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return `[${value.length}]`
  if (typeof value === "object") return "{…}"
  return truncate(String(value), 40)
}

function summarizeToolResult(result: unknown): string {
  if (!result) return ""
  if (typeof result === "string") return truncate(result.replace(/\s+/g, " ").trim(), 120)
  if (typeof result !== "object") return String(result)
  try {
    const record = result as { content?: unknown; details?: { content?: unknown; tools?: unknown[] }; isError?: unknown }
    const directContent = Array.isArray(record.content) ? record.content : Array.isArray(record.details?.content) ? record.details.content : []
    if (directContent.length > 0) {
      const texts = directContent
        .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") ? (part as { text: string }).text : "")
        .filter(Boolean)
      const merged = texts.join(" ").replace(/\s+/g, " ").trim()
      if (merged) return truncate(merged, 120)
    }
    return truncate(JSON.stringify(result), 120)
  } catch {
    return "(unserializable result)"
  }
}

function formatBrainDetail(brain: BrainModel, defaultBrainId: string): string {
  const lines: string[] = []
  const star = brain.id === defaultBrainId ? " (default)" : ""
  lines.push(`${brain.id}${star} — ${brain.name}`)
  if (brain.description) lines.push(brain.description)
  lines.push("")
  lines.push("Planner:")
  lines.push(`  ${brain.planner.modelId} (${brain.planner.thinkingLevel})`)
  lines.push("Roles:")
  const roleEntries = Object.entries(brain.roles) as Array<[keyof BrainModel["roles"], typeof brain.roles.coding]>
  for (const [role, policy] of roleEntries) {
    lines.push(`  ${role.padEnd(11)} ${policy.modelId} (${policy.thinkingLevel})${policy.fallbackModelIds && policy.fallbackModelIds.length > 0 ? ` → ${policy.fallbackModelIds.join(", ")}` : ""}`)
  }
  lines.push("Routing:")
  lines.push(`  maxParallelAgents=${brain.routing.maxParallelAgents}  requireReviewForFileEdits=${brain.routing.requireReviewForFileEdits}`)
  return lines.join("\n")
}

function sessionStatusGlyph(status: SessionSummary["status"]): string {
  switch (status) {
    case "completed": return "✓"
    case "failed": return "✗"
    case "incomplete": return "·"
  }
}

function formatTimestamp(ms: number): string {
  if (!ms) return "(unknown time)"
  const date = new Date(ms)
  const pad = (value: number) => value.toString().padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function healthGlyph(entry: McpPanelEntry): string {
  if (entry.entry.disabled) return "○"
  switch (entry.health) {
    case "ok": return "✓"
    case "error": return "✗"
    case "skipped": return "·"
    case "pending": return "?"
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function humanizeRuntimeError(error: unknown): string {
  const message = formatError(error)
  if (/User location is not supported/i.test(message) || /region is not supported/i.test(message)) {
    return `${message}\n\nHint: The upstream provider rejected the request because of geographic restrictions. Either set a usable proxy baseUrl for the provider in ~/.braincode/models.json or configure a Brain role that maps to a different provider (e.g. kimi).`
  }
  if (/missing API key for provider/i.test(message)) {
    return `${message}\n\nHint: Add the provider API key with \`braincode config\` or write it to ~/.braincode/auth.json.`
  }
  return message
}
