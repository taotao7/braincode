# Braincode

<img width="1774" height="887" alt="ChatGPT Image 2026年5月25日 14_44_11" src="https://github.com/user-attachments/assets/d1d8a807-7438-470f-96a8-e7fc94c45cfe" />

Braincode is **a harness, not an agent**. It is a Bun-based monorepo whose job is to route each part of a task to the model and the specialist role best suited for it — not to bind a single LLM to your terminal and hope for the best.

Its main idea is a user-selectable **Brain Model**: a high-level strategy profile inside the harness that dynamically plans which underlying model, agent role, tools, and context budget each sub-task should get.

The "harness" framing matters because Braincode does not assume one model is good at every job. It assumes the opposite: that an LLM is a powerful but narrow capability, and that the surrounding **harness** — routing, isolated worker contexts, structured handoffs, review gates, local config — is what turns those capabilities into reliable engineering work.

The project reuses Pi infrastructure where it makes sense, while keeping Braincode's product-specific orchestration and UI separate. The interactive terminal UI is Braincode-owned and built with Ink; Pi remains a provider/runtime layer, not the product interface.

**Languages**: [English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

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

## Core philosophy

At the current stage of AI, **smart orchestration of models matters more than any single model**. No individual LLM dominates every dimension — planning, coding, reviewing, summarizing, fast cheap replies — and locking a workflow to one model wastes both capability and money. Braincode is built on the belief that **leveraging each model's strengths through deliberate orchestration delivers the greatest gains in efficiency, quality, and cost**. The Brain Model is the concrete expression of this philosophy.

## Why this project

Today's coding agents are not smart enough. A strong agent should pick **different models for different needs**, because every model has its own strengths — some are better at planning, some at writing code, some at reviewing, some at fast/cheap replies.

Braincode is built around this idea: instead of choosing one model for everything, the user picks a **Brain Model** that dispatches each sub-task to the model best suited for it.

Braincode has two top-level modes:

- `auto` — the main mode, automatically plans by intent and routes work to different agents/models.
- `radical` — a more aggressive autonomous mode for users who want faster, broader execution.

## Agent roles (v0.2.0)

The harness exposes **14 roles**, organized as role-shaped specialists plus a small set of non-overlapping function helpers. The generic `coding` role has been removed — code work is split by domain so each role can be routed to a model that is actually strong at that domain.

**Router**
- `routeBrain` — LLM-driven planner. Reads the prompt and emits a structured routing decision (primary role, workers, todos, dependencies). The harness no longer relies on regex pattern matching for routing.

**Domain specialists**
- `frontend` · `backend` · `dba` · `devops` · `designer` · `security` · `qa` · `rush`

**Function helpers (non-overlapping)**
- `librarian` — codebase mapping AND external fact-finding (absorbs the old `research` role)
- `review` — defect inspection of existing code
- `oracle` — hard reasoning, architecture tradeoffs
- `summarize` — handoff compression

**Status display**
- `pet` — read-only BrainPet status reporter

Removed in this release: `coding`, `fastReply`, `research`. Existing user configs are migrated automatically — obsolete role entries are stripped on first load.

## Documentation

- [Overview](./docs/overview.md) — high-level map of layers, packages, and end-to-end request flow. Start here.
- [Architecture](./docs/architecture.md) — main system architecture, Brain Model design, context isolation, Pi integration, local config service.
- [Context management](./docs/context-management.md) — Brain/worker isolation, handoff/result packets, prompt references, session JSONL.
- [Agent communication](./docs/agent-communication.md) — worker lifecycle, routing, hooks, runtime events, multi-agent runs.
- [Project structure and plan](./docs/project-structure.md) — goals, non-goals, workspace layout, package responsibilities, milestones.
- [Visual style](./docs/visual-style.md) — Brutalist technical poster direction for UI and brand surfaces.
- [References](./docs/references.md) — Amp and Pi reference material used for design decisions.

## Current status

- Bun workspace and package skeleton are in place.
- `braincode` starts a minimal Braincode-owned Ink TUI.
- `braincode config` starts a local configuration service backed by `~/.braincode/`.
- The config UI can edit settings, execution mode, brains, models, and tools; auth currently exposes status only and does not display secrets.
- Pi adapter boundaries are started:
  - `packages/llm` maps Braincode model config to Pi model objects.
  - `packages/agent-runtime` creates Pi-backed runtime instances from mode, model policy, and system prompt.
- Single-prompt real model execution and Brain Model routing are wired through `braincode run` and the Ink TUI when provider auth is configured.
- Multi-agent orchestration, coding tools, permissions, and richer TUI workflows are planned next.

## Current development commands

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
