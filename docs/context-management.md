# Context Management

**Languages**: [English](./context-management.md) · [中文](./context-management.zh.md) · [Français](./context-management.fr.md)

This document is the contributor guide for Braincode's context model. If you are editing prompts, adding a worker role, changing what flows between Brain and a subagent, or touching prompt references — read this first.

The short version: **Brain owns the orchestration context. Each worker owns exactly one isolated task context. Only structured packets cross the boundary, never a full transcript.** Everything else in this document explains how that invariant is enforced and where it lives in the code.

## Why isolation matters

Today's chat-style transcripts grow without bound. When several agents work on the same task, copying the full transcript into each one wastes tokens, leaks private reasoning, and tangles failure modes. Braincode instead treats the orchestrator and each worker as separate context owners with a typed packet protocol between them. The result:

- Workers can be cheap models without being poisoned by unrelated context.
- The orchestrator can run, resume, or recover a session because every task has a stable id.
- Adding a role does not enlarge the shared prompt of every other role.
- Cross-provider fallback (we may retry a worker on a different provider) is safe because the worker's input is self-contained.

## Two layers, two task contexts

Defined in `packages/context/src/index.ts`:

```ts
export type ContextLayer = "brain" | "agent"

export type BrainTaskContext = {
  id: string
  layer: "brain"
  goal: string
  progress: TaskProgress
  childContextIds: string[]
  contextRefs: ContextRef[]
}

export type AgentTaskContext = {
  id: string
  parentId: string            // points at the Brain task id
  layer: "agent"
  agentRole: string
  goal: string
  progress: TaskProgress
  contextRefs: ContextRef[]
}
```

- The **Brain task** is the run. It carries the user goal, the list of child task ids, and references to anything Brain wants to keep around (selected file/thread/summary/artifact refs). There is exactly one per run, stored on `RuntimePlan.context` and written as a `context_plan` session record.
- An **Agent task** belongs to one worker invocation. It has its own id, a `parentId` back to the Brain task, the role, the per-worker goal, and its own progress. Workers never see another worker's `AgentTaskContext`.

Stable ids are not cosmetic — they are how the session JSONL ties events together and how a future resume/replay feature will reconstruct who ran what.

## Direction tags

Every packet that crosses layers carries `fromLayer` / `toLayer`. The constants exist so a packet's direction is always explicit at the type level:

```ts
export const brainToAgentContextTransfer: BrainToAgentContextTransfer = {
  fromLayer: "brain", toLayer: "agent",
}
export const agentToBrainContextTransfer: AgentToBrainContextTransfer = {
  fromLayer: "agent", toLayer: "brain",
}
```

`HandoffPacket` extends `BrainToAgentContextTransfer`. `WorkerResult` extends `AgentToBrainContextTransfer`. If you find yourself wanting a packet that flows agent-to-agent, you are bypassing the orchestrator — that is the invariant to push back on.

## The packets

```ts
export type HandoffPacket = BrainToAgentContextTransfer & {
  id: string                    // packet id
  task: AgentTaskContext        // the worker's task envelope
  constraints: string[]         // hard rules baked into the prompt
  expectedResult: string        // shape description for the worker's reply
}

export type WorkerResult = AgentToBrainContextTransfer & {
  handoffId: string
  taskId: string
  parentId: string
  progress: TaskProgress
  summary: string               // short, user-facing
  artifacts: ContextRef[]       // file/thread/summary/artifact refs
  risks: string[]
  nextQuestions: string[]
}
```

`ContextRef` is shared via `packages/protocol`:

```ts
export type ContextRef = {
  kind: "file" | "thread" | "summary" | "artifact"
  uri: string
  label?: string
}
```

Notice what is *not* in `WorkerResult`: no raw transcript, no reasoning trace, no tool call log. Those belong to the worker's isolated session and stay there. If the orchestrator needs to know more, it asks for it in the next handoff.

## What actually flows during a run

The orchestrator is `executePromptFromConfig` in `packages/agent-runtime/src/index.ts`. The context-relevant steps are:

1. **Prompt expansion** — `expandPromptReferences` rewrites `@<path>` and `@@<session-id>` markers into inlined sections appended to the prompt. The original tokens are kept so the model can refer to them. Limits: 64 KB per file, 24 KB per session snapshot.
2. **Project support assembly** — `readProjectSupport` collects `AGENTS.md`, `.mcp.json` metadata, and `.agents/skill/*` content. `formatProjectSupportPromptSection` formats this for prompts; `projectSupportContextRefs` packs it as `ContextRef[]` for handoff packets.
3. **Runtime context plan** — `buildRuntimePlan` creates one `BrainTaskContext` whose id is the session id during real execution, then assigns every `RuntimeWorkerPlan` a stable child `contextId`.
4. **Worker handoff construction** — `createWorkerHandoff` builds one `HandoffPacket` per worker, uses the worker's planned `contextId` as `task.id`, sets `parentId` to the Brain session id, fills `constraints` with the isolation rules (see below), and sets `expectedResult` to the JSON shape the worker should return.
5. **Worker run** — `runWorkerFromPlan` creates a brand-new Pi `Agent` for the worker. Its prompt is composed by `buildSupportWorkerPrompt`: project support section + original user request + optional Brain-supplied prior worker summaries for todo dependencies + the handoff packet (as JSON) + the expected reply shape. The worker has no access to the orchestrator's `Agent` state.
6. **Result normalization** — `normalizeWorkerResultText` parses the worker's reply into a `WorkerResult`. If the reply is plain text instead of JSON, it is wrapped into a completed `WorkerResult` with `summary` = the text. This is intentional resilience: provider drift should not break orchestration.
7. **Communication record** — Brain records `agent_message` events for the handoff and the result/error envelope so later replay or remote worker work has a canonical message stream.
8. **Primary prompt** — `buildPrimaryPrompt` gives the primary agent the user request plus a formatted list of worker summaries (role, status, goal, progress, summary, risks, open questions). It does *not* hand the primary any worker transcripts.
9. **Todo updates** — the runtime marks the primary/worker/review todos as running, completed, blocked, or failed as each owner starts or finishes.
10. **Optional review** — if the plan requires review and the primary isn't already the review role, `buildReviewPrompt` runs a review worker with the primary's summary, the worker results, and a fresh handoff packet.

The constraint list baked into every support handoff (from `createWorkerHandoff`) is:

- Run as the assigned role only.
- Treat the packet as a Brain-to-agent transfer; Brain owns orchestration context, the worker owns only its isolated task context.
- Use only this handoff, the original user request, and explicit worker results supplied in the prompt.
- Echo `taskId` / `parentId` exactly as provided; Brain values are authoritative.
- Do not assume access to the full root transcript or another worker's private chain of thought.
- Return concise structured findings for the primary Braincode agent.

These constraints are how the isolation invariant survives a model that "wants" to be chatty.

## Prompt references: `@` and `@@`

The orchestrator supports two reference markers at the top of the run:

- `@<path>` — attach a file or image to the root prompt. Text files under 64 KB are inlined in a fenced block. Images are referenced by relative path. Missing or oversize files become a `missing` reference with a reason instead of an error, so the model knows the attachment was intended but not delivered.
- `@@<session-id>` — attach a **compact** snapshot of a prior session. Built by `readSessionContext` in `packages/config` from the session's JSONL: initial prompt, final summary, worker summaries, errors. Hard-capped at 24 KB total, with per-field clipping. **It must not inline a full transcript or worker-private context.**

Workers do not get a separate copy of these references. They see only the expanded root request plus their own handoff packet — same isolation rule.

If you add a new reference kind, follow the same compaction discipline: a snapshot, not a transcript; pointers, not payloads.

## Session JSONL

`packages/config` writes a per-session JSONL at `~/.braincode/sessions/<id>.jsonl`. Every orchestration event is appended through `appendSessionRecord`. The record types you will see today:

| Type | Emitted by | What it captures |
|------|-----------|------------------|
| `run_start` | `executePromptFromConfig` | prompt, plan, project support summary, attempt number |
| `run_end` | same | final summary + worker results |
| `run_error` | same | error message, retry intent |
| `context_plan` | same | Brain task context id, child agent context ids, and context refs |
| `todo_plan` | same | the checkable tasks and dependency edges produced by routing |
| `todo_update` | same / `runWorkerFromPlan` | status changes for todo ids owned by primary or worker roles |
| `agent_message` | `runWorkerFromPlan` | typed handoff/result/error envelope for Brain-agent communication |
| `worker_start` | `runWorkerFromPlan` | phase, role, goal, handoff, model, attempt |
| `worker_end` | same | the executed `WorkerResult` |
| `worker_error` | same | error, fallback intent |
| `mcp_connect` | MCP hub | connected/failed/skipped servers, tool count |
| `hook_*` | `runAndRecordHooks` | hook records, additional context, blocked reasons |

The session JSONL is the durable, queryable form of the in-memory run. `readSessionContext` is what `@@` reads from. Anything Brain wants to recall later must end up here — not in the worker transcripts.

## Compaction policy

Two constants in `agent-runtime` govern inline budgets and should change together if you tune them:

- `MAX_INLINE_FILE_BYTES = 64 * 1024` — per `@<path>` text inlining.
- `MAX_INLINE_SESSION_CHARS = 24 * 1024` — per `@@<session-id>` snapshot.
- `MAX_SESSION_FIELD_CHARS = 6 * 1024` — per field inside a snapshot.

Brain Model also exposes a soft policy (`brain.context.maxInputTokens`, `compaction`, `isolation`). Today these are advisory — runtime hard limits are the inline budgets above. If you implement automatic compaction or a stronger `shared-facts` mode, route it through `packages/context` and keep `WorkerResult` as the only payload the orchestrator merges.

## Rules of thumb for contributors

- **Add a field to a packet, not a string to a prompt.** Anything Brain wants to remember should be a typed field on `WorkerResult` or a `ContextRef`, not free-form text wedged into the summary.
- **Never widen what a worker sees.** If a worker needs more, change the handoff packet — do not pipe in Brain's transcript.
- **Echo, do not invent.** Worker prompts instruct the model to echo `taskId` / `parentId`. The normalizer trusts the handoff values, not the model's reply. Keep it that way.
- **Direction tags carry weight.** When introducing a new packet, extend one of `BrainToAgentContextTransfer` / `AgentToBrainContextTransfer`. If you cannot pick one, the design is wrong.
- **JSONL is the durable record.** New orchestration events should be appended through `appendSessionRecord` so resume/replay/`@@` keep working.
- **Compaction is a public contract.** If you grow inline limits, update both the constant and the doc; a future contributor should not have to guess the budget by reading code.

## Where to look

- Packet types: `packages/context/src/index.ts`
- Wire vocabulary: `packages/protocol/src/index.ts`
- Handoff + result wiring: `createWorkerHandoff`, `runWorkerFromPlan`, `normalizeWorkerResultText` in `packages/agent-runtime/src/index.ts`
- Prompt assembly: `buildSupportWorkerPrompt`, `buildPrimaryPrompt`, `buildReviewPrompt`, `formatWorkerResults`, `formatProjectSupportPromptSection`
- Prompt references: `expandPromptReferences`, `formatSessionContext`
- Session writes/reads: `appendSessionRecord`, `readSessionContext` in `packages/config/src/index.ts`
