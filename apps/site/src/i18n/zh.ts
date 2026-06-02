export const zh = {
  nav_arch: "架构",
  nav_intent: "意图图",
  nav_output: "运行日志",
  nav_handoff: "任务交接",
  nav_modes: "运行模式",
  nav_install: "安装",
  nav_github: "GitHub",
  nav_docs: "文档",
  nav_home: "首页",
  slogan: "勇气是人类的赞歌，敢于直面困难是乐趣的开始。",
  release_label: "发布",
  hero_title_1: "Braincode",
  hero_title_2: "一个多模型编程 Agent 编排系统。",
  hero_lead:
    "Braincode 将一个编程请求转化为规划者、专家 worker、主要执行者、审查者和最终报告的协作流程。",
  workflow_label: "Braincode 工作流",
  workflow_step_1: "规划",
  workflow_step_2: "专家分配",
  workflow_step_3: "执行",
  workflow_step_4: "审查",
  workflow_step_5: "报告",
  btn_npm_install: "NPM 安装",
  btn_copied: "已复制！",
  btn_copy_failed: "复制失败",
  btn_docs: "阅读文档",
  section_arch_eyebrow: "为什么选择 BRAINCODE",
  section_arch_title:
    "不仅是另一个 AI 命令行，而是一个编程工作流引擎。",
  feature_1_title: "角色分离",
  feature_1_body:
    "大多数 agent 要求一个模型自己完成规划、编码和审查。Braincode 将规划、执行、审查和报告明确拆分为不同的角色任务。",
  feature_2_title: "成本与风险路由",
  feature_2_body:
    "简单的任务可以在较便宜的模型上运行。高风险的修改可以升级到更强的模型并引入独立审查环节。",
  feature_3_title: "隔离的工作上下文",
  feature_3_body:
    "Worker 不会继承完整的对话历史或彼此的状态。它们返回结构化结果供主要执行者使用。",
  section_intent_eyebrow: "意图图 · CTRL+O",
  section_intent_title: "洞察 AI 的思考过程。",
  section_intent_lead:
    "每次运行都会生成一个实时的 DAG。大脑将你的任务分解为专业的子 agent，根据依赖关系排序，并路由到正确的模型。在 TUI 中按 Ctrl+O 即可查看。",
  intent_refresh_hint: "/PLAN 刷新 · ESC 关闭",
  intent_pillar_1_title: "任务分解",
  intent_pillar_1_body:
    "大脑读取请求并提出具有明确依赖关系的子任务 —— 而不仅是一个扁平的待办列表。",
  intent_pillar_2_title: "实时状态",
  intent_pillar_2_body:
    "每个节点带有一个状态符号 —— ● 大脑、☑ 完成、◐ 运行中、☐ 待处理 —— 每次触发都会刷新。",
  intent_pillar_3_title: "可审计",
  intent_pillar_3_body:
    "每条连接边都存储了原因。你可以不读冗长的日志就能回答“为什么运行了这个 worker？”。",
  section_output_eyebrow: "运行时输出",
  section_output_title: "每一个动作都有明确的标签。",
  section_output_lead:
    "工具调用、网页搜索、shell 执行和用户决策不会模糊在同一行文本里。Braincode 先标注动作类型，再展示参数、状态和结果。",
  output_frame_title: "运行日志",
  output_frame_hint: "工具标签 · 可检查决策",
  output_decision_copy: "危险命令需要明确的决策。",
  output_decision_approve: "单次批准：运行构建命令",
  output_decision_block: "拦截并将原因返回给模型",
  output_pillar_1_title: "显式标签",
  output_pillar_1_body:
    "网页搜索、执行、读、写及 MCP 调用在载荷之前带有不同的标签。",
  output_pillar_2_title: "分离状态",
  output_pillar_2_body:
    "开始、流式更新、完成、失败、耗时和结果摘要保持易读的格式。",
  output_pillar_3_title: "结构化选择",
  output_pillar_3_body:
    "当 agent 需要做决策时，TUI 提供复选框选项，而不是要求自由文本输入。",
  section_handoff_eyebrow: "交接数据包",
  section_handoff_title: "大脑到 agent 的上下文传递。",
  section_handoff_lead:
    "Worker 绝不会继承主干日志。它们通过结构化数据包唤醒 —— 任务 ID、父 ID、角色、目标、约束和预期输出。它们的思维链保持私有和隔离。它们返回 JSON，大脑读取 JSON，让主上下文保持整洁。",
  handoff_pkt_title: "▮ 交接 · 资料员 WORKER",
  handoff_pkt_phase: "阶段 = 辅助",
  handoff_card_1_title: "隔离的上下文",
  handoff_card_1_body:
    "Worker 无法读取其他 worker 的提示词或根日志。一个出现幻觉的 worker 不会污染它的同伴。",
  handoff_card_2_title: "结构化返回",
  handoff_card_2_body:
    "每个 worker 都返回 JSON —— 摘要、产物、风险、后续问题。大脑合并这些结果而无需重新阅读冗长的对话。",
  handoff_card_3_title: "可恢复",
  handoff_card_3_body:
    "交接数据持久化到磁盘。如果运行中途崩溃，恢复会话后大脑将从中断的交接点继续重放 DAG。",
  section_modes_eyebrow: "双重执行模式",
  section_modes_title: "决定系统运行的激进程度。",
  auto_title: "Auto 自动模式",
  auto_tagline: "保守串行。稳扎稳打。",
  auto_body:
    "工具串行运行。每一个高风险操作（比如文件编辑）都会触发 Review Agent 进行验证。适合日常开发的稳定性需求。",
  auto_meta: "-> 默认激活",
  radical_title: "Radical 激进模式",
  radical_tagline: "激进并发。全速全开。",
  radical_body:
    "并行调用工具、更广泛的角色分解、多达 8 个计划待办，当依赖条件允许时可同时运行至少 4 个辅助 agent。",
  radical_meta: "-> 谨慎使用",
  section_roles_eyebrow: "15 种角色 · 角色优先",
  section_roles_title: "工作流引擎，而不是单模型 CLI。",
  section_roles_lead:
    "这里没有通用的“编程”角色。代码任务按领域划分，因此每个角色都能路由到真正擅长该领域的模型。AI 驱动的 routeBrain 负责决定由哪个专家运行。",
  section_roles_removed:
    "v0.2.0 已移除：coding, fastReply, research —— 它们已合并到领域专家、rush 和 librarian 中。",
  roles_carousel_label: "Braincode 角色调用指南走马灯",
  role_prev: "上一个角色",
  role_next: "下一个角色",
  role_call_label: "适用场景",
  role_call_routeBrain:
    "用于意图分类、角色选择、worker 图规划、任务分配以及依赖关系。它负责路由工作，而不是直接解决任务。",
  role_call_frontend:
    "用于面向浏览器的行为：组件、状态、无障碍设计、响应式布局、文案排版和视觉验证。",
  role_call_backend:
    "用于 API、服务、验证、授权节点、持久化边界、错误处理和持久的服务器行为。",
  role_call_designer:
    "用于 UX 流程、信息架构、交互模式、状态设计、视觉层级和产品文案优先级。",
  role_call_imageMaker:
    "当用户需要新的栅格资源、角色头像、图像提示词、生成的视觉内容或通过配置的图像 API 编辑图像时使用。",
  role_call_dba:
    "用于 Schema、迁移、索引、查询计划、约束、数据完整性、数据保留、回填和回滚风险分析。",
  role_call_devops:
    "用于构建、CI、打包、部署、本地环境、密钥注入、可观测性和运维手册。",
  role_call_security:
    "用于身份验证、权限、密钥、注入防范、依赖项暴露、信任边界、滥用场景及安全默认设置。",
  role_call_qa:
    "用于验收标准、可复现的 Bug、边缘用例、回归检查、测试策略、测试固件及覆盖率缺漏分析。",
  role_call_review:
    "当已存在规划、diff 或结果，且需要独立的缺陷发现、回归风险评估或缺失测试分析时使用。",
  role_call_summarize:
    "用于将长上下文压缩为适合任务交接的状态，包含目标、决策、产物、验证、说明和阻塞项。",
  role_call_oracle:
    "用于高难度的架构选择、模糊的调试、复杂的权衡、深度推理及在不确定性下的决策。",
  role_call_librarian:
    "用于代码库导向、符号查找、架构追踪、依赖映射、已核实的事实以及精确的参考文献提取。",
  role_call_rush:
    "当没有其他更合适的专家角色时，用于处理低风险的小杂活和简短的直接回复。",
  role_call_pet:
    "仅用作只读的 TUI 状态汇报器。它观察实时运行快照并输出简短的进度行；它从不进行任务路由。",
  section_trust_eyebrow: "可被验证",
  section_trust_title: "可信，是因为可以自己核实。",
  section_trust_lead:
    "Braincode 不要求你相信一张截图。每次发布都在 CI 里跑同样的检查，路由与审查行为也由可复现的基准测试覆盖，你可以在本地自己跑一遍。",
  trust_1_title: "CI 门禁",
  trust_1_body:
    "每次 push 和 pull request 都会运行严格类型检查、完整测试套件、覆盖率和基准测试。README 里的徽章直接链到运行历史。",
  trust_2_title: "可复现基准",
  trust_2_body:
    "确定性 fixtures 离线重放路由决策与一个 mock 执行环，无需任何 provider key。CI 会把每次运行的 JSON 报告归档为构建产物。",
  trust_3_title: "严格且开源",
  trust_3_body:
    "整个工作区在严格 TypeScript 下编译，源码以 MIT 许可开放。路由、审查门禁与报告代码都可以自己读。",
  section_cta_title: "准备好体验了吗？",
  section_cta_lead: "提供 macOS、Linux 和 npm 版本。",
  cta_docs: "阅读文档",
  footer_docs: "文档",
  footer_github: "GitHub",
  footer_license: "许可证",

  /* Docs page */
  docs_page_title: "文档",
  docs_page_lead:
    "在本地机器上安装、配置和运行 Braincode 所需的一切。本页与主站打包在同一个 HTML 中，完全支持离线阅读。",
  docs_toc_title: "本页目录",
  docs_back_home: "← 返回首页",

  docs_setup_title: "1. 安装设置",
  docs_setup_intro:
    "Braincode 以基于 Bun 的 CLI 形式发布。选择以下三种安装路径之一。CLI 默认启动基于 Ink 的终端 UI（TUI），并暴露本地浏览器配置服务器。",
  docs_setup_npm_title: "通过 npm 安装",
  docs_setup_npm_body:
    "推荐使用 npm 包。它将 braincode 二进制文件安装到全局 bin 目录，支持 macOS、Linux 和 Windows (WSL)。",
  docs_setup_brew_title: "通过 Homebrew 安装",
  docs_setup_brew_body:
    "Homebrew 会安装预编译的 Bun 二进制文件以及 braincode 入口，你无需自行安装 Bun。",
  docs_setup_source_title: "从源码构建",
  docs_setup_source_body:
    "克隆代码库，运行 bun install，然后直接在工作区中运行 braincode。这是贡献者使用的路径。",
  docs_setup_first_run_title: "首次运行",
  docs_setup_first_run_body:
    "在一个空目录中运行 braincode 启动 TUI，或者运行 braincode config 启动本地配置服务器（默认为 http://127.0.0.1:5181）。",

  docs_home_title: "2. ~/.braincode/ 目录",
  docs_home_intro:
    "所有运行时用户配置均保存在 ~/.braincode/ 中。代码库永远不包含你的密钥；你随时可以删除 ~/.braincode/ 并重新运行 braincode config 生成默认配置。",
  docs_home_files_title: "文件和目录",
  docs_home_settings_title: "settings.json",
  docs_home_settings_body:
    "顶级用户偏好：选定的大脑模型 ID、默认执行模式（auto 自动或 radical 激进）、系统解析的 UI 外观、遥测开关。",
  docs_home_auth_title: "auth.json",
  docs_home_auth_body:
    "服务商 API 密钥和 OAuth 令牌。使用严格权限 (0600) 写入。绝不能提交到 git、绝不能输出到日志、绝不要粘贴到提示词中。Braincode 会在 TUI 中掩码这些信息。",
  docs_home_brains_title: "brains.json",
  docs_home_brains_body:
    "你的“大脑模型”（Brain Models）。每个条目是一个路由策略：规划角色使用哪个模型、专家角色使用哪个模型、回退链及升级规则。",
  docs_home_models_title: "models.json",
  docs_home_models_body:
    "服务商/模型注册表：服务商 ID、模型 ID、上下文窗口、成本提示及能力标志。brains.json 通过 ID 引用它们。",
  docs_home_tools_title: "tools.json",
  docs_home_tools_body:
    "内置工具（读、写、编辑、shell、搜索）及从 .mcp.json 发现的任何 MCP 工具的权限映射。决定哪些工具需要审批。",
  docs_home_hooks_title: "hooks.json",
  docs_home_hooks_body:
    "用户级生命周期钩子。对于命令钩子，必须带有 trusted: true 标志，Braincode 才会执行。",
  docs_home_sessions_title: "sessions/",
  docs_home_sessions_body:
    "用于会话恢复和审计的 JSONL 日志。每个会话还包含来自所有 worker 运行的交接数据包。",
  docs_home_logs_title: "logs/ 和 cache/",
  docs_home_logs_body:
    "轮转运行时日志和临时缓存（压缩摘要、模型探测结果）。可以安全删除以回收磁盘空间。",

  docs_brain_title: "3. 大脑模型（Brain Models）",
  docs_brain_intro:
    "大脑模型是一种路由策略，而非单一的大语言模型。它将每个 agent 角色映射到包含思考级别、回退链及升级阈值的模型策略。routeBrain 选择角色和 worker；每个选定的角色通过自己配置的模型链执行。",
  docs_brain_example_title: "brains.json 示例",
  docs_brain_roles_title: "内置角色",
  docs_brain_roles_body:
    "Braincode v0.2.0 内置了 15 个角色槽。coding、fastReply 和 research 已被移除，并吸收到领域专家、rush 和 librarian 中。",

  docs_modes_title: "4. 执行模式",
  docs_modes_intro:
    "Braincode 拥有两个顶层执行模式。该模式控制大脑在规划、并行化和升级至专家角色时的激进程度。",
  docs_modes_auto_body:
    "默认模式。工具串行运行。高风险操作（如文件编辑、shell 命令）会触发 Review Agent 验证。最适合日常的稳定性需求。",
  docs_modes_radical_body:
    "并行工具调用、更广泛的规划、更早引入专家支持、最多 8 个待办，以及在依赖允许的情况下至少同时运行 4 个辅助 agent。安全性依然由工具权限系统保障。",
  docs_modes_switch_hint:
    "在 TUI 中使用 /auto 或 /radical 切换模式，或在 settings.json 中设置 defaultMode。",

  docs_mcp_title: "5. MCP — Model Context Protocol",
  docs_mcp_intro:
    "Braincode 会从代码库根目录的 .mcp.json 加载项目 MCP 服务器声明。MCP 允许你将外部工具（数据库、浏览器、内部 API）暴露为 Braincode 工具，无需修改核心运行时代码。",
  docs_mcp_file_title: ".mcp.json",
  docs_mcp_file_body:
    "使用名称、传输协议 (stdio 或 http)、命令/参数或 URL，及可选的环境变量来声明每个 MCP 服务器。请勿在此放入明文密钥 —— 请通过环境变量名引用。Braincode 会从你的 Shell 或 ~/.braincode/auth.json 中解析变量值。",
  docs_mcp_security_title: "安全模型",
  docs_mcp_security_body:
    "MCP 工具继承 Braincode 的权限系统。每次 MCP 调用在 TUI 中带有标签（[MCP] toolName），高风险工具（如写入、类 shell 调用）除非在 tools.json 中明确加入白名单，否则会提示审批。",

  docs_skills_title: "6. 技能 (Skills)",
  docs_skills_intro:
    "技能是项目本地的 Markdown 文档，用于教导 Braincode 特定的工作流。它们存放在 .agents/skills/<skill-id>/SKILL.md（或顶层 .agents/skills/*.md）中，当大脑认为需要时，会被作为提示词上下文加载。",
  docs_skills_file_title: "技能布局",
  docs_skills_file_body:
    "技能目录包含 SKILL.md (提示词) 及任何参考文档。第一个标题就是技能名称。大脑可能基于用户意图自动选择一项技能 —— 你无需手动调用。",
  docs_skills_use_title: "何时编写技能",
  docs_skills_use_body:
    "当某项工作流重复出现、具有特定的观点，且无法仅从代码库中直观推断出来时，即可编写技能。例如：'运行 QA 测试套件'、'部署到预发环境'、'编写 ADR'。确保每个意图对应一个技能。",

  docs_agents_title: "7. AGENTS.md",
  docs_agents_intro:
    "~/.braincode/AGENTS.md 可作为用户全局指令，代码库根目录的 AGENTS.md 作为项目上下文。Braincode 会把两者读取给主要 agent 和所有 worker；处理项目任务时，项目指令优先。",

  docs_hooks_title: "8. 钩子 (Hooks)",
  docs_hooks_intro:
    "钩子是在生命周期节点（工具执行前、工具执行后、会话结束时）触发的命令或脚本。项目钩子保存在 .agents/hooks.json；用户钩子保存在 ~/.braincode/hooks.json。命令钩子必须包含 trusted: true；如果声明了未信任的命令钩子，Braincode 将拒绝执行。",

  docs_config_ui_title: "9. 浏览器配置 UI",
  docs_config_ui_intro:
    "运行 braincode config 启动本地配置服务器。它默认绑定到 127.0.0.1，并提供 Web 形式的配置管理。所有修改均通过类型安全的 API 持久化到 ~/.braincode/ 中 —— Web 应用绝不会直接修改家目录文件。",

  docs_cli_title: "10. CLI 命令参考",
  docs_cli_intro:
    "braincode CLI 尽量保持轻量级。大部分产品行为封装在各模块包中，CLI 主要用于将其串联并启动 Ink TUI。",
  docs_cli_cmd_default: "在当前目录启动交互式 TUI。",
  docs_cli_cmd_config: "启动本地配置 Web 服务器并打印 URL。",
  docs_cli_cmd_run: "执行单个非交互式任务并打印结果。",
  docs_cli_cmd_dry:
    "预览某个任务真实的 routeBrain 规划。它使用已配置的大脑模型，可能会调用 routeBrain 服务商；如果仅有文本输入且 routeBrain 不可用，则输出将标注为启发式回退 (heuristic fallback)。如果包含图像输入，则必须使用 routeBrain 并在失败时直接报告路由/模型错误。",
  docs_cli_cmd_dry_heuristic:
    "仅预览确定性的启发式路由。用于无模型服务商环境下的诊断，或检查回退行为。",
  docs_cli_cmd_plan:
    "在 TUI 中预览配置的 routeBrain 为某个任务做出的规划决策。计划包含路由来源、置信度、原因、主要角色、分配的 worker、模型、模式及预算。",
  docs_cli_cmd_plan_heuristic:
    "在 TUI 中强制使用确定性的启发式路由。这是一个诊断路径，而非正常的工作流。",
  docs_cli_cmd_intent:
    "打开最新的一份意图图。展示当前的任务分解、依赖关系、待办状态、路由来源、置信度及路由原因。",
  docs_cli_cmd_daemon: "(计划中) 将 Braincode 作为后台本地服务运行。",

  docs_cli_core_title: "核心命令",
  docs_cli_run_flags_title: "运行权限选项 (Flags)",
  docs_cli_run_flags_intro:
    "在非交互式使用 braincode run 时，必须选择一种权限模式。同一时间只能使用一个权限选项。",
  docs_cli_flag_readonly:
    "仅暴露只读的本地工具 (list_files, read_file, search_files, git_diff, get_changed_files)。不允许执行命令或修改文件。",
  docs_cli_flag_allow_edits:
    "暴露读写本地工具并自动批准文件编辑 (edit_file, apply_patch)，但拦截命令执行、MCP 工具以及未知工具。",
  docs_cli_flag_yes:
    "为完全非交互式执行暴露所有本地工具，并自动批准所有工具调用。请谨慎使用。",
  docs_cli_benchmark_title: "基准测试 (Benchmark)",
  docs_cli_benchmark_intro:
    "运行代表性编码任务的规划基准测试，用于验证路由行为并衡量计划质量。",
  docs_cli_cmd_benchmark:
    "使用配置的大脑模型运行完整的基准测试套件。按任务输出通过/失败状态、路由来源、角色、审查标志及 worker 列表。",
  docs_cli_cmd_benchmark_list:
    "打印所有可用的基准任务 ID 和标题。使用 --json 可输出机器可读格式。",
  docs_cli_cmd_benchmark_flags:
    "--heuristic 跳过 routeBrain 并测试确定性回退路由。--task 可通过指定任务 ID 进行过滤（可重复或用逗号分隔）。--json 打印 JSON。",

  docs_tui_title: "11. TUI 快捷键参考",
  docs_tui_intro:
    "基于 Ink 的终端 UI (TUI) 是主要的 Braincode 交互界面。本节介绍斜杠命令、键盘快捷键以及各种交互面板。",
  docs_tui_commands_title: "斜杠命令 (Slash commands)",
  docs_tui_commands_intro:
    "在输入框中输入 / 打开命令面板。按 Tab 或 Enter 接受建议项。也可以直接手动输入完整命令。",
  docs_tui_cmd_help: "列出所有斜杠命令，包括动态加载的技能。",
  docs_tui_cmd_plan:
    "预览配置的 routeBrain 为某个任务做出的规划决策。展示路由来源、置信度、原因、主要角色、分配的 worker、模型、模式及预算。追加 --heuristic 预览确定性回退路由。",
  docs_tui_cmd_plan_heuristic:
    "在 TUI 中强制使用确定性的启发式路由。诊断路径，而非正常的工作流。",
  docs_tui_cmd_intent:
    "打开最新的一份意图图 (同 Ctrl+O)。展示任务分解、依赖关系、待办状态、路由来源、置信度及路由原因。",
  docs_tui_cmd_mcp: "打开 MCP 交互控制面板。浏览可用服务器，检查健康状态，启用/停用以及查看配置。",
  docs_tui_cmd_hooks: "打开钩子交互控制面板。浏览钩子回调，启用/停用以及查看命令详情。",
  docs_tui_cmd_sessions: "浏览最近会话记录。展示状态、提示词摘要及最后更新时间。",
  docs_tui_cmd_resume: "根据 ID 恢复会话。将从磁盘恢复日志与上下文。",
  docs_tui_cmd_new: "启动新会话。清除日志并生成全新会话 ID。",
  docs_tui_cmd_handoff:
    "从当前会话派生一个新会话。若传入会话 ID，则通过总结该会话内容交接给新任务。",
  docs_tui_cmd_brain: "查看大脑目录并切换默认的 Brain 模型。",
  docs_tui_cmd_mode: "查看或切换执行模式。传入 auto 或 radical，省略参数则显示当前模式。",
  docs_tui_cmd_auto_radical: "快速切换到 auto 或 radical 模式，无需打开模式面板。",
  docs_tui_cmd_theme: "显示系统解析的 TUI 主题 (dark 或 light)。主题根据终端外观自动检测。",
  docs_tui_cmd_team_test:
    "诊断命令：强制每个角色并行处理该提示词。用于验证各角色行为及模型可用性。",
  docs_tui_cmd_skill: "列出从 .agents/skills 及 ~/.braincode/skills 加载的项目技能与用户技能。",
  docs_tui_cmd_agents: "显示用户全局和项目本地 AGENTS.md 的路径、大小及其是否已被加载。",
  docs_tui_cmd_files: "刷新用于文件路径自动补全的 @file 索引。",
  docs_tui_cmd_clear: "清空日志输出。这不会开启一个新会话。",
  docs_tui_cmd_exit: "退出 TUI。",
  docs_tui_shortcuts_title: "键盘快捷键",
  docs_tui_shortcuts_intro:
    "这些快捷键在整个 TUI 全局可用。各交互面板专属的快捷键会显示在面板底部。",
  docs_tui_shortcut_intent: "切换显示意图图 (Intent Graph)。",
  docs_tui_shortcut_fold: "切换长文本折叠状态 (展开/收起)。",
  docs_tui_shortcut_paste: "粘贴剪贴板内容。如果剪贴板中含有图片，将保存至会话文件夹并插入 @path 占位符。",
  docs_tui_shortcut_history: "在历史输入记录中上下导航。",
  docs_tui_shortcut_scroll: "输入框为空时，滚动主日志区。",
  docs_tui_shortcut_page: "向上/向下滚动整屏主日志区。",
  docs_tui_shortcut_home_end: "快速跳转到日志区的顶部或底部。",
  docs_tui_shortcut_newline: "在输入框内换行 (不提交任务)。",
  docs_tui_shortcut_files: "输入 @ 唤出文件名联想面板。按 Tab/Enter 插入选中的路径。",
  docs_tui_shortcut_sessions: "输入 @@ 唤出会话引用面板。按 Tab/Enter 插入选中的会话 ID。",
  docs_tui_shortcut_commands: "输入 / 唤出命令建议面板。按 Tab/Enter 执行或插入选中的命令。",
  docs_tui_shortcut_accept: "接受当前提示项 (命令、文件或会话)。",
  docs_tui_shortcut_esc:
    "关闭当前的悬浮面板或选择框。如果后台任务正在运行，则中断当前任务；连续快速按两次清空输入框。",
  docs_tui_shortcut_exit: "退出 TUI。",
  docs_tui_panels_title: "交互面板",
  docs_tui_panels_intro:
    "TUI 中包含多个交互式面板，用于管理运行时状态。面板底部会显示其专属的快捷键指南。",
  docs_tui_panel_decision:
    "当工具调用需要用户审批时出现。选项：单次批准(y)，全局批准(s)，或拦截(n/Esc)。使用 ↑↓ 导航并按 Enter 或 空格键 确认。",
  docs_tui_panel_mcp:
    "浏览从 .mcp.json 及 ~/.braincode/ 发现的 MCP 服务器。使用 ↑↓ 导航，按 Enter 重新检查健康状态，按 空格键/e 启用/停用，按 v 查看配置细节。",
  docs_tui_panel_hooks:
    "浏览来自 .agents/hooks.json 及 ~/.braincode/hooks.json 的生命周期钩子。使用 ↑↓ 导航，按 Enter/v 查看详情，按 空格键/e 启用/停用。",
  docs_tui_panel_sessions:
    "浏览位于 ~/.braincode/sessions/ 的近期会话。使用 ↑↓ 导航，按 Enter 恢复会话，按 v 查看元数据，按 Esc 关闭面板。",
  docs_tui_panel_brain:
    "浏览可用的大脑模型。使用 ↑↓ 导航，按 Enter/s 设为默认值，按 v 查看其角色映射，按 Esc 关闭面板。",
  docs_tui_panel_intent:
    "显示实时的意图图，包括任务分解、待办状态以及路由决策。Ctrl+O 切换可见性，/plan 刷新，Esc 关闭。",
  docs_tui_panel_error:
    "显示包含通俗解释与提示的运行时错误。按 Enter, Esc, 或 q 关闭。",

  docs_troubleshoot_title: "12. 常见问题排查",
  docs_troubleshoot_keys_title: "API 密钥未生效",
  docs_troubleshoot_keys_body:
    "检查 ~/.braincode/auth.json 文件权限 (应为 0600)。请通过 braincode config 重新输入密钥；除非熟悉 Schema，否则不要手动编辑该文件。",
  docs_troubleshoot_models_title: "模型未能选中",
  docs_troubleshoot_models_body:
    "请确认 brains.json 中的模型 ID 匹配 models.json 中的某个条目。运行 braincode run --dry-run \"<task>\" 检查 routeBrain 规划，或添加 --heuristic 检查无网络下的回退路由行为。",
  docs_troubleshoot_reset_title: "完全重置",
  docs_troubleshoot_reset_body:
    "停止运行中的 braincode 进程，删除 ~/.braincode/ 目录，然后重新运行 braincode config。你的代码库状态不会受任何影响。",
} as const;
