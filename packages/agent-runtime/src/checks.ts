import { spawn } from "node:child_process"
import { basename, extname, resolve as resolvePath } from "node:path"
import type { BraincodeMode } from "@braincode/brain"
import type { CheckPatchKind, CheckPolicyConfiguration, CheckPolicyConfigurationMap, CheckSelectionStrategy } from "@braincode/tools"
import type { PatchFileChange, PatchSummary } from "./patch"
import { recordToolApprovalDecision, recordToolExecutionSummary, summarizeJson, type ToolAuditScope } from "./tool-audit"
import type { ToolApprovalDecision, ToolApprovalRequest } from "./runtime-agent"

const DEFAULT_CHECK_TIMEOUT_MS = 180_000
const DEFAULT_CHECK_OUTPUT_BYTES = 24_000
const CHECK_SCRIPT_PRIORITY = ["check", "typecheck", "lint", "test"] as const
const FULL_CHECK_SCRIPTS = [...CHECK_SCRIPT_PRIORITY]

export type PatchKind = CheckPatchKind

export type PatchCheckStatus = "passed" | "failed" | "skipped"

/**
 * Coarse risk tier derived from the patch kind (and, where available,
 * permission-policy signals). The tier drives review mode, required
 * independence, and coverage requirements. Critical tier is only reached when
 * the caller has external evidence (auth+ci overlap, or a permission policy
 * critical signal); the path-only heuristic never returns `critical` on its
 * own to avoid silent escalation surprises.
 */
export type PatchRiskTier = "low" | "medium" | "high" | "critical"

export function patchKindRiskTier(kind: PatchKind): PatchRiskTier {
  switch (kind) {
    case "docs-only":
    case "test-only":
      return "low"
    case "frontend":
    case "backend":
    case "unknown-code":
    case "package-change":
      return "medium"
    case "auth-risk":
    case "db-risk":
    case "ci-risk":
      return "high"
  }
}

export function classifyPatchRiskTier(input: {
  patchKind: PatchKind
  permissionReviewRequired?: boolean
  hasAuthPath?: boolean
  hasCiPath?: boolean
}): PatchRiskTier {
  if (input.hasAuthPath && input.hasCiPath) return "critical"
  const base = patchKindRiskTier(input.patchKind)
  if (input.permissionReviewRequired && (base === "low" || base === "medium")) return "high"
  return base
}

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
  patchKind?: PatchKind
  selectedScripts?: string[]
  reviewRequired?: boolean
  results: PatchCheckResult[]
}

export type PatchCheckOptions = {
  enabled?: boolean
  scripts?: string[]
  strategy?: CheckSelectionStrategy
  policies?: CheckPolicyConfigurationMap
  timeoutMs?: number
  maxOutputBytes?: number
  patch?: PatchSummary
  changedFiles?: PatchFileChange[]
}

type PatchCheckApproval = {
  mode: BraincodeMode
  sessionId: string
  attempt: number
  onToolApproval?: (
    request: ToolApprovalRequest,
    signal?: AbortSignal,
  ) => ToolApprovalDecision | Promise<ToolApprovalDecision>
  signal?: AbortSignal
  audit?: ToolAuditScope
}

type PackageManager = {
  name: "bun" | "pnpm" | "yarn" | "npm"
  command: string
  runArgs: (script: string) => string[]
}

type PatchCheckPolicySelection = {
  patchKind: PatchKind
  scripts: string[]
  configuredScripts: boolean
  skip: boolean
  reviewRequired: boolean
  approvalRequired: boolean
  reason: string
}

type PlannedPatchChecks = {
  patchKind: PatchKind
  packageScripts: Record<string, string>
  packageManager: PackageManager
  scripts: string[]
  configuredScripts: boolean
  reviewRequired: boolean
  approvalRequired: boolean
  reason: string
}

export async function runPatchChecks(projectRoot: string, options: PatchCheckOptions = {}): Promise<PatchCheckSummary> {
  const planned = await planPatchChecks(projectRoot, options)
  if ("status" in planned) return planned
  return executePlannedPatchChecks(projectRoot, options, planned)
}

export async function runPatchChecksWithApproval(
  projectRoot: string,
  options: PatchCheckOptions = {},
  approval: PatchCheckApproval,
): Promise<PatchCheckSummary> {
  const planned = await planPatchChecks(projectRoot, options)
  if ("status" in planned) return planned
  const approvalToolCallId = `patch-checks:${approval.sessionId}:${approval.attempt}`
  const approvalArgs = { scripts: planned.scripts, patchKind: planned.patchKind, reason: planned.reason }
  if (approval.mode !== "radical" || planned.approvalRequired) {
    if (!approval.onToolApproval) {
      await recordToolApprovalDecision(approval.audit, {
        toolCallId: approvalToolCallId,
        toolName: "run_script",
        decision: "blocked",
        approver: "runtime_policy",
        reason: "check scripts require command execution approval",
        argsSummary: summarizeJson(approvalArgs),
      })
      return {
        status: "skipped",
        reason: "check scripts require command execution approval",
        patchKind: planned.patchKind,
        selectedScripts: planned.scripts,
        ...(planned.reviewRequired ? { reviewRequired: true } : {}),
        results: [],
      }
    }
    const decision = await approval.onToolApproval({
      toolCallId: approvalToolCallId,
      toolName: "run_script",
      args: approvalArgs,
    }, approval.signal)
    if (approval.signal?.aborted) throw createRunAbortedError()
    await recordToolApprovalDecision(approval.audit, {
      toolCallId: approvalToolCallId,
      toolName: "run_script",
      decision: decision?.approved === false ? "blocked" : "approved",
      approver: decision?.approver ?? "human",
      reason: decision?.reason,
      argsSummary: summarizeJson(approvalArgs),
    })
    if (decision?.approved === false) {
      return {
        status: "skipped",
        reason: `check scripts blocked: ${decision.reason ?? "not approved"}`,
        patchKind: planned.patchKind,
        selectedScripts: planned.scripts,
        ...(planned.reviewRequired ? { reviewRequired: true } : {}),
        results: [],
      }
    }
  } else {
    await recordToolApprovalDecision(approval.audit, {
      toolCallId: approvalToolCallId,
      toolName: "run_script",
      decision: "auto_approved",
      approver: "mode_policy",
      reason: "auto-approved check scripts in radical mode",
      argsSummary: summarizeJson(approvalArgs),
    })
  }
  return executePlannedPatchChecks(projectRoot, options, planned, approval.audit)
}

export function classifyPatchKind(input?: PatchSummary | readonly PatchFileChange[]): PatchKind {
  const changes: readonly PatchFileChange[] = input
    ? isPatchSummaryInput(input) ? input.changedFiles : input
    : []
  const paths = (changes ?? []).map((change) => change.path).filter(Boolean)
  if (paths.length === 0) return "unknown-code"
  if (paths.some(isPackageChangePath)) return "package-change"
  if (paths.some(isCiPath)) return "ci-risk"
  if (paths.some(isDbPath)) return "db-risk"
  if (paths.some(isAuthPath)) return "auth-risk"
  if (paths.every(isDocsPath)) return "docs-only"
  if (paths.every(isTestPath)) return "test-only"
  if (paths.some(isFrontendPath)) return "frontend"
  if (paths.some(isBackendPath)) return "backend"
  return "unknown-code"
}

export function patchHasAuthPath(input?: PatchSummary | readonly PatchFileChange[]): boolean {
  const changes: readonly PatchFileChange[] = input
    ? isPatchSummaryInput(input) ? input.changedFiles : input
    : []
  return changes.some((change) => isAuthPath(change.path))
}

export function patchHasCiPath(input?: PatchSummary | readonly PatchFileChange[]): boolean {
  const changes: readonly PatchFileChange[] = input
    ? isPatchSummaryInput(input) ? input.changedFiles : input
    : []
  return changes.some((change) => isCiPath(change.path))
}

function isPatchSummaryInput(input: PatchSummary | readonly PatchFileChange[]): input is PatchSummary {
  return !Array.isArray(input)
}

export function patchKindRequiresReview(kind: PatchKind): boolean {
  return kind === "auth-risk" || kind === "db-risk" || kind === "ci-risk"
}

async function executePlannedPatchChecks(
  projectRoot: string,
  options: PatchCheckOptions,
  planned: PlannedPatchChecks,
  audit?: ToolAuditScope,
): Promise<PatchCheckSummary> {
  const results: PatchCheckResult[] = []
  for (const script of planned.scripts) {
    const toolCallId = audit?.sessionId ? `patch-check:${audit.sessionId}:${audit.attempt ?? 1}:${script}` : `patch-check:${script}`
    await recordToolExecutionSummary(audit, {
      event: "start",
      toolCallId,
      toolName: "run_script",
      argsSummary: summarizeJson({ script, patchKind: planned.patchKind, reason: planned.reason }),
    })
    if (!Object.prototype.hasOwnProperty.call(planned.packageScripts, script)) {
      const missingResult: PatchCheckResult = {
        name: script,
        command: planned.packageManager.command,
        args: planned.packageManager.runArgs(script),
        status: "failed",
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: "",
        stderr: `package.json script not found: ${script}`,
        timedOut: false,
      }
      results.push(missingResult)
      await recordToolExecutionSummary(audit, {
        event: "end",
        toolCallId,
        toolName: "run_script",
        isError: true,
        resultSummary: summarizeJson({ status: missingResult.status, exitCode: missingResult.exitCode, stderr: missingResult.stderr }),
      })
      continue
    }
    const result = await runPackageScriptCheck(projectRoot, script, planned.packageManager, {
      timeoutMs: options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_CHECK_OUTPUT_BYTES,
    })
    results.push(result)
    await recordToolExecutionSummary(audit, {
      event: "end",
      toolCallId,
      toolName: "run_script",
      isError: result.status !== "passed",
      resultSummary: summarizeJson({ status: result.status, exitCode: result.exitCode, durationMs: result.durationMs, timedOut: result.timedOut }),
    })
  }

  return {
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    reason: planned.reason,
    patchKind: planned.patchKind,
    selectedScripts: planned.scripts,
    ...(planned.reviewRequired ? { reviewRequired: true } : {}),
    results,
  }
}

async function planPatchChecks(projectRoot: string, options: PatchCheckOptions): Promise<PlannedPatchChecks | PatchCheckSummary> {
  const patchKind = classifyPatchKind(options.patch ?? options.changedFiles)
  if (options.enabled === false) {
    return {
      status: "skipped",
      reason: "checks disabled in tools configuration",
      patchKind,
      results: [],
    }
  }

  const selection = selectPatchCheckPolicy(options, patchKind)
  if (selection.skip) {
    return {
      status: "skipped",
      reason: selection.reason,
      patchKind,
      selectedScripts: selection.scripts,
      ...(selection.reviewRequired ? { reviewRequired: true } : {}),
      results: [],
    }
  }

  const packageScripts = await readPackageScripts(projectRoot)
  if (!packageScripts) {
    return {
      status: "skipped",
      reason: "package.json not found or has no scripts",
      patchKind,
      selectedScripts: selection.scripts,
      ...(selection.reviewRequired ? { reviewRequired: true } : {}),
      results: [],
    }
  }
  const scripts = selection.configuredScripts
    ? selection.scripts
    : selection.scripts.filter((script) => Object.prototype.hasOwnProperty.call(packageScripts, script))
  if (scripts.length === 0) {
    return {
      status: "skipped",
      reason: selection.configuredScripts
        ? `${selection.reason}; no check scripts selected`
        : `${selection.reason}; no ${selection.scripts.join(", ")} script found`,
      patchKind,
      selectedScripts: [],
      ...(selection.reviewRequired ? { reviewRequired: true } : {}),
      results: [],
    }
  }

  return {
    patchKind,
    packageScripts,
    packageManager: await detectPackageManager(projectRoot),
    scripts,
    configuredScripts: selection.configuredScripts,
    reviewRequired: selection.reviewRequired,
    approvalRequired: selection.approvalRequired,
    reason: selection.reason,
  }
}

function selectPatchCheckPolicy(options: PatchCheckOptions, patchKind: PatchKind): PatchCheckPolicySelection {
  const policy = options.policies?.[patchKind]
  const policyReviewRequired = policy?.review === "required"
  const defaultPolicy = defaultPatchCheckPolicy(patchKind, options.strategy ?? "smart")
  const reviewRequired = policyReviewRequired || defaultPolicy.reviewRequired
  const explicitScripts = normalizeCheckScripts(options.scripts)
  if (policy?.enabled === false) {
    return {
      patchKind,
      scripts: [],
      configuredScripts: true,
      skip: true,
      reviewRequired,
      approvalRequired: defaultPolicy.approvalRequired,
      reason: policy.reason ?? `${patchKind}: checks disabled by policy`,
    }
  }
  if (policy?.scripts !== undefined) {
    const policyScripts = normalizeCheckScripts(policy.scripts)
    return {
      patchKind,
      scripts: policyScripts,
      configuredScripts: true,
      skip: policyScripts.length === 0,
      reviewRequired,
      approvalRequired: defaultPolicy.approvalRequired,
      reason: policy.reason ?? `${patchKind}: running policy check scripts`,
    }
  }
  if (explicitScripts.length > 0) {
    return {
      patchKind,
      scripts: explicitScripts,
      configuredScripts: true,
      skip: false,
      reviewRequired,
      approvalRequired: defaultPolicy.approvalRequired,
      reason: policy?.reason ?? `${patchKind}: running configured check scripts`,
    }
  }
  return {
    patchKind,
    scripts: defaultPolicy.scripts,
    configuredScripts: false,
    skip: defaultPolicy.skip,
    reviewRequired,
    approvalRequired: defaultPolicy.approvalRequired,
    reason: policy?.reason ?? defaultPolicy.reason,
  }
}

function defaultPatchCheckPolicy(
  patchKind: PatchKind,
  strategy: CheckSelectionStrategy,
): Omit<PatchCheckPolicySelection, "patchKind" | "configuredScripts"> {
  if (strategy === "all") {
    return {
      scripts: FULL_CHECK_SCRIPTS,
      skip: false,
      reviewRequired: patchKindRequiresReview(patchKind),
      approvalRequired: patchKind === "ci-risk",
      reason: `${patchKind}: running full check set because check strategy is all`,
    }
  }

  switch (patchKind) {
    case "docs-only":
      return {
        scripts: [],
        skip: true,
        reviewRequired: false,
        approvalRequired: false,
        reason: "docs-only: skipping package checks by default",
      }
    case "test-only":
      return {
        scripts: ["test"],
        skip: false,
        reviewRequired: false,
        approvalRequired: false,
        reason: "test-only: running test script",
      }
    case "frontend":
      return {
        scripts: ["typecheck", "lint", "test"],
        skip: false,
        reviewRequired: false,
        approvalRequired: false,
        reason: "frontend: running typecheck, lint, and test scripts when available",
      }
    case "backend":
      return {
        scripts: ["typecheck", "test"],
        skip: false,
        reviewRequired: false,
        approvalRequired: false,
        reason: "backend: running typecheck and test scripts when available",
      }
    case "auth-risk":
      return {
        scripts: FULL_CHECK_SCRIPTS,
        skip: false,
        reviewRequired: true,
        approvalRequired: false,
        reason: "auth-risk: running full check set and requiring review",
      }
    case "db-risk":
      return {
        scripts: FULL_CHECK_SCRIPTS,
        skip: false,
        reviewRequired: true,
        approvalRequired: false,
        reason: "db-risk: running full check set and requiring review",
      }
    case "package-change":
      return {
        scripts: FULL_CHECK_SCRIPTS,
        skip: false,
        reviewRequired: false,
        approvalRequired: false,
        reason: "package-change: running full check set because package metadata changed",
      }
    case "ci-risk":
      return {
        scripts: FULL_CHECK_SCRIPTS,
        skip: false,
        reviewRequired: true,
        approvalRequired: true,
        reason: "ci-risk: running full check set only after command approval and requiring review",
      }
    case "unknown-code":
      return {
        scripts: FULL_CHECK_SCRIPTS,
        skip: false,
        reviewRequired: false,
        approvalRequired: false,
        reason: "unknown-code: running full check set",
      }
  }
}

function isPackageChangePath(path: string): boolean {
  const name = basename(path).toLowerCase()
  return name === "package.json"
    || name === "bun.lock"
    || name === "bun.lockb"
    || name === "package-lock.json"
    || name === "pnpm-lock.yaml"
    || name === "yarn.lock"
    || name === "npm-shrinkwrap.json"
    || name === "pnpm-workspace.yaml"
}

function isCiPath(path: string): boolean {
  const normalized = normalizePathForClassification(path)
  const name = basename(normalized)
  return normalized.startsWith(".github/workflows/")
    || normalized.startsWith(".circleci/")
    || name === ".gitlab-ci.yml"
    || name === ".gitlab-ci.yaml"
    || name === "bitbucket-pipelines.yml"
    || name === "bitbucket-pipelines.yaml"
}

function isDbPath(path: string): boolean {
  const normalized = normalizePathForClassification(path)
  const segments = normalized.split("/")
  const name = basename(normalized)
  return segments.some((segment) => ["db", "database", "databases", "migration", "migrations", "prisma", "drizzle"].includes(segment))
    || name === "schema.prisma"
    || name.endsWith(".sql")
}

function isAuthPath(path: string): boolean {
  const normalized = normalizePathForClassification(path)
  const segments = normalized.split("/")
  const name = basename(normalized)
  return segments.some((segment) => ["auth", "authentication", "oauth", "login", "session", "sessions"].includes(segment))
    || /^(auth|oauth|login|session|sessions|credential|credentials|token|tokens)([.-]|$)/.test(name)
}

function isDocsPath(path: string): boolean {
  const normalized = normalizePathForClassification(path)
  const name = basename(normalized)
  const extension = extname(name)
  return normalized.startsWith("docs/")
    || ["readme", "changelog", "contributing", "license", "notice"].includes(name.replace(/\.[^.]+$/, ""))
    || [".md", ".mdx", ".txt", ".rst", ".adoc"].includes(extension)
}

function isTestPath(path: string): boolean {
  const normalized = normalizePathForClassification(path)
  const segments = normalized.split("/")
  const name = basename(normalized)
  return segments.some((segment) => ["test", "tests", "__tests__", "spec", "specs", "fixtures", "__fixtures__"].includes(segment))
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)
}

function isFrontendPath(path: string): boolean {
  const normalized = normalizePathForClassification(path)
  const segments = normalized.split("/")
  const extension = extname(normalized)
  return [".tsx", ".jsx", ".css", ".scss", ".sass", ".less", ".html", ".vue", ".svelte"].includes(extension)
    || segments.some((segment) => ["frontend", "client", "web", "ui", "components", "pages", "styles", "assets", "public"].includes(segment))
    || basename(normalized) === "vite.config.ts"
}

function isBackendPath(path: string): boolean {
  const normalized = normalizePathForClassification(path)
  const segments = normalized.split("/")
  const extension = extname(normalized)
  return segments.some((segment) => ["api", "server", "backend", "routes", "controllers", "services", "workers", "runtime", "tools", "config"].includes(segment))
    || [".ts", ".js", ".mts", ".cts", ".mjs", ".cjs", ".go", ".rs", ".py", ".java", ".kt", ".rb", ".php", ".cs", ".swift"].includes(extension)
}

function normalizePathForClassification(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase()
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
