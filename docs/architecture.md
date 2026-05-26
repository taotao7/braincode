# Braincode Architecture

This document is the main architecture reference for Braincode.

For contributors, two companion docs go deeper on the trickiest parts:

- [Context management](./context-management.md) — how Brain and worker contexts stay isolated, packet shapes, prompt references, session JSONL.
- [Agent communication](./agent-communication.md) — worker lifecycle, routing, hooks, runtime events, multi-agent runs.

If you are new to the codebase, start with [Overview](./overview.md).

## Architecture goals

- Build a coding-first agent that can also perform general tasks.
- Let users select a high-level **Brain Model** instead of a single LLM.
- Dynamically route planning, coding, research, review, summarization, and quick replies to different models.
- Isolate context between agents.
- Keep context ownership layered: Brain owns the orchestration context, and every subagent owns one isolated task context.
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
    -> choose one or more agent roles and create a checkable todo plan
    -> create isolated context for each worker
      -> worker uses selected model + tools
      -> worker completion marks its assigned todo items complete or failed
      -> worker returns structured result
    -> primary agent completion marks its assigned todo items complete or failed
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

Routing also produces a todo plan. Each todo has a stable id, title, assigned routed role, status, and optional summary. Worker plans carry the todo ids they own. During execution the runtime records `todo_plan` and `todo_update` session JSONL events, emits live todo updates to the TUI, and updates the runtime plan so the user can see tasks move from pending to running to completed, blocked, or failed. Review work added by policy is appended to the runtime todo list without changing the original Brain-planned worker list.

## Layered context ownership

Workers must not share full conversation history.

```text
Brain orchestration context
  id: <brain-task-id>
  -> compact Brain-to-agent handoff packet
    -> isolated subagent task context
       id: <agent-task-id>
       parentId: <brain-task-id>
      -> structured agent-to-Brain result
  -> Brain keeps selected summaries, artifacts, risks, and questions
  -> primary agent receives only selected worker results
  -> optional review worker checks risky primary results
  -> root returns merged final answer
```

The ownership rule is:

- Brain owns the root orchestration layer: user intent, routing plan, shared facts, allowed context references, worker result summaries, artifacts, risks, and open questions.
- Brain assigns a stable task id for the root context so the run can be recorded, resumed, or recovered.
- Each subagent owns exactly one task layer: its own context id, `parentId` pointing to the Brain task id, role prompt, compact handoff packet, allowed references, progress, and tool results produced in that isolated session.
- Context crosses layers only through typed packets. Brain-to-agent handoff packets carry the subagent context id, parent id, goal, progress, constraints, references, and expected result. Agent-to-Brain result packets carry task id, parent id, progress, summary, artifacts, risks, and next questions.
- Full transcripts, private reasoning, and unrelated tool output do not cross layers. If prior work is needed, Brain should reference or summarize the relevant part instead of copying an entire thread.

Core packet types:

- `ContextRef`
- `BrainTaskContext`
- `AgentTaskContext`
- `HandoffPacket`
- `WorkerResult`
- `AgentMessage`

The current runtime executes support workers from compact handoff prompts, runs the primary role with only structured worker results as advisory context, and runs a review worker when Brain policy marks the task as risky. Richer context summaries, project facts, and thread references remain future extensions of the same packet boundary.

Prompt references follow the same boundary. `@<path>` attaches project files or images to the root user request. `@@<session-id>` attaches a compact session context snapshot built from session JSONL records: user prompts, final summaries, worker summaries, and errors. It must not inline a full transcript or worker-private context; workers receive only the expanded root request plus their own handoff packet.

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
- project support discovery for `AGENTS.md`, `.mcp.json`, `.agents/skill`, and `.agents/hooks.json`;
- coding workflow product behavior.

The adapter boundary is:

- `packages/llm` converts Braincode model configuration into Pi model objects.
- `packages/agent-runtime` creates Pi-backed agent runtime instances from Braincode mode, selected model policy, and system prompt.
- Higher-level orchestration should depend on Braincode package interfaces, not Pi package internals directly.

## Project support context

Braincode reads project-local support files from the active project root:

- `AGENTS.md` provides durable project instructions and conventions.
- `.mcp.json` declares project MCP servers. The runtime may use this file to configure MCP tools, but model prompts should only receive safe metadata such as server names and the config path, not raw secrets or full command configuration.
- `.agents/skill` contains project-local skills. A skill can live at `.agents/skill/<skill-id>/SKILL.md` or as a Markdown file directly under `.agents/skill`.
- `.agents/hooks.json` contains project-local lifecycle hooks.

`packages/config` owns discovery and parsing for these project support files. `packages/agent-runtime` injects discovered `AGENTS.md` and skill content into primary, worker, and review prompts, and records support metadata in the Brain task session log. Worker handoff packets carry support file references, but each worker still receives its own isolated task context.

## Hooks

Braincode supports lifecycle command hooks using Braincode-owned paths, not `.codex` paths:

- User hooks: `~/.braincode/hooks.json`
- Project hooks: `<repo>/.agents/hooks.json`

The schema follows the same three-level shape as the Codex reference: event name, matcher group, and command handlers. Supported event names are `SessionStart`, `SubagentStart`, `SubagentStop`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, and `Stop`.

Early runtime support runs trusted `command` hooks for `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, and `Stop`. Matching hooks from user and project files all run, and matching command hooks run concurrently. Command hooks receive one JSON object on stdin with shared fields such as `session_id`, `cwd`, `hook_event_name`, `model`, `turn_id`, and `permission_mode`, plus event-specific fields. Hook output may add `hookSpecificOutput.additionalContext`; `SessionStart` can block the run, and `UserPromptSubmit` can block the prompt.

Until Braincode has a hook review UI, command handlers must set `trusted: true` to run. Untrusted, disabled, async, and unsupported handler types are skipped and recorded in the session log.

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
