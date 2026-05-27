export const en = {
  nav_arch: "Architecture",
  nav_intent: "Intent",
  nav_output: "Output",
  nav_handoff: "Handoff",
  nav_modes: "Execution",
  nav_install: "Install",
  nav_github: "GitHub",
  release_label: "RELEASE",
  hero_title_1: "A harness,",
  hero_title_2: "not an agent.",
  hero_lead:
    "Braincode is a multi-LLM harness, not a single-model agent. You pick the Brain — it routes each sub-task to the model and the specialist role best suited for the job.",
  btn_npm_install: "NPM INSTALL",
  btn_docs: "Read the Docs",
  section_arch_eyebrow: "SYSTEM ARCHITECTURE",
  section_arch_title:
    "Smart orchestration matters more than picking a model.",
  feature_1_title: "Brain Model Routing",
  feature_1_body:
    "No single LLM is best at planning, coding, and reviewing. The Brain Model decides which role and context budget each sub-task gets.",
  feature_2_title: "Isolated Multi-Agent Execution",
  feature_2_body:
    "One main agent plus multiple workers running in parallel. Workers keep fully isolated context and communicate only through structured packets, keeping the main context clean.",
  feature_3_title: "Local-First Config",
  feature_3_body:
    "All configuration lives in ~/.braincode/. Edit it in the browser, what you see is what changes. API keys stay on your machine and never leak into a prompt.",
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
  section_roles_title: "A harness, not an agent.",
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
} as const;
