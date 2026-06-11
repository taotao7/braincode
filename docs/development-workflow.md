# Development Workflow

This document defines Braincode's project-level development workflow. It adapts ideas from GSD Core's phase loop without importing GSD's command surface or `.planning/` layout wholesale.

Braincode already has runtime-level orchestration: routeBrain creates a per-run todo graph, workers run in isolated contexts, session JSONL records what happened, and review/check gates validate side effects. The missing layer is the project-level contract that survives across many runs and explains what phase the project is in, which decisions are locked, which plans are executable, and what evidence is needed before shipping.

## Adopted Ideas

GSD Core is useful here because it treats agent work as a sequence of bounded phases with durable artifacts:

- Heavy reasoning runs in fresh contexts, not in one growing transcript.
- State lives in files that later agents can read, not only in chat memory.
- A phase moves through Discuss, Plan, Execute, Verify, and Ship.
- Every step produces an artifact that becomes the input to the next step.
- Execution plans carry concrete files, dependencies, acceptance criteria, and verification commands.
- Verification checks whether the implementation matched the phase goal and decisions, not just whether an agent finished.

Braincode should adopt those constraints, but keep its own product model:

- Braincode's runtime remains Brain Model routing plus isolated worker handoffs.
- Braincode's durable runtime audit remains `~/.braincode/sessions/*.jsonl`.
- This repository keeps planning truth in `docs/` until a first-class project workflow CLI exists.
- Future project-local workflow artifacts should use Braincode-owned schemas and commands, not copied GSD files.

## Phase Loop

For non-trivial product or architecture work, use this loop:

```text
Discuss -> optional Design -> Plan -> Execute -> Verify -> Ship
```

Use the full loop when a change spans multiple packages, touches safety policy, changes agent context boundaries, or depends on decisions that should survive future sessions. Skip it for small local fixes that fit in one prompt and one verification pass.

### Discuss

Goal: capture the implementation decisions before detailed planning.

Output:

- Phase boundary: what is in scope and explicitly out of scope.
- Locked decisions with short ids, such as `D-01`.
- Canonical references the planner and implementer must read.
- Deferred ideas that should not leak into this phase.

For this repo, decisions belong in the relevant `docs/` file first, with `docs/development-workflow.md`, `docs/architecture.md`, `docs/review-and-audit.md`, and `docs/project-structure.md` as the main anchors.

### Design

Goal: define UX, UI, or interaction behavior before implementation when the phase has a meaningful visual or workflow surface.

Output:

- State model, interaction flow, layout constraints, and acceptance criteria.
- Explicit non-goals, especially for product surfaces where overbuilding is easy.

Skip this step when the work is purely runtime, backend, CLI, or documentation.

### Plan

Goal: turn decisions into an executable, checkable plan.

Output:

- Concrete task list with package ownership.
- Files or modules expected to change.
- Dependencies between tasks.
- Acceptance criteria that can be verified by source assertions, tests, commands, screenshots, or runtime records.
- Review and risk triggers.

The runtime `AgentRoutingPlan` is per prompt. A project phase plan is broader: it can cover several agent runs and should be durable enough that a later session can resume the work without reconstructing the conversation.

### Execute

Goal: run one bounded plan at a time with minimal shared context.

Rules:

- A worker should receive the plan, the relevant decisions, and explicit references, not the full prior transcript.
- Independent work can run in parallel only when planned file ownership and dependencies do not conflict.
- File edits, commands, MCP tools, and generated artifacts still go through Braincode permission, check, and review gates.
- Every meaningful execution should leave a summary artifact or session record that future planning can read.

### Verify

Goal: prove the result matches the plan and decisions.

Verification should check:

- Acceptance criteria coverage.
- Tests or package scripts selected by smart checks.
- Review findings and residual risks.
- Whether implementation drifted outside phase scope.
- Whether planned artifacts, key links, and session records exist.

For code changes, this complements `docs/review-and-audit.md`: review gates find defects, while phase verification checks goal coverage.

### Ship

Goal: close the phase with enough evidence for a reviewer or future session to understand what changed.

Output:

- Final summary of shipped work.
- Verification status.
- Known residual risks.
- Links to changed docs, plans, session ids, checks, and review records.
- Follow-up work that belongs in a later phase.

## Engineering Contract

`packages/context` defines a small project-phase contract:

- `DevelopmentPhaseStep`
- `DevelopmentPhaseArtifact`
- `DevelopmentPhaseContract`
- `validateDevelopmentPhaseGate`

The contract is intentionally pure. It does not read files, call providers, or decide UI behavior. It gives the runtime, CLI, or future config UI one shared vocabulary for phase state and artifact gates.

The gate rules are conservative:

- `discuss` needs a phase id and goal.
- `plan` needs a decision-context artifact.
- `execute` needs an execution-plan artifact.
- `verify` needs an execution-summary artifact.
- `ship` needs a verification artifact.
- Blockers stop any step until resolved.

Future CLI/TUI work can render these gates, persist phase artifacts, or turn them into commands. The first invariant should remain: no agent should execute a broad phase from conversation memory alone when a durable plan artifact is required.

## Relationship to Existing Runtime

The project workflow layer and runtime layer solve different problems:

| Layer | Scope | Durable record | Owner |
|---|---|---|---|
| Project phase workflow | Many runs across a feature or architecture change | Docs now; future project workflow artifacts | `packages/context`, `packages/config`, CLI/TUI |
| Runtime routing plan | One user prompt or continuation | Session JSONL records | `packages/brain`, `packages/agent-runtime` |
| Worker task context | One isolated worker invocation | Handoff/result messages | `packages/context`, `packages/agent-runtime` |
| Review/audit gate | Side-effectful runtime execution | Session JSONL records and final report | `packages/agent-runtime`, `packages/tools` |

Keep those layers separate. Do not make the runtime worker plan responsible for long-term project roadmap state, and do not make project workflow artifacts carry private worker transcripts.

## Current Application to Braincode

Use this workflow for upcoming Braincode work:

- Whole-plan human approval policy: Discuss the approval boundary, Plan the record/UI changes, Execute runtime changes, Verify session JSONL and CLI/TUI rendering.
- Two-reviewer critical-patch resolution: Discuss independence policy, Plan review-decision merge behavior, Execute runtime tests, Verify review-gate downgrade behavior.
- Public review benchmark: Discuss benchmark scope, Plan fixtures and metrics, Execute benchmark runner changes, Verify reproducibility and docs.
- Project workflow CLI: Discuss artifact storage, Plan config/schema/API boundaries, Execute in `packages/config`, `packages/context`, `packages/agent-runtime`, and `apps/cli`, Verify resume behavior.

When a phase updates architecture, package ownership, review gates, context boundaries, or project support files, update the relevant `docs/` source of truth in the same change.
