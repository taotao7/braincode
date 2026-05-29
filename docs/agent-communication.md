# Agent Communication

**Languages**: [English](./agent-communication.md) · [中文](./agent-communication.zh.md) · [Français](./agent-communication.fr.md)

This document explains how Braincode's orchestrator (Brain) talks to worker agents and how workers talk back. If you are wiring a new role, changing how a worker is invoked, adding a runtime event, or designing a UI that needs to observe a run — start here.

The companion document is [context-management.md](./context-management.md), which covers what *information* crosses these boundaries. This document covers the *protocol* by which it crosses.

## Topology

Braincode is intentionally not a peer-to-peer agent mesh. Every conversation passes through Brain:

```
                       +-----------------+
                       |    Brain        |
                       |  (orchestrator) |
                       +--------+--------+
                                |
              HandoffPacket   <-+->  WorkerResult
                                |
        +-----------+-----------+-----------+-----------+
        |           |           |           |           |
   support#1   support#2   support#3      ...        review
   (isolated   (isolated   (isolated                (isolated,
    agent)      agent)      agent)                   runs after
                                                     primary)
```

- Workers do not talk to each other.
- Workers do not see Brain's transcript.
- Brain is the only merger of structured results.
- "Primary" is whichever routed worker the plan elected to produce the user-facing answer; review (when required) is a separate worker that sees the primary's summary.

This is enforced not by infrastructure but by *what the prompts contain* — each worker gets a self-contained handoff and the original user request, nothing more.

## The wire vocabulary

The shared shapes live in two packages.

`packages/protocol/src/index.ts` — the cross-process / cross-package vocabulary:

```ts
export type ContextRef = {
  kind: "file" | "thread" | "summary" | "artifact"
  uri: string
  label?: string
}

export type AgentMessage = {
  id: string
  parentId?: string
  from: string
  to: string | "orchestrator"
  kind: "handoff" | "result" | "question" | "fact" | "artifact" | "error"
  payload: unknown
  contextRefs?: ContextRef[]
}
```

`AgentMessage` is the **outer envelope** for any communication that needs to be addressed/routed. The current in-process orchestrator still passes `HandoffPacket` / `WorkerResult` directly to local functions, and it also records Brain-to-agent handoffs plus agent-to-Brain results as `agent_message` JSONL events. Anything that eventually crosses a process boundary (a future remote worker runtime, a multi-machine setup, an external client) should use the same envelope.

`packages/context/src/index.ts` — the concrete payloads used today:

```ts
HandoffPacket = BrainToAgentContextTransfer & {
  id: string
  task: AgentTaskContext
  constraints: string[]
  expectedResult: string
}

WorkerResult = AgentToBrainContextTransfer & {
  handoffId: string
  taskId: string
  parentId: string
  progress: TaskProgress
  summary: string
  artifacts: ContextRef[]
  risks: string[]
  nextQuestions: string[]
}
```

Mapping the two:

| `AgentMessage.kind` | Today's payload | Notes |
|---------------------|----------------|-------|
| `handoff` | `HandoffPacket` | Brain → worker, kicks off a worker run. |
| `result` | `WorkerResult` | worker → Brain, returns the structured output. |
| `error` | `WorkerResult` with `progress.status = "failed"` | Failures are returned as results, not exceptions, so the merger can render them. |
| `question`, `fact`, `artifact` | reserved | Not used yet. When introduced, they should ride the same envelope and respect direction. |

## Lifecycle of one worker

`runWorkerFromPlan` in `packages/agent-runtime/src/index.ts` is the canonical worker driver. The shape it implements:

```
plan a worker  -->  createWorkerHandoff(worker, parentId, phase)
                       |
                       v
append agent_message(handoff)
                       |
                       v
SubagentStart hook  --(may add context, may block)
                       |
                       v
selectRuntimeModelCandidatesWithApiKey(policy)   <-- ordered list from model-selection.ts
                       |
                       v
for each candidate (until one succeeds):
    new Pi Agent (fresh session, fresh prompt history)
    prompt = buildSupportWorkerPrompt | buildReviewPrompt
    runtime.agent.prompt(prompt)
    text = last assistant message
    result = normalizeWorkerResultText(text, handoff)
                       |
                       v
SubagentStop hook (on success)
                       |
                       v
appendSessionRecord("worker_end", ...)
append agent_message(result)
emit WorkerLifecycleEvent("worker_end", "completed")
return ExecutedWorkerResult
```

Failure path: each candidate failure logs `worker_error`, and the loop tries the next candidate. If all candidates fail, `failedWorkerResult` produces an `ExecutedWorkerResult` with `progress.status = "failed"` and `risks: [errorMessage]` — surfaced to the user the same way as any other result.

`ExecutedWorkerResult` is `WorkerResult` plus three runtime-only fields (`role`, `goal`, `status`, optional `error`). These never go *into* a worker; they only exist on the merge side.

## How a run is composed

`executePromptFromConfig` is the end-to-end orchestrator. Its high-level shape:

```
1. Run SessionStart + UserPromptSubmit hooks (either may block, both may add context).
2. expandPromptReferences:   resolve @<file>, @@<session>  -> appended sections.
3. buildRuntimePlan:         heuristic routing, then router-brain refinement.
   - When --team forced roles are supplied, plan.workers is overridden.
4. runSupportWorkers (parallel when independent, capped by the mode-adjusted routing limit):
   - Each worker is independent. No worker sees another's handoff or transcript.
   - If todo dependencies require one support result before another, Brain runs the upstream worker first and supplies only its normalized summary to the dependent worker.
   - Librarian, QA, security, and review-style support workers receive read-only project tools for evidence gathering.
5. Connect MCP servers via McpToolHub -> primary agent gets MCP tools.
6. Try each model candidate for the primary role:
     buildPrimaryPrompt(user_request, workerResults, primaryRole, projectSupport)
     runtime.agent.prompt(...)
     primarySummary = last assistant text
7. If plan.requiresReview && primary !== "review":
     runWorkerFromPlan(reviewWorker, buildReviewPrompt(...), phase="review")
     mergeReviewResult appends review decision, findings, residual risks, and risks to primarySummary.
8. Run Stop hook. Append run_end. Return { sessionId, summary, plan, workerResults, mcp }.
```

Notes worth internalizing before changing this code:

- **Support workers and the primary are not the same kind of call.** Support workers return a normalized `WorkerResult`. The primary returns free-form assistant text that is shown to the user. Confusing the two breaks the contract for both.
- **Support worker tools are evidence-only.** Read-only support tools help selected workers inspect code and diffs, but tool transcripts do not cross into the primary context except through the worker's structured summary/artifacts/risks.
- **Review is post-primary, not parallel.** Review needs the primary's output to do its job.
- **The forced-roles path (`/team`) skips review** by setting `requiresReview = false`. That is intentional — team mode is for independent multi-agent answers, not a workflow.

## Routing: heuristic + router brain

Two routers cooperate to produce an `AgentRoutingPlan`:

- `planAgentRouting(prompt, brain)` in `packages/brain` — deterministic safe fallback. Used for heuristic diagnostics, provider failures, and the baseline the router brain refines.
- `routePromptWithBrain(prompt, brain, models, mode, fallback, home)` in `agent-runtime` — calls the brain's `planner` / `roles.routeBrain` model with a strict JSON prompt and parses the result. `normalizeRouterDecision` validates and caps the choice against the heuristic fallback and `brain.routing.maxParallelAgents`.

The two paths normalize into the same shape:

```ts
type AgentRoutingPlan = {
  primaryRole: RoutedAgentRole
  workers: AgentWorkerPlan[]    // { role, goal, reason, todoIds }
  todos: AgentTodoItem[]        // checkable tasks assigned to routed roles
  dependencies: AgentTodoDependency[] // fromTodoId -> toTodoId edges
  requiresReview: boolean
  reason: string
}
```

`buildRuntimePlan` then expands every `AgentWorkerPlan` into a `RuntimeWorkerPlan`, assigns each worker a stable agent context id, resolves that role's configured execution policy, and builds the runtime todo list and dependency graph, including policy-added review work. It also applies mode routing limits: auto uses the configured worker/concurrency cap and 6 todos; radical raises the effective worker and support-concurrency budgets to at least 4 and allows 8 todos. The final `RuntimePlan` is what the rest of the orchestrator consumes.

Before routing, `selectBrain` resolves Brain preset inheritance. A brain with `extends: "brain"` inherits the parent planner, roles, routing, and context, then applies its own focused overrides.

If you add a new role:

1. Add it to `routedAgentRoles` and to `BrainModel.roles`.
2. Add a profile in `agentRoleProfiles` and a system prompt in `agentRoleSystemPrompts`.
3. Make sure the new role appears in the router-brain prompt by using `routedAgentRoles` as the generated enum source.

The router prompt includes the full role catalog from `agentRoleProfiles` plus the selected Brain Model's routed role-policy capability summaries. The role catalog describes role identity, capabilities, boundaries, and output contracts; each selected role still executes through its own `modelId -> fallbackModelIds` chain. `models.json` is the capability registry used to validate those ids, not a free global pool and not a source for rebinding a role to the planner or another role's model.

## Prompts sent to a worker

Three builders shape every worker prompt:

- `buildSupportWorkerPrompt(originalPrompt, handoff, projectSupport)` — used for parallel support workers. Contents: project support section, original user request, the full `HandoffPacket` as JSON, and the expected reply JSON shape (with `taskId` / `parentId` pre-filled to enforce echo).
- `buildPrimaryPrompt(originalPrompt, workerResults, primaryRole, projectSupport)` — used for the primary agent. Contents: project support section, original user request, formatted worker summaries, and a directive to "treat worker results as advisory context, resolve conflicts explicitly".
- `buildReviewPrompt(originalPrompt, primarySummary, workerResults, handoff, projectSupport)` — used for the review worker. Contents: project support section, read-only tool guidance, original user request, primary summary, worker summaries, the review handoff packet, and the expected JSON reply shape with `decision`, severity-ranked `findings`, `requiredChanges`, `blockingIssues`, and `residualRisks`.

`formatWorkerResults` is the shared formatter for the worker-summary block. Each entry is:

```
### <role> (<status>)
Task: <taskId> -> <parentId>
Goal: <goal>
Progress: <status>: <summary>
Summary: <summary>
Risks:
- ...
Open questions:
- ...
```

If you need a new way to present results, extend the formatter — do not pass the raw `ExecutedWorkerResult[]` into a prompt elsewhere.

## Reliability: model + provider fallback

Each worker (and the primary) pulls an ordered list of candidates from `selectRuntimeModelCandidatesWithApiKey` in `packages/agent-runtime/src/model-selection.ts`:

1. The policy's `modelId`, then `fallbackModelIds`, in order.

The runtime does not scan `models.json` as a global fallback pool. Fallbacks must be explicit in the selected Brain Model's planner/role policies so model execution stays inside the user's configured routing strategy.

If prompt expansion attached image inputs, the same candidate path is called with `requiresVision: true`. This is a hard runtime constraint for the router brain, support workers, primary agent, and review worker: text-only models are skipped before provider execution. routeBrain should select roles whose own policy chains include a vision-capable candidate; runtime will fail with the router/model error instead of rebinding that role to the planner model.

When extending policy or adding a model field, make sure the explicit primary/fallback list respects it.

## Hooks: the third party in every conversation

Hooks are the project's escape hatch for observability and policy. They run at five lifecycle points today:

| Event | When | Can block? | Adds context? |
|-------|------|------------|---------------|
| `SessionStart` | before any prompt expansion | yes (whole run) | yes |
| `UserPromptSubmit` | after expansion, before plan | yes (prompt) | yes |
| `SubagentStart` | before each worker's prompt | yes (worker run only) | yes |
| `SubagentStop` | after each worker's success | no | no |
| `Stop` | after primary + review | no | yes (appended as feedback) |

`runConfiguredHooks` runs every matching handler concurrently. Stdout is parsed (`parseHookOutput`) — JSON wins; plain text becomes additional context only for `SessionStart` / `SubagentStart` / `UserPromptSubmit`. Handlers must declare `trusted: true` until a review UI exists.

Hook output is recorded in the session JSONL (`hook_session_start`, `hook_user_prompt_submit`, `hook_subagent_start`, `hook_subagent_stop`, `hook_stop`). When a hook blocks, the orchestrator throws with the blocking reason rather than continuing silently.

If you are debugging a "why didn't this prompt run" mystery — check hooks first.

## Runtime events for the UI

The TUI (`apps/cli`) drives the bottom-right BrainPet footer and live progress display from two event streams:

- **`AgentEvent`** from `@earendil-works/pi-agent-core` — token stream, tool calls, tool results, etc. Subscribed via `agent.subscribe(...)`. `BraincodeAgentRuntimeOptions.onEvent` is the hook the TUI uses to forward these to the renderer.
- **`WorkerLifecycleEvent`** from `agent-runtime` — Braincode-level worker boundaries:

```ts
type WorkerLifecycleEvent =
  | { type: "worker_start"; role: RoutedAgentRole; goal: string;
      phase: "support" | "review"; modelId: string; todoIds?: string[] }
  | { type: "worker_end";   role: RoutedAgentRole;
      phase: "support" | "review";
      status: "completed" | "failed"; summary?: string; error?: string;
      todoIds?: string[] }
```

Workers emit `worker_start` after `SubagentStart` hooks settle and `worker_end` after the result is normalized. The CLI uses these to populate BrainPet progress snippets and to drive the queued-tasks list. BrainPet is read-only UI: it can summarize or quip about visible context, but it does not affect routing or execution.

- **`onPlan` / `TodoLifecycleEvent`** from `AgentRunRequest` — Braincode-level todo planning and status updates. `onPlan` gives the UI the initial todo list; `TodoLifecycleEvent` moves each item through pending/running/completed/blocked/failed as the primary, support workers, and review workers finish.
- **Render data flow** in the TUI — input draft/cursor updates, transcript/scroll updates, live run status, toast/queue state, and BrainPet snapshots are separate stores consumed by separate Ink surfaces. Ordinary typing patches the input box directly with ANSI without asking Ink to redraw the frame; layout-changing input updates still flow through Ink. High-frequency token flushes update only the transcript surface, while the status line and BrainPet footer keep their own refresh cadence.
- **Live run status** in the TUI — elapsed time is driven by a local one-second timer, while token totals still come from provider `AgentEvent` usage data. This avoids freezing the visible timer during long model calls with no streaming updates.
- **Transcript folding** in the TUI — tool and agent rows with `▸` / `▾` markers are toggled with `Ctrl+T`; mouse capture is only used for wheel scrolling and can be disabled with `BRAINCODE_TUI_MOUSE=false`.
- **Intent graph view** in the TUI — `Ctrl+O` or `/intent` opens the current task decomposition and dependency path from the latest `RuntimePlan`, including routing source, confidence, reason, workers, and mode budgets.
- **Router plan preview** in the TUI — `/plan <task>` asks the configured `routeBrain` by default; `/plan --heuristic <task>` is reserved for deterministic no-provider diagnostics. Router failures on text-only input are surfaced as a heuristic fallback in `RuntimePlan.routing`; image input requires routeBrain and reports router failures directly.

When you add a new lifecycle moment that the UI should know about, prefer extending an existing typed event (`AgentEvent`, `WorkerLifecycleEvent`, or `TodoLifecycleEvent`) before adding another callback surface.

## Multi-agent runs: `/team` and the forced-roles path

`/team` lets the user fan out a single prompt to multiple specialist roles independently. The plan-building code (`buildRuntimePlan`) takes a `forceRoles?: RoutedAgentRole[]` from `AgentRunRequest.forceRoles`. When supplied:

- Routing skips the router brain.
- Every forced role becomes a worker.
- The first forced role is the primary.
- `requiresReview` is forced to `false`.
- Each worker's goal is "Respond independently as the <role> agent."

Because each worker is still isolated, `/team` outputs are genuinely independent perspectives — not a debate. If you want a debate flow later, build it as a new role (e.g. `moderator`) that runs after the fanned-out workers and consumes their `WorkerResult`s.

## Why we do not let workers message each other

It is tempting to let two workers exchange a quick question without going through Brain. We do not, for three reasons:

1. **Context budget.** Direct A↔B chatter compounds quickly. The current model — Brain picks the next question and re-handoffs — caps the worst case.
2. **Failure surface.** Brain owns retry/fallback. If A could call B directly, a B failure becomes A's exception, and we lose the structured `failed` result that the merger expects.
3. **Replay/audit.** Session JSONL is the source of truth. Every Brain↔worker exchange is recorded. Side-channel messages would have to be recorded somewhere else, and history shows that side channels never get recorded for long.

If you need richer collaboration, add a sequenced plan step (worker A → Brain → worker B with A's `WorkerResult` in the handoff), not a peer link.

## Adding a new message kind

If you genuinely need a new packet kind (e.g. an interactive "ask the user a clarifying question"):

1. Decide its direction. Extend `BrainToAgentContextTransfer` or `AgentToBrainContextTransfer`. If neither fits, the design is probably wrong.
2. Add the payload type to `packages/context`.
3. Add the `kind` value to `AgentMessage.kind` in `packages/protocol` if it needs to travel over the wire.
4. Add a builder + normalizer in `agent-runtime` (mirroring `createWorkerHandoff` / `normalizeWorkerResultText`).
5. Append a record type to the session JSONL so replay/`@@` keep working.
6. If the UI should observe it, extend `WorkerLifecycleEvent` (or define a sibling event with the same shape discipline).

Steps 1–3 are the contract. Steps 4–6 are how the rest of Braincode stays consistent with it.

## Where to look

- Envelope: `packages/protocol/src/index.ts` — `AgentMessage`, `ContextRef`.
- Payloads: `packages/context/src/index.ts` — `HandoffPacket`, `WorkerResult`, task contexts, direction constants.
- Worker driver: `runWorkerFromPlan` in `packages/agent-runtime/src/index.ts`.
- Plan composition: `buildRuntimePlan`, `routePromptWithBrain`, `normalizeRouterDecision`.
- Prompt builders: `buildSupportWorkerPrompt`, `buildPrimaryPrompt`, `buildReviewPrompt`, `formatWorkerResults`.
- Reliability: `selectRuntimeModelCandidatesWithApiKey` in `packages/agent-runtime/src/model-selection.ts`.
- Hooks: `runConfiguredHooks`, `runAndRecordHooks`, `parseHookOutput`.
- UI events: `WorkerLifecycleEvent`, `AgentRunRequest.onEvent` / `onWorkerEvent` / `onMcpReport`.
