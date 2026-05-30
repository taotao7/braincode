import { spawn } from "node:child_process"
import { cp, mkdtemp, readdir, rm, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { runPatchChecks, type PatchCheckSummary, type PatchCheckStatus } from "./checks"
import { collectPatchBaseline, collectPatchDiffSnapshot, collectPatchSummary, collectUntrackedFilePreviews, hasPatchActivity, type PatchSummary } from "./patch"
import { applyReviewGatesToReviewDecision, type ReviewDecision, type ReviewDecisionStatus } from "./review"

export type ExecutionBenchmarkExpectedChecksStatus = PatchCheckStatus | "not-run"
export type ExecutionBenchmarkExpectedReviewDecision = ReviewDecisionStatus | "not-run"
export type ExecutionBenchmarkMode = "mock" | "real"

export type ExecutionBenchmarkTask = {
  id: string
  title: string
  task: string
  fixtureRoot: string
  projectRoot: string
  expected: {
    changedFiles: string[]
    checksStatus: ExecutionBenchmarkExpectedChecksStatus
    reviewDecision: ExecutionBenchmarkExpectedReviewDecision
  }
}

export type ExecutionBenchmarkRunOptions = {
  fixturesRoot?: string
  taskIds?: readonly string[]
  mode?: ExecutionBenchmarkMode
  keepWorktrees?: boolean
  executor?: ExecutionBenchmarkExecutor
}

export type ExecutionBenchmarkExecutor = (request: {
  prompt: string
  projectRoot: string
}) => Promise<{
  patch?: PatchSummary
  checks?: PatchCheckSummary
  reviewDecision?: ReviewDecision
  finalReport?: {
    status: string
    warnings?: string[]
    metrics?: {
      tokens?: {
        total?: {
          total?: number
        }
        byPhase?: Array<{
          phase?: string
          total?: number
        }>
      }
      toolCalls?: {
        total?: number
      }
    }
  }
}>

export type ExecutionBenchmarkCheckStatus = "passed" | "failed"

export type ExecutionBenchmarkCheck = {
  name: string
  status: ExecutionBenchmarkCheckStatus
  expected: string
  actual: string
}

export type ExecutionBenchmarkTaskMetrics = {
  success: boolean
  changedFiles: string[]
  diffStats?: PatchSummary["diffStats"]
  checksStatus: ExecutionBenchmarkExpectedChecksStatus
  reviewDecision: ExecutionBenchmarkExpectedReviewDecision
  durationMs: number
  toolCallCount: number
  tokenUsage: number
  tokenUsageByPhase: Array<{ phase: string; total: number }>
  primaryTokenUsage: number
  nonPrimaryTokenUsage: number
  brainToPrimaryTokenRatio?: number
  approvalCount: number
  fallbackCount: number
}

export type ExecutionBenchmarkTaskResult = {
  task: Omit<ExecutionBenchmarkTask, "fixtureRoot" | "projectRoot">
  status: ExecutionBenchmarkCheckStatus
  mode: ExecutionBenchmarkMode
  metrics: ExecutionBenchmarkTaskMetrics
  checks: ExecutionBenchmarkCheck[]
  worktree?: string
  error?: string
}

export type ExecutionBenchmarkSuiteSummary = {
  totalTasks: number
  passedTasks: number
  failedTasks: number
  durationMs: number
}

export type ExecutionBenchmarkSuiteResult = {
  startedAt: string
  mode: ExecutionBenchmarkMode
  taskIds: string[]
  results: ExecutionBenchmarkTaskResult[]
  summary: ExecutionBenchmarkSuiteSummary
}

type FixtureManifest = {
  id?: unknown
  title?: unknown
  task?: unknown
  expected?: {
    changedFiles?: unknown
    checksStatus?: unknown
    reviewDecision?: unknown
  }
}

export async function loadExecutionBenchmarkTasks(fixturesRoot = defaultExecutionBenchmarkFixturesRoot()): Promise<ExecutionBenchmarkTask[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true })
  const tasks: ExecutionBenchmarkTask[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const fixtureRoot = join(fixturesRoot, entry.name)
    const projectRoot = join(fixtureRoot, "project")
    const manifest = await readFixtureManifest(join(fixtureRoot, "benchmark.json"))
    tasks.push({
      id: manifest.id,
      title: manifest.title,
      task: manifest.task,
      fixtureRoot,
      projectRoot,
      expected: manifest.expected,
    })
  }
  return tasks.sort((left, right) => left.id.localeCompare(right.id))
}

export async function runExecutionBenchmarkSuite(options: ExecutionBenchmarkRunOptions = {}): Promise<ExecutionBenchmarkSuiteResult> {
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const mode = options.mode ?? "mock"
  const tasks = resolveExecutionBenchmarkTasks(await loadExecutionBenchmarkTasks(options.fixturesRoot), options.taskIds)
  const results: ExecutionBenchmarkTaskResult[] = []

  for (const task of tasks) {
    results.push(await runExecutionBenchmarkTask(task, {
      mode,
      keepWorktrees: options.keepWorktrees,
      executor: options.executor,
    }))
  }

  return {
    startedAt,
    mode,
    taskIds: tasks.map((task) => task.id),
    results,
    summary: summarizeExecutionBenchmarkSuite(results, elapsed(started)),
  }
}

export function resolveExecutionBenchmarkTasks(
  tasks: readonly ExecutionBenchmarkTask[],
  taskIds?: readonly string[],
): ExecutionBenchmarkTask[] {
  if (!taskIds || taskIds.length === 0) return [...tasks]
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const selected: ExecutionBenchmarkTask[] = []
  const missing: string[] = []
  for (const id of taskIds) {
    const task = byId.get(id)
    if (task) selected.push(task)
    else missing.push(id)
  }
  if (missing.length > 0) {
    throw new Error(`Unknown execution benchmark task id${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`)
  }
  return selected
}

async function runExecutionBenchmarkTask(
  task: ExecutionBenchmarkTask,
  options: Pick<ExecutionBenchmarkRunOptions, "mode" | "keepWorktrees" | "executor">,
): Promise<ExecutionBenchmarkTaskResult> {
  const mode = options.mode ?? "mock"
  const started = performance.now()
  const worktree = await prepareBenchmarkWorktree(task)
  try {
    const result = mode === "real"
      ? await runRealExecutionTask(task, worktree, options.executor)
      : await runMockExecutionTask(task, worktree)
    return {
      task: publicTask(task),
      status: summarizeExecutionBenchmarkChecks(result.checks),
      mode,
      metrics: {
        ...result.metrics,
        durationMs: elapsed(started),
      },
      checks: result.checks,
      ...(options.keepWorktrees ? { worktree } : {}),
    }
  } catch (error) {
    const metrics: ExecutionBenchmarkTaskMetrics = {
      success: false,
      changedFiles: [],
      checksStatus: "not-run",
      reviewDecision: "not-run",
      durationMs: elapsed(started),
      toolCallCount: 0,
      tokenUsage: 0,
      tokenUsageByPhase: [],
      primaryTokenUsage: 0,
      nonPrimaryTokenUsage: 0,
      approvalCount: 0,
      fallbackCount: 0,
    }
    return {
      task: publicTask(task),
      status: "failed",
      mode,
      metrics,
      checks: [{
        name: "execution",
        status: "failed",
        expected: "benchmark execution completes",
        actual: error instanceof Error ? error.message : String(error),
      }],
      ...(options.keepWorktrees ? { worktree } : {}),
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (!options.keepWorktrees) await rm(worktree, { recursive: true, force: true })
  }
}

async function runMockExecutionTask(task: ExecutionBenchmarkTask, projectRoot: string): Promise<Pick<ExecutionBenchmarkTaskResult, "metrics" | "checks">> {
  const baseline = await collectPatchBaseline(projectRoot)
  await applyMockFixturePatch(task.id, projectRoot)
  const patch = await collectPatchSummary(projectRoot, baseline)
  const checks = hasPatchActivity(patch)
    ? await runPatchChecks(projectRoot, { patch, timeoutMs: 60_000, maxOutputBytes: 8_000 })
    : undefined
  const reviewDecision = hasPatchActivity(patch)
    ? applyReviewGatesToReviewDecision(mockApprovedReviewDecision(), checks, {
        patch,
        checks,
        diff: await collectPatchDiffSnapshot(projectRoot),
        untrackedPreviews: await collectUntrackedFilePreviews(projectRoot, patch),
      }, { missingArtifacts: "changes_requested" })
    : undefined
  const metrics = collectExecutionBenchmarkMetrics(patch, checks, reviewDecision, {
    toolCallCount: task.id === "security-review-only" ? 1 : 3,
  })
  const resultChecks = evaluateExecutionBenchmarkResult(task, metrics)
  return { metrics: { ...metrics, success: summarizeExecutionBenchmarkChecks(resultChecks) === "passed" }, checks: resultChecks }
}

async function runRealExecutionTask(
  task: ExecutionBenchmarkTask,
  projectRoot: string,
  executor: ExecutionBenchmarkExecutor | undefined,
): Promise<Pick<ExecutionBenchmarkTaskResult, "metrics" | "checks">> {
  if (!executor) {
    throw new Error("Real execution benchmark requires an executor.")
  }
  const result = await executor({ prompt: task.task, projectRoot })
  const metrics = collectExecutionBenchmarkMetrics(result.patch, result.checks, result.reviewDecision, {
    toolCallCount: result.finalReport?.metrics?.toolCalls?.total ?? 0,
    tokenUsage: result.finalReport?.metrics?.tokens?.total?.total ?? 0,
    tokenUsageByPhase: normalizeBenchmarkTokenUsageByPhase(result.finalReport?.metrics?.tokens?.byPhase),
    fallbackCount: result.finalReport?.warnings?.some((warning) => /fallback/i.test(warning)) ? 1 : 0,
  })
  const resultChecks = evaluateExecutionBenchmarkResult(task, metrics)
  return { metrics: { ...metrics, success: summarizeExecutionBenchmarkChecks(resultChecks) === "passed" }, checks: resultChecks }
}

function collectExecutionBenchmarkMetrics(
  patch: PatchSummary | undefined,
  checks: PatchCheckSummary | undefined,
  reviewDecision: ReviewDecision | undefined,
  usage: Pick<ExecutionBenchmarkTaskMetrics, "toolCallCount"> & Partial<Pick<ExecutionBenchmarkTaskMetrics, "tokenUsage" | "tokenUsageByPhase" | "approvalCount" | "fallbackCount">>,
): ExecutionBenchmarkTaskMetrics {
  const patchActive = hasPatchActivity(patch)
  const tokenUsage = usage.tokenUsage ?? 0
  const tokenUsageByPhase = usage.tokenUsageByPhase ?? []
  const primaryTokenUsage = tokenUsageByPhase
    .filter((phase) => phase.phase === "primary")
    .reduce((total, phase) => total + phase.total, 0)
  const nonPrimaryTokenUsage = Math.max(0, tokenUsage - primaryTokenUsage)
  return {
    success: false,
    changedFiles: patchActive ? patch.changedFiles.map((change) => change.path).sort() : [],
    ...(patchActive ? { diffStats: patch.diffStats } : {}),
    checksStatus: checks?.status ?? "not-run",
    reviewDecision: reviewDecision?.decision ?? "not-run",
    durationMs: 0,
    toolCallCount: usage.toolCallCount,
    tokenUsage,
    tokenUsageByPhase,
    primaryTokenUsage,
    nonPrimaryTokenUsage,
    ...(primaryTokenUsage > 0 ? { brainToPrimaryTokenRatio: tokenUsage / primaryTokenUsage } : {}),
    approvalCount: usage.approvalCount ?? 0,
    fallbackCount: usage.fallbackCount ?? 0,
  }
}

function normalizeBenchmarkTokenUsageByPhase(value: unknown): Array<{ phase: string; total: number }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as { phase?: unknown; total?: unknown }
    const phase = typeof record.phase === "string" && record.phase.trim() ? record.phase.trim() : "unknown"
    const total = typeof record.total === "number" && Number.isFinite(record.total) ? Math.max(0, Math.round(record.total)) : 0
    return total > 0 ? [{ phase, total }] : []
  })
}

function evaluateExecutionBenchmarkResult(
  task: ExecutionBenchmarkTask,
  metrics: ExecutionBenchmarkTaskMetrics,
): ExecutionBenchmarkCheck[] {
  const expectedChangedFiles = [...task.expected.changedFiles].sort()
  const actualChangedFiles = [...metrics.changedFiles].sort()
  return [
    {
      name: "changed_files",
      status: sameStringSet(expectedChangedFiles, actualChangedFiles) ? "passed" : "failed",
      expected: expectedChangedFiles.length > 0 ? expectedChangedFiles.join(", ") : "(none)",
      actual: actualChangedFiles.length > 0 ? actualChangedFiles.join(", ") : "(none)",
    },
    {
      name: "checks_status",
      status: metrics.checksStatus === task.expected.checksStatus ? "passed" : "failed",
      expected: task.expected.checksStatus,
      actual: metrics.checksStatus,
    },
    {
      name: "review_decision",
      status: metrics.reviewDecision === task.expected.reviewDecision ? "passed" : "failed",
      expected: task.expected.reviewDecision,
      actual: metrics.reviewDecision,
    },
  ]
}

async function prepareBenchmarkWorktree(task: ExecutionBenchmarkTask): Promise<string> {
  const worktree = await mkdtemp(join(tmpdir(), `braincode-benchmark-${task.id}-`))
  await cp(task.projectRoot, worktree, { recursive: true })
  await runRequired(worktree, "git", ["init", "-q"])
  await runRequired(worktree, "git", ["config", "user.email", "benchmark@braincode.local"])
  await runRequired(worktree, "git", ["config", "user.name", "Braincode Benchmark"])
  await runRequired(worktree, "git", ["add", "."])
  await runRequired(worktree, "git", ["commit", "-q", "--no-gpg-sign", "-m", "benchmark fixture"])
  return worktree
}

async function applyMockFixturePatch(taskId: string, projectRoot: string): Promise<void> {
  switch (taskId) {
    case "readme-edit": {
      await appendText(join(projectRoot, "README.md"), "\n\n## Troubleshooting\n\nRun `braincode run --dry-run \"review this repo\"` to preview routing without editing files.\n")
      return
    }
    case "failing-test-fix": {
      await replaceFileText(join(projectRoot, "src/math.ts"), "return left - right", "return left + right")
      return
    }
    case "login-validation": {
      await writeFile(join(projectRoot, "src/login.ts"), `export type LoginInput = {
  email: string
  password: string
}

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: string }

export function login(input: LoginInput, authenticate: (email: string, password: string) => string | undefined): LoginResult {
  const email = input.email.trim()
  if (!email) return { ok: false, error: "Email is required." }
  if (!input.password) return { ok: false, error: "Password is required." }

  const userId = authenticate(email, input.password)
  if (!userId) return { ok: false, error: "Invalid credentials." }
  return { ok: true, userId }
}
`)
      return
    }
    case "auth-risk-change": {
      await writeFile(join(projectRoot, "src/auth/token.ts"), `export type Token = {
  subject: string
  expiresAt: number
}

export type User = {
  id: string
}

export function validateToken(token: Token, loadUser: (subject: string) => User | undefined, now = Date.now()): User | undefined {
  if (token.expiresAt <= now) return undefined
  return loadUser(token.subject)
}
`)
      return
    }
    case "package-change": {
      const packageJsonPath = join(projectRoot, "package.json")
      const packageJson = JSON.parse(await Bun.file(packageJsonPath).text()) as { scripts?: Record<string, string> }
      packageJson.scripts = {
        ...(packageJson.scripts ?? {}),
        verify: "bun run typecheck && bun run test",
      }
      await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
      await appendText(join(projectRoot, "README.md"), "\n\nRun `bun run verify` to execute typecheck and tests together.\n")
      return
    }
    case "security-review-only":
      return
    default:
      throw new Error(`No mock execution patch is defined for ${taskId}.`)
  }
}

async function appendText(path: string, text: string): Promise<void> {
  const current = await Bun.file(path).text()
  await writeFile(path, `${current}${text}`)
}

async function replaceFileText(path: string, search: string, replacement: string): Promise<void> {
  const current = await Bun.file(path).text()
  if (!current.includes(search)) throw new Error(`Fixture text not found in ${path}: ${search}`)
  await writeFile(path, current.replace(search, replacement))
}

function mockApprovedReviewDecision(): ReviewDecision {
  return {
    decision: "approved",
    confidence: 1,
    rationale: "Mock review found no concrete issue in the benchmark patch.",
    findings: [],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: [],
  }
}

async function readFixtureManifest(path: string): Promise<{
  id: string
  title: string
  task: string
  expected: ExecutionBenchmarkTask["expected"]
}> {
  const manifest = JSON.parse(await Bun.file(path).text()) as FixtureManifest
  const id = stringValue(manifest.id)
  const title = stringValue(manifest.title)
  const task = stringValue(manifest.task)
  const changedFiles = Array.isArray(manifest.expected?.changedFiles)
    ? manifest.expected.changedFiles.filter((item): item is string => typeof item === "string")
    : undefined
  const checksStatus = normalizeExpectedChecksStatus(manifest.expected?.checksStatus)
  const reviewDecision = normalizeExpectedReviewDecision(manifest.expected?.reviewDecision)
  if (!id || !title || !task || !changedFiles || !checksStatus || !reviewDecision) {
    throw new Error(`Invalid execution benchmark manifest: ${path}`)
  }
  return {
    id,
    title,
    task,
    expected: {
      changedFiles,
      checksStatus,
      reviewDecision,
    },
  }
}

function normalizeExpectedChecksStatus(value: unknown): ExecutionBenchmarkExpectedChecksStatus | undefined {
  return value === "passed" || value === "failed" || value === "skipped" || value === "not-run" ? value : undefined
}

function normalizeExpectedReviewDecision(value: unknown): ExecutionBenchmarkExpectedReviewDecision | undefined {
  return value === "approved" || value === "changes_requested" || value === "blocked" || value === "not-run" ? value : undefined
}

function publicTask(task: ExecutionBenchmarkTask): Omit<ExecutionBenchmarkTask, "fixtureRoot" | "projectRoot"> {
  return {
    id: task.id,
    title: task.title,
    task: task.task,
    expected: task.expected,
  }
}

function summarizeExecutionBenchmarkChecks(checks: readonly ExecutionBenchmarkCheck[]): ExecutionBenchmarkCheckStatus {
  return checks.some((check) => check.status === "failed") ? "failed" : "passed"
}

function summarizeExecutionBenchmarkSuite(
  results: readonly ExecutionBenchmarkTaskResult[],
  durationMs: number,
): ExecutionBenchmarkSuiteSummary {
  return {
    totalTasks: results.length,
    passedTasks: results.filter((result) => result.status === "passed").length,
    failedTasks: results.filter((result) => result.status === "failed").length,
    durationMs,
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function defaultExecutionBenchmarkFixturesRoot(): string {
  return resolve(process.cwd(), "benchmarks/fixtures")
}

function elapsed(started: number): number {
  return Math.max(0, Math.round(performance.now() - started))
}

async function runRequired(cwd: string, command: string, args: string[]): Promise<void> {
  const result = await runCommand(cwd, command, args)
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`)
  }
}

async function runCommand(cwd: string, command: string, args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => { stdout += String(chunk) })
    child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
    child.on("error", (error) => resolve({ exitCode: 127, stdout, stderr: error.message }))
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }))
  })
}

export async function ensureExecutionBenchmarkReportsDir(reportsRoot = resolve(process.cwd(), "benchmarks/reports")): Promise<string> {
  await mkdir(reportsRoot, { recursive: true })
  return reportsRoot
}
