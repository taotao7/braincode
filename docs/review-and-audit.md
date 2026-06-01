# Review and Audit

This document defines Braincode's review-gate and audit-trail contract. If you are changing tool permissions, patch checks, review workers, final reports, session records, or any path that can write files or execute commands, read this first.

The short version: **the review gate is the contract between planning and execution, and the audit trail is the reconstruction surface after execution.** A run should expose what it intends to validate before meaningful side effects, and it should leave enough structured evidence afterward to explain what happened and why it was allowed.

## Design goals

- Validate before execution, not only after a patch exists.
- Make approval decisions explicit, structured, and bound to a plan or tool call.
- Preserve a durable trail of plan, permission, tool, check, review, and final-report events.
- Keep the trail queryable from session JSONL instead of relying on terminal text.
- Let users reconstruct the run by task id, worker context id, tool call, changed file, and review decision.
- Keep safety policy enforceable in every mode: `radical` may auto-approve allowed actions, but it must not bypass deny rules or skip audit records.

## Gate layers

Braincode has several gates. They are ordered by how early they can prevent bad execution.

| Gate | When | Purpose | Current owner |
|------|------|---------|---------------|
| Intent clarification | Before worker handoff | Stop when the request is not actionable enough for specialist execution. | `packages/brain`, `packages/agent-runtime` |
| Execution plan review | Before meaningful side effects | Capture the plan, assumptions, validation target, risk, and approval basis before writes or commands. | Architecture target; partially covered by routing plan, todos, permission approval |
| Permission policy | Before each risky tool call | Enforce path/command allow/ask/deny rules and mark review-required actions. | `packages/tools`, `packages/agent-runtime` |
| Patch/check gate | After edits, before review/final report | Collect changed files, diff, untracked previews, and checks; failed checks cannot be reported as approved. | `packages/agent-runtime` |
| Independent review | After primary work, before final report | Run a separate review worker for risky work and return a typed decision. | `packages/agent-runtime` |
| Final report | End of run | Merge patch, checks, review, residual risks, metrics, and warnings into the user-facing result. | `packages/agent-runtime`, `apps/cli` |

These gates should compose into one story. A user should be able to answer: what did Braincode intend to do, what approved it, what changed, what evidence was checked, what the reviewer decided, and what risk remains.

## Execution plan review

Any run that can write files, apply patches, execute commands, run package scripts, or call risky MCP tools should have a plan review surface before the first side effect. This is not just a confirmation dialog. It is the structured contract that later audit records bind to.

The plan review should contain:

- `planId`, `sessionId`, and Brain task context id.
- Original user goal and expanded prompt-reference summary.
- Selected mode, Brain Model, primary role, support workers, and review requirement.
- Routing source, confidence, and reason.
- Todo list and dependency graph.
- Known assumptions and missing information.
- Proposed side effects, ideally as paths/globs, command categories, MCP tools, or explicit commands when known.
- Validation plan: expected checks, evidence to inspect, review artifacts, and success criteria.
- Risk triggers: permission-policy matches, sensitive paths, package/CI/auth/db changes, command execution, skipped checks, truncated diffs.
- Approval outcome: approved, blocked, needs clarification, or auto-approved by mode/policy.
- Approval rationale and approver kind: human, permission policy, mode policy, hook, or runtime policy.

`radical` mode can auto-approve policy-allowed work, but the plan review record should still exist and should say why auto-approval was valid. Deny rules remain non-bypassable.

Suggested future record shape:

```ts
type ExecutionPlanReview = {
  type: "execution_plan_review"
  planId: string
  sessionId: string
  brainTaskId: string
  mode: "auto" | "radical"
  status: "approved" | "blocked" | "needs_clarification" | "auto_approved"
  approver: "human" | "permission_policy" | "mode_policy" | "hook" | "runtime_policy"
  rationale: string
  proposedSideEffects: Array<{
    kind: "file_edit" | "patch" | "command" | "script" | "mcp"
    target: string
    risk: "low" | "medium" | "high"
  }>
  validationPlan: {
    checks: string[]
    evidence: string[]
    successCriteria: string[]
  }
  requiredReview: boolean
  residualPreExecutionRisks: string[]
}
```

This record should be appended before the first write/execute action. Later tool, check, review, patch, and final-report records should include enough ids or context to trace back to it.

## Permission decisions

Permission policy is the narrow gate immediately before a risky tool call. It must not be treated as a substitute for the plan review, because it answers a smaller question: "May this specific action run now?"

Rules:

- Path rules evaluate `edit_file` and `apply_patch` targets before mutation.
- Command rules evaluate `shell`, `exec_command`, and `run_script` before process start.
- Deny decisions cannot be bypassed by `--yes` or `radical`.
- Ask decisions surface through the active approval flow unless the active mode/policy can auto-approve them.
- `review: "required"` marks the run as requiring independent review and should be visible in the final report.
- Successful risky tool results should carry matched policy details in structured metadata.

Durable approval records should include the tool call id, tool name, target path or command, matched rules, decision, approver kind, and reason. The UI can render these compactly, but the session ledger should preserve the structured details.

## Patch and check gate

After patch activity, Braincode must collect review artifacts before it can claim the run is approved:

- changed files and pre-existing changed files;
- diff stats and capped diff snapshot;
- untracked file previews, with binary markers instead of raw binary content;
- check summary, including why checks ran or were skipped;
- smart patch kind and whether that kind requires review.

Review Gate v2 enforces these invariants:

- Failed checks override review approval.
- Skipped checks and truncated diffs become residual risks.
- Missing required patch/check/diff artifacts cannot produce a clean approval.
- Review-required path/command/check classifications add a review worker if the router did not already include one.

The check gate is still post-edit, but it is part of the same contract: the pre-execution plan should say what evidence will matter, and the post-edit gate should show whether that evidence was actually collected.

## Independent review

The review worker is an isolated agent, not the primary agent grading itself. It receives the original request, primary summary, worker summaries, patch artifacts, checks, diff evidence, and a review handoff packet. It returns a typed review decision:

```ts
type ReviewDecision = {
  decision: "approved" | "changes_requested" | "blocked"
  confidence?: number
  rationale: string
  findings: ReviewFinding[]
  requiredChanges: string[]
  blockingIssues: string[]
  residualRisks: string[]
}
```

Review rules:

- Findings come first and should cite exact files/lines when available.
- `approved` means no concrete blocking defect was found in the available evidence, not that the run is risk-free.
- `changes_requested` is a fix-loop trigger when the run is eligible and budget remains.
- `blocked` is not auto-fixed; it means a human or external state change is required.
- Review workers may use read-only evidence tools but must not edit files or execute commands.

## Audit trail

The session JSONL under `~/.braincode/sessions/<id>.jsonl` is the durable audit trail. It should be sufficient to reconstruct the run without terminal scrollback or private worker transcripts.

Existing records already cover much of the trail:

- `run_start`, `run_end`, `run_error`
- `execution_plan_review`
- `context_plan`
- `todo_plan`, `todo_update`
- `clarification_request`
- `agent_message`
- `worker_start`, `worker_end`, `worker_error`
- `tool_approval_decision`
- `tool_execution_summary`
- `check_summary`
- `review_decision`
- `fix_iteration`
- `patch_summary`
- `final_report`
- `token_usage`, `tool_call_count`
- `mcp_connect`
- `hook_*`

Records that should become first-class as the plan review matures:

- `review_artifacts_summary` to identify exactly which diff/check/untracked evidence was passed to review.

Do not put private chain-of-thought, full worker transcripts, or raw command output dumps into the audit trail. Store structured summaries, bounded evidence, ids, status, and references.

## Package ownership

- `packages/brain` decides routing, role selection, todo decomposition, and whether the plan requires review.
- `packages/agent-runtime` enforces the gate sequence, records session JSONL events, runs patch checks, runs review workers, applies review-gate downgrades, and builds final reports.
- `packages/tools` defines tool risk, approval policy, path/command permission evaluation, and structured policy details.
- `packages/context` owns task ids, parent/child context relationships, and handoff/result packet shapes.
- `packages/protocol` owns shared event and message vocabulary that may cross process/UI boundaries.
- `packages/config` persists and reads session JSONL, usage records, tool policy, hooks, and project support files.
- `apps/cli` renders plan previews, approval prompts, progress, review status, and final reports without owning policy.
- `apps/config-web` edits persistent policy and can preview permission decisions before an agent runs.

## Contributor rules

- Do not add a new write/execute path without a permission decision and an audit record.
- Do not let UI approval state be the only record of why an action was allowed.
- Do not report approval when checks failed, required artifacts are missing, or review is blocked.
- Do not let `radical` skip deny rules or erase auditability.
- Do not pass full worker transcripts into review or final reports; use structured worker results and bounded artifacts.
- When adding a new gate, add a session record type and update `@@` session context if future runs need to remember it.
- When changing review, checks, permissions, or audit records, add focused tests near the owning module.

## Current gaps

The current implementation already has intent clarification, runtime todo plans, pre-execution `execution_plan_review` records for side-effectful runs, plan-review rendering in CLI/TUI final reports, permission policy, durable `tool_approval_decision` records, durable `tool_execution_summary` records, tool approval callbacks, smart checks, review workers, review-gate enforcement, patch summaries, final reports, and session JSONL records.

The remaining gaps are explicit human approval for the whole execution plan where policy requires it, a dedicated `review_artifacts_summary` record, and focused tests for more mode-specific combinations such as radical MCP runs and `--yes` command execution.
