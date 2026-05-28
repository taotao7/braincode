# Braincode 总览

**语言版本**：[English](./overview.md) · [中文](./overview.zh.md) · [Français](./overview.fr.md)

这是 Braincode 代码库的高层地图。先看这一篇；几个深入主题各自有专门的文档：

- [Architecture](./architecture.md) — 设计意图、模式、Pi 集成、配置布局。
- [上下文管理](./context-management.zh.md) — Brain 与 worker 上下文如何隔离、有哪些东西可以越过边界。
- [Agent 通信](./agent-communication.zh.md) — handoff/result 协议、worker 生命周期、运行时事件。
- [Project structure and plan](./project-structure.md) — 工作区布局、各包职责、实现状态。
- [Visual style](./visual-style.md) — UI / 品牌方向。

## Braincode 是什么

Braincode 是一个 **基于 Bun 的 monorepo，目标是构建一个以编码为核心的 AI agent**，它会把任务的不同部分路由到最合适的模型。用户选的是一个 **Brain Model（一种路由策略）**，而不是某一个 LLM。一次运行由一个或多个相互隔离的 worker agent 构成，它们的结构化结果由一个主 agent 合并。

```
用户 -> Ink TUI / CLI / 浏览器配置界面
     -> Bun.serve（配置 + 控制）
     -> Brain Model：选角色、选模型、选 worker
     -> 隔离的 worker agent（输入 handoff packet，输出 worker result）
     -> 主 agent 合并结果
     -> 可选的 review worker
     -> 最终回复
```

## 运行时分层

仓库把关注点切成四层。绝大多数贡献只会改动其中一层。

| 层 | 包 | 职责 |
|----|----|------|
| 接口层 | `apps/cli`（Ink TUI + CLI）、`apps/config-web` | 用户入口。只展示 Braincode 的产品概念，不直接接 provider。 |
| 产品层 | `packages/brain`、`packages/server`、`packages/config` | Brain Model 选择、路由策略、本地配置服务、项目支持文件发现。 |
| Agent 层 | `packages/agent-runtime`、`packages/context`、`packages/tools`、`packages/protocol` | Worker 编排、上下文隔离、handoff/result packet、工具注册。 |
| Provider 层 | `packages/llm`、`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core` | 统一 provider 模型、agent 主循环、工具调用、会话。 |

跨层规则：

- 接口层不能直接调用 Pi，要走 `agent-runtime`。
- 只有 `agent-runtime` 构造 Pi 的 `Agent` 实例。
- `brain` 和 `context` 是纯逻辑：它们描述策略与形状，不直接调 provider。
- `protocol` 是共享的「形状词汇表」，依赖必须保持轻量。

## 包速览

```
apps/
  cli/             Bun CLI + Ink TUI（BrainPet、/plan、/team……）
  config-web/      由 packages/server 托管的多 tab 浏览器配置 UI

packages/
  shared/          极少量工具函数（debugLog、基础类型）。不要往这里堆代码。
  protocol/        线协议形状：ApiResult、ContextRef、AgentMessage。
  config/          ~/.braincode/* schema、原子写、会话 JSONL、
                   项目支持文件发现（AGENTS.md、.mcp.json、.agents/*）。
  server/          127.0.0.1 上的 Bun.serve；给配置 UI 的类型化 API。
  llm/             BraincodeModel -> Pi Model 映射、API key 解析。
  brain/           BrainModel、角色目录 + 提示词、planAgentRouting。
  context/         BrainTaskContext、AgentTaskContext、HandoffPacket、WorkerResult。
  agent-runtime/   编排器：构建 RuntimePlan、跑 worker、hook、MCP、会话。
  tools/           编码工具定义 + 权限。
```

值得收藏的关键入口：

- 路由：`packages/brain/src/index.ts` —— `planAgentRouting`、`agentRoleProfiles`、`agentRoleSystemPrompts`。
- Plan 构建：`packages/agent-runtime/src/index.ts` —— `buildRuntimePlan`、`routePromptWithBrain`。
- Worker 执行：`packages/agent-runtime/src/index.ts` —— `runWorkerFromPlan`、`runSupportWorkers`。
- 上下文形状：`packages/context/src/index.ts` —— 所有跨越 Brain/agent 边界的类型。
- Prompt 引用：`packages/agent-runtime/src/index.ts` —— `expandPromptReferences` 处理 `@path` 与 `@@session`。
- 会话：`packages/config/src/index.ts` —— `appendSessionRecord`、`readSessionContext`。

## 一次完整请求的流程

非交互式 `braincode run "<prompt>"` 在代码中的轨迹：

1. `apps/cli` 解析 argv，调用 `agent-runtime` 的 `executePromptFromConfig`。
2. 跑 `SessionStart` 与 `UserPromptSubmit` hook。两者都可以阻断，也都可以追加上下文。
3. `expandPromptReferences` 解析 `@<file>`（最大内联 64 KB）和 `@@<session-id>`（最大 24 KB 的会话快照）。
4. `buildRuntimePlan` 先用 `planAgentRouting` 做确定性兜底，再让配置好的 router brain 来细化。结果是一个 `RuntimePlan`：主角色、worker 列表、模型选择、模式、工具执行方式。
5. 支持 worker 并发跑（受 `brain.routing.maxParallelAgents` 限制）。每个 worker 只拿到原始用户请求 + 自己的 `HandoffPacket`。每个 worker 前后会触发 `SubagentStart` / `SubagentStop` hook。
6. `buildPrimaryPrompt` 把原始请求和各 worker 的结构化摘要拼成主 agent 的 prompt。如果项目在 `.mcp.json` 里声明了 MCP server，主 agent 还能拿到对应的 MCP 工具。
7. 如果 `requiresReview = true` 且主 agent 本身不是 review 角色，会拉起一个 review worker，给它主 agent 摘要和各 worker 结果。
8. 跑 `Stop` hook。最终摘要（含 review 备注）返回给调用方，并把 `run_end` 追加到 `~/.braincode/sessions/<id>.jsonl`。

交互式 TUI 走同一条路径。TUI 还订阅了来自 `pi-agent-core` 的 `AgentEvent` 和来自 `agent-runtime` 的 `WorkerLifecycleEvent`，用来驱动 BrainPet 状态面板、实时 elapsed/token 状态行，以及可折叠的 transcript 行。

## 执行模式

模式是 Braincode 层的概念；它影响编排，不直接影响模型。

- **`auto`** —— 默认。Agent 内部工具串行执行。路由偏聚焦；router 使用配置里的 worker / 并发上限，最多规划 6 个 todo。
- **`radical`** —— 自治更强。Agent 内部工具并行执行。routeBrain 会被要求更主动拆分、更早使用专家 support，最多规划 8 个 todo，并在依赖允许时至少使用 4 个 routed worker / 4 路 support 并发。在 TUI 中，即使用户级工具开关被关闭，默认本地工具也会暴露；工具调用会自动同意，不再弹 Ask User。

权威实现：`packages/brain` 里的 `getModePolicy`。

## Brain Model

一个 **Brain Model** = 每个角色一份 `ModelPolicy` + 路由 / 上下文默认值。角色目录集中定义在 `packages/brain` 的 `agentRoleProfiles` + `agentRoleSystemPrompts` —— router 的提示词、默认值、运行时系统提示永远不会漂移。routeBrain 会看到完整角色目录，但目录只描述角色身份、能力边界和输出契约；具体模型由用户在配置里绑定。

可被路由到的角色（worker 可以是这些），v0.2.0：
`frontend · backend · designer · dba · devops · security · qa · review · summarize · oracle · librarian · rush`

v0.2.0 移除：`coding`（被 frontend/backend 吸收）、`fastReply`（被 `rush` 吸收）、`research`（被 `librarian` 吸收）。目录变短是有意的 —— 保留下来的每个角色都对应一种真正不同的模型路由决定。

非路由角色：

- `routeBrain` —— 只在编排层用；负责选角色，不负责解题。
- `pet` —— TUI 的 BrainPet 状态报告器，只读。

新增角色时，请 **同时** 修改 `routedAgentRoles`、`agentRoleProfiles`、`agentRoleSystemPrompts`、`BrainModel.roles` —— 它们故意用同一个 union 作为键。

## 配置

所有用户相关的东西都在 `~/.braincode/`：

```
~/.braincode/
  settings.json      执行模式、默认 brain id、feature flag
  auth.json          provider key（不会进模型 prompt）
  brains.json        Brain Model 列表
  models.json        BraincodeModel 目录（provider、baseUrl、id）
  tools.json         工具开关
  hooks.json         用户级生命周期 hook
  sessions/          每个 session 一份 JSONL，记录编排事件
  logs/、cache/      运行时副产物
```

`braincode config` 在 localhost 上提供多 tab Web UI。模型管理放在第一个 tab；数据统计有独立 tab，用 Recharts 展示按模型、角色、运行阶段聚合的 token 用量，并支持点击查看明细。通过 OAuth 认证过的订阅 provider，比如 Claude Pro/Max、ChatGPT Plus/Pro Codex、GitHub Copilot，会出现在模型目录里，添加模型时不需要重复填 API key。

项目级的支持文件就放在代码旁边：

```
<repo>/
  AGENTS.md                 注入到 prompt 的长期项目指令
  .mcp.json                 项目级 MCP server 声明（prompt 中只露元数据）
  .agents/hooks.json        项目级生命周期 hook
  .agents/skill/<id>/SKILL.md   项目本地 skill
```

`packages/config` 负责发现与解析。`agent-runtime` 决定哪些变成 prompt 文本、哪些变成 `ContextRef`。

## Hooks 与 MCP

- Hook 是按事件名挂载的命令处理器。当前支持的运行时事件：`SessionStart`、`UserPromptSubmit`、`SubagentStart`、`SubagentStop`、`Stop`。在还没有 hook 审核界面之前，handler 必须显式声明 `trusted: true` 才会执行。详见 `agent-runtime` 里的 `runConfiguredHooks`。
- MCP server 由 `McpToolHub` 在每次运行时连接。hub 会返回开箱即用的 Pi `AgentTool`；失败或被跳过的 server 通过 `onMcpReport` 回报。

## 测试与开发循环

```sh
bun install
bun run check        # 整个 workspace 的类型检查
bun test             # 单元测试（config、brain、llm、context、agent-runtime）
bun run braincode -- run --dry-run "<prompt>"     # routeBrain 规划预览
bun run braincode -- run --dry-run --heuristic "<prompt>" # 无 provider 诊断
bun run braincode -- run "<prompt>"               # 真正运行
bun run braincode                                  # Ink TUI
bun run config                                     # 浏览器配置 UI
```

测试就放在源码旁边：`packages/<name>/src/index.test.ts`。新逻辑就近放在归属的包里，**不要** 让 `packages/shared` 膨胀。

## 接下来去哪里

- 改路由或角色？先看 [agent-communication.zh.md](./agent-communication.zh.md)，再看 `packages/brain`。
- 动了任何会跨 agent 的东西？改 prompt 之前先看 [context-management.zh.md](./context-management.zh.md)。
- 调整基础设施或包结构？参考 [project-structure.md](./project-structure.md) 里的预期布局与非目标。
