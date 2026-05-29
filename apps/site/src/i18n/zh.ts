export const zh = {
  nav_arch: "为什么",
  nav_intent: "意图图",
  nav_output: "输出",
  nav_handoff: "Handoff",
  nav_modes: "执行模式",
  nav_install: "安装",
  nav_github: "GitHub",
  nav_docs: "文档",
  nav_home: "首页",
  slogan: "勇气是人类的赞歌，敢于挑战困难是乐趣的来源",
  release_label: "版本",
  hero_title_1: "Braincode",
  hero_title_2: "一个多模型 coding agent 编排器。",
  hero_lead:
    "Braincode 把一次编码请求变成规划、专家 Worker、主执行、独立审查和最终报告。",
  workflow_label: "Braincode 工作流",
  workflow_step_1: "规划",
  workflow_step_2: "Worker",
  workflow_step_3: "执行",
  workflow_step_4: "审查",
  workflow_step_5: "报告",
  btn_npm_install: "NPM 安装",
  btn_docs: "查看文档",
  section_arch_eyebrow: "为什么是 Braincode",
  section_arch_title: "不是又一个 AI CLI，而是 coding workflow engine。",
  feature_1_title: "角色分工",
  feature_1_body:
    "大多数 agent 让同一个模型自己规划、自己写、自己审。Braincode 把规划、执行、审查和报告拆成明确职责。",
  feature_2_title: "成本与风险路由",
  feature_2_body:
    "简单任务交给便宜模型，风险高的改动升级到更强模型，并触发独立 Review。",
  feature_3_title: "Worker 上下文隔离",
  feature_3_body:
    "Worker 不继承完整对话，也不共享彼此状态。它们只返回结构化结果，供主执行器使用。",
  section_intent_eyebrow: "意图图 · CTRL+O",
  section_intent_title: "看见大脑的思考。",
  section_intent_lead:
    "每次运行都会生成一张实时 DAG。大脑把任务拆成多个专属子 Agent，按依赖排序，再把每个子任务路由到合适的模型。TUI 里按 Ctrl+O 呼出。",
  intent_refresh_hint: "/PLAN 刷新 · ESC 关闭",
  intent_pillar_1_title: "任务拆解",
  intent_pillar_1_body:
    "大脑读懂你的请求，拆出带显式依赖的子任务，而不是给你一份扁平的 todo。",
  intent_pillar_2_title: "状态实时",
  intent_pillar_2_body:
    "每个节点都有状态符号 —— ● 大脑、☑ 已完成、◐ 进行中、☐ 待处理 —— 每个 tick 自动刷新。",
  intent_pillar_3_title: "可审计",
  intent_pillar_3_body:
    "每条边都记录了「为什么连」。不用翻 transcript，就能解释「这个 Worker 为什么被调起」。",
  section_output_eyebrow: "运行时输出",
  section_output_title: "每个动作都有清晰的标签。",
  section_output_lead:
    "工具调用、Web 搜索、Shell 执行、用户决策不会糊在同一行 transcript 里。Braincode 先标动作类型，再展示参数、状态和结果。",
  output_frame_title: "运行 TRANSCRIPT",
  output_frame_hint: "动作标签 · 可勾选决策",
  output_decision_copy: "危险命令需要一次显式决定。",
  output_decision_approve: "本次允许：执行构建命令",
  output_decision_block: "拦截，并把原因返回给模型",
  output_pillar_1_title: "显式标签",
  output_pillar_1_body:
    "Web 搜索、执行、读、写、MCP 调用各有独立标签，标签在前，载荷在后。",
  output_pillar_2_title: "状态分离",
  output_pillar_2_body:
    "开始、流式更新、完成、失败、耗时、结果摘要分行展示，扫一眼就清楚。",
  output_pillar_3_title: "可勾选决策",
  output_pillar_3_body:
    "Agent 需要拍板时，TUI 给你勾选项，而不是让你自由发挥让模型猜。",
  section_handoff_eyebrow: "HANDOFF PACKETS",
  section_handoff_title: "大脑到 Agent 的上下文转交。",
  section_handoff_lead:
    "Worker 不继承主对话。每个 Worker 启动时收到一个结构化 packet —— task id、parent id、角色、目标、约束、期望产出。它们的私有思维链彼此隔离，统一返回 JSON，主上下文始终干净。",
  handoff_pkt_title: "▮ HANDOFF · LIBRARIAN WORKER",
  handoff_pkt_phase: "PHASE = SUPPORT",
  handoff_card_1_title: "上下文隔离",
  handoff_card_1_body:
    "Worker 看不到其他 Worker 的 prompt，也看不到根 transcript。一个 Worker 出幻觉，不会牵连同伴。",
  handoff_card_2_title: "结构化返回",
  handoff_card_2_body:
    "每个 Worker 返回 JSON —— summary、artifacts、risks、nextQuestions。大脑只读结构化结果，不重读冗长对话。",
  handoff_card_3_title: "可恢复",
  handoff_card_3_body:
    "Handoff 全部落盘。中途崩溃后恢复会话，大脑会沿着 packet 把 DAG 回放，从断点接着跑。",
  section_modes_eyebrow: "两种执行模式",
  section_modes_title: "你来选系统跑得多激进。",
  auto_title: "Auto 模式",
  auto_tagline: "保守串行，稳扎稳打。",
  auto_body:
    "工具串行调用。每次危险动作（如改文件）都会触发 Review Agent 复核。适合日常稳定迭代。",
  auto_meta: "-> 默认启用",
  radical_title: "Radical 模式",
  radical_tagline: "激进并行，火力全开。",
  radical_body:
    "工具并行调用、更广的角色拆分、最多 8 个计划 todo，并在依赖允许时至少 4 路 support agent 并发。",
  radical_meta: "-> 谨慎使用",
  section_roles_eyebrow: "15 个角色 · 角色优先",
  section_roles_title: "Workflow engine，不是单模型 CLI。",
  section_roles_lead:
    "没有通用的 coding 角色。代码工作按领域拆分，每个角色都能路由到真正擅长这个领域的模型。由 LLM 驱动的 routeBrain 决定哪个专家上场。",
  section_roles_removed:
    "v0.2.0 移除：coding、fastReply、research —— 分别合并进领域专家、rush、librarian。",
  roles_carousel_label: "Braincode 角色调用说明轮播图",
  role_prev: "上一个角色",
  role_next: "下一个角色",
  role_call_label: "调用时机",
  role_call_routeBrain:
    "用于意图分类、角色选择、Worker 图规划、todo 归属和依赖边。它只负责编排路由，不直接解决任务。",
  role_call_frontend:
    "用于浏览器端行为：组件、状态、可访问性、响应式布局、文案容纳和视觉验证。",
  role_call_backend:
    "用于 API、服务层、校验、授权触点、持久化边界、错误处理和稳定的服务端行为。",
  role_call_designer:
    "用于 UX 流程、信息架构、交互模式、状态设计、视觉层级和产品文案优先级。",
  role_call_imageMaker:
    "当用户需要新的位图资产、角色图、图片提示词、生成视觉或通过配置好的 Images API 改图时调用。",
  role_call_dba:
    "用于 schema、迁移、索引、查询计划、约束、数据完整性、保留策略、回填和回滚风险。",
  role_call_devops:
    "用于构建、CI、打包、部署、本地环境、密钥接线、可观测性和运维 runbook。",
  role_call_security:
    "用于认证、权限、密钥、注入、依赖暴露、信任边界、滥用路径和安全默认值。",
  role_call_qa:
    "用于验收标准、可复现 bug、边界用例、回归检查、测试策略、fixtures 和覆盖缺口。",
  role_call_review:
    "当计划、diff 或结果已经存在，需要独立找缺陷、审回归风险或检查缺失测试时调用。",
  role_call_summarize:
    "用于把长上下文压缩成可交接状态：目标、决策、产物、验证、注意事项、阻塞和下一步。",
  role_call_oracle:
    "用于困难架构选择、模糊调试、复杂权衡、深度推理和不确定条件下的技术判断。",
  role_call_librarian:
    "用于仓库定位、符号查找、架构追踪、依赖地图、事实核验和精确引用。",
  role_call_rush:
    "用于很小、低风险的杂事和简短直接回复，前提是没有更合适的专家角色。",
  role_call_pet:
    "只用于只读的 TUI 状态报告。它观察实时运行快照并输出短进度文字，不参与路由。",
  section_cta_title: "准备好挑一颗大脑了吗？",
  section_cta_lead: "支持 macOS、Linux 和 npm。",
  cta_docs: "阅读文档",
  footer_docs: "文档",
  footer_github: "GitHub",
  footer_license: "许可证",

  /* 文档页 */
  docs_page_title: "文档",
  docs_page_lead:
    "安装、配置和运行 Braincode 所需的一切。此页面和首页打包在同一个 HTML 里——完全离线可读。",
  docs_toc_title: "本页目录",
  docs_back_home: "← 返回首页",

  docs_setup_title: "1. 安装",
  docs_setup_intro:
    "Braincode 以 Bun CLI 发布。从以下三种安装方式中选一种。CLI 默认启动 Ink 终端 UI，同时暴露一个本地浏览器配置服务器。",
  docs_setup_npm_title: "通过 npm 安装",
  docs_setup_npm_body:
    "推荐使用 npm。安装 braincode 二进制到全局 bin 目录，支持 macOS、Linux 和 Windows (WSL)。",
  docs_setup_brew_title: "通过 Homebrew 安装",
  docs_setup_brew_body:
    "Homebrew 安装预构建的 Bun 二进制及 braincode 入口，无需手动安装 Bun。",
  docs_setup_source_title: "从源码构建",
  docs_setup_source_body:
    "克隆仓库，运行 bun install，然后直接从工作区运行 braincode。这是贡献者使用的方式。",
  docs_setup_first_run_title: "首次运行",
  docs_setup_first_run_body:
    "在空目录运行 braincode 启动 TUI，或运行 braincode config 启动本地配置服务器（默认 http://127.0.0.1:5181）。",

  docs_home_title: "2. ~/.braincode/ 主目录",
  docs_home_intro:
    "所有运行时用户配置存放在 ~/.braincode/。仓库不包含你的密钥；随时可以删除 ~/.braincode/，重新运行 braincode config 即可重建默认值。",
  docs_home_files_title: "文件与目录",
  docs_home_settings_title: "settings.json",
  docs_home_settings_body:
    "顶级用户偏好：选中的 Brain Model id、默认执行模式（auto 或 radical）、TUI 主题、遥测开关。",
  docs_home_auth_title: "auth.json",
  docs_home_auth_body:
    "供应商 API 密钥和 OAuth token。写入时带限制权限（0600）。绝不提交、绝不日志、绝不贴进提示词。TUI 中密钥被遮蔽。",
  docs_home_brains_title: "brains.json",
  docs_home_brains_body:
    "你的 Brain Models。每条是一个路由策略：哪个模型承担规划角色、哪个模型承担每个专家角色、回退链、升级规则。",
  docs_home_models_title: "models.json",
  docs_home_models_body:
    "供应商/模型注册表：供应商 id、模型 id、上下文窗口、成本提示、能力标志。brains.json 通过 id 引用这些。",
  docs_home_tools_title: "tools.json",
  docs_home_tools_body:
    "内置工具（read、write、edit、shell、search）和 .mcp.json 发现的 MCP 工具的权限映射。决定哪些工具需要审批。",
  docs_home_hooks_title: "hooks.json",
  docs_home_hooks_body:
    "用户级生命周期钩子。命令钩子必须带 trusted: true 才会被执行。",
  docs_home_sessions_title: "sessions/",
  docs_home_sessions_body:
    "JSONL 会话日志，用于恢复和审计。每个会话也包含每次 Worker 运行的 Handoff packets。",
  docs_home_logs_title: "logs/ 和 cache/",
  docs_home_logs_body:
    "轮转运行日志和临时缓存（压缩摘要、模型探测结果）。删除可回收磁盘空间。",

  docs_brain_title: "3. Brain Models",
  docs_brain_intro:
    "Brain Model 是路由策略，不是单个 LLM。它把每个 Agent 角色映射到一个模型策略，包括思考级别、回退链和升级阈值。routeBrain 负责选择角色和 worker；每个被选中的角色只通过自己的配置模型链执行。",
  docs_brain_example_title: "brains.json 示例",
  docs_brain_roles_title: "内置角色",
  docs_brain_roles_body:
    "Braincode v0.2.0 内置 15 个角色槽。coding、fastReply、research 已移除，分别合并进领域专家、rush 和 librarian。",

  docs_modes_title: "4. 执行模式",
  docs_modes_intro:
    "Braincode 有两种顶级执行模式。模式控制大脑在规划、并行化和升级到专家角色时的激进程度。",
  docs_modes_auto_body:
    "默认模式。工具串行执行。危险动作（文件编辑、Shell 命令）触发 Review Agent。适合日常稳定迭代。",
  docs_modes_radical_body:
    "并行工具调用、更广的规划、更早使用专家 support、最多 8 个 todo，并在依赖允许时至少 4 路 support agent 同时运行。安全仍经过工具权限系统。",
  docs_modes_switch_hint:
    "在 TUI 中用 /auto 或 /radical 切换，或在 settings.json 中设置 defaultMode。",

  docs_mcp_title: "5. MCP — 模型上下文协议",
  docs_mcp_intro:
    "Braincode 从仓库根目录的 .mcp.json 加载项目 MCP 服务器声明。MCP 让你将外部工具（数据库、浏览器、内部 API）作为 Braincode 工具暴露，无需修改核心运行时。",
  docs_mcp_file_title: ".mcp.json",
  docs_mcp_file_body:
    "声明每个 MCP 服务器：名称、传输方式（stdio 或 http）、命令/参数或 URL，以及可选环境变量。不要在这里放原始密钥——用环境变量名引用。Braincode 从你的 shell 或 ~/.braincode/auth.json 解析环境值。",
  docs_mcp_security_title: "安全模型",
  docs_mcp_security_body:
    "MCP 工具继承 Braincode 的权限系统。每个 MCP 调用在 TUI 中带标签（[MCP] toolName），危险工具（写入、类 Shell 调用）除非在 tools.json 中明确白名单，否则提示审批。",

  docs_skills_title: "6. Skills",
  docs_skills_intro:
    "Skills 是项目本地的 Markdown 文档，教 Braincode 一个专业化工作流。它们放在 .agents/skill/<skill-id>/SKILL.md（或顶级 .agents/skill/*.md），在大脑判断相关时作为提示上下文加载。",
  docs_skills_file_title: "Skill 目录结构",
  docs_skills_file_body:
    "一个 skill 文件夹包含 SKILL.md（提示）加任何参考文档。第一个标题是 skill 名称。大脑可能根据用户意图自动选择 skill——你不需要手动调用。",
  docs_skills_use_title: "何时写一个 Skill",
  docs_skills_use_body:
    "当一个工作流是重复的、有主见的、且从代码库本身不直观时，写一个 skill——例如：「运行 QA 套件」「部署到 staging」「写一个 ADR」。每个意图保持一个 skill。",

  docs_agents_title: "7. AGENTS.md",
  docs_agents_intro:
    "仓库根目录的 AGENTS.md 是持久化项目上下文。Braincode 把它读入主 Agent 和每个 Worker。用它写工程规则、编码约定和深层文档链接——不要写临时任务笔记。",

  docs_hooks_title: "8. Hooks",
  docs_hooks_intro:
    "Hooks 是在生命周期点（pre-tool、post-tool、on-session-end）触发的命令或脚本。项目钩子放在 .agents/hooks.json；用户钩子放在 ~/.braincode/hooks.json。命令钩子需要 trusted: true；Braincode 会拒绝运行未信任的命令钩子，即使它已被声明。",

  docs_config_ui_title: "9. 浏览器配置 UI",
  docs_config_ui_intro:
    "运行 braincode config 启动本地配置服务器。默认绑定 127.0.0.1，提供配置 Web 应用。编辑通过类型化 API 流转并持久化到 ~/.braincode/——Web 应用不会直接写入主目录。",

  docs_cli_title: "10. CLI 参考",
  docs_cli_intro:
    "braincode CLI 故意保持精简。大部分产品行为在 packages 中；CLI 的作用是把它们组装起来并托管 Ink TUI。",
  docs_cli_cmd_default: "在当前目录启动交互式 TUI。",
  docs_cli_cmd_config: "启动本地配置 Web 服务器并打印 URL。",
  docs_cli_cmd_run: "执行单个非交互式提示并打印结果。",
  docs_cli_cmd_dry:
    "预览真实的 routeBrain 计划。它使用当前 Brain Model，可能调用 routeBrain 绑定的 provider；文本输入下如果 routeBrain 不可用，输出会明确标成 heuristic fallback。图片输入必须经过 routeBrain，会直接暴露 router/model 失败。",
  docs_cli_cmd_dry_heuristic:
    "只预览确定性的 heuristic 路由。用于无 provider 的诊断，或检查 fallback 行为。",
  docs_cli_cmd_plan:
    "在 TUI 中预览配置好的 routeBrain 决策。计划会显示路由来源、置信度、原因、主角色、worker、模型、模式和预算。",
  docs_cli_cmd_plan_heuristic:
    "在 TUI 中强制使用确定性 heuristic 路由。这是诊断路径，不是 Braincode 的正常规划流程。",
  docs_cli_cmd_intent:
    "打开最新 intent graph。它展示当前任务拆解、依赖边、todo 状态、路由来源、置信度和路由原因。",
  docs_cli_cmd_daemon: "（计划中）将 Braincode 作为长期本地服务运行。",

  docs_cli_core_title: "核心命令",
  docs_cli_run_flags_title: "Run 权限标志",
  docs_cli_run_flags_intro:
    "使用 braincode run 进行非交互式执行时，必须选择一个权限模式。一次只能使用一个标志。",
  docs_cli_flag_readonly:
    "仅暴露只读本地工具（list_files、read_file、search_files、git_diff、get_changed_files）。不允许编辑或执行命令。",
  docs_cli_flag_allow_edits:
    "暴露读写本地工具并自动批准文件编辑（edit_file、apply_patch），但阻止命令执行、MCP 工具和未知工具。",
  docs_cli_flag_yes:
    "暴露所有本地工具并自动批准每一次工具调用，实现完全非交互式执行。请谨慎使用。",
  docs_cli_benchmark_title: "基准测试",
  docs_cli_benchmark_intro:
    "运行代表性的编码任务规划基准测试，以验证路由行为并衡量规划质量。",
  docs_cli_cmd_benchmark:
    "使用配置的 Brain Model 运行完整基准测试套件。输出每个任务的通过/失败状态，以及路由来源、角色、审查标记和 Worker 列表。",
  docs_cli_cmd_benchmark_list:
    "打印可用的基准测试任务 ID 和标题。配合 --json 输出机器可读的 JSON。",
  docs_cli_cmd_benchmark_flags:
    "--heuristic 跳过 routeBrain，对确定性回退进行基准测试。--task 过滤到特定任务 ID（可重复或用逗号分隔）。--json 输出 JSON。",

  docs_tui_title: "11. TUI 参考",
  docs_tui_intro:
    "基于 Ink 的终端 UI 是 Braincode 的主要交互界面。本节涵盖斜杠命令、键盘快捷键和交互式面板。",
  docs_tui_commands_title: "斜杠命令",
  docs_tui_commands_intro:
    "在输入框中键入 / 打开命令覆盖层。按 Tab 或 Enter 接受建议。也可以直接键入完整命令。",
  docs_tui_cmd_help: "列出所有斜杠命令，包括动态加载的 Skills。",
  docs_tui_cmd_plan:
    "预览配置的 routeBrain 决策。显示路由来源、置信度、原因、主角色、Worker、模型、模式和预算。加 --heuristic 使用确定性回退。",
  docs_tui_cmd_plan_heuristic: "在 TUI 中强制使用确定性启发式路由。诊断路径，不是正常的规划流程。",
  docs_tui_cmd_intent: "打开最新的意图图（快捷键 Ctrl+O）。展示任务拆解、依赖边、todo 状态、路由来源、置信度和路由原因。",
  docs_tui_cmd_mcp: "打开交互式 MCP 控制面板。浏览服务器、检查健康状态、启用/禁用、查看配置。",
  docs_tui_cmd_hooks: "打开交互式 Hooks 控制面板。浏览处理器、启用/禁用、查看命令详情。",
  docs_tui_cmd_sessions: "浏览最近会话。显示状态、提示摘要和最后更新时间。",
  docs_tui_cmd_resume: "按 ID 恢复会话。会从磁盘恢复对话记录和上下文。",
  docs_tui_cmd_new: "开始一个新会话。清空对话记录并生成新的会话 ID。",
  docs_tui_cmd_handoff: "从当前会话 Fork 出一个新会话。传入会话 ID 可总结并交接另一个会话。",
  docs_tui_cmd_brain: "查看 Brain 目录并切换默认 Brain Model。",
  docs_tui_cmd_mode: "查看或切换执行模式。传入 auto 或 radical，或不传参数查看当前模式。",
  docs_tui_cmd_auto_radical: "快速切换执行模式为 auto 或 radical，无需打开模式面板。",
  docs_tui_cmd_theme: "显示系统解析的 TUI 主题（dark 或 light）。主题根据终端外观自动检测。",
  docs_tui_cmd_team_test: "诊断：强制每个角色并行运行该提示。用于验证角色行为和模型可用性。",
  docs_tui_cmd_skill: "列出从 .agents/skill 和 ~/.braincode/skills 加载的项目和用户 Skills。",
  docs_tui_cmd_agents: "显示 AGENTS.md 文件路径、大小以及是否已加载。",
  docs_tui_cmd_files: "刷新用于文件名自动补全的 @file 索引。",
  docs_tui_cmd_clear: "清空对话记录。这不会开始一个新会话。",
  docs_tui_cmd_exit: "退出 TUI。",
  docs_tui_shortcuts_title: "键盘快捷键",
  docs_tui_shortcuts_intro: "以下快捷键在 TUI 中全局生效。面板专属快捷键显示在面板底部。",
  docs_tui_shortcut_intent: "切换意图图覆盖层。",
  docs_tui_shortcut_fold: "切换对话记录的折叠状态（折叠/展开长内容）。",
  docs_tui_shortcut_paste: "粘贴剪贴板内容。图片会保存到会话目录并作为 @path 标记插入。",
  docs_tui_shortcut_history: "在已提交的提示历史记录中导航。",
  docs_tui_shortcut_scroll: "当输入框为空时，向上或向下滚动对话记录。",
  docs_tui_shortcut_page: "按视口页数滚动对话记录。",
  docs_tui_shortcut_home_end: "跳转到对话记录的顶部或底部。",
  docs_tui_shortcut_newline: "在输入框中插入换行而不提交。",
  docs_tui_shortcut_files: "键入 @ 打开文件名覆盖层。按 Tab/Enter 插入选中的文件路径。",
  docs_tui_shortcut_sessions: "键入 @@ 打开会话引用覆盖层。按 Tab/Enter 插入选中的会话 ID。",
  docs_tui_shortcut_commands: "键入 / 打开命令覆盖层。按 Tab/Enter 运行或插入选中的命令。",
  docs_tui_shortcut_accept: "接受当前覆盖层建议（命令、文件或会话）。",
  docs_tui_shortcut_esc: "关闭当前覆盖层或面板。如果运行正在进行，则中断运行。快速按两次可清空输入框。",
  docs_tui_shortcut_exit: "退出 TUI。",
  docs_tui_panels_title: "面板",
  docs_tui_panels_intro: "TUI 显示多个交互式面板用于管理运行时状态。每个面板都有自己的键盘控制，显示在面板底部。",
  docs_tui_panel_decision:
    "当工具调用需要用户审批时出现。选项：本次允许（y）、整个会话允许（s）或拦截（n/Esc）。用 ↑↓ 导航，Enter 确认，Space 勾选。",
  docs_tui_panel_mcp:
    "浏览从 .mcp.json 和 ~/.braincode/ 发现的 MCP 服务器。用 ↑↓ 导航，Enter 重新检查健康状态，Space/e 启用/禁用，v 查看配置。",
  docs_tui_panel_hooks:
    "浏览来自 .agents/hooks.json 和 ~/.braincode/hooks.json 的生命周期钩子。用 ↑↓ 导航，Enter/v 查看详情，Space/e 启用/禁用。",
  docs_tui_panel_sessions:
    "浏览 ~/.braincode/sessions/ 中的最近会话。用 ↑↓ 导航，Enter 恢复，v 查看元数据，Esc 关闭。",
  docs_tui_panel_brain:
    "浏览可用的 Brain Models。用 ↑↓ 导航，Enter/s 设为默认，v 查看角色映射，Esc 关闭。",
  docs_tui_panel_intent:
    "显示实时意图图，包含任务拆解、todo 状态和路由决策。Ctrl+O 切换，/plan 刷新，Esc 关闭。",
  docs_tui_panel_error: "显示运行时错误及人性化提示。按 Enter、Esc 或 q 关闭。",

  docs_troubleshoot_title: "12. 故障排除",
  docs_troubleshoot_keys_title: "API 密钥未被识别",
  docs_troubleshoot_keys_body:
    "检查 ~/.braincode/auth.json 文件权限（应为 0600）。用 braincode config 重新输入密钥；除非你了解 schema，不要手动编辑文件。",
  docs_troubleshoot_models_title: "模型未被选中",
  docs_troubleshoot_models_body:
    "确认 brains.json 中的模型 id 与 models.json 中的条目匹配。运行 braincode run --dry-run \"<task>\" 查看 routeBrain 计划；加 --heuristic 可在不调用 provider 的情况下检查 fallback 路由。",
  docs_troubleshoot_reset_title: "重置一切",
  docs_troubleshoot_reset_body:
    "停止所有 braincode 进程，删除 ~/.braincode/，重新运行 braincode config。你的仓库状态不会被触碰。",
} as const;
