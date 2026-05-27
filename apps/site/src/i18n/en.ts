export const en = {
  nav_arch: "Why",
  nav_intent: "Intent",
  nav_output: "Output",
  nav_handoff: "Handoff",
  nav_modes: "Execution",
  nav_install: "Install",
  nav_github: "GitHub",
  nav_docs: "Docs",
  nav_home: "Home",
  release_label: "RELEASE",
  hero_title_1: "Braincode",
  hero_title_2: "A multi-model coding agent orchestrator.",
  hero_lead:
    "Braincode turns one coding request into planner, specialist workers, primary executor, reviewer, and final report.",
  workflow_label: "Braincode workflow",
  workflow_step_1: "Planner",
  workflow_step_2: "Workers",
  workflow_step_3: "Executor",
  workflow_step_4: "Reviewer",
  workflow_step_5: "Final report",
  btn_npm_install: "NPM INSTALL",
  btn_docs: "Read the Docs",
  section_arch_eyebrow: "WHY BRAINCODE",
  section_arch_title:
    "Not another AI CLI. A coding workflow engine.",
  feature_1_title: "Separated roles",
  feature_1_body:
    "Most agents ask one model to plan, code, and review itself. Braincode splits planning, execution, review, and reporting into explicit jobs.",
  feature_2_title: "Cost and risk routing",
  feature_2_body:
    "Simple work can run on cheaper models. Risky edits can escalate to stronger models and independent review.",
  feature_3_title: "Isolated worker context",
  feature_3_body:
    "Workers do not inherit the full conversation or each other's state. They return structured results the primary executor can use.",
  section_intent_eyebrow: "INTENT GRAPH · CTRL+O",
  section_intent_title: "See the brain think.",
  section_intent_lead:
    'Every run produces a live DAG. The brain decomposes your task into specialized sub-agents, orders them by dependency, and routes each one to the right model. Press Ctrl+O in the TUI to pop it open.',
  intent_refresh_hint: "/PLAN REFRESHES · ESC CLOSES",
  intent_pillar_1_title: "Decomposition",
  intent_pillar_1_body:
    "The brain reads the request and proposes sub-tasks with explicit dependencies — not a flat todo list.",
  intent_pillar_2_title: "Live status",
  intent_pillar_2_body:
    "Each node carries a glyph — ● brain, ☑ done, ◐ running, ☐ pending — refreshed every tick.",
  intent_pillar_3_title: "Auditable",
  intent_pillar_3_body:
    'Every edge stores a reason. You can answer "why did this worker run?" without reading a transcript.',
  section_output_eyebrow: "RUNTIME OUTPUT",
  section_output_title: "Every action has a visible label.",
  section_output_lead:
    "Tool calls, web searches, shell execution, and user decisions do not blur into the same transcript line. Braincode marks the action type first, then shows arguments, status, and results.",
  output_frame_title: "RUN TRANSCRIPT",
  output_frame_hint: "TOOL TAGS · CHECKABLE DECISIONS",
  output_decision_copy: "Dangerous command needs an explicit decision.",
  output_decision_approve: "Approve once: run the build command",
  output_decision_block: "Block and return the reason to the model",
  output_pillar_1_title: "Explicit tags",
  output_pillar_1_body:
    "Web search, execute, read, write, and MCP calls carry distinct labels before the payload.",
  output_pillar_2_title: "Separated status",
  output_pillar_2_body:
    "Start, streaming update, completion, failure, duration, and result summary stay scannable.",
  output_pillar_3_title: "Checkable choices",
  output_pillar_3_body:
    "When the agent needs a decision, the TUI presents checkable options instead of free-form guessing.",
  section_handoff_eyebrow: "HANDOFF PACKETS",
  section_handoff_title: "Brain-to-agent context transfer.",
  section_handoff_lead:
    "Workers never inherit the main transcript. Each one wakes up with a structured packet — task id, parent id, role, goal, constraints, expected output. Their private chains of thought stay isolated. They return JSON. The brain reads JSON. The main context stays clean.",
  handoff_pkt_title: "▮ HANDOFF · LIBRARIAN WORKER",
  handoff_pkt_phase: "PHASE = SUPPORT",
  handoff_card_1_title: "Isolated context",
  handoff_card_1_body:
    "Workers cannot read another worker's prompt or the root transcript. One worker hallucinating cannot poison its peers.",
  handoff_card_2_title: "Structured return",
  handoff_card_2_body:
    "Every worker returns JSON — summary, artifacts, risks, nextQuestions. The brain merges these without re-reading verbose chats.",
  handoff_card_3_title: "Resumable",
  handoff_card_3_body:
    "Handoffs persist to disk. Crash mid-run, resume the session, the brain replays the DAG from where the packets left off.",
  section_modes_eyebrow: "TWO EXECUTION MODES",
  section_modes_title: "Decide how aggressive the system runs.",
  auto_title: "Auto Mode",
  auto_tagline: "Conservative and serial. Steady wins.",
  auto_body:
    "Tools run serially. Every risky action (like a file edit) triggers a Review Agent for verification. Best for everyday stability.",
  auto_meta: "-> default active",
  radical_title: "Radical Mode",
  radical_tagline: "Aggressive and parallel. Full throttle.",
  radical_body:
    "Parallel tool calls. Maximum routing freedom, trading some stability for raw speed. For hardcore devs who know the codebase.",
  radical_meta: "-> use with caution",
  section_roles_eyebrow: "14 ROLES · ROLE-FIRST",
  section_roles_title: "Workflow engine, not a one-model CLI.",
  section_roles_lead:
    "There is no generic coding role. Code work is split by domain so each role can be routed to a model that is actually strong at that domain. The LLM-driven routeBrain picks which specialist runs.",
  section_roles_removed:
    "v0.2.0 removed: coding, fastReply, research — folded into domain specialists, rush, and librarian respectively.",
  section_cta_title: "Ready to pick your brain?",
  section_cta_lead: "Available for macOS, Linux, and npm.",
  cta_docs: "Read Documentation",
  footer_docs: "Docs",
  footer_github: "GitHub",
  footer_license: "License",

  /* Docs page */
  docs_page_title: "Documentation",
  docs_page_lead:
    "Everything you need to install, configure, and run Braincode on your own machine. This page is bundled into the same single HTML as the landing site — fully offline-readable.",
  docs_toc_title: "On this page",
  docs_back_home: "← Back to home",

  docs_setup_title: "1. Setup",
  docs_setup_intro:
    "Braincode ships as a Bun-based CLI. Pick one of the three install paths below. The CLI launches an Ink-based terminal UI by default and exposes a local browser config server.",
  docs_setup_npm_title: "Install via npm",
  docs_setup_npm_body:
    "The npm package is the recommended path. It installs the braincode binary into your global bin directory and works on macOS, Linux, and Windows (WSL).",
  docs_setup_brew_title: "Install via Homebrew",
  docs_setup_brew_body:
    "Homebrew installs a prebuilt Bun binary along with the braincode entrypoint, so you do not need to install Bun yourself.",
  docs_setup_source_title: "Build from source",
  docs_setup_source_body:
    "Clone the repository, run bun install, and run braincode directly from the workspace. This is the path used by contributors.",
  docs_setup_first_run_title: "First run",
  docs_setup_first_run_body:
    "Run braincode in an empty directory to launch the TUI, or run braincode config to start the local configuration server (http://127.0.0.1:5181 by default).",

  docs_home_title: "2. The ~/.braincode/ home",
  docs_home_intro:
    "All runtime user configuration lives in ~/.braincode/. The repository never contains your secrets; you can wipe ~/.braincode/ at any time and rerun braincode config to recreate the defaults.",
  docs_home_files_title: "Files and folders",
  docs_home_settings_title: "settings.json",
  docs_home_settings_body:
    "Top-level user preferences: selected Brain Model id, default execution mode (auto or radical), TUI theme, telemetry flag.",
  docs_home_auth_title: "auth.json",
  docs_home_auth_body:
    "Provider API keys and OAuth tokens. Written with restrictive permissions (0600). Never commit, never log, never paste into a prompt. Braincode masks these in the TUI.",
  docs_home_brains_title: "brains.json",
  docs_home_brains_body:
    "Your Brain Models. Each entry is a routing policy: which model takes the planner role, which model takes each specialist role, fallback chain, escalation rules.",
  docs_home_models_title: "models.json",
  docs_home_models_body:
    "Provider/model registry: provider id, model id, context window, cost hints, capability flags. brains.json refers to these by id.",
  docs_home_tools_title: "tools.json",
  docs_home_tools_body:
    "Permission map for built-in tools (read, write, edit, shell, search) and any MCP tools discovered from .mcp.json. Decides which tools require approval.",
  docs_home_hooks_title: "hooks.json",
  docs_home_hooks_body:
    "User-level lifecycle hooks. Command hooks must carry trusted: true before Braincode will run them.",
  docs_home_sessions_title: "sessions/",
  docs_home_sessions_body:
    "JSONL session logs for resume and audit. Each session also contains the handoff packets from every worker run.",
  docs_home_logs_title: "logs/ and cache/",
  docs_home_logs_body:
    "Rotating runtime logs and ephemeral cache (compaction summaries, model probe results). Safe to delete to reclaim disk space.",

  docs_brain_title: "3. Brain Models",
  docs_brain_intro:
    "A Brain Model is a routing policy, not a single LLM. It maps each agent role to a model policy with thinking level, fallback chain, and escalation thresholds. The selected Brain Model dictates how every task is decomposed and routed.",
  docs_brain_example_title: "Example brains.json",
  docs_brain_roles_title: "Built-in roles",
  docs_brain_roles_body:
    "Braincode v0.2.0 ships with 14 role slots. coding, fastReply, and research were removed and absorbed into domain specialists, rush, and librarian.",

  docs_modes_title: "4. Execution Modes",
  docs_modes_intro:
    "Braincode has two top-level execution modes. The mode controls how aggressive the brain is allowed to be when planning, parallelizing, and escalating to stronger models.",
  docs_modes_auto_body:
    "Default mode. Tools run serially. Risky actions (file edits, shell commands) trigger a Review Agent. Best for everyday stability.",
  docs_modes_radical_body:
    "Parallel tool calls, broader planning, stronger models sooner. Safety still goes through the tool permission system, but it trades some stability for raw speed.",
  docs_modes_switch_hint:
    "Switch modes from the TUI with /auto or /radical, or set defaultMode in settings.json.",

  docs_mcp_title: "5. MCP — Model Context Protocol",
  docs_mcp_intro:
    "Braincode loads project MCP server declarations from .mcp.json at the repo root. MCP lets you expose external tools (databases, browsers, internal APIs) as Braincode tools without modifying the core runtime.",
  docs_mcp_file_title: ".mcp.json",
  docs_mcp_file_body:
    "Declare each MCP server with a name, transport (stdio or http), command/args or url, and optional environment variables. Do not put raw secrets here — reference them by env name. Braincode resolves env values from your shell or ~/.braincode/auth.json.",
  docs_mcp_security_title: "Security model",
  docs_mcp_security_body:
    "MCP tools inherit Braincode's permission system. Every MCP call carries a label in the TUI ([MCP] toolName) and risky tools (writes, shell-like calls) prompt for approval unless explicitly allow-listed in tools.json.",

  docs_skills_title: "6. Skills",
  docs_skills_intro:
    "Skills are project-local Markdown documents that teach Braincode a specialized workflow. They live under .agents/skill/<skill-id>/SKILL.md (or top-level .agents/skill/*.md) and are loaded as prompt context when the brain decides they are relevant.",
  docs_skills_file_title: "Skill layout",
  docs_skills_file_body:
    "A skill folder contains SKILL.md (the prompt) plus any reference docs. The first heading is the skill name. The brain may select a skill based on user intent — you do not have to invoke it manually.",
  docs_skills_use_title: "When to write a skill",
  docs_skills_use_body:
    "Write a skill when a workflow is repeated, opinionated, and not obvious from the codebase alone — for example: 'Run the QA suite', 'Deploy to staging', 'Write an ADR'. Keep one skill per intent.",

  docs_agents_title: "7. AGENTS.md",
  docs_agents_intro:
    "AGENTS.md at the repo root is durable project context. Braincode reads it into the primary agent and every worker. Use it for engineering rules, coding conventions, and links to deeper docs — not for transient task notes.",

  docs_hooks_title: "8. Hooks",
  docs_hooks_intro:
    "Hooks are commands or scripts triggered at lifecycle points (pre-tool, post-tool, on-session-end). Project hooks live in .agents/hooks.json; user hooks live in ~/.braincode/hooks.json. Command hooks require trusted: true; Braincode will refuse to run an untrusted command hook even if it is declared.",

  docs_config_ui_title: "9. Browser config UI",
  docs_config_ui_intro:
    "Run braincode config to launch the local configuration server. It binds to 127.0.0.1 by default and serves the config web app. Edits flow through the typed API and persist to ~/.braincode/ — the web app never writes the home directory directly.",

  docs_cli_title: "10. CLI reference",
  docs_cli_intro:
    "The braincode CLI is intentionally thin. Most product behavior lives in the packages; the CLI exists to wire them up and host the Ink TUI.",
  docs_cli_cmd_default: "Launch the interactive TUI in the current directory.",
  docs_cli_cmd_config: "Start the local configuration web server and print the URL.",
  docs_cli_cmd_run: "Execute a single non-interactive prompt and print the result.",
  docs_cli_cmd_dry: "Preview the brain's routing plan without making any provider calls.",
  docs_cli_cmd_daemon: "(Planned) run Braincode as a long-running local service.",

  docs_troubleshoot_title: "11. Troubleshooting",
  docs_troubleshoot_keys_title: "API keys not picked up",
  docs_troubleshoot_keys_body:
    "Check ~/.braincode/auth.json file permissions (should be 0600). Use braincode config to re-enter the key; do not edit the file by hand unless you know the schema.",
  docs_troubleshoot_models_title: "Model not selected",
  docs_troubleshoot_models_body:
    "Confirm the model id in brains.json matches an entry in models.json. Run braincode run --dry-run \"<task>\" to see the routing plan without spending tokens.",
  docs_troubleshoot_reset_title: "Reset everything",
  docs_troubleshoot_reset_body:
    "Stop any running braincode process, remove ~/.braincode/, and rerun braincode config. Your repository state is never touched.",
} as const;
