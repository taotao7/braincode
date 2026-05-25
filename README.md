# Braincode

Braincode is a Bun-based monorepo for a coding-first AI agent that can also handle general tasks. Its main idea is a user-selectable **Brain Model**: a high-level strategy profile that dynamically plans which underlying model, agent role, tools, and context budget should be used for each part of a task.

The project is designed to reuse Pi infrastructure where it makes sense, while keeping Braincode's product-specific orchestration separate.

## Goals

- Build a coding agent that can also perform research, review, planning, summarization, and automation tasks.
- Let users select a Brain Model instead of manually selecting one LLM for everything.
- Dynamically route work to different models based on role, cost, latency, context size, and risk.
- Isolate context between agents and exchange only structured handoff/result messages.
- Provide a local configuration service that users open in the browser.
- Store real user configuration under `~/.braincode/`.
- Use Bun and a monorepo layout from the beginning.
- Keep packages low-coupled and reusable.

## Non-goals for the first phase

- Do not fork pi-mono.
- Do not build every UI surface at once.
- Do not design a complex plugin system before the core agent runtime works.
- Do not store user secrets or machine-local settings in the repository.

## Runtime and infrastructure

- Runtime: Bun
- Package manager: Bun workspaces
- Local server: `Bun.serve()`
- User config directory: `~/.braincode/`
- Pi integration target:
  - `@earendil-works/pi-ai` for normalized LLM/provider streaming
  - `@earendil-works/pi-agent-core` for agent runtime, tool calling, sessions, and compaction

## Planned repository layout

```text
braincode/
  AGENTS.md
  README.md
  package.json
  tsconfig.json
  apps/
    cli/
      src/
        index.ts
    config-web/
      src/
        index.html
        main.tsx
  packages/
    shared/
      src/
        index.ts
    protocol/
      src/
        index.ts
    config/
      src/
        index.ts
    server/
      src/
        index.ts
    llm/
      src/
        index.ts
    brain/
      src/
        index.ts
    context/
      src/
        index.ts
    agent-runtime/
      src/
        index.ts
    tools/
      src/
        index.ts
```

## Package responsibilities

### `apps/cli`

Command-line entrypoint for Braincode.

Expected commands:

- `braincode` — start interactive/default mode.
- `braincode config` — start local configuration server and print/open the URL.
- `braincode daemon` — future long-running service mode.
- `braincode run <task>` — future non-interactive execution.

The CLI should stay thin. It should delegate implementation to packages.

### `apps/config-web`

Browser UI for configuration.

It should talk to the local server API and should not write `~/.braincode/` directly.

### `packages/config`

Owns configuration schemas, default values, migrations, and persistence under `~/.braincode/`.

Planned files under the user directory:

```text
~/.braincode/
  settings.json
  auth.json
  brains.json
  models.json
  tools.json
  sessions/
  logs/
  cache/
```

Responsibilities:

- Resolve the Braincode home directory.
- Create missing directories/files safely.
- Load and validate settings.
- Write settings atomically where practical.
- Keep secrets separate from normal settings.
- Apply future config migrations.

### `packages/server`

Local configuration and control service using `Bun.serve()`.

Default behavior:

- Bind to `127.0.0.1`.
- Use a configurable port, with a default such as `14580`.
- Serve the config web app.
- Expose typed API routes for settings, brains, models, tools, auth status, and health checks.

Security direction:

- Do not bind to public interfaces by default.
- Use a local token or equivalent protection for browser requests.
- Never expose arbitrary shell execution through config routes.

### `packages/brain`

Owns the Brain Model concept and task routing.

A Brain Model is not just one LLM. It is a policy profile:

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

Responsibilities:

- Classify tasks.
- Select agent roles.
- Select model policies.
- Decide when to escalate to stronger models.
- Decide when to spawn worker agents.
- Decide when review is required.

### `packages/llm`

Owns provider/model registry and Pi AI integration.

Responsibilities:

- Bridge Braincode model config to Pi model definitions.
- Register custom providers if needed.
- Resolve API keys and provider headers from `packages/config`.
- Hide provider-specific quirks from the rest of Braincode.

### `packages/agent-runtime`

Owns Braincode's runtime wrapper around Pi agent core.

Responsibilities:

- Start and run agent sessions.
- Connect tools to the underlying agent runtime.
- Emit normalized Braincode events.
- Persist sessions.
- Apply Braincode-specific runtime policy.

### `packages/context`

Owns context isolation and communication between agents.

Important rule: workers should not share full conversation history. The orchestrator sends a compact handoff packet; the worker returns a structured result.

```text
Root context
  -> handoff packet
    -> isolated worker context
      -> structured result
  -> root decides what to merge
```

Planned concepts:

- `ContextRef`
- `HandoffPacket`
- `WorkerResult`
- `ContextSummary`
- `ProjectFacts`
- compaction policy

### `packages/protocol`

Shared protocol types for agent events, local server APIs, handoff messages, and UI communication.

This package should stay dependency-light.

Example agent message shape:

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

### `packages/tools`

Owns tool definitions and permissions.

Responsibilities:

- Register coding tools such as read, write, edit, shell, search.
- Define safe execution policies.
- Keep permission checks outside individual UI surfaces.
- Support future project-specific tool configuration.

### `packages/shared`

Small dependency-light shared utilities and primitive types.

Do not turn this into a dumping ground. If code has a domain owner, keep it in that package.

## Local configuration service

Users should be able to configure Braincode through a local browser UI.

Planned flow:

```sh
braincode config
```

Then Braincode starts a local service such as:

```text
http://127.0.0.1:14580
```

The UI edits settings through the local server. The server persists real configuration to `~/.braincode/`.

The repository should only contain code, schemas, defaults, and documentation.

## Context management design

Braincode follows a thread/context model inspired by agent systems such as Amp:

- An agent is a model plus system prompt plus tools plus current context.
- Context is a limited resource and should be intentionally managed.
- Worker agents get isolated context windows.
- Multi-agent communication should use structured summaries and artifacts, not copied raw transcripts.
- The root orchestrator decides what information becomes part of the main context.

```text
User task
  -> root planner
    -> coding worker context
    -> research worker context
    -> review worker context
  -> merge summaries/artifacts
  -> final response or patch
```

## Initial milestones

### MVP-0: repository skeleton

- Create Bun workspace.
- Add root scripts.
- Add package skeletons.
- Add config home resolver for `~/.braincode/`.
- Add local config server skeleton.

### MVP-1: configuration UI

- Start `braincode config`.
- Serve a minimal web page.
- Read/write `settings.json`.
- Show auth/model/brain config sections.

### MVP-2: single-agent runtime

- Integrate Pi AI/Core.
- Run one agent session.
- Load model and credentials from `~/.braincode/`.
- Persist session JSONL.

### MVP-3: Brain Model routing

- Load `brains.json`.
- Select model by task role.
- Support thinking level and escalation policy.

### MVP-4: isolated worker agents

- Implement handoff packets.
- Run isolated worker sessions.
- Merge structured worker results.
- Add context compaction/summarization policy.

### MVP-5: coding workflow

- Add read/search/edit/shell tools with permissions.
- Add review agent for risky file edits.
- Add user confirmation flows where needed.

## Development commands

```sh
bun install
bun run check
bun test
bun run braincode -- help
bun run config
bun run braincode -- config --port 14581
```

The `config` command starts the local browser configuration service and creates missing files under `~/.braincode/`.

## References

- Amp note: `https://ampcode.com/notes/how-to-build-an-agent`
- Amp guide: `https://ampcode.com/guides/context-management`
- Pi repository: `https://github.com/earendil-works/pi`
