# Project Structure and Plan

This document is the source of truth for the planned workspace layout, package ownership, and milestone order.

## Goals

- Build a coding agent that can also perform research, review, planning, summarization, and automation tasks.
- Let users select a Brain Model instead of manually selecting one LLM for everything.
- Support two top-level execution modes: `auto` and `radical`.
- Dynamically route work to different models based on role, cost, latency, context size, and risk.
- Isolate context between agents and exchange only structured handoff/result messages.
- Provide a local configuration service that users open in the browser.
- Store real user configuration under `~/.braincode/`.
- Use Bun and a monorepo layout from the beginning.
- Keep packages low-coupled and reusable.

## Non-goals for the first phase

- Do not fork pi-mono.
- Do not use Pi's TUI as Braincode's product interface.
- Do not build every UI surface at once.
- Do not design a complex plugin system before the core agent runtime works.
- Do not store user secrets or machine-local settings in the repository.

## Runtime and infrastructure

- Runtime: Bun
- Package manager: Bun workspaces
- Terminal UI: Ink, owned by Braincode
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
  docs/
    architecture.md
    project-structure.md
    references.md
  apps/
    cli/
      src/
        index.ts
        tui.tsx
    config-web/
      src/
        index.ts
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
- `braincode run --dry-run <task>` — inspect mode, brain, role, and model selection without making provider calls.
- `braincode run <task>` — execute one non-interactive prompt through the configured provider when auth is available.

The CLI should stay thin. It should delegate implementation to packages.

The interactive TUI is implemented with Ink and should expose Braincode product concepts such as mode, Brain Model routing, agent roles, tool approval, and session state. It should not expose generic Pi model-switching controls; provider/model configuration belongs in `braincode config`.

Early TUI commands:

- `/help` — show Braincode TUI commands and the model-configuration boundary.
- `/plan <task>` — preview Brain Model routing without making a provider call.
- `/clear` — clear the transcript.
- `/exit` or `/quit` — leave the TUI.

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
- Store the selected execution mode, initially `auto` or `radical`.
- Write settings atomically where practical.
- Keep secrets separate from normal settings.
- Apply future config migrations.

### `packages/server`

Local configuration and control service using `Bun.serve()`.

Responsibilities:

- Bind to `127.0.0.1` by default.
- Serve the config web app.
- Expose typed API routes for settings, brains, models, tools, auth status, and health checks.
- Persist changes through `packages/config`.

### `packages/brain`

Owns execution mode policy, Brain Model definitions, planning, routing, and model selection policies.

Responsibilities:

- Apply the selected top-level mode: `auto` or `radical`.
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

Owns context isolation, compaction policy, and handoff/result packets.

Workers should not share full conversation history. The orchestrator sends a compact handoff packet; the worker returns a structured result.

### `packages/protocol`

Shared protocol types for agent events, local server APIs, handoff messages, and UI communication.

This package should stay dependency-light.

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

MVP-2 starts by establishing the adapter boundary:

- `packages/llm` maps Braincode model config to Pi model objects.
- `packages/agent-runtime` creates Pi-backed agent runtime instances from Braincode mode, model policy, and system prompt.
- Real provider execution is added after model/auth configuration is reliable.

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
