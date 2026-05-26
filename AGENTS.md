# Braincode Agent Instructions

This repository is the `braincode` project: a Bun-based monorepo for building a coding-first AI agent that can also perform general tasks.

Use this file for durable engineering rules. Use the documents under [`docs/`](./docs/) as the source of truth for project architecture, structure, planning, and references.

## Project references

- Main architecture: [`docs/architecture.md`](./docs/architecture.md)
- Project goals and non-goals: [`docs/project-structure.md#goals`](./docs/project-structure.md#goals) and [`docs/project-structure.md#non-goals-for-the-first-phase`](./docs/project-structure.md#non-goals-for-the-first-phase)
- Runtime and infrastructure: [`docs/project-structure.md#runtime-and-infrastructure`](./docs/project-structure.md#runtime-and-infrastructure)
- Planned repository layout: [`docs/project-structure.md#planned-repository-layout`](./docs/project-structure.md#planned-repository-layout)
- Package responsibilities: [`docs/project-structure.md#package-responsibilities`](./docs/project-structure.md#package-responsibilities)
- Milestones: [`docs/project-structure.md#initial-milestones`](./docs/project-structure.md#initial-milestones)
- Visual style: [`docs/visual-style.md`](./docs/visual-style.md)
- External references: [`docs/references.md`](./docs/references.md)

When changing architecture, structure, or planning, update the relevant `docs/` file first or in the same change. Do not let this file become a second copy of the full plan.

## Runtime and package management

- Use Bun by default.
- Use `bun install` for dependencies.
- Use `bun run <script>` for scripts.
- Use `bun test` for tests.
- Use `bunx <package> <command>` instead of `npx`.
- Prefer Bun-native APIs when practical:
  - `Bun.serve()` for local HTTP/WebSocket services.
  - `Bun.file` for simple file reads/writes.
  - `Bun.$` for shell integration inside TypeScript code.

## Architecture principles

- Keep packages low-coupled and reusable.
- Put product orchestration in braincode packages, not in app entrypoints.
- Prefer small, typed interfaces between packages.
- Do not let UI packages depend on agent internals directly; communicate through protocol/shared types.
- Do not let agent workers share full conversation history. Use isolated contexts and structured handoff/result messages.
- Do not fork pi-mono unless there is no viable public API or integration point.
- Follow the planned layout in [`docs/project-structure.md#planned-repository-layout`](./docs/project-structure.md#planned-repository-layout) unless a change is intentionally updating the plan.
- Keep package ownership aligned with [`docs/project-structure.md#package-responsibilities`](./docs/project-structure.md#package-responsibilities).

## Pi integration direction

- Prefer depending on Pi packages instead of copying Pi code.
- Use `@earendil-works/pi-ai` for provider/model streaming abstractions.
- Use `@earendil-works/pi-agent-core` for agent runtime, tool calling, sessions, and compaction where it fits.
- Do not use Pi's TUI or generic model-switching UI as Braincode's product interface.
- Build Braincode's terminal interface with Ink, exposing Braincode concepts such as mode, Brain Model routing, roles, tools, permissions, sessions, and handoffs.
- Keep provider/model configuration in `braincode config`; the terminal UI may display the routed model but should not let users bypass Braincode routing by switching models directly.
- Keep Braincode's own responsibilities separate:
  - brain model schema and routing policy
  - Braincode-owned Ink terminal UI
  - multi-agent orchestration
  - context isolation and handoff protocol
  - local configuration server
  - project/user configuration storage
  - coding workflow product behavior

## User configuration

- Runtime user configuration belongs under `~/.braincode/`, not inside the repository.
- The repo may contain default schemas, templates, migrations, and documentation only.
- The local configuration UI should run on `127.0.0.1` by default and persist to `~/.braincode/`.
- Secrets belong in `~/.braincode/auth.json` or a future secure credential store, never in committed files.
- Treat `~/.braincode/auth.json` as sensitive and ensure restrictive permissions when writing it.

## Project structure and planning

- Keep the workspace shape aligned with [`docs/project-structure.md#planned-repository-layout`](./docs/project-structure.md#planned-repository-layout).
- Keep package responsibilities aligned with [`docs/project-structure.md#package-responsibilities`](./docs/project-structure.md#package-responsibilities).
- Keep implementation order aligned with [`docs/project-structure.md#initial-milestones`](./docs/project-structure.md#initial-milestones), unless the user explicitly reprioritizes.
- If code changes reveal that the plan is wrong, update the relevant `docs/` file rather than encoding hidden architectural decisions only in code.

## Development rules

- Keep root `package.json` focused on workspace scripts and metadata.
- Each workspace package should declare its own dependencies.
- Add tests near behavior that has meaningful risk: routing, config migration, context isolation, tool permissions.
- Prefer focused tests over broad end-to-end tests for early development.
- Avoid adding one-off abstractions unless they remove real complexity or match an existing package boundary.
