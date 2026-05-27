# Project Structure and Plan

This document is the source of truth for the planned workspace layout, package ownership, and milestone order. The current implementation has passed the initial skeleton/runtime/TUI/MCP phases; the active planning focus is now local coding tools, patch artifacts, review gates, and permission policy.

## Goals

- Build a coding agent that can also perform research, review, planning, summarization, and automation tasks.
- Let users select a Brain Model instead of manually selecting one LLM for everything.
- Support two top-level execution modes: `auto` and `radical`.
- Dynamically route work to different models based on role, cost, latency, context size, and risk.
- Isolate context between agents and exchange only structured handoff/result messages.
- Enforce layered context ownership: Brain manages the orchestration context, and each subagent manages one isolated task context.
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
  .mcp.json
  .agents/
    hooks.json
    skill/
      <skill-id>/
        SKILL.md
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

The interactive TUI is implemented with Ink and should expose Braincode product concepts such as mode, Brain Model routing, agent roles, tool approval, and session state. It should let users switch Braincode mode between `auto` and `radical` without leaving the TUI. It should not expose generic Pi model-switching controls; provider/model configuration belongs in `braincode config`.

Early TUI commands:

- `/help` — show Braincode TUI commands and the model-configuration boundary.
- `/plan <task>` — preview Brain Model routing without making a provider call.
- `/mode auto|radical`, `/auto`, `/radical` — switch top-level execution mode.
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
  hooks.json
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
- Discover project support files from the active project root: `AGENTS.md`, `.mcp.json`, `.agents/skill`, and `.agents/hooks.json`.
- Parse `.mcp.json` for project MCP server metadata without copying secrets into model context.
- Load local skill Markdown from `.agents/skill/<skill-id>/SKILL.md` or top-level `.agents/skill/*.md`.
- Load user hooks from `~/.braincode/hooks.json` and project hooks from `.agents/hooks.json`.
- Normalize hook definitions and require explicit `trusted: true` before command hooks can run.

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
- Maintain role definitions and built-in role prompts for every Braincode agent.
- Select model policies.
- Decide when to escalate to stronger models.
- Decide when to spawn worker agents.
- Decide when review is required.
- Decide what crosses from the Brain context layer into each worker's isolated task context.

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
- Expand routing plans into runtime worker plans with model selections.
- Run isolated support workers from compact handoff packets.
- Run the primary agent with only structured worker results as additional context.
- Run a review worker for risky tasks when Brain policy requires it.
- Merge structured worker and review results into the final run result.
- Connect tools to the underlying agent runtime.
- Broker tool approval callbacks before risky tool execution and keep tool events normalized for UI rendering.
- Load project support context from `packages/config` and pass relevant `AGENTS.md`/skill content into primary, worker, and review prompts.
- Carry project support references in worker handoff packets.
- Run trusted lifecycle hooks at supported runtime points and record hook outcomes in the session log.
- Emit normalized Braincode events.
- Persist sessions.
- Apply Braincode-specific runtime policy.

### `packages/context`

Owns context isolation, compaction policy, and handoff/result packets.

Workers should not share full conversation history. Brain owns the root orchestration context and gives it a stable task id for recording and recovery. Each worker owns a separate task context with its own id and a `parentId` pointing back to the Brain task. Brain sends the worker a compact handoff packet, and the worker returns a structured result for Brain to merge.

Responsibilities:

- Define root Brain task context metadata.
- Define isolated subagent task context metadata.
- Define typed Brain-to-agent handoff packets.
- Define typed agent-to-Brain result packets.
- Track child task progress through structured worker results rather than shared transcripts.
- Keep context references selective, so file/thread/history references pull only task-relevant information.
- Preserve the invariant that worker private transcripts and unrelated tool output do not become shared context.

### `packages/protocol`

Shared protocol types for agent events, local server APIs, handoff messages, and UI communication.

This package should stay dependency-light.

### `packages/tools`

Owns tool definitions and permissions. Today this package defines built-in tool metadata, defaults, and approval configuration. First-party local tool execution is the next implementation target; MCP tools are already bridged through `packages/agent-runtime`.

Responsibilities:

- Register coding tools such as read, write, edit, shell, search, patch application, git diff, changed-file inspection, and check/script execution.
- Provide first-party local implementations for the default coding toolset.
- Coordinate with `packages/agent-runtime` for project/user MCP tools declared through `.mcp.json` and user MCP config.
- Define safe execution policies that can account for path, command, risk, and review requirements.
- Keep permission checks outside individual UI surfaces.
- Support future project-specific tool configuration.

### `packages/shared`

Small dependency-light shared utilities and primitive types.

Do not turn this into a dumping ground. If code has a domain owner, keep it in that package.

## Current implementation phase

The project is no longer in a "framework skeleton" phase. The first versions of runtime orchestration, routeBrain routing, worker execution, review worker execution, TUI interaction, sessions/handoff, MCP tools, hooks, and approval UI are in place.

The current product gap is turning that orchestration into a reliable coding patch engine:

```text
local tools
  -> file edits
  -> changed files
  -> git diff
  -> checks
  -> review decision
  -> final patch report
  -> session ledger
```

Near-term work should prioritize:

- First-party local coding tools that work without MCP setup.
- Patch ledger records for tool calls, snapshots, changed files, diffs, checks, and review decisions.
- Diff/check-based review input and a typed review decision.
- Path-aware and command-aware permission policy.
- Router-plan UX that clearly distinguishes heuristic dry-runs from routeBrain execution plans.
- Benchmarks and demo cases that prove the orchestration improves real coding outcomes.

## Initial milestones

### MVP-0: repository skeleton - done

- Create Bun workspace.
- Add root scripts.
- Add package skeletons.
- Add config home resolver for `~/.braincode/`.
- Add local config server skeleton.

### MVP-1: configuration UI - done

- Start `braincode config`.
- Serve a minimal web page.
- Read/write `settings.json`.
- Show auth/model/brain config sections.

### MVP-2: single-agent runtime - done

- Integrate Pi AI/Core.
- Run one agent session.
- Load model and credentials from `~/.braincode/`.
- Persist session JSONL.

MVP-2 starts by establishing the adapter boundary:

- `packages/llm` maps Braincode model config to Pi model objects.
- `packages/agent-runtime` creates Pi-backed agent runtime instances from Braincode mode, model policy, and system prompt.
- Real provider execution is added after model/auth configuration is reliable.

### MVP-3: Brain Model routing - first version done

- Load `brains.json`.
- Select model by task role, including specialist roles such as frontend, backend, security, QA, DBA, DevOps, oracle, librarian, and rush.
- Use deterministic routing for dry-runs and fallback.
- Use the configured route brain during real execution when credentials are available.
- Keep built-in prompts aligned with each role's scope and boundaries.
- Support thinking level, fallbacks, and escalation policy.

### MVP-4: isolated worker agents - first version done

- Implement handoff packets.
- Encode Brain-to-agent and agent-to-Brain context transfer directions.
- Add stable parent/child task context ids for recovery and progress tracking.
- Run isolated worker sessions.
- Merge structured worker results into primary-agent execution.
- Run mandatory review workers for risky file-editing tasks.
- Add richer context compaction/summarization policy.

### MVP-5: coding workflow - partially done, active focus

- Done: `AGENTS.md` durable project instruction context.
- Done: project MCP server declarations from `.mcp.json`.
- Done: project-local skills from `.agents/skill`.
- Done: trusted command hooks from `~/.braincode/hooks.json` and `.agents/hooks.json`.
- Done: review worker execution for risky tasks.
- Done: user confirmation flows for risky tool calls in the TUI.
- Active: read/search/edit/shell/apply-patch/git/check tools as first-party local implementations.
- Active: patch ledger and diff/check artifact pipeline.
- Active: granular permission rules for paths, commands, critical files, and review requirements.
