export const zh = {
  nav_arch: "架构",
  nav_intent: "意图图",
  nav_handoff: "Handoff",
  nav_modes: "执行模式",
  nav_install: "安装",
  nav_github: "GitHub",
  release_label: "版本",
  hero_title_1: "是 harness，",
  hero_title_2: "不是单个 agent。",
  hero_lead:
    "Braincode 是一个多 LLM harness，而不是单模型 agent。用户选「大脑」，harness 把每个子任务路由到最合适的模型和最合适的专业角色。",
  btn_npm_install: "NPM 安装",
  btn_docs: "查看文档",
  section_arch_eyebrow: "系统架构",
  section_arch_title: "智能编排比选哪个模型更重要。",
  feature_1_title: "Brain Model 路由策略",
  feature_1_body:
    "没有任何一个 LLM 在 planning / coding / reviewing 上都是最强。Brain Model 决定每个子任务用什么角色和上下文预算。",
  feature_2_title: "多 Agent 隔离执行",
  feature_2_body:
    "1 个主 Agent + 多个 Worker 并行完成。Worker 之间上下文完全隔离,只通过结构化 packet 通信,不污染主上下文。",
  feature_3_title: "本地优先配置",
  feature_3_body:
    "所有配置保存在 ~/.braincode/。浏览器配置所见即所改,API key 完全本地存储,不进入任何外部提示词。",
  section_intent_eyebrow: "意图图 · CTRL+O",
  section_intent_title: "看见大脑的思考。",
  section_intent_lead:
    "每次运行都会生成一张实时 DAG。大脑把任务拆解为多个专属子 Agent,按依赖顺序排列,并把每个子任务路由到合适的模型。在 TUI 中按 Ctrl+O 即可呼出。",
  intent_refresh_hint: "/PLAN 刷新 · ESC 关闭",
  intent_pillar_1_title: "任务拆解",
  intent_pillar_1_body:
    "大脑读取你的请求,生成带显式依赖关系的子任务,而不是一份扁平的 todo 列表。",
  intent_pillar_2_title: "状态实时",
  intent_pillar_2_body:
    "每个节点带状态符号 —— ● 大脑、☑ 已完成、◐ 进行中、☐ 待处理 —— 每个 tick 刷新。",
  intent_pillar_3_title: "可审计",
  intent_pillar_3_body:
    "每条边都保存了「为什么连接」的原因。无需翻 transcript 就能解释「为什么这个 Worker 跑了」。",
  section_handoff_eyebrow: "HANDOFF PACKETS",
  section_handoff_title: "大脑到 Agent 的上下文转交。",
  section_handoff_lead:
    "Worker 不会继承主对话上下文。每个 Worker 启动时收到一个结构化 packet —— task id、parent id、角色、目标、约束、期望产出。它们的私有思维链彼此隔离,统一返回 JSON,主上下文永远干净。",
  handoff_pkt_title: "▮ HANDOFF · LIBRARIAN WORKER",
  handoff_pkt_phase: "PHASE = SUPPORT",
  handoff_card_1_title: "上下文隔离",
  handoff_card_1_body:
    "Worker 看不见其他 Worker 的 prompt,也看不见根 transcript。一个 Worker 出幻觉,不会污染其他 Worker。",
  handoff_card_2_title: "结构化返回",
  handoff_card_2_body:
    "每个 Worker 返回 JSON —— summary、artifacts、risks、nextQuestions。大脑只读结构化结果,不重读冗长对话。",
  handoff_card_3_title: "可恢复",
  handoff_card_3_body:
    "Handoff 会落盘。中途崩溃,resume session 后,大脑会沿着 packet 把 DAG 回放继续跑。",
  section_modes_eyebrow: "两种执行模式",
  section_modes_title: "决定系统的激进程度。",
  auto_title: "Auto 模式",
  auto_tagline: "保守串行,按部就班",
  auto_body:
    "工具串行调用。每次危险动作(如修改文件)都会触发 Review Agent 进行复核。适合日常稳定性开发。",
  auto_meta: "-> 默认启用",
  radical_title: "Radical 模式",
  radical_tagline: "激进并行,火力全开",
  radical_body:
    "并行工具调用。路由自由度最高,牺牲部分稳定换取极限速度。适合熟悉项目结构的 Hardcore 开发者。",
  radical_meta: "-> 谨慎使用",
  section_roles_eyebrow: "14 个角色 · 以角色为主",
  section_roles_title: "是 harness，不是单个 agent。",
  section_roles_lead:
    "没有通用的 coding 角色。代码工作按领域拆分,每个角色都能路由到真正擅长这个领域的模型。由 LLM 驱动的 routeBrain 决定哪个专家上场。",
  section_roles_removed:
    "v0.2.0 移除：coding、fastReply、research —— 分别合并到领域专家、rush、librarian 中。",
  section_cta_title: "准备好挑一个大脑了吗?",
  section_cta_lead: "支持 macOS、Linux 与 npm。",
  cta_docs: "阅读文档",
  footer_docs: "文档",
  footer_github: "GitHub",
  footer_license: "许可证",
} as const;
