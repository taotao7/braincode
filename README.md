# Braincode

<img width="1774" height="887" alt="ChatGPT Image 2026年5月25日 14_44_11" src="https://github.com/user-attachments/assets/d1d8a807-7438-470f-96a8-e7fc94c45cfe" />

Braincode is a Bun-based monorepo for a coding-first AI agent that can also handle general tasks.

Its main idea is a user-selectable **Brain Model**: a high-level strategy profile that dynamically plans which underlying model, agent role, tools, and context budget should be used for each part of a task.

The project reuses Pi infrastructure where it makes sense, while keeping Braincode's product-specific orchestration separate.

**Languages**: [English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

## Core philosophy

At the current stage of AI, **smart orchestration of models matters more than any single model**. No individual LLM dominates every dimension — planning, coding, reviewing, summarizing, fast cheap replies — and locking a workflow to one model wastes both capability and money. Braincode is built on the belief that **leveraging each model's strengths through deliberate orchestration delivers the greatest gains in efficiency, quality, and cost**. The Brain Model is the concrete expression of this philosophy.

## Why this project

Today's coding agents are not smart enough. A strong agent should pick **different models for different needs**, because every model has its own strengths — some are better at planning, some at writing code, some at reviewing, some at fast/cheap replies.

Braincode is built around this idea: instead of choosing one model for everything, the user picks a **Brain Model** that dispatches each sub-task to the model best suited for it.

Braincode has two top-level modes:

- `auto` — the main mode, automatically plans by intent and routes work to different agents/models.
- `radical` — a more aggressive autonomous mode for users who want faster, broader execution.

## Documentation

- [Architecture](./docs/architecture.md) — main system architecture, Brain Model design, context isolation, Pi integration, local config service.
- [Project structure and plan](./docs/project-structure.md) — goals, non-goals, workspace layout, package responsibilities, milestones.
- [Visual style](./docs/visual-style.md) — Brutalist technical poster direction for UI and brand surfaces.
- [References](./docs/references.md) — Amp and Pi reference material used for design decisions.

## Current status

- Bun workspace and package skeleton are in place.
- `braincode config` starts a local configuration service backed by `~/.braincode/`.
- The config UI can edit settings, execution mode, brains, models, and tools; auth currently exposes status only and does not display secrets.
- Pi adapter boundaries are started:
  - `packages/llm` maps Braincode model config to Pi model objects.
  - `packages/agent-runtime` creates Pi-backed runtime instances from mode, model policy, and system prompt.
- Real model execution, Brain Model routing, and multi-agent orchestration are planned next.

## Current development commands

```sh
bun install
bun run check
bun test
bun run braincode -- help
bun run config
bun run braincode -- config --port 14581
bun run braincode -- run --dry-run "review this patch"
bun run braincode -- run "hello"
```

The `config` command starts the local browser configuration service and creates missing files under `~/.braincode/`.
Real `run` requires a provider key in `~/.braincode/auth.json`, for example `providers.anthropic.apiKey` for the default model.
