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
User / CLI / Config UI
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

1. **Interface layer**: CLI and browser configuration UI.
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

## Brain Model

A Brain Model is a routing and execution policy. It is not a single provider model.

```ts
type BrainModel = {
  id: string
  name: string
  description: string
  planner: ModelPolicy
  roles: {
    coding: ModelPolicy
    research: ModelPolicy
    review: ModelPolicy
    summarize: ModelPolicy
    fastReply: ModelPolicy
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

## Context isolation

Workers must not share full conversation history.

```text
Root context
  -> compact handoff packet
    -> isolated worker context
      -> structured worker result
  -> root decides what to merge
```

Planned concepts:

- `ContextRef`
- `HandoffPacket`
- `WorkerResult`
- `ContextSummary`
- `ProjectFacts`
- compaction policy

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

Braincode owns:

- brain model schema and routing policy;
- multi-agent orchestration;
- context isolation and handoff protocol;
- local configuration server;
- project/user configuration storage;
- coding workflow product behavior.

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
