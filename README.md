# Braincode

![Runtime](https://img.shields.io/badge/runtime-Bun-black?logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-93%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-99.20%25%20lines-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

A multi-model coding agent orchestrator.

Braincode turns one coding request into a coordinated engineering workflow:

```text
planner -> specialist workers -> primary executor -> reviewer -> final report
```

It is not another AI CLI that asks one model to plan, code, and review itself. Braincode is a coding workflow engine with role separation, model routing, isolated worker contexts, review gates, and structured final reports.

**Languages**: [English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

<img width="1774" height="887" alt="Braincode routing diagram" src="./apps/site/src/assets/routing-diagram.png" />

## Why Braincode?

Most coding agents ask one model to plan, code, and review itself. Braincode separates these roles.

- Route simple tasks to cheap models
- Escalate risky work to stronger models
- Keep worker contexts isolated
- Require independent review for risky file edits
- Produce structured final reports

## Example

```bash
braincode run "add login validation"
braincode run --dry-run "add login validation"
braincode run --dry-run --heuristic "add login validation"
braincode benchmark
```

`braincode run` uses the configured Brain Model. `--dry-run` previews the same routeBrain planning path used by real execution; add `--heuristic` only when you need a no-provider fallback diagnostic. Use `braincode config` to change the active Brain Model and provider/model settings.

`braincode benchmark` runs a deterministic demo suite of representative coding prompts: README edits, failing-test fixes, auth-risk changes, package/script changes, and security-review-only runs. By default it asks routeBrain when credentials are available and labels heuristic fallback checks; use `--heuristic` for a no-provider diagnostic run.

## How It Works

1. `routeBrain` creates a structured plan.
2. Brain spawns isolated specialist workers.
3. Workers return structured results, not full transcripts.
4. The primary executor applies the change with worker context.
5. A review worker checks the result when policy requires review.
6. Brain returns a final report and records the session.

## Install

```bash
# Homebrew (macOS / Linux)
brew install taotao7/tap/braincode

# npm (requires Node >= 18)
npm i -g @taotao7/braincode

# Or download a prebuilt binary
curl -L https://github.com/taotao7/braincode/releases/latest/download/braincode-darwin-arm64.tar.gz \
  | tar -xz && ./braincode-darwin-arm64 help
```

Supported targets: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. After install, run `braincode` for the TUI or `braincode config` to open the local configuration page.

## Current Status

- Bun monorepo with `apps/*` and `packages/*` workspaces.
- CLI entrypoints for `braincode`, `braincode run`, `braincode run --dry-run`, and `braincode config`.
- Braincode-owned Ink TUI with slash commands, sessions, handoff, MCP/hook/brain/intent panels, streaming text, thinking, todo updates, worker lifecycle, and tool approval decisions.
- Browser config service backed by `~/.braincode/` for settings, execution mode, brains, models, tools, and auth status.
- Runtime plans with mode, Brain Model, routed primary role, todos, dependencies, workers, routing metadata, selected model, and tool execution mode.
- `routeBrain` LLM routing during execution and plan previews, with deterministic heuristic routing available for diagnostics and fallback.
- Isolated support workers, primary executor, and policy-triggered review worker using structured handoff/result packets.
- Session JSONL persistence for runs, todo events, worker lifecycle, hooks, prompt references, handoff, summaries, and errors.
- Project support discovery for `AGENTS.md`, `.mcp.json`, `.agents/skill`, and `.agents/hooks.json`.
- MCP stdio bridge that connects project/user MCP servers and exposes listed tools to the agent runtime.
- First-party local coding tools for zero-config file listing, file reads, content/path search, file edits, patch application, shell commands, git diffs, changed-file inspection, and package scripts.
- Tool approval UI for risky write/execute tool calls, with basic tool-level allow/confirm policy from `tools.json`.
- Minimal patch ledger: successful runs collect changed files and git diff stats and append a `patch_summary` session record.
- Automated patch checks: file-changing runs discover `check`, `typecheck`, `lint`, and `test` package scripts, append `check_summary`, and pass patch/check artifacts to review workers.
- Check runner policy in `tools.json`: checks can be disabled, pinned to explicit package scripts, and bounded by timeout/output limits.
- Typed review decisions: review workers return `approved`, `changes_requested`, or `blocked`; the runtime appends `review_decision` and prevents failed checks from being reported as approved.
- Prompt references for `@file`, compact `@@session` context, and image attachments.
- Router-plan UX: `/plan` asks the configured `routeBrain` by default, heuristic diagnostics are explicit, and the TUI shows routing source, confidence, and reason in plan and intent views.
- Demo benchmark CLI for representative coding tasks covering docs edits, failing tests, auth-risk implementation, package/script changes, and security-review-only prompts.

## Remaining Work

- Continue focused tests for routing, context isolation, hooks, tools, permissions, review gates, and failure recovery.

## Brain Models and Roles

A **Brain Model** is a routing policy, not a single LLM. It decides which model, role, tool budget, and context budget each part of a task should get.

Braincode has two top-level modes:

- `auto` - the main mode, automatically plans by intent and routes work to different agents/models.
- `radical` - a more aggressive autonomous mode for users who want faster, broader execution.

The runtime exposes **14 roles**:

**Router**
- `routeBrain` - LLM-driven planner. Reads the prompt and emits a structured routing decision.

**Domain specialists**
- `frontend` · `backend` · `dba` · `devops` · `designer` · `security` · `qa` · `rush`

**Function helpers**
- `librarian` - codebase mapping and external fact-finding
- `review` - defect inspection of existing code or generated changes
- `oracle` - hard reasoning and architecture tradeoffs
- `summarize` - handoff compression

**Status display**
- `pet` - read-only BrainPet status reporter

Removed in v0.2.0: `coding`, `fastReply`, `research`. Existing user configs are migrated automatically.

## Implementation Notes

Braincode is a Bun-based monorepo, but that is an implementation detail rather than the product pitch. Product orchestration lives in Braincode packages; app entrypoints stay thin.

The project reuses Pi infrastructure where it makes sense, while keeping Braincode's product-specific orchestration and UI separate. The interactive terminal UI is Braincode-owned and built with Ink; Pi remains a provider/runtime layer, not the product interface.

Runtime user configuration belongs under `~/.braincode/`, not inside the repository. Secrets belong in `~/.braincode/auth.json` or a future secure credential store.

## Documentation

- [Overview](./docs/overview.md) - high-level map of layers, packages, and end-to-end request flow. Start here.
- [Architecture](./docs/architecture.md) - main system architecture, Brain Model design, context isolation, Pi integration, local config service.
- [Context management](./docs/context-management.md) - Brain/worker isolation, handoff/result packets, prompt references, session JSONL.
- [Agent communication](./docs/agent-communication.md) - worker lifecycle, routing, hooks, runtime events, multi-agent runs.
- [Project structure and plan](./docs/project-structure.md) - goals, non-goals, workspace layout, package responsibilities, implementation status.
- [Visual style](./docs/visual-style.md) - Brutalist technical poster direction for UI and brand surfaces.
- [References](./docs/references.md) - Amp and Pi reference material used for design decisions.

## Development Commands

```sh
bun install
bun run check
bun test
bun run coverage
bun run braincode -- help
bun run braincode
bun run config
bun run braincode -- config --port 14581
bun run braincode -- run --dry-run "review this patch"
bun run braincode -- run --dry-run --heuristic "review this patch"
bun run braincode -- run "hello"
bun run benchmark
bun run benchmark -- --heuristic
bun run braincode -- benchmark --task auth-risk-change --json
```

The `config` command starts the local browser configuration service and creates missing files under `~/.braincode/`.
Real `run` and TUI prompts require a provider key in `~/.braincode/auth.json`, for example `providers.anthropic.apiKey` for the default model.
Inside the TUI, use `/help` for commands and `/plan <task>` to preview the configured `routeBrain` decision. If the router is unavailable, the plan falls back to the heuristic route and labels that source. Use `/plan --heuristic <task>` only for no-provider diagnostics. The TUI intentionally has no direct model-switching command.
