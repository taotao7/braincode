# Agent 通信

**语言版本**：[English](./agent-communication.md) · [中文](./agent-communication.zh.md) · [Français](./agent-communication.fr.md)

本文说明 Braincode 的编排器（Brain）如何与 worker agent 通信、worker 又如何回话。如果你要接一个新角色、改 worker 的调用方式、加运行时事件、或者设计需要观察 run 的 UI —— 从这里开始。

配套文档是 [context-management.zh.md](./context-management.zh.md)，那篇讲什么 **信息** 跨越这些边界。本文讲它们跨越边界用的 **协议**。

## 拓扑

Braincode 故意不是 peer-to-peer 的 agent 网格。所有通信都经过 Brain：

```
                       +-----------------+
                       |    Brain        |
                       |   （编排器）    |
                       +--------+--------+
                                |
              HandoffPacket   <-+->  WorkerResult
                                |
        +-----------+-----------+-----------+-----------+
        |           |           |           |           |
   support#1   support#2   support#3      ...        review
   （隔离的    （隔离的    （隔离的                 （隔离的，
    agent）     agent）     agent）                  在主 agent
                                                     之后跑）
```

- Worker 之间不通话。
- Worker 看不到 Brain 的对话历史。
- 只有 Brain 合并结构化结果。
- 「主 agent」是 plan 选出来产出最终用户回复的那个 routed worker；review（如果需要）是另一个 worker，看主 agent 的摘要。

这条规则不是靠基础设施强制，而是靠 **每个 prompt 里到底有什么** —— 每个 worker 只拿到自包含的 handoff + 原始用户请求，仅此而已。

## 线协议词汇

共享形状分布在两个包里。

`packages/protocol/src/index.ts` —— 跨进程 / 跨包的词汇：

```ts
export type ContextRef = {
  kind: "file" | "thread" | "summary" | "artifact"
  uri: string
  label?: string
}

export type AgentMessage = {
  id: string
  parentId?: string
  from: string
  to: string | "orchestrator"
  kind: "handoff" | "result" | "question" | "fact" | "artifact" | "error"
  payload: unknown
  contextRefs?: ContextRef[]
}
```

`AgentMessage` 是任何需要被寻址 / 路由的通信的 **外层信封**。当前的进程内编排器仍然把 `HandoffPacket` / `WorkerResult` 直接传给本地函数，同时也会把 Brain -> agent 的 handoff 和 agent -> Brain 的结果记录成 `agent_message` JSONL 事件。任何最终要跨进程的东西（未来的远程 worker、跨机部署、外部客户端）都应该沿用同一个信封。

`packages/context/src/index.ts` —— 今天实际使用的具体 payload：

```ts
HandoffPacket = BrainToAgentContextTransfer & {
  id: string
  task: AgentTaskContext
  constraints: string[]
  expectedResult: string
}

WorkerResult = AgentToBrainContextTransfer & {
  handoffId: string
  taskId: string
  parentId: string
  progress: TaskProgress
  summary: string
  artifacts: ContextRef[]
  risks: string[]
  nextQuestions: string[]
}
```

两者对应关系：

| `AgentMessage.kind` | 今天的 payload | 备注 |
|---------------------|----------------|------|
| `handoff` | `HandoffPacket` | Brain → worker，启动一次 worker run。 |
| `result` | `WorkerResult` | worker → Brain，返回结构化输出。 |
| `error` | `WorkerResult` 且 `progress.status = "failed"` | 失败也以 result 形式回传，不抛异常，合并器才能渲染。 |
| `question`、`fact`、`artifact` | 保留 | 还没用。未来引入时也走同一信封，遵守方向。 |

## 一个 worker 的生命周期

`packages/agent-runtime/src/workers.ts` 里的 `runWorkerFromPlan` 是 worker 的标准驱动。它实现的形状：

```
plan 出一个 worker  -->  createWorkerHandoff(worker, parentId, phase)
                            |
                            v
append agent_message(handoff)
                            |
                            v
SubagentStart hook       （可能追加上下文，可能阻断）
                            |
                            v
selectRuntimeModelCandidatesWithApiKey(policy)   <-- 来自 model-selection.ts 的有序候选列表
                            |
                            v
逐个尝试候选（直到某个成功）:
    新建 Pi Agent（新会话，全新 prompt 历史）
    prompt = buildSupportWorkerPrompt | buildReviewPrompt
    runtime.agent.prompt(prompt)
    text = 最后一条 assistant 消息
    result = normalizeWorkerResultText(text, handoff)
                            |
                            v
SubagentStop hook（成功时）
                            |
                            v
appendSessionRecord("worker_end", ...)
append agent_message(result)
emit WorkerLifecycleEvent("worker_end", "completed")
return ExecutedWorkerResult
```

失败路径：每个候选失败都会写 `worker_error`，循环试下一个候选。所有候选都失败时，`failedWorkerResult` 产出一个 `progress.status = "failed"`、`risks: [errorMessage]` 的 `ExecutedWorkerResult` —— 像其他结果一样呈现给用户。

`ExecutedWorkerResult` = `WorkerResult` + 三个仅在合并侧使用的运行时字段（`role`、`goal`、`status`、可选 `error`）。这些字段永远 **不会** 进入 worker；只在编排侧存在。

## 一次 run 是怎么组成的

`executePromptFromConfig` 是端到端编排器。高层形状：

```
1. 跑 SessionStart + UserPromptSubmit hook（任一可阻断，两者皆可加上下文）。
2. expandPromptReferences：解析 @<file>、@@<session> -> 拼到 prompt 末尾。
3. buildRuntimePlan：先启发式路由，再用 router brain 细化。
   - --team 强制角色时，覆盖 plan.workers。
4. runSupportWorkers（独立 worker 并发，受 mode 调整后的 routing limit 限制）：
   - 每个 worker 独立。worker 之间互不可见。
   - 如果 todo 依赖要求一个 support 结果先出来，Brain 会先跑上游 worker，并只把归一化后的摘要交给依赖它的 worker。
5. 通过 McpToolHub 连 MCP server -> 把工具注入主 agent。
6. 逐个尝试主角色的模型候选：
     buildPrimaryPrompt(原始用户请求, workerResults, primaryRole, projectSupport)
     runtime.agent.prompt(...)
     primarySummary = 最后一条 assistant 文本
7. 若 plan.requiresReview && primary !== "review"：
     runWorkerFromPlan(reviewWorker, buildReviewPrompt(...), phase="review")
     mergeReviewResult 把 review 摘要 + risks 拼到 primarySummary 后。
8. 跑 Stop hook。append run_end。返回 { sessionId, summary, plan, workerResults, mcp }。
```

改这块代码前请先内化这些点：

- **support worker 和主 agent 不是同一类调用。** support worker 返回归一化的 `WorkerResult`。主 agent 返回展示给用户的自由文本。把两者搞混会同时打破两端的契约。
- **review 在主 agent 之后跑，不是并行。** review 需要主 agent 的输出才能干活。
- **强制角色路径（`/team`）会跳过 review**，把 `requiresReview` 强制设为 `false`。这是故意的 —— team 模式是为了拿到多个独立答案，不是一条工作流。

## 路由：启发式 + router brain

两层路由协作产出一个 `AgentRoutingPlan`：

- `packages/brain` 里的 `planAgentRouting(prompt, brain)` —— 确定性的安全兜底。用于 heuristic 诊断、provider 失败、以及作为 router brain 细化时的基线。
- `packages/agent-runtime/src/router.ts` 里的 `routePromptWithBrain(prompt, brain, models, mode, fallback, home)` —— 用一个严格 JSON 风格的 prompt 调 brain 的 `planner` / `roles.routeBrain` 模型，解析结果。`normalizeRouterDecision` 会用启发式兜底和 `brain.routing.maxParallelAgents` 校验和裁剪选择。

两条路径最终归一为同一种形状：

```ts
type AgentRoutingPlan = {
  primaryRole: RoutedAgentRole
  workers: AgentWorkerPlan[]    // { role, goal, reason }
  requiresReview: boolean
  reason: string
}
```

`buildRuntimePlan` 然后用 `createRuntimeWorkerPlan` 把每个 `AgentWorkerPlan` 展开成 `RuntimeWorkerPlan`，给每个 worker 分配稳定的 agent context id，解析该角色配置的执行策略，并生成运行时 todo 列表和依赖图。它还会应用 mode routing limit：auto 使用配置里的 worker / 并发上限和 6 个 todo；radical 会把有效 worker 和 support 并发预算至少提高到 4，并允许 8 个 todo。最终的 `RuntimePlan` 才是后续编排消费的东西。

加新角色时：

1. 把它加入 `routedAgentRoles` 和 `BrainModel.roles`。
2. 在 `agentRoleProfiles` 加 profile，在 `agentRoleSystemPrompts` 加系统提示。
3. 确保 router-brain prompt 使用 `routedAgentRoles` 生成允许角色枚举。

router prompt 会嵌入来自 `agentRoleProfiles` 的完整角色目录，以及当前选中 Brain Model 的 routed role policy 能力摘要。角色目录只描述角色身份、能力、边界和输出契约；每个被选中的角色仍然只通过它自己的 `modelId -> fallbackModelIds` 链执行。`models.json` 是能力注册表，用来校验这些 id，不是全局模型池，也不能用来把某个角色偷换成 planner 或另一个角色的模型。

## 发给 worker 的 prompt

三个构造器塑造每一份 worker prompt：

- `buildSupportWorkerPrompt(originalPrompt, handoff, projectSupport)` —— 用于并发的 support worker。内容：项目支持段、原始用户请求、完整 `HandoffPacket`（JSON）、期望回复的 JSON 形状（`taskId` / `parentId` 已预填以强制回显）。
- `buildPrimaryPrompt(originalPrompt, workerResults, primaryRole, projectSupport)` —— 用于主 agent。内容：项目支持段、原始用户请求、格式化后的 worker 摘要，以及一条指令：「把 worker 结果当作建议性上下文，显式解决冲突」。
- `buildReviewPrompt(originalPrompt, primarySummary, workerResults, handoff, projectSupport)` —— 用于 review worker。内容：项目支持段、只读工具指引、原始用户请求、主 agent 摘要、worker 摘要、patch/check/diff artifacts、review handoff packet，以及包含 `decision`、`confidence`、分级 `findings`、`requiredChanges`、`blockingIssues` 和 `residualRisks` 的 JSON 回复形状。runtime review gate 会继续强制 failed checks 降级、truncated diff / skipped checks residual risk，以及按策略对缺失 review artifacts blocked 或 changes_requested。

`formatWorkerResults` 是 worker 摘要块的共享格式化器。每项是：

```
### <role> (<status>)
Task: <taskId> -> <parentId>
Goal: <goal>
Progress: <status>: <summary>
Summary: <summary>
Risks:
- ...
Open questions:
- ...
```

如果需要新的结果呈现方式 —— 扩展这个格式化器，**不要** 在别处直接传原始的 `ExecutedWorkerResult[]` 给 prompt。

## 可靠性：模型 + provider 兜底

每个 worker（以及主 agent）都从 `packages/agent-runtime/src/model-selection.ts` 里的 `selectRuntimeModelCandidatesWithApiKey` 拿一个有序候选列表：

1. policy 的 `modelId`，然后是 `fallbackModelIds`（按序）。

runtime 不会把 `models.json` 当作全局 fallback 池扫描。fallback 必须显式写在当前 Brain Model 的 planner / role policy 里，这样模型执行始终留在用户配置的路由策略内。

如果 prompt 展开后带有图片输入，这条候选链路会带上 `requiresVision: true`。这是 runtime 的硬约束，routeBrain、support worker、主 agent、review worker 都一样：无视觉能力的纯文本模型会在调用 provider 之前被跳过。routeBrain 应该选择自身 role policy 链里包含 vision 候选的角色；runtime 会直接暴露 router/model 错误，而不是把该角色偷换成 planner 模型。

加 policy 字段或新模型字段时，请确保显式 primary / fallback 列表能尊重它。

## Hooks：每次对话里的「第三方」

Hook 是项目的可观测 / 策略逃生口。当前在五个生命周期点触发：

| 事件 | 触发时机 | 可阻断？ | 可加上下文？ |
|------|----------|----------|--------------|
| `SessionStart` | 任何 prompt 展开之前 | 可（整次 run） | 可 |
| `UserPromptSubmit` | 展开之后、plan 之前 | 可（prompt） | 可 |
| `SubagentStart` | 每个 worker 的 prompt 之前 | 可（仅本 worker） | 可 |
| `SubagentStop` | 每个 worker 成功之后 | 否 | 否 |
| `Stop` | 主 + review 之后 | 否 | 可（作为反馈追加） |

`runConfiguredHooks` 并发跑每个匹配的 handler。stdout 经 `parseHookOutput` 解析：JSON 优先；纯文本仅对 `SessionStart` / `SubagentStart` / `UserPromptSubmit` 视为额外上下文。在 hook 审核 UI 出来之前，handler 必须显式 `trusted: true`。

Hook 输出会进 session JSONL（`hook_session_start`、`hook_user_prompt_submit`、`hook_subagent_start`、`hook_subagent_stop`、`hook_stop`）。Hook 阻断时，编排器抛出阻断原因，而不是默默继续。

如果你在调试「为什么这个 prompt 没跑」—— 先查 hook。

## 给 UI 的运行时事件

TUI（`apps/cli`）从两条事件流驱动右下角 BrainPet footer 和实时进度：

- **`AgentEvent`**，来自 `@earendil-works/pi-agent-core` —— token 流、工具调用、工具结果等。通过 `agent.subscribe(...)` 订阅。`BraincodeAgentRuntimeOptions.onEvent` 是 TUI 用来把它们转发到渲染器的钩子。
- **`WorkerLifecycleEvent`**，来自 `agent-runtime` —— Braincode 层的 worker 边界：

```ts
type WorkerLifecycleEvent =
  | { type: "worker_start"; role: RoutedAgentRole; goal: string;
      phase: "support" | "review"; modelId: string; todoIds?: string[] }
  | { type: "worker_end";   role: RoutedAgentRole;
      phase: "support" | "review";
      status: "completed" | "failed"; summary?: string; error?: string;
      todoIds?: string[] }
```

Worker 在 `SubagentStart` hook 结束后发 `worker_start`，结果归一化后发 `worker_end`。CLI 用它们填充 BrainPet 进度片段，并驱动任务队列列表。BrainPet 只是只读 UI：可以基于可见上下文总结或吐槽，但不会影响路由或执行。

- **渲染数据流** —— TUI 把 input draft/cursor、transcript/scroll、实时运行状态、toast/queue、BrainPet snapshot 拆成独立 store，并由不同 Ink surface 分别订阅。普通打字直接用 ANSI patch 输入框，不要求 Ink 重画整帧；只有输入高度变化等布局更新才走 Ink。高频 token flush 只更新 transcript surface，状态行和 BrainPet footer 维持自己的刷新节奏。
- **实时运行状态** —— TUI 的 elapsed 时间由本地 1 秒计时器驱动，token 总量仍来自 provider 的 `AgentEvent` usage 数据；这样长时间没有流式事件时，用时显示也不会停住。
- **Transcript 折叠** —— 带 `▸` / `▾` 标记的工具或 agent 行使用 `Ctrl+T` 统一展开/收起。鼠标捕获默认关闭以保留终端原生拖选；需要滚轮滚动时可设 `BRAINCODE_TUI_MOUSE=true`。
- **Intent graph 视图** —— `Ctrl+O` 或 `/intent` 会打开最新 `RuntimePlan` 的任务拆解和依赖路径，并显示路由来源、置信度、原因、worker 和 mode 预算。
- **Router plan 预览** —— `/plan <task>` 默认请求配置的 `routeBrain`；`/plan --heuristic <task>` 只用于确定性、无 provider 调用的诊断。文本输入的 router 失败会标成 heuristic fallback；图片输入必须经过 routeBrain，router 失败会直接报错。

新增需要 UI 感知的生命周期节点时，**优先扩展 `WorkerLifecycleEvent`**，而不是从 `AgentRunRequest` 漏出新的 callback。一条类型化的流比五个 callback 好渲染得多。

## 多 agent 运行：`/team` 和强制角色路径

`/team` 让用户把一条 prompt 扇出给多个专家角色，各自独立作答。Plan 构造代码（`buildRuntimePlan`）从 `AgentRunRequest.forceRoles` 读取 `forceRoles?: RoutedAgentRole[]`。提供时：

- 路由跳过 router brain。
- 每个被强制的角色都成为 worker。
- 第一个强制角色是主角色。
- `requiresReview` 强制为 `false`。
- 每个 worker 的目标是「以 <role> agent 身份独立作答」。

由于每个 worker 仍然隔离，`/team` 的输出是真正独立的视角 —— 不是辩论。如果以后想做辩论流，请作为新角色（例如 `moderator`）来实现：它在扇出的 worker 之后运行，消费它们的 `WorkerResult`。

## 为什么不让 worker 互相对话

「让两个 worker 直接快速问一下」很诱人。我们不这么做，三个原因：

1. **上下文预算。** 直接 A↔B 对话会迅速复合膨胀。当前模型 —— 由 Brain 决定下一个问题、再 re-handoff —— 限制了最坏情况。
2. **失败面。** Brain 拥有重试 / 兜底。如果 A 能直接调 B，那 B 失败就变成 A 的异常，合并器就拿不到那个结构化的 `failed` 结果。
3. **回放 / 审计。** Session JSONL 是真相之源。每次 Brain↔worker 交互都被记录。旁路通信会必须记到别处 —— 而历史证明旁路通信用不了多久就没人记录了。

如果你需要更丰富的协作，请加一个有顺序的 plan 步骤（worker A → Brain → 把 A 的 `WorkerResult` 放进 B 的 handoff），而不是 peer 链路。

## 新增一种消息 kind

如果你确实需要新的 packet kind（比如交互式「问用户一个澄清问题」）：

1. 决定方向。扩展 `BrainToAgentContextTransfer` 或 `AgentToBrainContextTransfer`。如果两个都不合适，设计大概率有问题。
2. 在 `packages/context` 加 payload 类型。
3. 如果它要跨进程传，把它的 `kind` 加到 `packages/protocol` 的 `AgentMessage.kind`。
4. 在 `agent-runtime` 加构造器 + 归一化器（参考 `createWorkerHandoff` / `normalizeWorkerResultText`）。
5. 在 session JSONL 增加一种记录类型，让 replay / `@@` 继续工作。
6. 如果 UI 要观察它，扩展 `WorkerLifecycleEvent`（或者定义一个同样纪律的兄弟事件）。

1–3 步是契约。4–6 步是其他部分如何与契约保持一致。

## 去哪看

- 信封：`packages/protocol/src/index.ts` —— `AgentMessage`、`ContextRef`。
- Payload：`packages/context/src/index.ts` —— `HandoffPacket`、`WorkerResult`、task context、方向常量。
- Worker 驱动：`packages/agent-runtime/src/workers.ts` 里的 `runWorkerFromPlan`。
- Plan 组成：`packages/agent-runtime/src/router.ts` 里的 `buildRuntimePlan`、`routePromptWithBrain`、`normalizeRouterDecision`。
- Prompt 构造器：`buildSupportWorkerPrompt`、`buildPrimaryPrompt`、`buildReviewPrompt`、`formatWorkerResults`。
- 可靠性：`packages/agent-runtime/src/model-selection.ts` 里的 `selectRuntimeModelCandidatesWithApiKey`。
- Hooks：`runConfiguredHooks`、`runAndRecordHooks`、`parseHookOutput`。
- UI 事件：`WorkerLifecycleEvent`、`AgentRunRequest.onEvent` / `onWorkerEvent` / `onMcpReport`。
