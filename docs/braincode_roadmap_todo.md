# Braincode Roadmap TODO

> 目标：把 Braincode 从“可用型 early product”继续推进成一个稳定、可审计、可证明效果的 **multi-model coding workflow engine**。
>
> 核心心智：不是让一个模型从头写到尾，而是让 Braincode 通过 `routeBrain -> specialist workers -> primary executor -> checks -> reviewer -> final report` 产出一个可审查的 patch。

---

## 0. 当前状态快照

Braincode 当前已经具备以下基础能力：

- [x] Bun monorepo：`apps/*` + `packages/*`
- [x] CLI：`braincode`、`braincode run`、`braincode run --dry-run`、`braincode config`、`braincode benchmark`
- [x] TUI：slash commands、session、handoff、MCP/hook/brain/intent panels、worker lifecycle、tool approval
- [x] Brain Model：role policy、routing policy、context policy、preset inheritance
- [x] `routeBrain`：LLM-driven routing，支持 heuristic fallback
- [x] 多 worker：support workers、primary executor、policy-triggered review worker
- [x] 上下文隔离：structured handoff / worker result，不共享完整 worker transcript
- [x] 本地 coding tools：`list_files`、`read_file`、`search_files`、`edit_file`、`apply_patch`、`exec_command`、`write_stdin`、`shell`、`git_diff`、`get_changed_files`、`run_script`
- [x] 非交互权限模式：read-only 默认、`--allow-edits`、`--yes`
- [x] tool evidence cache：重复 read/search/diff 工具有缓存和重复提醒
- [x] patch ledger：changed files、diff stats、`patch_summary`
- [x] checks：发现 `check/typecheck/lint/test` scripts，按 package manager 运行
- [x] typed review decision：`approved / changes_requested / blocked`
- [x] prompt references：`@file`、`@@session`、image attachments
- [x] demo benchmark：覆盖 docs edit、failing test、auth risk、package change、security-review-only

当前主要改进方向不再是“补基础能力”，而是：

- [x] 让 final report 更稳定、更结构化
- [x] 让本地工具在大项目里更快更安全
- [x] 让权限策略从 tool-level 升级到 path/command-level
- [x] 让 review artifacts 覆盖更多真实 patch 情况
- [x] 让 benchmark 从“规划评估”升级到“真实执行评估”

---

## 1. 北极星目标

### Product North Star

Braincode should produce a routed, review-gated, auditable patch.

中文表达：

> Braincode 把一个开发需求拆成角色分工、上下文隔离、代码修改、自动检查和独立审查，最后产出一个可审计 patch。

### 成功标准

一次 `braincode run --yes "fix failing test"` 应该稳定输出：

```txt
Braincode Run Report

Task:
- fix failing test

Routing:
- source: routeBrain
- primary role: backend
- workers: librarian, qa, review

Patch:
- changed files: 2
- insertions: 18
- deletions: 4

Checks:
- typecheck: passed
- test: passed

Review:
- decision: approved
- findings: none
- residual risks: ...

Session:
- <session-id>
```

---

## 2. 开发原则

- [ ] 不再优先堆新角色、新面板、新概念
- [ ] 优先打磨完整 patch engine 链路
- [x] runtime 负责事实报告，模型只负责自然语言总结
- [x] 本地工具默认安全，危险动作必须清晰可控
- [ ] benchmark 必须能证明 routing / review / checks 的实际价值
- [x] TUI 和 CLI 共用同一套 final report 数据结构
- [x] 支持大仓库时不能靠“把文件全读进内存”

---

# P0：稳定核心产品闭环

## P0-1. 拆分 `packages/agent-runtime/src/index.ts`

### 背景

`agent-runtime/src/index.ts` 当前承载过多职责：

- model selection
- hooks
- evidence cache
- context budget
- routeBrain / planning
- patch summary
- checks
- review
- worker execution
- image maker
- prompt references
- session handoff
- 主执行流程

继续堆功能会降低可维护性和测试定位效率。

### TODO

- [x] 新建 `packages/agent-runtime/src/model-selection.ts`
  - [x] `selectRuntimeModel`
  - [x] `selectRuntimeModelCandidatesWithApiKey`
  - [x] vision/image generation requirement checks
- [x] 新建 `packages/agent-runtime/src/evidence-cache.ts`
  - [x] `createToolEvidenceCache`
  - [x] `wrapToolsWithEvidenceCache`
  - [x] duplicate reminder logic
- [x] 新建 `packages/agent-runtime/src/context-budget.ts`
  - [x] `estimateProviderContextBytes`
  - [x] `enforceHandoffContextBudget`
  - [x] automatic handoff summary
- [x] 新建 `packages/agent-runtime/src/hooks.ts`
  - [x] `runConfiguredHooks`
  - [x] `runAndRecordHooks`
  - [x] hook input/output parsing
- [x] 新建 `packages/agent-runtime/src/patch.ts`
  - [x] `collectPatchBaseline`
  - [x] `collectPatchSummary`
  - [x] `collectPatchDiffSnapshot`
  - [x] untracked preview，见 P1-3
- [x] 新建 `packages/agent-runtime/src/checks.ts`
  - [x] `runPatchChecks`
  - [x] `runPatchChecksWithApproval`
  - [x] package manager detection
- [x] 新建 `packages/agent-runtime/src/router.ts`
  - [x] `buildRuntimePlan`
  - [x] `routePromptWithBrain`
  - [x] `normalizeRouterDecision`
  - [x] input modality routing directive
- [x] 新建 `packages/agent-runtime/src/workers.ts`
  - [x] `runWorkerFromPlan`
  - [x] `runSupportWorkers`
  - [x] worker handoff/prompt builder
- [x] 新建 `packages/agent-runtime/src/review.ts`
  - [x] `buildReviewPrompt`
  - [x] `normalizeReviewDecisionText`
  - [x] `applyCheckGateToReviewDecision`
  - [x] `mergeReviewResult`
- [x] 新建 `packages/agent-runtime/src/prompt-references.ts`
  - [x] `expandPromptReferences`
  - [x] `@file`
  - [x] `@@session`
  - [x] image references
- [x] 新建 `packages/agent-runtime/src/image-maker.ts`
  - [x] image model selection
  - [x] image generation artifact save
  - [x] imageMaker worker result
- [x] 保留 `index.ts` 作为 public exports + thin orchestration entry

### 验收标准

- [x] `bun run check` 通过
- [x] `bun test` 通过
- [x] public exports 不破坏现有 CLI/TUI
- [x] 每个新模块都有最少一个聚焦测试
- [x] `agent-runtime/src/index.ts` 行数明显下降，只保留入口和 re-export

---

## P0-2. 结构化 Final Report

### 背景

当前 runtime 已经有 `patch`、`checks`、`reviewDecision`，但 CLI 主要输出 `result.summary`。事实信息仍然太依赖 primary 模型的自然语言总结。

### TODO

- [x] 定义 `FinalReport` 类型

```ts
type FinalReport = {
  status: "approved" | "changes_requested" | "blocked" | "answered" | "read_only"
  task: string
  sessionId: string
  brain: {
    id: string
    name: string
    mode: BraincodeMode
  }
  routing: {
    source: "router-brain" | "heuristic"
    primaryRole: RoutedAgentRole
    workers: Array<{ role: RoutedAgentRole; phase: "support" | "primary" | "review"; status?: string }>
    confidence?: number
    reason?: string
  }
  todos: Array<{
    id: string
    title: string
    role: RoutedAgentRole
    status: AgentTodoStatus
  }>
  patch?: PatchSummary
  checks?: PatchCheckSummary
  review?: ReviewDecision
  modelSummary: string
  warnings: string[]
}
```

- [x] 在 `executePromptFromConfig` 返回值里增加 `finalReport`
- [x] `modelSummary` 保留 primary agent 原始总结
- [x] `patch/check/review/todos/routing` 由 runtime 填充，不能由模型编造
- [x] 对 review/check 状态做统一状态机

```txt
checks failed + review approved => final status = changes_requested
review blocked => final status = blocked
no patch + no tools => final status = answered / read_only
```

### 验收标准

- [x] CLI/TUI 都能消费同一个 `FinalReport`
- [x] failed checks 不会被最终报告展示成 approved
- [x] 没有 patch 时，报告明确说明 no patch activity
- [x] `FinalReport` 可 JSON 序列化并写入 session ledger

---

## P0-3. CLI/TUI 渲染 Final Report

### TODO

- [x] CLI 增加默认 human-readable report

```txt
Braincode Run Report
Task: ...
Brain: brain / auto
Routing: routeBrain -> backend
Workers: librarian completed, qa completed, review approved
Patch: 2 files, +18 -4
Checks: typecheck passed, test passed
Review: approved
Session: xxx
```

- [x] CLI 增加 `--json` 输出完整 `FinalReport`
- [x] CLI 增加 `--summary-only` 保持只输出模型 summary
- [x] TUI run 完成时展示 compact report card
- [x] TUI 支持展开 sections：Patch / Checks / Review / Workers
- [x] Session ledger 记录 `final_report`

### 验收标准

- [x] `braincode run --allow-edits "update README"` 输出 changed files/check/review 信息
- [x] `braincode run --json "..."` 可用于自动化脚本
- [x] TUI 不再只依赖 assistant text 传达执行事实

---

# P1：性能与可靠性

## P1-1. `read_file` 改成 windowed read

### 背景

当前 `read_file` 会整文件读入内存后再按 offset/limit 切片。大文件场景下性能和内存风险较高。

### TODO

- [x] 改造 `read_file`
  - [x] `stat` 先判断文件大小
  - [x] 小文件继续全量读取
  - [x] 大文件使用 `fs.open` + `read` 读取指定 byte window
  - [x] 返回 `nextOffset`
  - [x] 保留 binary 检测
  - [x] 注意 UTF-8 多字节字符边界
- [x] 增加参数
  - [x] `offset`
  - [x] `limit`
  - [x] `encoding?: "utf8"`
- [x] 为超大文件增加测试：10MB / 100MB mock 或 fixture

### 验收标准

- [x] 读取大文件时不会把全文件加载进内存
- [x] `limit` 很小也能正确返回窗口和 `nextOffset`
- [x] binary 文件仍被拒绝
- [x] `bun test packages/tools` 通过

---

## P1-2. fallback search 性能优化

### 背景

`rg` 不可用时，fallback 会顺序扫描最多 5000 个文件。大仓库里会慢。

### TODO

- [x] fallback search 增加并发限制
  - [x] 默认并发 8 或 16
- [x] 增加默认 ignore directories

```txt
.git
node_modules
dist
build
coverage
.next
.nuxt
.turbo
.cache
vendor
```

- [x] 增加 max searchable file bytes
  - [x] 默认 256KB 或 512KB
- [x] 搜索结果达到 `maxResults` 后尽快停止排队和读取
- [x] 对 skipped files 返回 details，而不是塞进正文

### 验收标准

- [x] 无 `rg` 环境下，fallback search 仍可用
- [x] 大仓库不会明显卡死
- [x] maxResults 生效后不继续无意义扫描
- [x] 测试覆盖 no-rg path/content search

---

## P1-3. Review artifacts 支持 untracked file preview

### 背景

`git diff` 不包含未跟踪文件内容。如果 Agent 新建文件，review worker 可能只能看到 `?? file.ts`，看不到文件内容。

### TODO

- [x] 扩展 `PatchReviewArtifacts`

```ts
type PatchReviewArtifacts = {
  patch?: PatchSummary
  checks?: PatchCheckSummary
  diff?: PatchDiffSnapshot
  untrackedPreviews?: Array<{
    path: string
    text?: string
    truncated: boolean
    binary: boolean
    size: number
  }>
}
```

- [x] 从 `git status --short` 找出 `??` 文件
- [x] 对文本文件收集 capped preview
- [x] 对 binary 文件记录 binary marker
- [x] `buildReviewPrompt` 中加入 untracked previews

### 验收标准

- [x] 新建文件会出现在 review artifacts 中
- [x] reviewer 能看到新文件内容片段
- [x] 大文件/二进制不会污染上下文

---

## P1-4. Evidence cache 增加 LRU / TTL / byte limit

### 背景

当前 evidence cache 有 `createdAt`，但没有明确的 max entries / TTL / bytes 淘汰策略。长 session 里可能持续增长。

### TODO

- [x] 增加配置

```ts
type ToolEvidenceCacheOptions = {
  maxEntries: number // default 200
  maxBytes: number   // default 8MB
  ttlMs: number      // default 10min
}
```

- [x] 写入 cache 前估算 result content bytes
- [x] 超出 maxEntries 时按 LRU 删除
- [x] 超出 maxBytes 时按 LRU 删除
- [x] 过期 entry 自动删除
- [x] cache details 里加入：`evictedEntries`、`currentEntries`、`approxBytes`

### 验收标准

- [x] 长 session 下 cache 不无限增长
- [x] 重复 read/search 仍然复用结果
- [x] 写/执行工具后 cache 仍会失效

---

## P1-5. MCP 懒加载 / 后台加载

### 背景

当前 MCP 连接在 run 开始时进行。多个 MCP 或慢 MCP 会影响启动速度。

### TODO

- [x] 增加 MCP loading strategy

```ts
type McpLoadingStrategy = "eager" | "lazy" | "background"
```

- [x] TUI 默认 background
- [x] CLI run 默认 eager 或 short-budget eager
- [x] 本地 tools 先可用，不阻塞 MCP
- [x] TUI 展示 MCP loading 状态
- [x] MCP ready 后动态更新可用工具列表
- [x] 增加全局 MCP startup budget

```txt
per-server connect timeout: 15s
global MCP startup budget: 5s / 10s
```

### 验收标准

- [x] 慢 MCP 不阻塞 TUI 首屏
- [x] MCP 失败会记录，但不影响本地 tools
- [x] 用户能看到 MCP connected / failed / skipped

---

# P2：安全与策略

## P2-1. Permission Policy v2：path-aware + command-aware

### 背景

当前权限主要按 tool name 和危险关键词判断。下一步要把 Braincode 的安全优势做出来。

### TODO

- [x] 设计 `permissions.json` 或扩展 `tools.json`

```json
{
  "paths": [
    { "pattern": "src/auth/**", "edit": "ask", "review": "required" },
    { "pattern": "src/payment/**", "edit": "ask", "review": "required" },
    { "pattern": "db/**", "edit": "ask", "review": "required" },
    { "pattern": "package.json", "edit": "ask", "review": "required" },
    { "pattern": ".github/workflows/**", "edit": "ask", "review": "required" },
    { "pattern": "../**", "edit": "deny" }
  ],
  "commands": [
    { "pattern": "bun test", "policy": "allow" },
    { "pattern": "npm test", "policy": "allow" },
    { "pattern": "git push", "policy": "deny" },
    { "pattern": "npm publish", "policy": "deny" },
    { "pattern": "rm -rf", "policy": "deny" }
  ]
}
```

- [x] edit/apply_patch 前判断 path policy
- [x] shell/exec/run_script 前判断 command policy
- [x] policy 命中结果写入 tool details
- [x] 命中 `review: required` 时强制 requiresReview
- [x] TUI approval panel 展示 path/command policy 命中原因

### 验收标准

- [x] `src/auth/**` 改动强制 review
- [x] `git push` / `npm publish` 默认 deny
- [x] 项目外写入仍然 deny
- [x] `--yes` 是否绕过 policy 需要明确：deny 不可绕过，ask 可由 `--yes` / radical 自动批准

---

## P2-2. Smart Checks：按 patch 类型选择验证策略

### 背景

当前文件变更后会选择 `check/typecheck/lint/test`。这很安全，但可能过重。

### TODO

- [x] 增加 patch classifier

```ts
type PatchKind =
  | "docs-only"
  | "frontend"
  | "backend"
  | "test-only"
  | "package-change"
  | "auth-risk"
  | "db-risk"
  | "ci-risk"
  | "unknown-code"
```

- [x] 根据 changed files 判断 patch kind
- [x] 默认策略

```txt
docs-only      -> skip or docs check
test-only      -> run test
frontend       -> typecheck + lint + test if available
backend        -> typecheck + test
auth-risk      -> full checks + review
db-risk        -> full checks + review
package-change -> detected package manager + full checks
ci-risk        -> review + no auto shell unless approved
```

- [x] 允许用户配置 `.braincode/checks.json`
- [x] final report 显示为什么跑/跳过 checks

### 验收标准

- [x] README 改动不会默认跑超重测试
- [x] auth/db/package.json 改动强制更严格 checks
- [x] 用户可以覆盖默认策略

---

## P2-3. Review Gate v2

### TODO

- [x] review decision 增加 `confidence`

```ts
type ReviewDecision = {
  decision: "approved" | "changes_requested" | "blocked"
  confidence?: number
  rationale: string
  findings: ReviewFinding[]
  requiredChanges: string[]
  blockingIssues: string[]
  residualRisks: string[]
}
```

- [x] review prompt 明确：findings first，不要泛泛总结
- [x] 对 truncated diff 强制 residual risk
- [x] 对 skipped checks 强制 residual risk
- [x] 对 failed checks 自动 changes_requested
- [x] 对 missing review artifacts 自动 blocked 或 changes_requested，按策略配置

### 验收标准

- [x] failed checks 不可能 approved
- [x] diff truncated 时 review 必须指出 residual risk
- [x] reviewer 输出无法 parse 时 fallback 为 blocked/changes_requested，而不是当作 approved

---

# P3：评估与证明

## P3-1. Execution Benchmark

### 背景

当前 benchmark 更偏 routeBrain 规划质量。下一步要验证真实 patch 质量。

### TODO

- [x] 新建目录

```txt
benchmarks/
  fixtures/
    readme-edit/
    failing-test-fix/
    login-validation/
    auth-risk-change/
    package-change/
    security-review-only/
  runner/
  reports/
```

- [x] 每个 fixture 包含

```txt
initial project
benchmark task
expected changed files
expected checks
expected review behavior
optional expected diff pattern
```

- [x] 新增命令

```bash
braincode benchmark --execute
braincode benchmark --execute --task login-validation
braincode benchmark --execute --json
```

- [x] 指标

```txt
success
changedFiles
diffStats
checks.status
review.decision
durationMs
toolCallCount
tokenUsage
approvalCount
fallbackCount
```

### 验收标准

- [x] 无 provider 时可跑 fake/mock agent 测试基础链路
- [x] 有 provider 时可跑真实执行 benchmark
- [x] benchmark report 能用于 README 展示

---

## P3-2. Demo case：Safe Review Patch

### TODO

- [x] 新建 `examples/login-validation-demo`
- [x] 准备一个小型 TS/Bun/React fixture
- [x] 任务：增加 login validation
- [x] 展示流程

```txt
routeBrain -> frontend/backend/qa -> primary -> checks -> review -> final report
```

- [x] 录制 asciinema 或 gif
- [x] README 增加 demo section

### 验收标准

- [x] 新用户能 2 分钟看懂 Braincode 和普通 CLI agent 的区别
- [x] demo 里必须展示 patch、checks、review decision

---

## P3-3. Usage / Cost / Quality Metrics

### TODO

- [ ] Session ledger 增加 tool call count
- [ ] Usage stats 增加 by phase：router/support/primary/review
- [ ] Final report 显示 token summary
- [ ] benchmark report 显示 estimated cost，如果模型价格未知则显示 token usage only
- [ ] TUI status line 展示本轮 tokens 和 elapsed

### 验收标准

- [ ] 用户能看到多 worker 是否真的增加成本
- [ ] 用户能看到 review gate 成本
- [ ] benchmark 能比较 single-agent vs brain-agent

---

# P4：产品打磨

## P4-1. Quickstart 降低使用门槛

### TODO

- [x] README 增加 3 步 Quickstart

```bash
npm i -g @taotao7/braincode
braincode config
braincode run --dry-run "review this repo"
```

- [x] 增加 “First real edit”

```bash
braincode run --allow-edits "update README wording"
```

- [x] 增加 “Full autonomous local run”

```bash
braincode run --yes "fix failing test and run checks"
```

- [x] 增加常见错误说明
  - missing API key
  - image input requires vision model
  - empty assistant response
  - context handoff required
  - command blocked by permission mode

### 验收标准

- [x] 用户不读架构文档也能跑起来
- [x] 常见错误都有修复路径

---

## P4-2. Config Web 继续简化

### TODO

- [ ] 增加 setup wizard
  - [ ] 选择 provider
  - [ ] 填 key
  - [ ] test connection
  - [ ] 选择 default brain
  - [ ] 选择 routeBrain / primary / review 模型
- [ ] 增加 health check 页面
  - [ ] provider key status
  - [ ] model capability：tools / vision / image generation
  - [ ] package manager detection
  - [ ] MCP connection status
- [ ] 增加 permission preview

### 验收标准

- [ ] 用户能看出为什么 image prompt 跑不了
- [ ] 用户能看出 role 的模型链是否可用
- [ ] 用户能看出 MCP 是否 blocked/skipped/failed

---

# 3. 推荐执行顺序

## 第 1 周：结构和报告

- [x] P0-1 拆 `agent-runtime/src/index.ts`
- [x] P0-2 定义 `FinalReport`
- [x] P0-3 CLI 输出 Final Report

## 第 2 周：性能基础

- [x] P1-1 windowed `read_file`
- [x] P1-2 fallback search 优化
- [x] P1-4 evidence cache LRU/TTL

## 第 3 周：review 和安全

- [x] P1-3 untracked file preview
- [x] P2-1 permission policy v2
- [x] P2-3 review gate v2

## 第 4 周：评估和传播

- [x] P3-1 execution benchmark
- [x] P3-2 login validation demo
- [x] P4-1 quickstart 文档

---

# 4. Issue 拆分建议

## Issue 001：Split agent-runtime modules

```txt
Goal:
Refactor packages/agent-runtime/src/index.ts into focused modules without changing runtime behavior.

Files:
- packages/agent-runtime/src/index.ts
- packages/agent-runtime/src/model-selection.ts
- packages/agent-runtime/src/evidence-cache.ts
- packages/agent-runtime/src/context-budget.ts
- packages/agent-runtime/src/hooks.ts
- packages/agent-runtime/src/patch.ts
- packages/agent-runtime/src/checks.ts
- packages/agent-runtime/src/router.ts
- packages/agent-runtime/src/workers.ts
- packages/agent-runtime/src/review.ts
- packages/agent-runtime/src/prompt-references.ts
- packages/agent-runtime/src/image-maker.ts

Acceptance:
- bun run check passes
- bun test passes
- no public API breakage
```

## Issue 002：Add runtime-owned FinalReport

```txt
Goal:
Add a structured FinalReport generated by runtime facts instead of model prose.

Acceptance:
- executePromptFromConfig returns finalReport
- session ledger appends final_report
- CLI can print human report
- --json prints structured report
```

## Issue 003：Optimize read_file for large files

```txt
Goal:
Make read_file read byte windows for large files instead of loading full file into memory.

Acceptance:
- large file test passes
- binary detection still works
- offset/limit/nextOffset works
```

## Issue 004：Add untracked file previews to review artifacts

```txt
Goal:
Ensure review workers can inspect newly created files.

Acceptance:
- new files appear in review artifacts
- large/binary files are safely summarized
```

## Issue 005：Add Permission Policy v2

```txt
Goal:
Support path-aware and command-aware permission rules.

Acceptance:
- [x] auth/db/package/workflow edits force review
- [x] git push/npm publish/rm -rf deny by default
- [x] TUI approval shows matched rule
```

## Issue 006：Execution benchmark fixtures

```txt
Goal:
Benchmark real patch generation, checks, and review decisions.

Acceptance:
- [x] braincode benchmark --execute works
- [x] fixtures are isolated temp repos
- [x] JSON report includes patch/check/review metrics
```

---

# 5. 暂时不要做

这些可以先不做，避免分散主线：

- [ ] 不急着做 VS Code extension
- [ ] 不急着做 ACP / wire server
- [ ] 不急着做 cloud sync
- [ ] 不急着做 plugin marketplace
- [ ] 不急着增加更多角色
- [ ] 不急着追 OpenCode/Kimi CLI 的完整产品矩阵
- [ ] 不急着做多人协作

当前主线只有一句话：

> 把 Braincode 打磨成一个稳定、可审计、可验证效果的 patch workflow engine。

---

# 6. 最终里程碑

## v0.3：Structured Report & Runtime Refactor

- [x] 拆 agent-runtime
- [x] FinalReport
- [x] CLI/TUI report renderer
- [x] session `final_report`

## v0.4：Performance & Review Artifacts

- [x] windowed read_file
- [x] fallback search 优化
- [x] evidence cache LRU/TTL
- [x] untracked preview
- [x] MCP lazy/background loading

## v0.5：Permission & Smart Checks

- [x] path-aware policy
- [x] command-aware policy
- [x] risky file force review
- [x] smart check selection
- [x] review gate v2

## v0.6：Execution Benchmark & Demo

- [x] fixture benchmark
- [x] login validation demo
- [x] benchmark JSON report
- [x] README demo section
