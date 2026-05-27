# Braincode

A multi-model coding agent orchestrator.

Braincode turns one coding request into a coordinated engineering workflow:

```text
planner -> specialist workers -> primary executor -> reviewer -> final report
```

It is not another AI CLI that asks one model to plan, code, and review itself. Braincode is a coding workflow engine with role separation, model routing, isolated worker contexts, review gates, and structured final reports.

**Languages**: [English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

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
```

`braincode run` uses the configured Brain Model. `--dry-run` previews the routing plan without making provider calls. Use `braincode config` to change the active Brain Model and provider/model settings.

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

- Bun workspace and package skeleton are in place.
- `braincode` starts a Braincode-owned Ink TUI.
- `braincode config` starts a local configuration service backed by `~/.braincode/`.
- The config UI can edit settings, execution mode, brains, models, and tools; auth currently exposes status only and does not display secrets.
- `braincode run` builds a runtime plan from the configured Brain Model.
- Runtime execution can run support workers in isolated contexts, pass structured results to the primary executor, and run a review worker when policy requires it.
- Session JSONL, project/user support files, hooks, MCP server loading, model fallback, and provider auth wiring are started.

## Roadmap

- Stabilize Brain Model routing policy and role selection.
- Tighten coding tool permissions, edit previews, and review gates.
- Improve TUI workflows for intent graphs, worker progress, approvals, and final reports.
- Expand config migrations, model catalog support, and provider setup.
- Add focused tests for routing, context isolation, hooks, permissions, and failure recovery.
- Keep packaging and release automation simple across npm, Homebrew, and prebuilt binaries.

<img width="1774" height="887" alt="ChatGPT Image 2026年5月25日 14_44_11" src="https://github.com/user-attachments/assets/d1d8a807-7438-470f-96a8-e7fc94c45cfe" />

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
- [Project structure and plan](./docs/project-structure.md) - goals, non-goals, workspace layout, package responsibilities, milestones.
- [Visual style](./docs/visual-style.md) - Brutalist technical poster direction for UI and brand surfaces.
- [References](./docs/references.md) - Amp and Pi reference material used for design decisions.

## Development Commands

```sh
bun install
bun run check
bun test
bun run braincode -- help
bun run braincode
bun run config
bun run braincode -- config --port 14581
bun run braincode -- run --dry-run "review this patch"
bun run braincode -- run "hello"
```

The `config` command starts the local browser configuration service and creates missing files under `~/.braincode/`.
Real `run` and TUI prompts require a provider key in `~/.braincode/auth.json`, for example `providers.anthropic.apiKey` for the default model.
Inside the TUI, use `/help` for commands and `/plan <task>` to preview Brain Model routing without calling a provider. The TUI intentionally has no direct model-switching command.
