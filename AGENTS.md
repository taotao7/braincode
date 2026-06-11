# Braincode Agent Instructions

This repository is the `braincode` project: a Bun-based monorepo for building a coding-first AI agent that can also perform general tasks.

Use this file for durable engineering rules. Use the documents under [`docs/`](./docs/) as the source of truth for project architecture, structure, planning, and references.

## Project references

- Main architecture: [`docs/architecture.md`](./docs/architecture.md)
- Development workflow: [`docs/development-workflow.md`](./docs/development-workflow.md)
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
- Keep context ownership layered: Brain owns orchestration context; each subagent owns exactly one isolated task context.
- Give every subagent context its own id and a `parentId` pointing to the Brain task context for progress tracking and recovery.
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

## Project support files

- Load project instructions from `AGENTS.md`.
- Load project MCP server declarations from `.mcp.json`; do not put secrets directly in this file.
- Load project-local skills from `.agents/skills`, preferably `.agents/skills/<skill-id>/SKILL.md`.
- Load project-local hooks from `.agents/hooks.json`; do not use `.codex` paths for Braincode hooks.
- Treat `AGENTS.md` and skill Markdown as prompt context. Treat `.mcp.json` as tool configuration metadata, not prompt content.
- Require command hooks to be explicitly trusted before running them.

## Project structure and planning

- Keep the workspace shape aligned with [`docs/project-structure.md#planned-repository-layout`](./docs/project-structure.md#planned-repository-layout).
- Keep package responsibilities aligned with [`docs/project-structure.md#package-responsibilities`](./docs/project-structure.md#package-responsibilities).
- Keep implementation order aligned with [`docs/project-structure.md#initial-milestones`](./docs/project-structure.md#initial-milestones), unless the user explicitly reprioritizes.
- If code changes reveal that the plan is wrong, update the relevant `docs/` file rather than encoding hidden architectural decisions only in code.

## Development rules

- Keep root `package.json` focused on workspace scripts and metadata.
- Each workspace package should declare its own dependencies.
- Use Conventional Commits-style messages for commits and commit-like summaries, such as `feat: add routing policy` or `fix: restore config web theme`.
- Add tests near behavior that has meaningful risk: routing, config migration, context isolation, tool permissions.
- Put narrow unit tests next to their owning module as `src/<module>.test.ts` or `src/<module>.test.tsx`.
- Put package-level integration tests, public-entrypoint tests, and tests spanning several source modules in `<workspace>/test/*.test.ts` with descriptive names such as `runtime-integration.test.ts`; avoid growing catch-all `src/index.test.ts` files.
- Reserve a root `tests/` tree for future cross-workspace or end-to-end suites only. Keep fixtures under the nearest `test/fixtures/` directory unless they are benchmark fixtures, which belong under `benchmarks/fixtures/`.
- Prefer focused tests over broad end-to-end tests for early development.
- Avoid adding one-off abstractions unless they remove real complexity or match an existing package boundary.
