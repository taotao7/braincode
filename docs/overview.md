# Braincode Overview

**Languages**: [English](./overview.md) · [中文](./overview.zh.md) · [Français](./overview.fr.md)

This is the high-level map of the Braincode codebase. Read this first; the deeper subjects each have their own document:

- [Architecture](./architecture.md) — design intent, modes, Pi integration, configuration layout.
- [Context management](./context-management.md) — how Brain and worker contexts are isolated and what crosses the boundary.
- [Agent communication](./agent-communication.md) — handoff/result protocol, worker lifecycle, runtime events.
- [Project structure and plan](./project-structure.md) — workspace layout, package responsibilities, milestones.
- [Visual style](./visual-style.md) — UI/brand direction.

## What Braincode is

Braincode is a **Bun-based monorepo for a coding-first AI agent** that routes each part of a task to the model best suited for it. The user picks a **Brain Model** (a routing policy), not a single LLM. A run is one or more isolated worker agents whose structured results are merged by a primary agent.

```
User -> Ink TUI / CLI / config browser UI
     -> Bun.serve (config + control)
     -> Brain Model: choose roles, models, workers
     -> isolated worker agents (handoff packets in, worker results out)
     -> primary agent merges results
     -> optional review worker
     -> final answer
```

## Runtime layers

The repo separates concerns into four layers. Most contribution work touches one layer at a time.

| Layer | Packages | Responsibility |
|-------|----------|----------------|
| Interface | `apps/cli` (Ink TUI + CLI), `apps/config-web` | User entrypoints. Renders Braincode product concepts; never talks to providers directly. |
| Product | `packages/brain`, `packages/server`, `packages/config` | Brain Model selection, routing policy, local config service, project support discovery. |
| Agent | `packages/agent-runtime`, `packages/context`, `packages/tools`, `packages/protocol` | Worker orchestration, context isolation, handoff/result packets, tool registry. |
| Provider | `packages/llm`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core` | Normalize provider models, agent loop, tool calling, sessions. |

Cross-layer rules:

- The interface layer must not call Pi directly. It goes through `agent-runtime`.
- `agent-runtime` is the only place that constructs Pi `Agent` instances.
- `brain` and `context` are pure: they describe policy and shape, never call providers.
- `protocol` is the shared shape vocabulary and stays dependency-light.

## Packages at a glance

```
apps/
  cli/             Bun CLI + Ink TUI (BrainPet, /plan, /team, ...)
  config-web/      Browser config UI served by packages/server

packages/
  shared/          Tiny utilities (debugLog, primitives). Do not dump code here.
  protocol/        Wire shapes: ApiResult, ContextRef, AgentMessage.
  config/          ~/.braincode/* schemas, atomic writes, session JSONL,
                   project support discovery (AGENTS.md, .mcp.json, .agents/*).
  server/          Bun.serve on 127.0.0.1; typed API for the config UI.
  llm/             BraincodeModel -> Pi Model mapping, API key resolution.
  brain/           BrainModel, role catalog + prompts, planAgentRouting.
  context/         BrainTaskContext, AgentTaskContext, HandoffPacket, WorkerResult.
  agent-runtime/   Orchestrator: builds RuntimePlan, runs workers, hooks, MCP, sessions.
  tools/           Coding tool definitions + permissions.
```

Where things actually live (entry points worth bookmarking):

- Routing: `packages/brain/src/index.ts` — `planAgentRouting`, `agentRoleProfiles`, `agentRoleSystemPrompts`.
- Plan building: `packages/agent-runtime/src/index.ts` — `buildRuntimePlan`, `routePromptWithBrain`.
- Worker execution: `packages/agent-runtime/src/index.ts` — `runWorkerFromPlan`, `runSupportWorkers`.
- Context shapes: `packages/context/src/index.ts` — every type that crosses the Brain/agent boundary.
- Prompt references: `packages/agent-runtime/src/index.ts` — `expandPromptReferences` for `@path` and `@@session`.
- Sessions: `packages/config/src/index.ts` — `appendSessionRecord`, `readSessionContext`.

## End-to-end request flow

A non-interactive `braincode run "<prompt>"` produces this trace through the code:

1. `apps/cli` parses argv and calls `executePromptFromConfig` from `agent-runtime`.
2. `SessionStart` and `UserPromptSubmit` hooks run. Either can block; both can add context.
3. `expandPromptReferences` resolves `@<file>` (inlined up to 64 KB) and `@@<session-id>` (compact session snapshot up to 24 KB).
4. `buildRuntimePlan` calls `planAgentRouting` for a deterministic baseline, then asks the configured router brain to refine it. The result is a `RuntimePlan`: primary role, worker list, model selection, mode, tool-execution mode.
5. Support workers run concurrently (capped by `brain.routing.maxParallelAgents`). Each gets only the original user request plus its own `HandoffPacket`. `SubagentStart` / `SubagentStop` hooks fire around each worker.
6. `buildPrimaryPrompt` composes the primary agent's prompt from the original request plus structured worker summaries. The primary agent has access to MCP tools when the project declares them in `.mcp.json`.
7. If `requiresReview` is true and the primary is not itself the review role, a review worker runs with the primary's summary and worker results.
8. `Stop` hook runs. The final summary plus review notes is returned to the caller, and `run_end` is appended to the session JSONL under `~/.braincode/sessions/<id>.jsonl`.

The interactive TUI variant follows the same path. The TUI also subscribes to `AgentEvent` from `pi-agent-core` and to `WorkerLifecycleEvent` from `agent-runtime` to drive the BrainPet status panel.

## Execution modes

Modes are a Braincode-level concept; they bias the orchestration, not the model.

- **`auto`** — default. Tools execute sequentially per agent. Routing is conservative; review is required when policy says so.
- **`radical`** — autonomous. Tools execute in parallel within an agent. Routing is freer. Permission boundaries still apply.

`getModePolicy` in `packages/brain` is the source of truth.

## Brain Model

A **Brain Model** is a `ModelPolicy` per role plus routing/context defaults. The role catalog is defined in one place — `agentRoleProfiles` + `agentRoleSystemPrompts` in `packages/brain` — so the router prompt, defaults, and runtime system prompts never drift apart.

Routed roles (the ones a worker can be):
`coding · frontend · backend · designer · dba · devops · security · qa · research · review · summarize · fastReply · oracle · librarian · rush`

Non-routed roles:
- `routeBrain` — orchestrator-only; selects roles, never solves tasks.
- `pet` — read-only BrainPet status reporter for the TUI.

When adding a role, update `routedAgentRoles`, `agentRoleProfiles`, `agentRoleSystemPrompts`, and `BrainModel.roles` together — they are deliberately keyed by the same union.

## Configuration

Everything user-specific lives under `~/.braincode/`:

```
~/.braincode/
  settings.json      execution mode, default brain id, feature flags
  auth.json          provider keys (kept out of model prompts)
  brains.json        Brain Models
  models.json        BraincodeModel catalog (provider, baseUrl, id)
  tools.json         tool toggles
  hooks.json         user-level lifecycle hooks
  sessions/          per-session JSONL transcripts of orchestration events
  logs/, cache/      runtime byproducts
```

Project-local support files live next to code:

```
<repo>/
  AGENTS.md                 durable project instructions injected into prompts
  .mcp.json                 project MCP server declarations (metadata only in prompts)
  .agents/hooks.json        project lifecycle hooks
  .agents/skill/<id>/SKILL.md   project-local skills
```

`packages/config` owns discovery and parsing. `agent-runtime` decides what becomes prompt text vs. a `ContextRef`.

## Hooks and MCP

- Hooks are command handlers keyed by event name. Supported runtime events: `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`. Handlers must set `trusted: true` to run today (there is no review UI yet). See `runConfiguredHooks` in `agent-runtime`.
- MCP servers are connected per run via `McpToolHub`. The hub returns ready-to-use Pi `AgentTool`s; servers that fail or are skipped are reported back through `onMcpReport`.

## Tests and dev loop

```sh
bun install
bun run check        # typecheck across the workspace
bun test             # unit tests (config, brain, llm, context, agent-runtime)
bun run braincode -- run --dry-run "<prompt>"     # plan only, no provider call
bun run braincode -- run "<prompt>"               # real run
bun run braincode                                  # Ink TUI
bun run config                                     # config browser UI
```

Tests live next to source: `packages/<name>/src/index.test.ts`. Keep new logic close to the package it belongs to; resist growing `packages/shared`.

## Where to go next

- Working on routing or roles? Start with [agent-communication.md](./agent-communication.md), then `packages/brain`.
- Touching anything that crosses agents? Read [context-management.md](./context-management.md) before editing prompts.
- Reshaping infra or packages? See [project-structure.md](./project-structure.md) for the intended layout and non-goals.
