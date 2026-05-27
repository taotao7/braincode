export const zh = {
  nav_arch: "架构",
  nav_intent: "意图图",
  nav_output: "输出",
  nav_handoff: "Handoff",
  nav_modes: "执行模式",
  nav_install: "安装",
  nav_github: "GitHub",
  release_label: "版本",
  hero_title_1: "一套 harness，",
  hero_title_2: "不是单个 agent。",
  hero_lead:
    "Braincode 是多 LLM 协作框架，不是单模型 agent。你挑「大脑」，它把每个子任务路由到合适的模型和擅长的角色。",
  btn_npm_install: "NPM 安装",
  btn_docs: "查看文档",
  section_arch_eyebrow: "系统架构",
  section_arch_title: "合适的场景，用合适的模型。",
  feature_1_title: "Brain Model 路由",
  feature_1_body:
    "没有一个 LLM 能同时把规划、编码、审查都做到最好。Brain Model 决定每个子任务交给谁，分多少上下文预算。",
  feature_2_title: "多 Agent 隔离执行",
  feature_2_body:
    "一个主 Agent，多个 Worker 并行跑。Worker 之间上下文完全隔离，只通过结构化 packet 通信，主上下文始终干净。",
  feature_3_title: "本地优先配置",
  feature_3_body:
    "所有配置都放在 ~/.braincode/。在浏览器里改，所见即所得；API key 完全本地保存，不会出现在任何提示词里。",
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
    "工具并行调用。路由自由度最高，牺牲一点稳定换极限速度。适合熟悉项目结构的硬核开发者。",
  radical_meta: "-> 谨慎使用",
  section_roles_eyebrow: "14 个角色 · 角色优先",
  section_roles_title: "一套 harness，不是单个 agent。",
  section_roles_lead:
    "没有通用的 coding 角色。代码工作按领域拆分，每个角色都能路由到真正擅长这个领域的模型。由 LLM 驱动的 routeBrain 决定哪个专家上场。",
  section_roles_removed:
    "v0.2.0 移除：coding、fastReply、research —— 分别合并进领域专家、rush、librarian。",
  section_cta_title: "准备好挑一颗大脑了吗？",
  section_cta_lead: "支持 macOS、Linux 和 npm。",
  cta_docs: "阅读文档",
  footer_docs: "文档",
  footer_github: "GitHub",
  footer_license: "许可证",
} as const;
