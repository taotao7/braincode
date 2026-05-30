# Project Structure and Plan

This document is the source of truth for workspace layout, package ownership, and implementation status. The current implementation has passed the initial skeleton/runtime/TUI/MCP/coding-workflow phases; ongoing work is focused on product polish, token-usage visibility, configuration health checks, and targeted test coverage.

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
  .braincode/
    checks.json
  .agents/
    hooks.json
    skills/
      <skill-id>/
        SKILL.md
  README.md
  package.json
  tsconfig.json
  docs/
    architecture.md
    project-structure.md
    references.md
  examples/
    login-validation-demo/
      README.md
      demo.cast
      expected-final.patch
      prompt.txt
      project/
  apps/
    cli/
      src/
        index.ts
        tui.tsx
        *.test.ts
        *.test.tsx
      test/
        run-report.test.ts
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
      test/
        config-store.test.ts
    server/
      src/
        index.ts
    llm/
      src/
        index.ts
      test/
        provider-runtime.test.ts
    brain/
      src/
        index.ts
    context/
      src/
        index.ts
    agent-runtime/
      src/
        benchmark.ts
        checks.ts
        context-budget.ts
        evidence-cache.ts
        hooks.ts
        index.ts
        mcp.ts
        model-selection.ts
        patch.ts
        prompt-references.ts
        review.ts
      test/
        runtime-integration.test.ts
    tools/
      src/
        index.ts
      test/
        local-tools.test.ts
```

## Package responsibilities

### `apps/cli`

Command-line entrypoint for Braincode.

Expected commands:

- `braincode` — start interactive/default mode.
- `braincode config` — start local configuration server and print/open the URL.
- `braincode daemon` — future long-running service mode.
- `braincode run --dry-run <task>` — inspect mode, brain, role, model selection, and the routeBrain plan.
- `braincode run --dry-run --heuristic <task>` — inspect deterministic fallback routing without making provider calls.
- `braincode run <task>` — execute one non-interactive prompt through the configured provider in read-only mode by default.
- `braincode run --allow-edits <task>` — non-interactive execution with first-party local read/write tools and auto-approved file edits, while command execution, MCP tools, and unknown tools remain blocked.
- `braincode run --yes <task>` — non-interactive execution with all local tools and auto-approved tool calls except permission-policy deny matches.
- MCP startup is bounded: CLI runs use short-budget eager loading, while the TUI loads MCP servers in the background and keeps local tools available immediately.
- `braincode benchmark [--heuristic] [--task <id>] [--json]` — run the representative coding-task plan benchmark suite.
- `braincode benchmark --execute [--real] [--task <id>] [--json]` — run isolated patch/check/review execution benchmark fixtures.

The CLI should stay thin. It should delegate implementation to packages.

The interactive TUI is implemented with Ink and should expose Braincode product concepts such as mode, Brain Model routing, agent roles, tool approval, transcript folding, live token/elapsed status, and session state. It renders in the terminal's alternate screen buffer (full-screen, like vim/htop), so it owns the whole terminal and restores the original screen on exit; conversation history is not left in the terminal scrollback, so session resume is the way back to it. Rendering should keep high-frequency data flows separated: input draft/cursor state, transcript/scroll state, live run status, toast/queue state, and BrainPet snapshots each have their own store and component subscription so typing and provider token streams do not force the whole frame to re-render. Ordinary input edits should patch the input box directly and reserve Ink redraws for layout changes. The running status line should tick independently of provider/tool events so elapsed time stays current during long quiet calls. Because the alternate screen has no native scrollback, the transcript provides its own in-app scrolling (`PageUp`/`PageDown`/`Ctrl+↑↓`/`Home`/`End` and the mouse wheel, on by default); the header stays pinned at the top and the input box/status line stay pinned at the bottom, so only the transcript region scrolls. Transcript folding is controlled with `Ctrl+T`. The TUI should let users switch Braincode mode between `auto` and `radical` without leaving the TUI. It should not expose generic Pi model-switching controls; provider/model configuration belongs in `braincode config`.

Early TUI commands:

- `/help` — show Braincode TUI commands and the model-configuration boundary.
- `/plan <task>` — ask the configured `routeBrain` for the preview, then label the route source, confidence, and reason; if the router is unavailable for text-only input, fall back to the heuristic route. Image input requires a vision-capable routeBrain call, so router failures are surfaced instead of silently falling back.
- `/plan --heuristic <task>` — preview deterministic fallback routing without making a provider call.
- `/mode auto|radical`, `/auto`, `/radical` — switch top-level execution mode.
- `/clear` — clear the transcript.
- `/exit` or `/quit` — leave the TUI.

### `apps/config-web`

Browser UI for configuration.

It should talk to the local server API and should not write `~/.braincode/` directly.
It uses tabbed navigation with model management first, so long configuration surfaces stay scannable. It shows model, role, and runtime-phase token usage through the server usage-statistics API, including charted summaries and clickable details. When auth status reports OAuth-backed subscriptions such as Claude Pro/Max, ChatGPT Plus/Pro Codex, or GitHub Copilot, the model catalog can add those provider models without requiring a duplicate API key. GitHub Copilot OAuth should default to public `github.com` and only ask for a GitHub Enterprise domain when the user enables that option. ChatGPT subscription calls use a web-backed endpoint that can be rejected by browser or Cloudflare checks, so connection tests should surface that as a dedicated subscription limitation rather than a generic auth failure; the OAuth panel should mark ChatGPT subscription OAuth as not recommended for reliable calls and suggest ClIProxy API or another compatible proxy for users who still want subscription-backed ChatGPT models.

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
- Discover project support files from the active project root: `AGENTS.md`, `.mcp.json`, `.agents/skills`, `.agents/hooks.json`, and optional `.braincode/checks.json`.
- Parse `.mcp.json` for project MCP server metadata without copying secrets into model context.
- Treat user MCP config as user-installed/trusted, but require project `.mcp.json` server entries to opt in with `trusted: true` before Braincode starts their commands.
- Load local skill Markdown from `.agents/skills/<skill-id>/SKILL.md` or top-level `.agents/skills/*.md`.
- Load user hooks from `~/.braincode/hooks.json` and project hooks from `.agents/hooks.json`.
- Normalize hook definitions and require explicit `trusted: true` before command hooks can run.
- Load optional project check policy from `.braincode/checks.json` and normalize it as a non-secret project support file.
- Aggregate token usage from session JSONL records by model, role, runtime phase, and recent call details for the local config UI.

### `packages/server`

Local configuration and control service using `Bun.serve()`.

Responsibilities:

- Bind to `127.0.0.1` by default.
- Serve the config web app.
- Expose typed API routes for settings, brains, models, tools, auth status, and health checks.
- Expose usage-statistics API routes backed by session JSONL aggregation.
- Persist changes through `packages/config`.

### `packages/brain`

Owns execution mode policy, Brain Model definitions, planning, routing, and model selection policies.

Responsibilities:

- Apply the selected top-level mode: `auto` or `radical`.
- Classify tasks.
- Select agent roles.
- Maintain role definitions and built-in role prompts for every Braincode agent.
- Select model policies.
- Resolve Brain preset inheritance with `extends`, so derived brains can override only planner, role, routing, or context differences.
- Decide when to escalate to stronger models.
- Decide when to spawn worker agents.
- Decide when review is required.
- Decide what crosses from the Brain context layer into each worker's isolated task context.

### `packages/llm`

Owns provider/model registry and Pi AI integration.

Responsibilities:

- Bridge Braincode model config to Pi model definitions.
- Expose Pi built-in providers and user-added OpenAI/Anthropic-compatible providers.
- List provider models through `/models` when the configured provider supports it.
- Resolve API keys and provider headers from `packages/config`.
- Register OpenAI-compatible Images API models in `models.json` and keep them isolated from text-agent model execution.
- Hide provider-specific quirks from the rest of Braincode.

### `packages/agent-runtime`

Owns Braincode's runtime wrapper around Pi agent core.

Responsibilities:

- Start and run agent sessions.
- Expand routing plans into runtime worker plans with model selections.
- Resolve ordered runtime model candidates, API-key availability, and vision/image-generation requirements from Brain Model policies.
- Run isolated support workers from compact handoff packets.
- Give selected support/review roles read-only project tools for evidence gathering without edit/execute capability.
- Run the primary agent with only structured worker results as additional context.
- Run a review worker for risky tasks when Brain policy requires it.
- Merge structured worker and review results into the final run result.
- Connect tools to the underlying agent runtime, including eager/background/lazy MCP loading and dynamic primary-agent tool refresh when MCP becomes ready.
- Cache repeated read-only tool evidence within a run, reuse identical results, warn on duplicate loops, and reset cached evidence plus duplicate counters after write/execute tools.
- Broker tool approval callbacks before risky tool execution and keep tool events normalized for UI rendering.
- Apply path-aware and command-aware permission policy before local writes, patches, shell/exec commands, and package scripts; deny matches are not bypassable, ask matches can be approved by the active permission mode, and `review: required` matches add a review worker.
- Classify patch changes into smart check kinds, select package-script checks according to user/project policy, record why checks ran or were skipped, and force review for smart-check risk kinds.
- Load project support context from `packages/config` and pass relevant `AGENTS.md`/skill content into primary, worker, and review prompts.
- Carry project support references in worker handoff packets.
- Record provider token usage per routeBrain, support, primary, and review model call into session JSONL.
- Run trusted lifecycle hooks at supported runtime points and record hook outcomes in the session log.
- Emit normalized Braincode events.
- Persist sessions.
- Apply Braincode-specific runtime policy.
- Own the reusable demo benchmark task catalog and plan-level evaluation logic for representative coding workflows.

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

Owns tool definitions, permissions, and first-party local coding tool implementations. MCP tools are bridged through `packages/agent-runtime`.

Responsibilities:

- Register coding tools such as read, write, edit, shell/exec, stdin polling, search, patch application, git diff, changed-file inspection, and check/script execution.
- Provide first-party local implementations for the default coding toolset.
- Detect JS package managers from lockfiles for package-script execution (`bun`, `pnpm`, `yarn`, or `npm`).
- Coordinate with `packages/agent-runtime` for project/user MCP tools declared through `.mcp.json` and user MCP config.
- Define safe execution policies that can account for path, command, risk, and review requirements.
- Keep permission checks outside individual UI surfaces.
- Support future project-specific tool configuration.

### `packages/shared`

Small dependency-light shared utilities and primitive types.

Do not turn this into a dumping ground. If code has a domain owner, keep it in that package.

## Current implementation phase

The project is no longer in a "framework skeleton" phase. Runtime orchestration, routeBrain routing, worker execution, review worker execution, TUI interaction, sessions/handoff, MCP tools, hooks, approval UI, patch summaries, checks, structured review decisions, permission policy, read-only evidence workers, package-manager-aware checks, review artifacts for untracked files, tool-call evidence caching, and Brain-mediated dynamic specialist dispatch are in place.

The coding patch engine now follows this path:

```text
local tools
  -> read-only support/review evidence
  -> file edits
  -> changed files
  -> git diff
  -> untracked file previews
  -> checks
  -> review decision
  -> final patch report
  -> session ledger
```

Remaining work:

- Continue focused tests for routing, context isolation, hooks, tools, permissions, review gates, and failure recovery.

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
- Keep model management first in the tabbed Web UI and expose usage charts/details from session token records.

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
- Use routeBrain for default execution and dry-run planning, with deterministic routing reserved for diagnostics and fallback.
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

### MVP-5: coding workflow - done, ongoing focused tests

- Done: `AGENTS.md` durable project instruction context.
- Done: project MCP server declarations from `.mcp.json`, gated by per-server `trusted: true` before command execution.
- Done: project-local skills from `.agents/skills`.
- Done: trusted command hooks from `~/.braincode/hooks.json` and `.agents/hooks.json`.
- Done: review worker execution for risky tasks.
- Done: user confirmation flows for risky tool calls in the TUI.
- Done: first-party `list_files`, `read_file`, `search_files`, `edit_file`, `apply_patch`, `exec_command`, `write_stdin`, `shell`, `git_diff`, `get_changed_files`, and `run_script` tools wired into primary runtime execution.
- Done: read-only tool access for `librarian`, `qa`, `security`, and review workers.
- Done: non-interactive run permission modes: read-only default, `--allow-edits` for local reads/file edits, and `--yes`.
- Done: minimal patch ledger record with changed files and git diff stats.
- Done: automated package-script checks for file-changing runs with package manager detection, smart patch-kind selection, `check_summary` session records, and review-worker patch/check artifacts.
- Done: review-worker artifacts include capped text previews for newly created untracked files and binary markers for untracked binary files.
- Done: configurable check-runner policy in `tools.json` plus project `.braincode/checks.json` overrides for explicit scripts, per-kind policies, timeout/output bounds, and disabling checks.
- Done: typed review-worker decisions with `approved`, `changes_requested`, and `blocked` plus confidence, severity-ranked findings, required changes, blocking issues, residual risks, and `review_decision` session records.
- Done: Review Gate v2 runtime enforcement prevents failed checks from approving, records truncated diffs and skipped checks as residual risks, and downgrades or blocks missing review artifacts by policy.
- Done: bounded run-level read-only evidence cache with duplicate tool-call reminders, LRU/TTL/byte-limit eviction, cache-size details, and write/execute invalidation.
- Done: Permission Policy v2 in `tools.json`, with path-aware edit/patch checks, command-aware shell/exec/script checks, non-bypassable deny rules, policy details on tool results, and forced review for sensitive path matches.
- Done: Brain preset inheritance through `extends`.
- Done: demo benchmark CLI for representative README edit, failing-test fix, auth-risk change, package change, and security-review-only planning runs.
- Done: execution benchmark fixtures under `benchmarks/fixtures` plus `braincode benchmark --execute`, with offline mock execution by default, `--real` for configured provider runs, isolated temp git worktrees, and JSON metrics for changed files, diff stats, checks, review, duration, tool calls, token usage, approvals, and fallbacks.
- Done: login validation safe-review demo under `examples/login-validation-demo`, including a TS/Bun/React fixture, focused `.braincode/checks.json`, expected patch, and asciinema transcript.
- Done: token-only usage metrics in final reports, session `tool_call_count` records, runtime-phase token aggregation, and benchmark brain/primary token comparison. Braincode intentionally does not estimate dollar cost because user-connected providers and model access modes may not expose reliable pricing.
- Ongoing: focused tests for routing, context isolation, hooks, tools, permissions, review gates, and failure recovery.
