# Braincode Agent Instructions

This repository is the `braincode` project: a Bun-based monorepo for building a coding-first AI agent that can also perform general tasks.

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

## Pi integration direction

- Prefer depending on Pi packages instead of copying Pi code.
- Use `@earendil-works/pi-ai` for provider/model streaming abstractions.
- Use `@earendil-works/pi-agent-core` for agent runtime, tool calling, sessions, and compaction where it fits.
- Keep Braincode's own responsibilities separate:
  - brain model schema and routing policy
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

## Suggested package boundaries

- `apps/cli`: CLI entrypoint and command wiring only.
- `apps/config-web`: browser configuration UI.
- `packages/config`: config schema, default values, migrations, and `~/.braincode/` persistence.
- `packages/server`: local Bun server, API routes, WebSocket/SSE endpoints.
- `packages/brain`: brain model definitions, planning, routing, model selection policies.
- `packages/agent-runtime`: wrapper around Pi agent runtime and Braincode session execution.
- `packages/llm`: provider/model registry and Pi AI integration.
- `packages/context`: context isolation, compaction policy, handoff/result packets.
- `packages/protocol`: shared message/event/RPC types between CLI, server, UI, and agents.
- `packages/tools`: tool registry, tool permissions, coding tools, and safe execution policy.
- `packages/shared`: dependency-light shared types/utilities.

## Development rules

- Keep root `package.json` focused on workspace scripts and metadata.
- Each workspace package should declare its own dependencies.
- Add tests near behavior that has meaningful risk: routing, config migration, context isolation, tool permissions.
- Prefer focused tests over broad end-to-end tests for early development.
- Avoid adding one-off abstractions unless they remove real complexity or match an existing package boundary.
