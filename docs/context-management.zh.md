# 上下文管理

**语言版本**：[English](./context-management.md) · [中文](./context-management.zh.md) · [Français](./context-management.fr.md)

本文是 Braincode 上下文模型的贡献者指南。如果你要改 prompt、加 worker 角色、改动 Brain 与 subagent 之间流动的内容、或者动 prompt 引用 —— 先读这一篇。

简短版：**Brain 拥有编排上下文。每个 worker 只拥有一个隔离的任务上下文。只有结构化的 packet 可以跨越边界，永远不传完整的对话历史。** 后面所有内容都是在解释这条不变式如何被强制执行，以及代码里在哪。

## 为什么必须隔离

今天的 chat 风格对话历史会无限增长。当多个 agent 协作同一任务时，把完整对话复制给每个 agent 会浪费 token、泄露私有推理、把失败模式纠缠在一起。Braincode 反过来：把编排器和每个 worker 看成各自的上下文所有者，中间用类型化的 packet 协议通信。这带来：

- Worker 可以用便宜模型，不会被无关上下文污染。
- 编排器可以运行、恢复、重放一个 session，因为每个 task 都有稳定的 id。
- 加一个角色不会让其他每个角色的共享 prompt 变大。
- Brain Model 内显式配置的模型兜底是安全的，因为 worker 的输入是自包含的。

## 两层、两种任务上下文

定义在 `packages/context/src/index.ts`：

```ts
export type ContextLayer = "brain" | "agent"

export type BrainTaskContext = {
  id: string
  layer: "brain"
  goal: string
  progress: TaskProgress
  childContextIds: string[]
  contextRefs: ContextRef[]
}

export type AgentTaskContext = {
  id: string
  parentId: string            // 指向 Brain task id
  layer: "agent"
  agentRole: string
  goal: string
  progress: TaskProgress
  contextRefs: ContextRef[]
}
```

- **Brain task** 就是这次 run。它持有用户目标、子任务 id 列表，以及 Brain 想保留的引用（精选的 file/thread/summary/artifact）。一次 run 只有一个，存放在 `RuntimePlan.context`，并写入 `context_plan` session 记录。
- **Agent task** 属于一次 worker 调用。它有自己的 id，`parentId` 指回 Brain task，记录角色、worker 自己的目标、自己的进度。Worker 看不到其他 worker 的 `AgentTaskContext`。

稳定 id 不是装饰 —— 这是 session JSONL 把事件穿起来的方式，也是未来 resume / replay 功能能复原「谁跑了什么」的前提。

## 方向标签

任何跨层 packet 都带 `fromLayer` / `toLayer`。这两个常量的存在是为了让方向永远显式可见：

```ts
export const brainToAgentContextTransfer: BrainToAgentContextTransfer = {
  fromLayer: "brain", toLayer: "agent",
}
export const agentToBrainContextTransfer: AgentToBrainContextTransfer = {
  fromLayer: "agent", toLayer: "brain",
}
```

`HandoffPacket` 扩展 `BrainToAgentContextTransfer`，`WorkerResult` 扩展 `AgentToBrainContextTransfer`。如果你发现自己想做一个 agent-to-agent 的 packet —— 你正在绕过编排器，这正是这条不变式要拦下的设计。

## 各种 packet

```ts
export type HandoffPacket = BrainToAgentContextTransfer & {
  id: string                    // packet id
  task: AgentTaskContext        // worker 的任务信封
  constraints: string[]         // 烧进 prompt 的硬规则
  expectedResult: string        // 描述 worker 回复的形状
}

export type WorkerResult = AgentToBrainContextTransfer & {
  handoffId: string
  taskId: string
  parentId: string
  progress: TaskProgress
  summary: string               // 简短、面向用户
  artifacts: ContextRef[]       // file/thread/summary/artifact 引用
  risks: string[]
  nextQuestions: string[]
}
```

`ContextRef` 由 `packages/protocol` 共享：

```ts
export type ContextRef = {
  kind: "file" | "thread" | "summary" | "artifact"
  uri: string
  label?: string
}
```

注意 `WorkerResult` **没有** 这些东西：没有原始对话历史、没有推理链、没有工具调用日志。这些都属于 worker 自己的隔离 session，留在那里。如果编排器需要更多信息，它在下一次 handoff 里要。

## 一次运行里实际流动的内容

编排器是 `packages/agent-runtime/src/index.ts` 里的 `executePromptFromConfig`。和上下文有关的步骤：

1. **Prompt 展开** —— `expandPromptReferences` 把 `@<path>` 和 `@@<session-id>` 标记重写为内联段落，追加到 prompt 末尾。原 token 保留，方便模型引用。上限：单个文件 64 KB，单次会话快照 24 KB。
2. **项目支持文件组装** —— `readProjectSupport` 收集 `AGENTS.md`、`.mcp.json` 元数据、`.agents/skills/*` 内容。`formatProjectSupportPromptSection` 用于 prompt 文本；`projectSupportContextRefs` 把它打包成 `ContextRef[]` 进 handoff packet。
3. **运行时 context 计划** —— `packages/agent-runtime/src/router.ts` 里的 `buildRuntimePlan` 创建一个 `BrainTaskContext`；真实执行时它的 id 就是 session id，同时给每个 `RuntimeWorkerPlan` 分配稳定的子 `contextId`。
4. **Handoff 构造** —— `packages/agent-runtime/src/workers.ts` 里的 `createWorkerHandoff` 给每个 worker 生成一个 `HandoffPacket`，使用 worker 计划里的 `contextId` 作为 `task.id`，`parentId` 设为 Brain session id，`constraints` 填进隔离规则（见下），`expectedResult` 描述 worker 该返回的 JSON 形状。
5. **Worker 运行** —— `packages/agent-runtime/src/workers.ts` 里的 `runWorkerFromPlan` 为 worker 新建一个 Pi `Agent`。prompt 由 `buildSupportWorkerPrompt` 组装：项目支持段 + 原始用户请求 + todo 依赖需要时由 Brain 提供的上游 worker 摘要 + handoff packet（JSON）+ 期望回复形状。Worker 没法访问编排器的 `Agent` 状态。
6. **结果归一化** —— `packages/agent-runtime/src/workers.ts` 里的 `normalizeWorkerResultText` 把 worker 的回复解析成 `WorkerResult`。如果回复是纯文本而不是 JSON，会包成一个 `completed` 状态、`summary` = 文本的 `WorkerResult`。这是故意做的容错：provider 漂移不应该弄垮编排。
7. **通信记录** —— Brain 会把 handoff 和 result/error 信封记录成 `agent_message` 事件，后续 replay 或远程 worker 可以共用同一条消息流。
8. **主 prompt** —— `buildPrimaryPrompt` 给主 agent 的内容是：用户请求 + 格式化后的 worker 摘要列表（role、status、goal、progress、summary、risks、open questions）。**不** 给主 agent 任何 worker 的对话历史。
9. **Todo 更新** —— runtime 会在 primary / worker / review 的 owner 启动和结束时，把 todo 标为 running、completed、blocked 或 failed。
10. **可选的 review** —— 如果 plan 要求 review，且主 agent 自身不是 review，`buildReviewPrompt` 会拉一个 review worker，给它主 agent 摘要、worker 结果、新的 handoff packet。

每个 support handoff 中烧进去的约束清单（来自 `createWorkerHandoff`）：

- 只以指定角色运行。
- 把 packet 视为 Brain-to-agent 传递：Brain 拥有编排上下文，本 worker 只拥有自己隔离的任务上下文。
- 只能使用 handoff、原始用户请求、以及 prompt 里显式提供的其他 worker 结果。
- 原样回显 `taskId` / `parentId`；Brain 的值是权威。
- 不要假定能访问完整的根 transcript 或其他 worker 的私有推理链。
- 给主 Braincode agent 返回简洁的结构化发现。

这些约束是「即便模型想多嘴」也能守住隔离不变式的方法。

## Prompt 引用：`@` 和 `@@`

编排器在 run 顶部支持两种引用标记：

- `@<path>` —— 在根 prompt 上附加一个文件或图片。小于 64 KB 的文本文件会内联进 fenced block；支持的图片会作为 image input 发送，并强制 runtime 模型选择只使用有视觉能力的候选。文件缺失或超大不会报错，而是变成带原因的 `missing` 引用，让模型知道附件曾被打算附上但没送到。
- `@@<session-id>` —— 附加先前某个 session 的 **紧凑** 快照。由 `packages/config` 的 `readSessionContext` 从 session JSONL 构建：初始 prompt、最终摘要、worker 摘要、错误。整体硬上限 24 KB，每字段还会做单独裁剪。**绝对不会** 内联完整 transcript 或 worker 私有上下文。

Worker 不会单独拿到这些引用的副本。它们只看到展开后的根请求 + 自己的 handoff packet —— 同一条隔离规则。

如果你要新增一种引用类型，请遵守同样的压缩纪律：快照而不是 transcript，指针而不是 payload。

## Session JSONL

`packages/config` 给每个 session 写一份 JSONL：`~/.braincode/sessions/<id>.jsonl`。所有编排事件都通过 `appendSessionRecord` 追加。今天会出现的记录类型：

| 类型 | 来源 | 内容 |
|------|------|------|
| `run_start` | `executePromptFromConfig` | prompt、plan、项目支持摘要、尝试次数 |
| `run_end` | 同上 | 最终摘要 + worker 结果 |
| `run_error` | 同上 | 错误信息、是否重试 |
| `context_plan` | 同上 | Brain task context id、子 agent context id、context refs |
| `todo_plan` | 同上 | routing 产出的可勾选任务和依赖边 |
| `todo_update` | 同上 / `runWorkerFromPlan` | primary 或 worker 拥有的 todo id 状态变化 |
| `agent_message` | `runWorkerFromPlan` | Brain-agent 通信用的 typed handoff/result/error 信封 |
| `worker_start` | `runWorkerFromPlan` | 阶段、角色、目标、handoff、模型、尝试次数 |
| `worker_end` | 同上 | 已执行的 `WorkerResult` |
| `worker_error` | 同上 | 错误、是否兜底 |
| `token_usage` | routeBrain / worker / primary runtime 调用 | 按模型、角色、阶段、task id、agent session id 标注的 provider token 用量；供 `braincode config` 的统计图表和明细使用 |
| `mcp_connect` | MCP hub | connected / failed / skipped server、工具数 |
| `hook_*` | `runAndRecordHooks` | hook 记录、追加上下文、阻断原因 |

Session JSONL 是内存中 run 的持久化、可查询形式。`@@` 读的就是它。Brain 之后想回忆什么，都得最终落在这里 —— 而不是 worker 的对话历史。

## 压缩策略

`agent-runtime` 里两个常量控制内联预算，调整时请一起改：

- `MAX_INLINE_FILE_BYTES = 64 * 1024` —— 单个 `@<path>` 文本内联上限。
- `MAX_INLINE_SESSION_CHARS = 24 * 1024` —— 单个 `@@<session-id>` 快照上限。
- `MAX_SESSION_FIELD_CHARS = 6 * 1024` —— 快照内单个字段上限。

Brain Model 还暴露了一份软策略（`brain.context.maxInputTokens`、`compaction`、`isolation`）。目前是建议性的 —— 运行时硬上限是上面这些内联预算。如果你要实现自动压缩或更强的 `shared-facts` 模式，请走 `packages/context`，并保留 `WorkerResult` 作为编排器合并的唯一 payload。

## 给贡献者的经验法则

- **加字段到 packet，而不是塞字符串进 prompt。** Brain 想记住的东西应该成为 `WorkerResult` 上的字段或 `ContextRef`，而不是塞进 summary 的自由文本。
- **绝不放宽 worker 看到的东西。** 如果 worker 需要更多 —— 改 handoff packet，**不要** 把 Brain 的 transcript 灌进去。
- **回显，不要发明。** Worker prompt 指示模型回显 `taskId` / `parentId`，归一化器以 handoff 的值为准，不以模型回复为准。请保持这种设计。
- **方向标签很重要。** 引入新 packet 时，扩展 `BrainToAgentContextTransfer` / `AgentToBrainContextTransfer` 二者之一。如果两个都选不出来，说明设计有问题。
- **JSONL 是持久记录。** 新增的编排事件应该通过 `appendSessionRecord` 落盘，resume / replay / `@@` 才能继续工作。
- **压缩上限是公开契约。** 改内联上限请同时更新常量和本文；后来者不应该靠读代码猜预算。

## 去哪看

- Packet 类型：`packages/context/src/index.ts`
- 线协议词汇：`packages/protocol/src/index.ts`
- Handoff / result 接线：`packages/agent-runtime/src/workers.ts` 里的 `createWorkerHandoff`、`runWorkerFromPlan`、`normalizeWorkerResultText`
- Prompt 组装：`buildSupportWorkerPrompt`、`buildPrimaryPrompt`、`buildReviewPrompt`、`formatWorkerResults`、`formatProjectSupportPromptSection`
- Prompt 引用：`expandPromptReferences`、`formatSessionContext`
- Session 读写：`packages/config/src/index.ts` 里的 `appendSessionRecord`、`readSessionContext`
