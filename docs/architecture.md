# Braincode Architecture

This document is the main architecture reference for Braincode.

## Architecture goals

- Build a coding-first agent that can also perform general tasks.
- Let users select a high-level **Brain Model** instead of a single LLM.
- Dynamically route planning, coding, research, review, summarization, and quick replies to different models.
- Isolate context between agents.
- Communicate between agents with structured handoff/result messages instead of shared full transcripts.
- Reuse Pi infrastructure where public package APIs fit.
- Keep Braincode product orchestration separate from app entrypoints and UI layers.

## High-level system

```text
User / Ink TUI / CLI / Config UI
  -> apps/cli or apps/config-web
    -> packages/server
      -> packages/config
      -> packages/brain
      -> packages/agent-runtime
        -> packages/context
        -> packages/tools
        -> packages/llm
          -> @earendil-works/pi-ai
        -> @earendil-works/pi-agent-core
```

Runtime responsibilities are split into four layers:

1. **Interface layer**: Braincode-owned Ink TUI, CLI commands, and browser configuration UI.
2. **Product layer**: Brain Model selection, routing, local configuration service, coding workflow policy.
3. **Agent layer**: isolated sessions, handoff packets, tool registry, normalized runtime events.
4. **Provider/runtime layer**: Pi AI and Pi Agent Core integration.

## Core flow

```text
User task
  -> root orchestrator
    -> classify task and select Brain Model policy
    -> choose one or more agent roles
    -> create isolated context for each worker
      -> worker uses selected model + tools
      -> worker returns structured result
    -> merge selected summaries/artifacts/facts
  -> final answer or code change
```

## Execution modes

Braincode has two top-level execution modes.

### `auto`

`auto` is the default and primary product mode. In this mode Braincode interprets the user's intent, plans the work, selects suitable agent roles, chooses model policies through the selected Brain Model, and dispatches isolated worker agents when useful.

Use `auto` for normal coding-agent behavior:

- classify the task before acting;
- choose cheap/fast models for simple work;
- use stronger models for planning, risky coding, or review;
- spawn separate agents for research, coding, summarization, or review when needed;
- keep context isolated and merge only structured results.

### `radical`

`radical` is the more aggressive mode. It should still respect safety and tool permission boundaries, but it may plan more broadly, use stronger models sooner, spawn more workers, and pursue implementation with less back-and-forth when the user intent is clear.

Use `radical` for users who prefer higher autonomy and faster end-to-end execution. Risky actions should still go through the tool permission system and explicit approval policy where required.

## Brain Model

A Brain Model is a routing and execution policy. It is not a single provider model.

```ts
type BrainModel = {
  id: string
  name: string
  description: string
  planner: ModelPolicy
  roles: {
    routeBrain: ModelPolicy
    coding: ModelPolicy
    frontend: ModelPolicy
    backend: ModelPolicy
    designer: ModelPolicy
    dba: ModelPolicy
    devops: ModelPolicy
    security: ModelPolicy
    qa: ModelPolicy
    research: ModelPolicy
    review: ModelPolicy
    summarize: ModelPolicy
    fastReply: ModelPolicy
    oracle: ModelPolicy
    librarian: ModelPolicy
    rush: ModelPolicy
  }
  routing: {
    maxParallelAgents: number
    preferCheapModelForSimpleTasks: boolean
    escalateOnUncertainty: boolean
    requireReviewForFileEdits: boolean
  }
  context: {
    maxInputTokens: number
    compaction: "auto" | "manual" | "aggressive"
    isolation: "strict" | "shared-facts"
  }
}
```

The Brain Model layer decides:

- which role should handle a task;
- which model policy should be used for each role;
- when to spawn worker agents;
- when to escalate to a stronger model;
- when review is required;
- how much context can be passed into a worker.

Routing has two inputs:

- deterministic heuristics in `packages/brain`, used for dry-runs and fallback;
- the configured `routeBrain`/`planner` model, used during real execution when credentials are available.

Both paths normalize into an `AgentRoutingPlan` with one primary routed role, zero or more worker plans, a review requirement flag, and a short routing reason. Role definitions and built-in role prompts live with the Brain Model logic so the router, defaults, and runtime prompts stay aligned.

## Context isolation

Workers must not share full conversation history.

```text
Root context
  -> compact handoff packet
    -> isolated worker context
      -> structured worker result
  -> primary agent receives selected worker summaries
  -> optional review worker checks risky primary results
  -> root returns merged final answer
```

Core packet types:

- `ContextRef`
- `HandoffPacket`
- `WorkerResult`
- `AgentMessage`

The current runtime executes support workers from compact handoff prompts, runs the primary role with only structured worker results as advisory context, and runs a review worker when Brain policy marks the task as risky. Richer context summaries and project facts remain future extensions of the same packet boundary.

Agent-to-agent communication should use protocol types from `packages/protocol`.

Example shape:

```ts
type AgentMessage = {
  id: string
  parentId?: string
  from: string
  to: string | "orchestrator"
  kind: "handoff" | "result" | "question" | "fact" | "artifact" | "error"
  payload: unknown
  contextRefs?: ContextRef[]
}
```

## Pi integration

Braincode should depend on Pi packages instead of copying or forking Pi code.

Use:

- `@earendil-works/pi-ai` for provider/model streaming abstractions.
- `@earendil-works/pi-agent-core` for agent runtime, tool calling, sessions, and compaction where it fits.

Braincode does not use Pi's TUI as the product interface. The interactive terminal UI is owned by Braincode and implemented with Ink so the UI can expose Braincode concepts instead of generic provider/model controls. Provider/model setup belongs in `braincode config`; the TUI can display routing decisions but must not offer a direct model switch that bypasses Brain Model policy.

Braincode owns:

- brain model schema and routing policy;
- top-level execution modes: `auto` and `radical`;
- multi-agent orchestration;
- context isolation and handoff protocol;
- local configuration server;
- project/user configuration storage;
- coding workflow product behavior.

The adapter boundary is:

- `packages/llm` converts Braincode model configuration into Pi model objects.
- `packages/agent-runtime` creates Pi-backed agent runtime instances from Braincode mode, selected model policy, and system prompt.
- Higher-level orchestration should depend on Braincode package interfaces, not Pi package internals directly.

## Local configuration architecture

Users configure Braincode through a local browser UI.

```text
braincode config
  -> Bun.serve on 127.0.0.1:<port>
    -> config web UI
    -> typed local API
      -> ~/.braincode/*.json
```

Default behavior:

- Bind to `127.0.0.1`.
- Use default port `14580` unless overridden.
- Store runtime user configuration under `~/.braincode/`.
- Keep repository files limited to code, schemas, defaults, and documentation.

Security direction:

- Do not bind to public interfaces by default.
- Protect browser requests with a local token or equivalent mechanism before exposing sensitive operations.
- Never expose arbitrary shell execution through configuration routes.
- Store secrets in `~/.braincode/auth.json` or a future secure credential store.
- Ensure restrictive file permissions for secret files.
