# Braincode

一个多模型代码工作流引擎。

Braincode 把一次编码请求变成协同工程流程：

```text
planner -> specialist workers -> primary executor -> reviewer -> final report
```

它不是“又一个 AI CLI”，不是把一个模型绑到终端里让它自己规划、自己写、自己审。Braincode 会把一个需求拆成角色分工、上下文隔离、代码修改、检查和独立审查，最后产出可审计 patch。

**语言版本**：[English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

## 为什么 Braincode？

大多数 coding agent 让同一个模型完成规划、编码和自我审查。Braincode 把这些职责拆开。

- 简单任务路由到便宜模型
- 高风险工作升级到更强模型
- Worker 上下文彼此隔离
- 高风险文件编辑需要独立 Review
- 输出结构化最终报告

## 示例

```bash
braincode run "add login validation"
braincode run --allow-edits "add login validation"
braincode run --yes "fix the failing test"
braincode run --dry-run "add login validation"
braincode run --dry-run --heuristic "add login validation"
BRAINCODE_DEBUG=true braincode run "hello"
braincode benchmark
```

`braincode run` 使用当前配置的 Brain Model。非交互运行默认只读，因为没有审批 UI；`--allow-edits` 会自动批准内置本地读取和文件编辑，但阻止命令执行、MCP 工具和未知工具，`--yes` 会自动批准工具调用。`--dry-run` 预览与真实执行相同的 routeBrain 规划路径；需要不调用 provider 的诊断时，加 `--heuristic`。用 `braincode config` 修改当前 Brain Model 和 provider/model 配置。

`braincode benchmark` 运行一组代表性 coding prompt：README 编辑、失败测试修复、auth 风险改动、package/script 改动，以及只做安全审查的只读任务。默认会在有凭据时请求 routeBrain，并标注 heuristic fallback；`--heuristic` 可用于无 provider 的诊断运行。

设置 `BRAINCODE_DEBUG=true` 后，runtime 会把脱敏调试信息写到 stderr：模型候选、provider payload/response 摘要、agent 事件摘要、fallback 尝试和空 assistant 响应。密钥等敏感字段会在输出前脱敏。

## 工作方式

1. `routeBrain` 创建结构化计划。
2. Brain 启动隔离的专家 Worker。
3. Worker 返回结构化结果，而不是完整 transcript。
4. 主执行器结合 Worker 上下文应用改动。
5. 策略要求时，Review Worker 检查结果。
6. Brain 返回最终报告并记录 session。

## 安装

```bash
# Homebrew（macOS / Linux）
brew install taotao7/tap/braincode

# npm（需要 Node >= 18）
npm i -g @taotao7/braincode

# 或者直接下载预编译二进制
curl -L https://github.com/taotao7/braincode/releases/latest/download/braincode-darwin-arm64.tar.gz \
  | tar -xz && ./braincode-darwin-arm64 help
```

支持的平台：`darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`。安装完成后，运行 `braincode` 启动 TUI，或运行 `braincode config` 打开本地配置页面。

## 发布记录

### v0.2.4

- `read_file` 现在会在大文件遇到过小 `limit` 时自动扩大读取窗口，并返回结构化 `nextOffset` metadata，减少一页一页碎片读取导致 transcript 和 provider context 爆炸的问题。

### v0.2.3

- Config Web UI 改为多 tab 管理，模型 tab 放在最前；usage tab 展示按模型、role、运行阶段聚合的 token 统计，并加入 Recharts 图表和点击详情过滤。
- 认证过 Claude Pro/Max、ChatGPT Plus/Pro Codex、GitHub Copilot 等 Pi OAuth 订阅后，可以在模型目录里直接选择对应订阅商模型，不需要重复填写 API key。
- TUI running 状态有独立的一秒计时和轻量动画：前缀符号循环，状态文字逐字高亮，没 token/tool 事件时耗时也会继续更新。
- TUI transcript 折叠改为键盘驱动，按 `Ctrl+T` 可在展开/收起所有可折叠行之间切换；工具调用默认保持短行，参数和结果摘要放到折叠详情里。鼠标捕获仅用于滚轮滚动，可设置 `BRAINCODE_TUI_MOUSE=false` 关闭。
- provider 返回 message size 超限时，会作为 Braincode handoff 边界提示 `/handoff`，让用户从紧凑的 `@@session` packet 继续，而不是静默压缩当前 transcript。
- read-only evidence cache 在 write/execute 工具后会清理缓存和重复计数，减少文件或命令输出变化后的 stale duplicate-read 提醒。
- npm wrapper 和发布元数据同步到 `0.2.3`，用于匹配同版本 GitHub release 资产。

### v0.2.2

- TUI transcript 折叠不再使用鼠标点击，改为 `Ctrl+T` 切换，避免选择文本和折叠命中互相干扰。
- TUI transcript 渲染改为内部 viewport，输入框为空时支持 Up/Down 滚动内容，也支持 PageUp/PageDown、Ctrl+Up/Ctrl+Down 和鼠标滚轮浏览历史，流式输出时不再强制重绘整段终端 scrollback；prompt 历史使用 Ctrl+P/Ctrl+N 切换。
- BrainPet 固定到右下角 footer，默认使用稳定低刷新渲染，会根据当前工具、worker、队列和最近事件汇报进度或简短吐槽；如需动画可设置 `BRAINCODE_TUI_ANIMATIONS=true`。
- npm wrapper 和发布元数据同步到 `0.2.2`，用于匹配同版本 GitHub release 资产。

## 核心理念

在现阶段的 AI 大模型时代，**合理的编排一定大于单个模型**。没有任何一个 LLM 能在所有维度都做到最好 —— 规划、写代码、审查、总结、快速廉价的回复，各有各的强项。把整个工作流绑死在单一模型上，既浪费能力，也浪费钱。Braincode 坚信：**合理利用每个模型的特性，通过精心编排把它们组合起来，才能最大化提升效率、质量与成本收益**。Brain Model 就是这种理念的具体落地。

## 为什么要做这个项目

目前市面上的 coding agent 还不够智能。我心目中完美的 agent，应该能够 **根据不同的需求调用不同的模型**：因为每个模型的侧重点都不一样 —— 有的擅长规划，有的擅长写代码，有的擅长审查，有的擅长快速、低成本的回复。把整个工作流绑定在单一的 LLM 上，既浪费能力，也浪费钱。

Braincode 就是围绕这个想法构建的：用户不再为所有任务挑选同一个模型，而是选择一个 **Brain Model（大脑模型）** —— 一个路由策略，将每个子任务（规划、编码、研究、审查、总结、快速回复）分派给最合适的模型。

Braincode 目前有两种顶层模式：

- `auto` — 默认模式，根据意图自动规划并路由到不同 agent/模型。
- `radical` — 更激进的自治模式，适合希望更快、更广执行的用户。

## Agent 角色（v0.2.0）

harness 暴露 **14 个角色**，整体以角色（专业人设）为主，并保留少量不重叠的功能型助手。原来通用的 `coding` 角色已经被移除 —— 代码工作按照领域细分，这样每个角色都能路由到真正擅长该领域的模型。

**路由**
- `routeBrain` — 由 LLM 驱动的规划器。读 prompt，输出结构化的路由决定（primary 角色、worker 列表、todo、依赖）。harness 不再依赖正则匹配做路由。

**领域专家**
- `frontend` · `backend` · `dba` · `devops` · `designer` · `security` · `qa` · `rush`

**功能型助手（不重叠）**
- `librarian` — 代码库地图 + 外部资料检索（合并了原来的 `research` 角色）
- `review` — 对现有代码做缺陷检查
- `oracle` — 复杂推理、架构权衡
- `summarize` — handoff 压缩

**状态显示**
- `pet` — 只读的 BrainPet 状态报告

本次发布移除的角色：`coding`、`fastReply`、`research`。已有用户配置会自动迁移 —— 首次加载时，过时的角色条目会被剥离。

## 目标

- 构建一个以编码为主、同时具备研究、审查、规划、总结、自动化能力的 agent。
- 让用户选择 Brain Model，而不是为所有事情手动指定单一 LLM。
- 根据角色、成本、延迟、上下文规模和风险，动态地把工作路由到不同模型。
- 在 agent 之间隔离上下文，仅交换结构化的 handoff/result 消息。
- 提供本地配置服务，用户在浏览器中打开使用。
- 真实的用户配置存储在 `~/.braincode/` 下。
- 终端 UI 使用 Ink，由 Braincode 拥有，只展示 Braincode 的 mode、Brain Model 路由、agent 角色、工具权限和会话状态。
- TUI 的 transcript 折叠使用 `Ctrl+T` 在展开/收起之间切换，BrainPet 固定在右下角并显示上下文进度。
- 从一开始就使用 Bun 与 monorepo 布局。
- 保持包之间的低耦合与高复用。

## 第一阶段的非目标

- 不 fork pi-mono。
- 不把 Pi TUI 或通用模型切换界面作为 Braincode 的产品界面。
- 不一次性构建所有 UI。
- 在核心 agent 运行时跑通之前，不设计复杂的插件系统。
- 不在仓库中存放用户密钥或机器本地配置。

## 文档

- [总览](./docs/overview.zh.md) —— 分层、包结构、一次完整请求的流程。从这里开始。
- [Architecture](./docs/architecture.md) —— 主系统架构、Brain Model 设计、上下文隔离、Pi 集成、本地配置服务（仅英文）。
- [上下文管理](./docs/context-management.zh.md) —— Brain / worker 隔离、handoff / result packet、prompt 引用、session JSONL。
- [Agent 通信](./docs/agent-communication.zh.md) —— worker 生命周期、路由、hook、运行时事件、多 agent 运行。
- [Project structure and plan](./docs/project-structure.md) —— 工作区布局、各包职责、里程碑（仅英文）。
- [Visual style](./docs/visual-style.md) —— UI / 品牌方向（仅英文）。
- [References](./docs/references.md) —— 设计决策参考的 Amp / Pi 资料（仅英文）。

## 更多内容

当前 TUI 支持 `/help` 查看命令、`/plan <任务>` 预览 Brain Model 路由；需要无 provider 诊断时使用 `/plan --heuristic <任务>`。TUI 不提供直接切换模型的命令；模型和 provider 配置属于 `braincode config`。

完整的架构、包职责、配置布局、路线图等，请参考英文版的 [README.md](./README.md)。
