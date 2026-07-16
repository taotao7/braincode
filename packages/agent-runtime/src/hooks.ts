import { spawn, type ChildProcess } from "node:child_process"
import { appendSessionRecord, readHookSources, readSettings, type HookEventName, type HookHandler, type HookMatcherGroup, type HookSource, type SessionHookRecordType } from "@braincode/config"

export type HookPermissionMode = "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions"

export type HookRuntimeContext = {
  sessionId: string
  cwd: string
  home?: string
  transcriptPath?: string | null
  model?: string
  turnId?: string
  permissionMode?: HookPermissionMode
}

export type HookRunRecord = {
  eventName: HookEventName
  source: Pick<HookSource, "kind" | "path">
  matcher?: string
  command?: string
  status: "completed" | "skipped" | "failed" | "blocked"
  reason?: string
  stdout?: string
  stderr?: string
  exitCode?: number | null
}

export type HookRunResult = {
  records: HookRunRecord[]
  additionalContext: string[]
  blockedReason?: string
}

function hookMatcherMatches(eventName: HookEventName, matcher: string | undefined, matcherValue?: string): boolean {
  if (eventName === "UserPromptSubmit" || eventName === "Stop") return true
  if (!matcher || matcher === "*") return true

  try {
    return new RegExp(matcher).test(matcherValue ?? "")
  } catch {
    return matcher === matcherValue
  }
}

function getMatchingHookGroups(source: HookSource, eventName: HookEventName, matcherValue?: string): HookMatcherGroup[] {
  return (source.document.hooks[eventName] ?? []).filter((group) => hookMatcherMatches(eventName, group.matcher, matcherValue))
}

function buildHookInput(eventName: HookEventName, eventInput: Record<string, unknown>, context: HookRuntimeContext): Record<string, unknown> {
  return {
    session_id: context.sessionId,
    transcript_path: context.transcriptPath ?? null,
    cwd: context.cwd,
    hook_event_name: eventName,
    model: context.model ?? "braincode",
    turn_id: context.turnId ?? context.sessionId,
    permission_mode: context.permissionMode ?? "default",
    ...eventInput,
  }
}

function parseHookOutput(eventName: HookEventName, stdout: string, stderr: string, exitCode: number | null): { additionalContext?: string; blockedReason?: string } {
  const trimmed = stdout.trim()
  if (exitCode === 2) {
    return { blockedReason: stderr.trim() || trimmed || "Hook blocked the event." }
  }
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed) as { decision?: unknown; reason?: unknown; continue?: unknown; stopReason?: unknown; systemMessage?: unknown; hookSpecificOutput?: unknown }
    const hookSpecificOutput = parsed.hookSpecificOutput && typeof parsed.hookSpecificOutput === "object" ? parsed.hookSpecificOutput as { hookEventName?: unknown; additionalContext?: unknown } : undefined
    const additionalContext = hookSpecificOutput?.hookEventName === eventName && typeof hookSpecificOutput.additionalContext === "string" && hookSpecificOutput.additionalContext.trim()
      ? hookSpecificOutput.additionalContext.trim()
      : undefined
    if (parsed.decision === "block") {
      return {
        additionalContext,
        blockedReason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "Hook blocked the event.",
      }
    }
    if (parsed.continue === false) {
      return {
        additionalContext,
        blockedReason: typeof parsed.stopReason === "string" && parsed.stopReason.trim() ? parsed.stopReason.trim() : "Hook stopped the event.",
      }
    }
    return { additionalContext }
  } catch {
    if (eventName === "SessionStart" || eventName === "SubagentStart" || eventName === "UserPromptSubmit") {
      return { additionalContext: trimmed }
    }
    return {}
  }
}

async function runCommandHook(
  eventName: HookEventName,
  source: HookSource,
  group: HookMatcherGroup,
  handler: HookHandler,
  hookInput: Record<string, unknown>,
  cwd: string,
): Promise<{ record: HookRunRecord; additionalContext?: string; blockedReason?: string }> {
  const baseRecord = {
    eventName,
    source: { kind: source.kind, path: source.path },
    matcher: group.matcher,
    command: handler.command,
  }

  if (handler.enabled === false) {
    return { record: { ...baseRecord, status: "skipped", reason: "disabled" } }
  }
  if (handler.async === true) {
    return { record: { ...baseRecord, status: "skipped", reason: "async command hooks are not supported yet" } }
  }
  if (handler.type !== "command") {
    return { record: { ...baseRecord, status: "skipped", reason: `unsupported hook type: ${handler.type}` } }
  }
  if (!handler.command) {
    return { record: { ...baseRecord, status: "skipped", reason: "missing command" } }
  }
  if (handler.trusted !== true) {
    return { record: { ...baseRecord, status: "skipped", reason: "untrusted" } }
  }

  const timeoutMs = (handler.timeout ?? 600) * 1000
  const command = process.platform === "win32" ? handler.commandWindows ?? handler.command_windows ?? handler.command : handler.command

  return await new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      // Own process group (POSIX) so a timeout can reclaim shell grandchildren,
      // not just the shell itself.
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        BRAINCODE_HOOK_SOURCE: source.path,
      },
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    // A hook that exits without reading stdin raises EPIPE on the stdin stream;
    // without a listener that becomes an uncaught exception for the whole process.
    child.stdin?.on("error", () => {})
    const timer = setTimeout(() => {
      timedOut = true
      terminateHookProcessTree(child, "SIGTERM")
      // Escalate: a hook that ignores SIGTERM must not outlive its timeout.
      killTimer = setTimeout(() => terminateHookProcessTree(child, "SIGKILL"), 1_000)
    }, timeoutMs)

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      resolve({ record: { ...baseRecord, status: "failed", reason: error.message, stdout, stderr } })
    })
    child.on("close", (exitCode) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      if (timedOut) {
        resolve({ record: { ...baseRecord, status: "failed", reason: `timed out after ${handler.timeout ?? 600}s`, stdout, stderr, exitCode } })
        return
      }

      const output = parseHookOutput(eventName, stdout, stderr, exitCode)
      const status = output.blockedReason ? "blocked" : exitCode === 0 ? "completed" : "failed"
      resolve({
        record: {
          ...baseRecord,
          status,
          reason: output.blockedReason ?? (exitCode === 0 ? undefined : stderr.trim() || `command exited with ${exitCode}`),
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined,
          exitCode,
        },
        additionalContext: output.additionalContext,
        blockedReason: output.blockedReason,
      })
    })
    child.stdin?.end(`${JSON.stringify(hookInput)}\n`)
  })
}

function terminateHookProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid
  if (pid && process.platform !== "win32") {
    try {
      process.kill(-pid, signal)
      return
    } catch {
      // Fall through to direct child termination.
    }
  }
  if (pid && process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" }).on("error", () => {})
      return
    } catch {
      // Fall through to direct child termination.
    }
  }
  try { child.kill(signal) } catch { /* ignore */ }
}

export async function runConfiguredHooks(
  eventName: HookEventName,
  eventInput: Record<string, unknown>,
  context: HookRuntimeContext,
  matcherValue?: string,
): Promise<HookRunResult> {
  const settings = await readSettings(context.home)
  if (settings.features?.hooks === false) {
    return { records: [], additionalContext: [] }
  }

  const sources = await readHookSources(context.home, context.cwd)
  const hookInput = buildHookInput(eventName, eventInput, context)
  const hookRuns: Array<Promise<{ record: HookRunRecord; additionalContext?: string; blockedReason?: string }>> = []
  for (const source of sources) {
    for (const group of getMatchingHookGroups(source, eventName, matcherValue)) {
      for (const handler of group.hooks) {
        hookRuns.push(runCommandHook(eventName, source, group, handler, hookInput, context.cwd))
      }
    }
  }

  const results = await Promise.all(hookRuns)
  const additionalContext = results.map((result) => result.additionalContext).filter((value): value is string => Boolean(value))
  const blockedReason = results.find((result) => result.blockedReason)?.blockedReason
  return {
    records: results.map((result) => result.record),
    additionalContext,
    blockedReason,
  }
}

export function addHookAdditionalContext(prompt: string, additionalContext: string[]): string {
  if (additionalContext.length === 0) return prompt
  return `Hook additional context:\n${additionalContext.map((context) => `- ${context}`).join("\n")}\n\n${prompt}`
}

export function formatStopHookFeedback(result: HookRunResult): string {
  const messages = [...result.additionalContext]
  if (result.blockedReason) messages.push(result.blockedReason)
  return messages.length > 0 ? `\n\nHook feedback:\n${messages.map((message) => `- ${message}`).join("\n")}` : ""
}

export function createHookContext(sessionId: string, cwd: string, home: string | undefined, model?: string): HookRuntimeContext {
  return {
    sessionId,
    cwd,
    home,
    model,
    turnId: sessionId,
    permissionMode: "default",
  }
}

export async function runAndRecordHooks(
  eventName: HookEventName,
  eventInput: Record<string, unknown>,
  context: HookRuntimeContext,
  matcherValue: string | undefined,
  home: string | undefined,
  recordType: SessionHookRecordType,
): Promise<HookRunResult> {
  const result = await runConfiguredHooks(eventName, eventInput, context, matcherValue)
  if (result.records.length > 0 || result.additionalContext.length > 0 || result.blockedReason) {
    await appendSessionRecord(context.sessionId, {
      type: recordType,
      eventName,
      matcher: matcherValue,
      records: result.records,
      additionalContext: result.additionalContext,
      blockedReason: result.blockedReason,
    }, home)
  }
  return result
}
