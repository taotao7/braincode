import { spawn } from "node:child_process"
import { resolve as resolvePath } from "node:path"
import type { BraincodeMode } from "@braincode/brain"

const DEFAULT_CHECK_TIMEOUT_MS = 180_000
const DEFAULT_CHECK_OUTPUT_BYTES = 24_000
const CHECK_SCRIPT_PRIORITY = ["check", "typecheck", "lint", "test"] as const

export type PatchCheckStatus = "passed" | "failed" | "skipped"

export type PatchCheckResult = {
  name: string
  command: string
  args: string[]
  status: Exclude<PatchCheckStatus, "skipped">
  exitCode: number | null
  signal: NodeJS.Signals | null
  durationMs: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export type PatchCheckSummary = {
  status: PatchCheckStatus
  reason?: string
  results: PatchCheckResult[]
}

export type PatchCheckOptions = {
  enabled?: boolean
  scripts?: string[]
  timeoutMs?: number
  maxOutputBytes?: number
}

type PatchCheckApproval = {
  mode: BraincodeMode
  sessionId: string
  attempt: number
  onToolApproval?: (
    request: {
      toolCallId: string
      toolName: string
      args: unknown
    },
    signal?: AbortSignal,
  ) => { approved: boolean; reason?: string } | Promise<{ approved: boolean; reason?: string }>
  signal?: AbortSignal
}

type PackageManager = {
  name: "bun" | "pnpm" | "yarn" | "npm"
  command: string
  runArgs: (script: string) => string[]
}

export async function runPatchChecks(projectRoot: string, options: PatchCheckOptions = {}): Promise<PatchCheckSummary> {
  if (options.enabled === false) {
    return { status: "skipped", reason: "checks disabled in tools configuration", results: [] }
  }
  const packageScripts = await readPackageScripts(projectRoot)
  if (!packageScripts) {
    return { status: "skipped", reason: "package.json not found or has no scripts", results: [] }
  }
  const packageManager = await detectPackageManager(projectRoot)

  const scripts = normalizeCheckScripts(options.scripts?.length ? options.scripts : selectDefaultCheckScripts(packageScripts))
  if (scripts.length === 0) {
    return { status: "skipped", reason: "no check, typecheck, lint, or test script found", results: [] }
  }

  const results: PatchCheckResult[] = []
  for (const script of scripts) {
    if (!Object.prototype.hasOwnProperty.call(packageScripts, script)) {
      results.push({
        name: script,
        command: packageManager.command,
        args: packageManager.runArgs(script),
        status: "failed",
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: "",
        stderr: `package.json script not found: ${script}`,
        timedOut: false,
      })
      continue
    }
    results.push(await runPackageScriptCheck(projectRoot, script, packageManager, {
      timeoutMs: options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_CHECK_OUTPUT_BYTES,
    }))
  }

  return {
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    results,
  }
}

export async function runPatchChecksWithApproval(
  projectRoot: string,
  options: PatchCheckOptions = {},
  approval: PatchCheckApproval,
): Promise<PatchCheckSummary> {
  if (options.enabled === false) return runPatchChecks(projectRoot, options)
  if (approval.mode !== "radical") {
    if (!approval.onToolApproval) {
      return { status: "skipped", reason: "check scripts require command execution approval", results: [] }
    }
    const decision = await approval.onToolApproval({
      toolCallId: `patch-checks:${approval.sessionId}:${approval.attempt}`,
      toolName: "run_script",
      args: {
        scripts: options.scripts?.length ? options.scripts : [...CHECK_SCRIPT_PRIORITY],
        reason: "post-patch verification",
      },
    }, approval.signal)
    if (approval.signal?.aborted) throw createRunAbortedError()
    if (decision?.approved === false) {
      return { status: "skipped", reason: `check scripts blocked: ${decision.reason ?? "not approved"}`, results: [] }
    }
  }
  return runPatchChecks(projectRoot, options)
}

async function readPackageScripts(projectRoot: string): Promise<Record<string, string> | undefined> {
  const file = Bun.file(resolvePath(projectRoot, "package.json"))
  if (!(await file.exists())) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
  const scripts = (parsed as Record<string, unknown>).scripts
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return undefined
  const output: Record<string, string> = {}
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === "string") output[name] = command
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function selectDefaultCheckScripts(scripts: Record<string, string>): string[] {
  return CHECK_SCRIPT_PRIORITY.filter((script) => Object.prototype.hasOwnProperty.call(scripts, script))
}

function normalizeCheckScripts(scripts: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const script of scripts ?? []) {
    const trimmed = script.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    output.push(trimmed)
  }
  return output
}

async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  if (await Bun.file(resolvePath(projectRoot, "bun.lockb")).exists() || await Bun.file(resolvePath(projectRoot, "bun.lock")).exists()) {
    return {
      name: "bun",
      command: "bun",
      runArgs: (script) => ["run", script],
    }
  }
  if (await Bun.file(resolvePath(projectRoot, "pnpm-lock.yaml")).exists()) {
    return {
      name: "pnpm",
      command: "pnpm",
      runArgs: (script) => ["run", script],
    }
  }
  if (await Bun.file(resolvePath(projectRoot, "yarn.lock")).exists()) {
    return {
      name: "yarn",
      command: "yarn",
      runArgs: (script) => ["run", script],
    }
  }
  if (await Bun.file(resolvePath(projectRoot, "package-lock.json")).exists()) {
    return {
      name: "npm",
      command: "npm",
      runArgs: (script) => ["run", script],
    }
  }
  return {
    name: "bun",
    command: "bun",
    runArgs: (script) => ["run", script],
  }
}

async function runPackageScriptCheck(
  cwd: string,
  script: string,
  packageManager: PackageManager,
  options: { timeoutMs: number; maxOutputBytes: number },
): Promise<PatchCheckResult> {
  const startedAt = Date.now()
  return await new Promise((resolve) => {
    const command = packageManager.command
    const args = packageManager.runArgs(script)
    let settled = false
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        detached: process.platform !== "win32",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      resolve({
        name: script,
        command,
        args,
        status: "failed",
        exitCode: null,
        signal: null,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: message,
        timedOut: false,
      })
      return
    }

    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    const append = (current: Buffer, chunk: Buffer) => {
      const next = Buffer.concat([current, chunk])
      return next.byteLength > options.maxOutputBytes ? next.subarray(next.byteLength - options.maxOutputBytes) : next
    }
    const finish = (result: Omit<PatchCheckResult, "durationMs">) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ...result, durationMs: Date.now() - startedAt })
    }
    const timer = setTimeout(() => {
      timedOut = true
      terminateProcessTree(child, "SIGTERM")
    }, options.timeoutMs)

    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk) })
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk) })
    child.on("error", (error) => {
      finish({
        name: script,
        command,
        args,
        status: "failed",
        exitCode: null,
        signal: null,
        stdout: stdout.toString("utf8"),
        stderr: error.message,
        timedOut,
      })
    })
    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      finish({
        name: script,
        command,
        args,
        status: exitCode === 0 && !timedOut ? "passed" : "failed",
        exitCode,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
      })
    })
  })
}

function terminateProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
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

function createRunAbortedError(): Error {
  const error = new Error("Braincode run interrupted by user.")
  error.name = "AbortError"
  return error
}
