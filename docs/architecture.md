# Braincode Architecture

This document is the main architecture reference for Braincode.

For contributors, companion docs go deeper on the trickiest parts:

- [Context management](./context-management.md) — how Brain and worker contexts stay isolated, packet shapes, prompt references, session JSONL.
- [Agent communication](./agent-communication.md) — worker lifecycle, routing, hooks, runtime events, multi-agent runs.
- [Review and audit](./review-and-audit.md) — pre-execution review gates, permission decisions, patch/check review, and the session audit trail.

If you are new to the codebase, start with [Overview](./overview.md).

## Architecture goals

- Build a coding-first agent that can also perform general tasks.
- Let users select a high-level **Brain Model** instead of a single LLM.
- Dynamically route planning, domain code work (frontend/backend/etc.), research, review, summarization, and quick replies to different models — Braincode acts as a harness over multiple LLMs rather than a single-LLM agent.
- Isolate context between agents.
- Keep context ownership layered: Brain owns the orchestration context, and every subagent owns one isolated task context.
- Communicate between agents with structured handoff/result messages instead of shared full transcripts.
- Reuse Pi infrastructure where public package APIs fit.
- Keep Braincode product orchestration separate from app entrypoints and UI layers.

## High-level system

```text
User / Ink TUI / CLI / Config UI
  -> apps/cli or apps/config-web
    -> packages/server
      -> packages/config
      -> packages/brain
      -> packages/agent-runtime
        -> packages/context
        -> packages/tools
        -> packages/llm
          -> @earendil-works/pi-ai
        -> @earendil-works/pi-agent-core
```

Runtime responsibilities are split into four layers:

1. **Interface layer**: Braincode-owned Ink TUI, CLI commands, and browser configuration UI.
2. **Product layer**: Brain Model selection, routing, local configuration service, coding workflow policy.
3. **Agent layer**: isolated sessions, handoff packets, tool registry, normalized runtime events.
4. **Provider/runtime layer**: Pi AI and Pi Agent Core integration.

## Core flow

```text
User task
  -> root orchestrator
    -> assess whether the user intent is complete enough for execution
      -> if incomplete, return a clarification question with concrete options
    -> classify task and select Brain Model policy
    -> choose one or more agent roles and create a checkable todo plan
    -> create isolated context for each worker
      -> worker uses selected model + tools
      -> worker completion marks its assigned todo items complete or failed
      -> worker returns structured result
    -> primary agent completion marks its assigned todo items complete or failed
    -> merge selected summaries/artifacts/facts
  -> final answer or code change
```

## Execution modes

Braincode has two top-level execution modes.

### `auto`

`auto` is the default and primary product mode. In this mode Braincode interprets the user's intent, plans the work, selects suitable agent roles, chooses model policies through the selected Brain Model, and dispatches isolated worker agents when useful.

Use `auto` for normal coding-agent behavior:

- ask for clarification before worker handoff when the user's request is too incomplete or ambiguous to execute safely;
- classify the task before acting;
- choose cheap/fast models for simple work;
- use stronger models for planning, risky code work, or review;
- spawn separate agents for librarian, code specialists (frontend/backend/etc.), summarization, or review when needed;
- keep context isolated and merge only structured results.

### `radical`

`radical` is the more aggressive mode. In the TUI, radical exposes Braincode's default local tools even if the user-level tool toggles are disabled, and exposed tool calls are auto-approved: routeBrain receives radical-specific decomposition instructions, the todo budget grows from 6 to 8, the effective worker budget is raised to at least 4 routed workers, support-worker concurrency is raised to at least 4 where dependencies allow, and each agent runs its own tool calls in parallel.

Use `radical` for users who prefer higher autonomy and faster end-to-end execution. The mode should add specialist workers earlier (`librarian`, `oracle`, `qa`, and domain experts when relevant) and keep dependencies sparse so independent support agents can run concurrently. In the TUI, risky write/execute/MCP actions do not pause for Ask User prompts in radical mode.

## Brain Model

A Brain Model is a routing and execution policy. It is not a single provider model.

```ts
type BrainModel = {
  id: string
  name: string
  description: string
  planner: ModelPolicy
  roles: {
    routeBrain: ModelPolicy
    frontend: ModelPolicy
    backend: ModelPolicy
    designer: ModelPolicy
    imageMaker: ModelPolicy
    dba: ModelPolicy
    devops: ModelPolicy
    security: ModelPolicy
    qa: ModelPolicy
    review: ModelPolicy
    summarize: ModelPolicy
    oracle: ModelPolicy
    librarian: ModelPolicy
    rush: ModelPolicy
    pet: ModelPolicy
  }
  routing: {
    maxParallelAgents: number
    preferCheapModelForSimpleTasks: boolean
    escalateOnUncertainty: boolean
    requireReviewForFileEdits: boolean
  }
  context: {
    maxInputTokens: number
    compaction: "auto" | "manual" | "aggressive"
    isolation: "strict" | "shared-facts"
  }
}
```

The Brain Model layer decides:

- which role should handle a task;
- which model policy should be used for each role;
- when to spawn worker agents;
- when to escalate to a stronger model;
- when review is required;
- how much context can be passed into a worker.

Routing has two inputs:

- deterministic heuristics in `packages/brain`, used for diagnostics and fallback;
- the configured `routeBrain`/`planner` model, used during real execution and default plan previews when credentials are available.

Both paths normalize into an `AgentRoutingPlan` with one primary routed role, zero or more worker plans, a review requirement flag, and a short routing reason. Role definitions and built-in role prompts live with the Brain Model logic so the router, defaults, and runtime prompts stay aligned. The routeBrain prompt embeds the full role catalog and the selected Brain Model's routed role-policy capability summaries. The role catalog describes role identity, capabilities, boundaries, and output contracts; the role-policy summaries tell routeBrain which roles can satisfy modality constraints such as vision. Runtime execution still resolves each selected role through that role's own `modelId -> fallbackModelIds` chain. The planner/routeBrain model is only for routing unless it is explicitly configured in the selected role's own chain, so routeBrain cannot silently rebind `rush` or another role to the planner model.

Brain presets can inherit from another Brain Model with `extends`. The selected brain is resolved before routing, merging planner, role, routing, and context fields over the parent. This lets users maintain narrow presets such as a stricter review brain without duplicating the full built-in role matrix.

Role policies point at entries in `models.json`; those entries include text-agent models backed by Pi's built-in provider catalog or user-added OpenAI/Anthropic-compatible providers, plus image-generation models backed by an OpenAI-compatible Images API. The `imageMaker` policy selects an `openai-images` entry from that same catalog, while runtime requirements prevent those image-generation entries from running text agent turns. This keeps raster image generation separate from vision-capable text models: a model that accepts image input can serve frontend/design/review work, but it is not the Image Maker engine. When a prompt carries image input, routeBrain itself must run on a vision-capable configured model; if that cannot happen, Braincode reports the router failure instead of silently falling back to heuristic routing.

Routing also produces a todo plan and dependency graph. Each todo has a stable id, title, assigned routed role, status, and optional summary. Dependency edges identify which todo must produce output before another todo can proceed. Worker plans carry the todo ids they own and runtime worker plans carry stable child context ids. During execution the runtime records `context_plan`, `todo_plan`, `todo_update`, and `agent_message` session JSONL events, emits live todo and worker updates to the TUI, and updates the runtime plan so the user can see tasks move from pending to running to completed, blocked, or failed. Independent support workers run concurrently up to the mode-adjusted routing limit (`brain.routing.maxParallelAgents` in auto, at least 4 in radical); dependent support workers wait until Brain has an upstream worker summary to pass along. The TUI can show the current decomposition graph with `Ctrl+O` or `/intent`. Review work added by policy is appended to the runtime todo list without changing the original Brain-planned worker list.

The routing plan can also carry an intent-clarification decision. routeBrain must decide whether the request is complete enough for specialist execution before workers are launched. If the request is missing a target, expected outcome, constraints, or success criteria and several materially different interpretations are plausible, the plan includes `clarification.required=true`, one user-facing question, and two or three mutually exclusive options. The runtime records `clarification_request`, marks planned todos blocked, returns a `needs_clarification` final report, and does not start support, primary, review, MCP, or local-tool execution. The next user turn can answer with an option id, option number, or additional details; normal session continuity then feeds the completed intent back into routeBrain for specialist handoff.

Tool execution emits a separate, user-visible surface from normal assistant text. The TUI labels tool transcript rows by action class (`Web Search`, `Execute`, `Read`, `Write`, `MCP`, or generic `Tool`) and keeps tool start, streaming update, completion, failure, duration, arguments, and result summaries scannable. Transcript rows with `▸` / `▾` markers are collapsible, and `Ctrl+T` toggles foldable transcript rows between expanded and collapsed without using mouse clicks. The TUI renders in the terminal's alternate screen buffer, so it owns the whole terminal and the original screen is restored on exit (like vim/htop/less); the conversation is not left in the terminal scrollback, so resume a session to revisit it. Because the alternate screen has no native scrollback, the transcript scrolls in-app with `PageUp`/`PageDown`/`Ctrl+↑↓`/`Home`/`End` and the mouse wheel (on by default; `BRAINCODE_TUI_MOUSE=false` releases the mouse so you can drag-select without holding Shift). The header (mode, session, root, project, user) stays pinned at the top and the input box and status line stay pinned at the bottom; only the transcript region scrolls. The live running status line owns a one-second timer so elapsed time keeps updating even while the provider is quiet. Local command execution supports both the legacy one-shot `shell` tool and `exec_command` sessions that can return a session id for long-running commands; `write_stdin` polls or writes to those sessions. In auto mode, risky tool categories can pause through the runtime's tool approval callback before Pi executes the call; the TUI presents those approval requests as checkable `Ask User` decisions and returns an approve/block result to the runtime. The TUI can approve once, block, or approve further risky calls for the current session. Radical mode auto-approves exposed tool calls after permission-policy deny checks, and the TUI radical path ignores disabled local-tool toggles so execute tools such as `exec_command`, `shell`, and `run_script` remain available. Tool approval honors `~/.braincode/tools.json`: tools enabled with `approvalPolicy: "allow"` in the Web UI are not prompted again unless a path/command policy asks for explicit approval. Non-interactive `braincode run` is read-only by default; `--allow-edits` exposes first-party local read/write tools and auto-approves file edits while blocking command execution, MCP tools, and unknown tools, and `--yes` exposes configured local/MCP tools with auto-approval.

`tools.json` also owns Permission Policy v2 under `permissions.paths` and `permissions.commands`. Path rules evaluate `edit_file` and `apply_patch` targets before execution; command rules evaluate `shell`, `exec_command`, and `run_script` commands before process start. Built-in rules ask and require review for `src/auth/**`, `src/payment/**`, `db/**`, `package.json`, and `.github/workflows/**`; deny project escapes; allow common test commands; and deny `git push`, package publish commands, and `rm -rf`. Deny rules cannot be bypassed by `--yes` or radical mode. Ask rules still surface through the approval callback, so `--yes` and radical can approve them automatically, while the TUI shows the matched path/command rule in the approval panel. When a matched rule has `review: "required"`, the runtime marks the run as requiring review and adds a review worker if the original route did not include one. Successful local tool results include the matched permission policy details in their structured `details`.

Read-only evidence tools are available to `librarian`, `qa`, `security`, and `review` workers. These workers can list files, read files, search content/paths, inspect diffs, and inspect changed files, but they cannot edit files, apply patches, run shell/exec commands, poll exec sessions, or run package scripts. The primary worker receives the configured local/MCP toolset according to the active permission mode.

MCP tool loading supports `eager`, `background`, and `lazy` strategies. Non-interactive CLI runs use short-budget eager loading: each server has a bounded connect timeout and the run continues with local tools if the global startup budget is exceeded. The TUI uses background loading so local tools and the first prompt are not blocked by slow MCP startup; loading, skipped, failed, and connected states are emitted through the MCP report callback and recorded in the session log. While MCP is still loading or deferred, the primary agent can call `mcp__connect` to wait for configured MCP servers and refresh the live tool list for the next provider turn.

After patch activity, the check runner classifies the runtime-owned changed files into `docs-only`, `test-only`, `frontend`, `backend`, `auth-risk`, `db-risk`, `package-change`, `ci-risk`, or `unknown-code`. The default smart strategy skips package checks for docs-only changes, runs `test` for test-only changes, runs `typecheck`/`lint`/`test` for frontend changes, runs `typecheck`/`test` for backend changes, and runs the full `check`/`typecheck`/`lint`/`test` set for risky or unknown code when those scripts exist. Auth, DB, and CI risk classifications also mark the run as requiring independent review. CI workflow changes require command approval before checks run, even in aggressive execution paths. Projects can override the user-level `tools.json` check policy with `.braincode/checks.json`, including per-kind scripts, skip behavior, review requirements, and reason strings. Check summaries record `patchKind`, selected scripts, the run/skip reason, and whether review was required, and the shared final report renders that reason in CLI and TUI output.

When a run creates new untracked files, the review prompt includes capped text previews for those files alongside the normal patch summary, diff snapshot, and check results. Binary untracked files are represented by size and binary markers instead of raw content, so review can see that the artifact exists without polluting the model context.

The runtime keeps a run-level evidence cache for deterministic read-only local tool calls (`list_files`, `read_file`, `search_files`, `git_diff`, `get_changed_files`). Identical calls reuse cached results and repeated calls get progressively stronger reminders. The cache is bounded by max entries, approximate cached-content bytes, and TTL; eviction uses least-recently-used ordering and each cached tool result reports cache size and eviction details. Write/execute tool calls reset cached entries, repeat counters, and consecutive-call state so stale reads and false duplicate loops do not survive patch changes or command output changes.

Braincode treats provider message-size limits as a handoff boundary, not an invitation to silently compress the current transcript. Before each provider call, the runtime estimates the active agent message payload against the provider-size safety budget. If the active context is too large, or if the provider returns a hard "total message size exceeds limit" error, the run is reported as "context handoff required." The TUI pre-fills `/handoff` so the user can produce a compact session packet and continue from `@@<session-id>` in a fresh session. Full tool transcripts and private worker context stay behind the boundary.

## Layered context ownership

Workers must not share full conversation history.

```text
Brain orchestration context
  id: <brain-task-id>
  -> RuntimePlan.context (Brain task id + child agent context ids)
  -> compact Brain-to-agent handoff packet
    -> isolated subagent task context
       id: <agent-task-id>
       parentId: <brain-task-id>
      -> structured agent-to-Brain result
  -> Brain keeps selected summaries, artifacts, risks, and questions
  -> primary agent receives only selected worker results
  -> optional review worker checks risky primary results
  -> root returns merged final answer
```

The ownership rule is:

- Brain owns the root orchestration layer: user intent, routing plan, shared facts, allowed context references, worker result summaries, artifacts, risks, and open questions.
- Brain assigns a stable task id for the root context so the run can be recorded, resumed, or recovered.
- Each subagent owns exactly one task layer: its own context id, `parentId` pointing to the Brain task id, role prompt, compact handoff packet, allowed references, progress, and tool results produced in that isolated session.
- Context crosses layers only through typed packets. Brain-to-agent handoff packets carry the subagent context id, parent id, goal, progress, constraints, references, and expected result. Agent-to-Brain result packets carry task id, parent id, progress, summary, artifacts, risks, and next questions.
- Full transcripts, private reasoning, and unrelated tool output do not cross layers. If prior work is needed, Brain should reference or summarize the relevant part instead of copying an entire thread.

Core packet and message types:

- `ContextRef`
- `BrainTaskContext`
- `AgentTaskContext`
- `HandoffPacket`
- `WorkerResult`
- `AgentMessage`

The current runtime executes support workers from compact handoff prompts, records typed `AgentMessage` envelopes for handoffs and results, runs the primary role with only structured worker results as advisory context, and runs a review worker when Brain policy marks the task as risky. Support/review workers may collect their own read-only evidence, but only their structured result crosses back into Brain context. Richer context summaries, project facts, and thread references remain future extensions of the same packet boundary.

Prompt references follow the same boundary. `@<path>` attaches project files or images to the root user request. `@@<session-id>` attaches a compact session context snapshot built from session JSONL records: user prompts, final summaries, worker summaries, and errors. It must not inline a full transcript or worker-private context; workers receive only the expanded root request plus their own handoff packet. When images are attached, Braincode passes the same image inputs to routeBrain, supporting role agents, the primary role, and review so frontend/design workers can inspect visual context instead of seeing only an attachment marker.

Agent-to-agent communication should use protocol types from `packages/protocol`.

Example shape:

```ts
type AgentMessage = {
  id: string
  parentId?: string
  from: string
  to: string | "orchestrator"
  kind: "handoff" | "result" | "question" | "fact" | "artifact" | "error"
  payload: unknown
  contextRefs?: ContextRef[]
}
```

## Pi integration

Braincode should depend on Pi packages instead of copying or forking Pi code.

Use:

- `@earendil-works/pi-ai` for provider/model streaming abstractions.
- `@earendil-works/pi-agent-core` for agent runtime, tool calling, sessions, and compaction where it fits.

Braincode does not use Pi's TUI as the product interface. The interactive terminal UI is owned by Braincode and implemented with Ink so the UI can expose Braincode concepts instead of generic provider/model controls. Provider/model setup belongs in `braincode config`; the TUI can display routing decisions but must not offer a direct model switch that bypasses Brain Model policy.

Braincode owns:

- brain model schema and routing policy;
- top-level execution modes: `auto` and `radical`;
- multi-agent orchestration;
- context isolation and handoff protocol;
- local configuration server;
- project/user configuration storage;
- project support discovery for `AGENTS.md`, `.mcp.json`, `.agents/skills`, and `.agents/hooks.json`;
- coding workflow product behavior.

The adapter boundary is:

- `packages/llm` converts Braincode model configuration into Pi model objects.
- `packages/agent-runtime` creates Pi-backed agent runtime instances from Braincode mode, selected model policy, and system prompt.
- Higher-level orchestration should depend on Braincode package interfaces, not Pi package internals directly.

## Project support context

Braincode reads project-local support files from the active project root:

- `AGENTS.md` provides durable project instructions and conventions.
- `.mcp.json` declares project MCP servers. The runtime may use trusted project entries to configure MCP tools, but model prompts should only receive safe metadata such as server names and the config path, not raw secrets or full command configuration. User-level MCP config is treated as user-installed/trusted; project entries must set `trusted: true` before Braincode starts their commands.
- `.agents/skills` contains project-local skills. A skill can live at `.agents/skills/<skill-id>/SKILL.md` or as a Markdown file directly under `.agents/skills`.
- `.agents/hooks.json` contains project-local lifecycle hooks.

`packages/config` owns discovery and parsing for these project support files. `packages/agent-runtime` injects discovered `AGENTS.md` and skill content into primary, worker, and review prompts, and records support metadata in the Brain task session log. Worker handoff packets carry support file references, but each worker still receives its own isolated task context.

## Hooks

Braincode supports lifecycle command hooks using Braincode-owned paths, not `.codex` paths:

- User hooks: `~/.braincode/hooks.json`
- Project hooks: `<repo>/.agents/hooks.json`

The schema follows the same three-level shape as the Codex reference: event name, matcher group, and command handlers. Supported event names are `SessionStart`, `SubagentStart`, `SubagentStop`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, and `Stop`.

Early runtime support runs trusted `command` hooks for `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, and `Stop`. Matching hooks from user and project files all run, and matching command hooks run concurrently. Command hooks receive one JSON object on stdin with shared fields such as `session_id`, `cwd`, `hook_event_name`, `model`, `turn_id`, and `permission_mode`, plus event-specific fields. Hook output may add `hookSpecificOutput.additionalContext`; `SessionStart` can block the run, and `UserPromptSubmit` can block the prompt.

Until Braincode has a hook review UI, command handlers must set `trusted: true` to run. Untrusted, disabled, async, and unsupported handler types are skipped and recorded in the session log.

## Local configuration architecture

Users configure Braincode through a local browser UI.

```text
braincode config
  -> Bun.serve on 127.0.0.1:<port>
    -> config web UI
    -> typed local API
      -> ~/.braincode/*.json
```

Default behavior:

- Bind to `127.0.0.1`.
- Use default port `14580` unless overridden.
- Store runtime user configuration under `~/.braincode/`.
- Keep repository files limited to code, schemas, defaults, and documentation.
- Present configuration as tabs with the Models tab first; keep provider/model editing in the Web UI rather than the TUI.
- Show token usage summaries and details through the local usage-statistics API, with charts grouped by model, role, and runtime phase.
- Offer authenticated subscription-backed providers from OAuth status, such as Claude Pro/Max, ChatGPT Plus/Pro Codex, and GitHub Copilot, as model-catalog choices without requiring a second API key.

Security direction:

- Do not bind to public interfaces by default.
- Protect browser requests with a local token or equivalent mechanism before exposing sensitive operations.
- Never expose arbitrary shell execution through configuration routes.
- Store secrets in `~/.braincode/auth.json` or a future secure credential store.
- Ensure restrictive file permissions for secret files.
