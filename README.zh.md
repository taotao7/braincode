# Braincode

Braincode 是一个基于 Bun 的 monorepo 项目，目标是构建一个以编码为核心、同时也能处理通用任务的 AI agent。它的核心理念是用户可选的 **Brain Model（大脑模型）**：一种高层策略画像，可以动态决定每个子任务该使用哪个底层模型、哪种 agent 角色、哪些工具以及多大的上下文预算。

项目在合适的地方复用 Pi 基础设施，同时把 Braincode 自身的产品级编排逻辑和 UI 保持独立。交互式终端 UI 由 Braincode 自己使用 Ink 实现；Pi 保留在 provider/runtime 层，不作为产品界面。

**语言版本**：[English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

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

## 核心理念

在现阶段的 AI 大模型时代，**合理的编排一定大于单个模型**。没有任何一个 LLM 能在所有维度都做到最好 —— 规划、写代码、审查、总结、快速廉价的回复，各有各的强项。把整个工作流绑死在单一模型上，既浪费能力，也浪费钱。Braincode 坚信：**合理利用每个模型的特性，通过精心编排把它们组合起来，才能最大化提升效率、质量与成本收益**。Brain Model 就是这种理念的具体落地。

## 为什么要做这个项目

目前市面上的 coding agent 还不够智能。我心目中完美的 agent，应该能够 **根据不同的需求调用不同的模型**：因为每个模型的侧重点都不一样 —— 有的擅长规划，有的擅长写代码，有的擅长审查，有的擅长快速、低成本的回复。把整个工作流绑定在单一的 LLM 上，既浪费能力，也浪费钱。

Braincode 就是围绕这个想法构建的：用户不再为所有任务挑选同一个模型，而是选择一个 **Brain Model（大脑模型）** —— 一个路由策略，将每个子任务（规划、编码、研究、审查、总结、快速回复）分派给最合适的模型。

Braincode 目前有两种顶层模式：

- `auto` — 默认模式，根据意图自动规划并路由到不同 agent/模型。
- `radical` — 更激进的自治模式，适合希望更快、更广执行的用户。

## 目标

- 构建一个以编码为主、同时具备研究、审查、规划、总结、自动化能力的 agent。
- 让用户选择 Brain Model，而不是为所有事情手动指定单一 LLM。
- 根据角色、成本、延迟、上下文规模和风险，动态地把工作路由到不同模型。
- 在 agent 之间隔离上下文，仅交换结构化的 handoff/result 消息。
- 提供本地配置服务，用户在浏览器中打开使用。
- 真实的用户配置存储在 `~/.braincode/` 下。
- 终端 UI 使用 Ink，由 Braincode 拥有，只展示 Braincode 的 mode、Brain Model 路由、agent 角色、工具权限和会话状态。
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

当前 TUI 支持 `/help` 查看命令、`/plan <任务>` 预览 Brain Model 路由但不调用 provider。TUI 不提供直接切换模型的命令；模型和 provider 配置属于 `braincode config`。

完整的架构、包职责、配置布局、路线图等，请参考英文版的 [README.md](./README.md)。
