# Braincode

Braincode is a Bun-based monorepo for a coding-first AI agent that can also handle general tasks.

Its main idea is a user-selectable **Brain Model**: a high-level strategy profile that dynamically plans which underlying model, agent role, tools, and context budget should be used for each part of a task.

The project reuses Pi infrastructure where it makes sense, while keeping Braincode's product-specific orchestration separate.

**Languages**: [English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

## Why this project

Today's coding agents are not smart enough. A strong agent should pick **different models for different needs**, because every model has its own strengths — some are better at planning, some at writing code, some at reviewing, some at fast/cheap replies.

Braincode is built around this idea: instead of choosing one model for everything, the user picks a **Brain Model** that dispatches each sub-task to the model best suited for it.

Braincode has two top-level modes:

- `auto` — the main mode, automatically plans by intent and routes work to different agents/models.
- `radical` — a more aggressive autonomous mode for users who want faster, broader execution.

## Documentation

- [Architecture](./docs/architecture.md) — main system architecture, Brain Model design, context isolation, Pi integration, local config service.
- [Project structure and plan](./docs/project-structure.md) — goals, non-goals, workspace layout, package responsibilities, milestones.
- [References](./docs/references.md) — Amp and Pi reference material used for design decisions.

## Current development commands

```sh
bun install
bun run check
bun test
bun run braincode -- help
bun run config
bun run braincode -- config --port 14581
```

The `config` command starts the local browser configuration service and creates missing files under `~/.braincode/`.
