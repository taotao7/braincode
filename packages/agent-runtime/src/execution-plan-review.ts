import type { CheckRunnerConfiguration, LocalToolMode } from "@braincode/tools"
import type { RuntimePlan } from "./router"
import type { PromptReference } from "./prompt-references"

export type ExecutionPlanReviewStatus = "approved" | "blocked" | "needs_clarification" | "auto_approved"

export type ExecutionPlanReviewApprover = "human" | "permission_policy" | "mode_policy" | "hook" | "runtime_policy"

export type ExecutionPlanSideEffectKind = "file_edit" | "patch" | "command" | "script" | "mcp" | "artifact"

export type ExecutionPlanSideEffect = {
  kind: ExecutionPlanSideEffectKind
  target: string
  risk: "low" | "medium" | "high"
}

export type ExecutionPlanReviewRecord = {
  type: "execution_plan_review"
  planId: string
  sessionId: string
  brainTaskId: string
  mode: RuntimePlan["mode"]
  status: ExecutionPlanReviewStatus
  approver: ExecutionPlanReviewApprover
  rationale: string
  brain: RuntimePlan["brain"]
  primaryRole: RuntimePlan["role"]
  routing: RuntimePlan["routing"]
  requiredReview: boolean
  workers: Array<{ role: string; goal: string; reason?: string; todoIds?: string[] }>
  todos: RuntimePlan["todos"]
  dependencies: RuntimePlan["dependencies"]
  promptReferences: Array<{ kind: PromptReference["kind"]; token: string; path: string; sessionId?: string; size?: number; reason?: string }>
  proposedSideEffects: ExecutionPlanSideEffect[]
  validationPlan: {
    checks: string[]
    evidence: string[]
    successCriteria: string[]
  }
  riskTriggers: string[]
  residualPreExecutionRisks: string[]
}

export type BuildExecutionPlanReviewOptions = {
  sessionId: string
  localToolMode: LocalToolMode
  hasApprovalCallback: boolean
  promptReferences?: PromptReference[]
  checkOptions: CheckRunnerConfiguration
  mcpServers?: Array<{ scope: string; name: string }>
}

export function buildExecutionPlanReview(
  plan: RuntimePlan,
  options: BuildExecutionPlanReviewOptions,
): ExecutionPlanReviewRecord | undefined {
  const proposedSideEffects = collectProposedSideEffects(plan, options)
  if (proposedSideEffects.length === 0) return undefined

  const status = plan.mode === "radical"
    ? "auto_approved"
    : "approved"
  const approver = plan.mode === "radical" ? "mode_policy" : "runtime_policy"
  const checks = expectedCheckNames(options.checkOptions)
  const riskTriggers = collectRiskTriggers(plan, options, proposedSideEffects)
  const residualPreExecutionRisks = collectResidualPreExecutionRisks(plan, options, proposedSideEffects)

  return {
    type: "execution_plan_review",
    planId: `${plan.context.id}:plan`,
    sessionId: options.sessionId,
    brainTaskId: plan.context.id,
    mode: plan.mode,
    status,
    approver,
    rationale: status === "auto_approved"
      ? autoApprovalRationale()
      : "Side-effectful execution is allowed to proceed behind runtime permission policy and per-tool approval callbacks.",
    brain: plan.brain,
    primaryRole: plan.role,
    routing: plan.routing,
    requiredReview: plan.agentPlan.requiresReview,
    workers: plan.workers.map((worker) => ({
      role: worker.role,
      goal: worker.goal,
      reason: worker.reason,
      todoIds: worker.todoIds,
    })),
    todos: plan.todos,
    dependencies: plan.dependencies,
    promptReferences: (options.promptReferences ?? []).map((ref) => ({
      kind: ref.kind,
      token: ref.token,
      path: ref.path,
      sessionId: ref.sessionId,
      size: ref.size,
      reason: ref.reason,
    })),
    proposedSideEffects,
    validationPlan: {
      checks,
      evidence: expectedEvidence(plan),
      successCriteria: plan.todos.length > 0
        ? plan.todos.map((todo) => todo.title)
        : [`Complete the ${plan.role} task without blocked review, failed checks, or unresolved permission denials.`],
    },
    riskTriggers,
    residualPreExecutionRisks,
  }
}

function collectProposedSideEffects(
  plan: RuntimePlan,
  options: BuildExecutionPlanReviewOptions,
): ExecutionPlanSideEffect[] {
  const effects: ExecutionPlanSideEffect[] = []
  if (options.localToolMode === "read-write" || options.localToolMode === "all") {
    effects.push(
      { kind: "file_edit", target: "project files via edit_file", risk: "medium" },
      { kind: "patch", target: "project files via apply_patch", risk: "medium" },
    )
  }
  if (options.localToolMode === "all") {
    effects.push(
      { kind: "command", target: "shell/exec_command/write_stdin/kill_background", risk: "high" },
      { kind: "script", target: "package scripts via run_script", risk: "high" },
    )
    if (plan.role !== "imageMaker") {
      effects.push({ kind: "artifact", target: "~/.braincode image artifacts via generate_image", risk: "medium" })
    }
  }
  if (plan.role === "imageMaker") {
    effects.push({ kind: "artifact", target: "~/.braincode image artifacts", risk: "medium" })
  }
  for (const server of options.mcpServers ?? []) {
    effects.push({ kind: "mcp", target: `${server.scope}:${server.name}`, risk: "medium" })
  }
  return dedupeSideEffects(effects)
}

function dedupeSideEffects(effects: ExecutionPlanSideEffect[]): ExecutionPlanSideEffect[] {
  const seen = new Set<string>()
  return effects.filter((effect) => {
    const key = `${effect.kind}:${effect.target}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function expectedCheckNames(checkOptions: CheckRunnerConfiguration): string[] {
  if (!checkOptions.enabled) return ["checks disabled by policy"]
  if (checkOptions.scripts.length > 0) return checkOptions.scripts.map((script) => `script:${script}`)
  return [`${checkOptions.strategy} package-script selection`]
}

function expectedEvidence(plan: RuntimePlan): string[] {
  const evidence = [
    "changed file summary",
    "git diff stats and capped diff snapshot",
    "untracked file previews with binary markers",
    "check_summary session record when patch activity exists",
  ]
  if (plan.agentPlan.requiresReview) {
    evidence.push("independent review_decision session record")
  }
  return evidence
}

function collectRiskTriggers(
  plan: RuntimePlan,
  options: BuildExecutionPlanReviewOptions,
  effects: ExecutionPlanSideEffect[],
): string[] {
  const triggers: string[] = []
  if (plan.agentPlan.requiresReview) triggers.push("routing requires independent review")
  if (effects.some((effect) => effect.kind === "command" || effect.kind === "script")) triggers.push("command execution exposed")
  if (effects.some((effect) => effect.kind === "file_edit" || effect.kind === "patch")) triggers.push("project file mutation exposed")
  if (effects.some((effect) => effect.kind === "mcp")) triggers.push("MCP tools exposed")
  if (!options.checkOptions.enabled) triggers.push("checks disabled")
  if (options.localToolMode !== "read-only" && !options.hasApprovalCallback && plan.mode !== "radical") {
    triggers.push("write/execute tools exposed without approval callback; risky calls will block at tool gate")
  }
  return triggers
}

function collectResidualPreExecutionRisks(
  plan: RuntimePlan,
  options: BuildExecutionPlanReviewOptions,
  effects: ExecutionPlanSideEffect[],
): string[] {
  const risks: string[] = []
  if (effects.some((effect) => effect.kind === "mcp")) {
    risks.push("MCP server tools may have server-defined side effects; runtime tool gates still apply to known local tools.")
  }
  if (!options.checkOptions.enabled) {
    risks.push("Automated checks are disabled by check policy.")
  } else if (options.checkOptions.scripts.length === 0) {
    risks.push("Exact check commands depend on smart patch classification after edits.")
  }
  if (plan.mode === "radical") {
    risks.push("Radical mode auto-approves exposed non-denied tool calls.")
  } else if (options.localToolMode !== "read-only" && !options.hasApprovalCallback) {
    risks.push("Risky local tool calls will be blocked because no approval callback is available.")
  }
  return risks
}

function autoApprovalRationale(): string {
  return "Radical mode auto-approves exposed tool calls after non-bypassable deny policy checks."
}
