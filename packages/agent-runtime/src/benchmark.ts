import type { RoutedAgentRole } from "@braincode/brain"
import type { PlanRuntimeOptions, RuntimePlan } from "./index"

export type DemoBenchmarkTaskCategory =
  | "readme-edit"
  | "failing-test-fix"
  | "auth-risk-change"
  | "package-change"
  | "security-review-only"

export type DemoBenchmarkExpectation = {
  primaryRoles: readonly RoutedAgentRole[]
  planRoles?: readonly RoutedAgentRole[]
  requiresReview: boolean
  requiresReviewWorker: boolean
  patchActivity: "expected" | "none"
  checkScripts: "expected" | "not-required"
}

export type DemoBenchmarkTask = {
  id: string
  title: string
  category: DemoBenchmarkTaskCategory
  prompt: string
  description: string
  tags: readonly string[]
  expected: DemoBenchmarkExpectation
}

export type DemoBenchmarkCheckStatus = "passed" | "failed" | "skipped"

export type DemoBenchmarkCheck = {
  name: string
  status: DemoBenchmarkCheckStatus
  expected: string
  actual: string
  reason?: string
}

export type DemoBenchmarkTaskResult = {
  task: DemoBenchmarkTask
  status: DemoBenchmarkCheckStatus
  durationMs: number
  checks: DemoBenchmarkCheck[]
  plan?: RuntimePlan
  error?: string
}

export type DemoBenchmarkSuiteSummary = {
  totalTasks: number
  passedTasks: number
  failedTasks: number
  skippedChecks: number
  passedChecks: number
  failedChecks: number
  durationMs: number
}

export type DemoBenchmarkSuiteResult = {
  startedAt: string
  useRouterBrain: boolean
  taskIds: string[]
  results: DemoBenchmarkTaskResult[]
  summary: DemoBenchmarkSuiteSummary
}

export type DemoBenchmarkRunOptions = {
  home?: string
  useRouterBrain?: boolean
  taskIds?: string[]
}

export type DemoBenchmarkPlanRunner = (
  prompt: string,
  home?: string,
  options?: PlanRuntimeOptions,
) => Promise<RuntimePlan>

export const demoBenchmarkTasks: readonly DemoBenchmarkTask[] = [
  {
    id: "readme-edit",
    title: "README edit",
    category: "readme-edit",
    description: "Small documentation-only file edit that should stay scoped and still pass through the patch/review ledger.",
    prompt: "Add a short Troubleshooting section to README.md explaining how to run `braincode run --dry-run`, and keep the change scoped to documentation.",
    tags: ["docs", "small-edit", "review-gate"],
    expected: {
      primaryRoles: ["rush", "librarian"],
      requiresReview: true,
      requiresReviewWorker: true,
      patchActivity: "expected",
      checkScripts: "not-required",
    },
  },
  {
    id: "failing-test-fix",
    title: "Failing test fix",
    category: "failing-test-fix",
    description: "Debugging task where implementation and verification should be visible in the plan.",
    prompt: "Fix the failing test in packages/tools by finding the regression, updating the implementation, and running the focused test command.",
    tags: ["tests", "debugging", "checks"],
    expected: {
      primaryRoles: ["qa", "backend"],
      planRoles: ["qa"],
      requiresReview: true,
      requiresReviewWorker: true,
      patchActivity: "expected",
      checkScripts: "expected",
    },
  },
  {
    id: "auth-risk-change",
    title: "Auth-risk change",
    category: "auth-risk-change",
    description: "Security-sensitive implementation request that should involve auth/security reasoning and mandatory review.",
    prompt: "Change the auth token validation path to reject expired tokens before loading the user record, and call out any authorization assumptions.",
    tags: ["auth", "security", "backend", "review-gate"],
    expected: {
      primaryRoles: ["security", "backend"],
      planRoles: ["security"],
      requiresReview: true,
      requiresReviewWorker: true,
      patchActivity: "expected",
      checkScripts: "expected",
    },
  },
  {
    id: "package-change",
    title: "Package change",
    category: "package-change",
    description: "Workspace/package-script maintenance task that should route through build or DevOps ownership.",
    prompt: "Add a package script that runs the typecheck and test suite for the workspace, then update the development commands documentation.",
    tags: ["package-json", "scripts", "devops"],
    expected: {
      primaryRoles: ["devops"],
      requiresReview: true,
      requiresReviewWorker: true,
      patchActivity: "expected",
      checkScripts: "expected",
    },
  },
  {
    id: "security-review-only",
    title: "Security review only",
    category: "security-review-only",
    description: "Read-only defect inspection task that should not be treated as a file-changing run.",
    prompt: "Perform a security review only of the current authentication diff. Report concrete findings, risk level, and evidence; do not alter files.",
    tags: ["security", "review", "read-only"],
    expected: {
      primaryRoles: ["review", "security"],
      planRoles: ["review"],
      requiresReview: false,
      requiresReviewWorker: false,
      patchActivity: "none",
      checkScripts: "not-required",
    },
  },
]

export function resolveDemoBenchmarkTasks(taskIds?: readonly string[]): DemoBenchmarkTask[] {
  if (!taskIds || taskIds.length === 0) return [...demoBenchmarkTasks]

  const byId = new Map(demoBenchmarkTasks.map((task) => [task.id, task]))
  const tasks: DemoBenchmarkTask[] = []
  const missing: string[] = []
  for (const id of taskIds) {
    const task = byId.get(id)
    if (task) tasks.push(task)
    else missing.push(id)
  }

  if (missing.length > 0) {
    throw new Error(`Unknown benchmark task id${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`)
  }
  return tasks
}

export function evaluateDemoBenchmarkPlan(task: DemoBenchmarkTask, plan: RuntimePlan): DemoBenchmarkCheck[] {
  const routeSource = plan.routing.source
  const usesRouterBrain = routeSource === "router-brain"
  const roleSet = new Set<RoutedAgentRole>([
    plan.role,
    ...plan.workers.map((worker) => worker.role),
    ...plan.todos.map((todo) => todo.role),
  ])
  const reviewWorkerPresent = plan.role !== "review" && plan.workers.some((worker) => worker.role === "review")
  const todoIds = new Set(plan.todos.map((todo) => todo.id))
  const workerTodoIdsAreValid = plan.workers.every((worker) => (worker.todoIds ?? []).every((todoId) => todoIds.has(todoId)))
  const childContextCountMatchesWorkers = plan.context.childContextIds.length === plan.workers.length

  const checks: DemoBenchmarkCheck[] = [
    {
      name: "primary_role",
      status: usesRouterBrain
        ? passIf(task.expected.primaryRoles.includes(plan.role))
        : "skipped",
      expected: task.expected.primaryRoles.join(" | "),
      actual: plan.role,
      reason: usesRouterBrain ? undefined : "heuristic fallback does not attempt specialist routing",
    },
    {
      name: "review_policy",
      status: passIf(plan.agentPlan.requiresReview === task.expected.requiresReview),
      expected: String(task.expected.requiresReview),
      actual: String(plan.agentPlan.requiresReview),
    },
    {
      name: "review_worker",
      status: passIf(reviewWorkerPresent === task.expected.requiresReviewWorker),
      expected: String(task.expected.requiresReviewWorker),
      actual: String(reviewWorkerPresent),
    },
    {
      name: "todo_coverage",
      status: passIf(plan.todos.length > 0 && workerTodoIdsAreValid),
      expected: "todos exist and worker todoIds resolve",
      actual: `${plan.todos.length} todos, worker todoIds ${workerTodoIdsAreValid ? "valid" : "invalid"}`,
    },
    {
      name: "context_isolation",
      status: passIf(childContextCountMatchesWorkers && new Set(plan.context.childContextIds).size === plan.context.childContextIds.length),
      expected: "one unique child context per worker",
      actual: `${plan.context.childContextIds.length} child contexts for ${plan.workers.length} workers`,
    },
  ]

  if (task.expected.planRoles && task.expected.planRoles.length > 0) {
    checks.splice(1, 0, {
      name: "plan_roles",
      status: usesRouterBrain
        ? passIf(task.expected.planRoles.every((role) => roleSet.has(role)))
        : "skipped",
      expected: task.expected.planRoles.join(", "),
      actual: [...roleSet].join(", "),
      reason: usesRouterBrain ? undefined : "heuristic fallback does not attempt specialist routing",
    })
  }

  return checks
}

export async function runDemoBenchmarkSuite(
  planRunner: DemoBenchmarkPlanRunner,
  options: DemoBenchmarkRunOptions = {},
): Promise<DemoBenchmarkSuiteResult> {
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const useRouterBrain = options.useRouterBrain ?? true
  const tasks = resolveDemoBenchmarkTasks(options.taskIds)
  const results: DemoBenchmarkTaskResult[] = []

  for (const task of tasks) {
    const taskStarted = performance.now()
    try {
      const plan = await planRunner(task.prompt, options.home, { useRouterBrain })
      const checks = evaluateDemoBenchmarkPlan(task, plan)
      results.push({
        task,
        status: summarizeChecks(checks),
        durationMs: elapsed(taskStarted),
        checks,
        plan,
      })
    } catch (error) {
      results.push({
        task,
        status: "failed",
        durationMs: elapsed(taskStarted),
        checks: [{
          name: "plan_error",
          status: "failed",
          expected: "runtime plan",
          actual: error instanceof Error ? error.message : String(error),
        }],
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    startedAt,
    useRouterBrain,
    taskIds: tasks.map((task) => task.id),
    results,
    summary: summarizeSuite(results, elapsed(started)),
  }
}

function passIf(value: boolean): DemoBenchmarkCheckStatus {
  return value ? "passed" : "failed"
}

function summarizeChecks(checks: DemoBenchmarkCheck[]): DemoBenchmarkCheckStatus {
  if (checks.some((check) => check.status === "failed")) return "failed"
  return "passed"
}

function summarizeSuite(results: DemoBenchmarkTaskResult[], durationMs: number): DemoBenchmarkSuiteSummary {
  const allChecks = results.flatMap((result) => result.checks)
  return {
    totalTasks: results.length,
    passedTasks: results.filter((result) => result.status === "passed").length,
    failedTasks: results.filter((result) => result.status === "failed").length,
    skippedChecks: allChecks.filter((check) => check.status === "skipped").length,
    passedChecks: allChecks.filter((check) => check.status === "passed").length,
    failedChecks: allChecks.filter((check) => check.status === "failed").length,
    durationMs,
  }
}

function elapsed(started: number): number {
  return Math.max(0, Math.round(performance.now() - started))
}
