# Braincode 下一阶段 TODO 规划

> 版本：2026-05-30  
> 状态：高强度编码后复盘版  
> 目标：把 Braincode 从“可用型 early product”推进到“可以稳定推广的开源开发者工具”。

---

## 0. 当前判断

Braincode 当前已经具备比较完整的 patch engine 雏形：

```text
routeBrain 规划
→ specialist workers
→ primary executor
→ local tools / MCP tools
→ patch summary
→ smart checks
→ review worker
→ typed review decision
→ final report
→ token / tool metrics
→ benchmark
```

当前阶段不再是补基础能力，而是进入 **可靠性收敛、可验证性增强、对外可用性打磨** 阶段。

---

## 1. 不再优先做的事情

近期不要继续优先堆这些：

- [ ] 新角色
- [ ] 新面板
- [ ] 新模型 provider 花活
- [ ] 复杂插件市场
- [ ] VS Code / 桌面端 / 多端入口
- [ ] 云同步
- [ ] 多人协作
- [ ] 过早商业化包装

当前最重要的主线：

```text
CI + doctor + benchmark 对比 + TUI 模块化 + FinalReport 协议稳定
```

---

# P0. 可信度与可验证性

## P0-1. 增加 GitHub Actions CI

### 目标

让外部用户看到 main 分支是可验证的，不再只依赖 README badge 或本地口头说明。

### TODO

- [ ] 新建 `.github/workflows/ci.yml`
- [ ] push 到 main 时运行
- [ ] PR 时运行
- [ ] 跑 TypeScript check
- [ ] 跑单元测试
- [ ] 跑 coverage
- [ ] 跑 planning benchmark heuristic
- [ ] 跑 execution benchmark mock fixture

### 建议 workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install
        run: bun install --frozen-lockfile

      - name: Type check
        run: bun run check

      - name: Test
        run: bun test

      - name: Coverage
        run: bun run coverage

      - name: Planning benchmark
        run: bun run braincode -- benchmark --heuristic

      - name: Execution benchmark
        run: bun run braincode -- benchmark --execute --task login-validation
```

### 验收标准

- [ ] GitHub main 分支显示 CI 状态
- [ ] README badge 改成真实 GitHub Actions badge
- [ ] `bun run check` 失败会阻止合并
- [ ] `bun test` 失败会阻止合并
- [ ] execution benchmark fixture 失败会阻止合并

---

## P0-2. 增加 `braincode doctor`

### 目标

降低新用户配置失败率。用户安装后先跑 `braincode doctor`，就能知道模型、API key、MCP、工具、checks、权限策略是否可用。

### CLI 设计

```bash
braincode doctor
braincode doctor --json
braincode doctor --project .
braincode doctor --mcp
braincode doctor --checks
```

### 检查项

#### 基础配置

- [ ] `~/.braincode/` 是否存在
- [ ] `settings.json` 是否存在且可解析
- [ ] `models.json` 是否存在且可解析
- [ ] `brains.json` 是否存在且可解析
- [ ] `tools.json` 是否存在且可解析
- [ ] `auth.json` 是否存在
- [ ] default brain id 是否存在
- [ ] active Brain Model 是否能 resolve `extends`

#### 模型配置

- [ ] routeBrain model 是否配置
- [ ] routeBrain provider 是否有 API key
- [ ] primary role model 是否配置
- [ ] fallback model 是否存在
- [ ] image input 需要 vision model 时是否有 vision-capable model
- [ ] imageMaker 是否配置 image API model
- [ ] text agent 是否误用了 image generation model

#### 本地工具

- [ ] git 是否可用
- [ ] rg 是否可用
- [ ] bun 是否可用
- [ ] npm / pnpm / yarn 是否可用
- [ ] 当前 project root 是否是 git repo
- [ ] local tools 是否被全部禁用

#### 权限策略

- [ ] `permissions.paths` 是否可解析
- [ ] `permissions.commands` 是否可解析
- [ ] deny 规则是否存在基础危险命令
- [ ] sensitive path 是否配置 review required
- [ ] `--yes` 是否不会绕过 deny

#### Checks

- [ ] package.json 是否存在
- [ ] check/typecheck/lint/test scripts 是否存在
- [ ] `.braincode/checks.json` 是否可解析
- [ ] project check policy 是否覆盖成功
- [ ] 当前 patch kind 是否能选出合理 checks

#### MCP

- [ ] user MCP 是否可读取
- [ ] project MCP 是否可读取
- [ ] project MCP server 是否要求 `trusted: true`
- [ ] stdio MCP 是否可 initialize
- [ ] HTTP MCP health check 是否成功
- [ ] SSE MCP health check 是否成功或明确提示限制

### human-readable 输出示例

```text
Braincode Doctor

Config:
  ✓ home: ~/.braincode
  ✓ settings.json
  ✓ brains.json
  ✓ models.json
  ✓ tools.json

Models:
  ✓ routeBrain: anthropic/claude-sonnet
  ✓ primary backend: anthropic/claude-sonnet
  ! imageMaker: not configured

Tools:
  ✓ git
  ✓ rg
  ✓ bun
  ✓ local tools enabled

Permissions:
  ✓ deny git push
  ✓ deny npm publish
  ✓ ask + review src/auth/**
  ✓ ask + review db/**

Checks:
  ✓ package manager: bun
  ✓ scripts: typecheck, test
  ✓ project policy: .braincode/checks.json

MCP:
  ✓ user tavily server configured
  ! project filesystem skipped: untrusted project MCP server

Result:
  Ready for read-only and edit runs.
```

### JSON 输出结构

```ts
type DoctorReport = {
  status: "ok" | "warning" | "error"
  config: DoctorCheck[]
  models: DoctorCheck[]
  tools: DoctorCheck[]
  permissions: DoctorCheck[]
  checks: DoctorCheck[]
  mcp: DoctorCheck[]
}

type DoctorCheck = {
  id: string
  status: "ok" | "warning" | "error" | "skipped"
  message: string
  fix?: string
}
```

### 验收标准

- [ ] 新用户配置错误时能看到明确 fix suggestion
- [ ] 缺 API key 时提示 `braincode config`
- [ ] MCP 慢或失败时不会误判整个项目不可用
- [ ] `--json` 可被 CI / issue template 使用

---

## P0-3. Benchmark 对比叙事

### 目标

证明 Braincode 的差异化价值，而不是只证明“能跑”。

当前 benchmark 已经有 planning benchmark 和 execution benchmark。下一步要加入对比维度：

```text
single-primary
vs
braincode-auto
vs
braincode-radical
```

### TODO

- [ ] 增加 `--mode single-primary`
- [ ] 增加 `--mode braincode-auto`
- [ ] 增加 `--mode braincode-radical`
- [ ] benchmark report 展示三列对比
- [ ] 输出 pass rate
- [ ] 输出 token usage
- [ ] 输出 tool calls
- [ ] 输出 duration
- [ ] 输出 checks status
- [ ] 输出 review decision correctness
- [ ] 输出 changed files correctness
- [ ] 输出 brain/primary token ratio
- [ ] 输出 review caught issue count

### CLI 设计

```bash
braincode benchmark --execute --compare
braincode benchmark --execute --compare --task login-validation
braincode benchmark --execute --compare --json
braincode benchmark --execute --compare --real
```

### 报告示例

```text
Braincode execution benchmark comparison

Task: login-validation

single-primary
  status: failed
  changed: src/login.ts
  checks: failed
  review: not run
  tokens: 18.2k
  duration: 51s

braincode-auto
  status: passed
  changed: src/login.ts
  checks: passed
  review: approved
  tokens: 32.7k
  brain/primary: 1.79x
  duration: 84s

braincode-radical
  status: passed
  changed: src/login.ts
  checks: passed
  review: approved
  tokens: 45.1k
  brain/primary: 2.48x
  duration: 76s

Conclusion:
  braincode-auto passed with independent review at 1.79x token overhead.
```

### 评价指标

```ts
type BenchmarkComparisonMetrics = {
  status: "passed" | "failed" | "skipped"
  changedFilesCorrect: boolean
  checksPassed: boolean
  reviewDecisionCorrect: boolean
  tokenUsage: number
  toolCallCount: number
  durationMs: number
  brainToPrimaryTokenRatio?: number
}
```

### 验收标准

- [ ] mock benchmark 可以稳定通过
- [ ] real benchmark 可以输出不稳定但真实的数据
- [ ] README 能展示一组对比结果
- [ ] 不把 mock benchmark 伪装成真实模型能力

---

# P1. 可维护性与协议稳定

## P1-1. 拆分 TUI

### 目标

避免 `apps/cli/src/tui.tsx` 成为新的大泥球。

### 建议目录

```text
apps/cli/src/tui/
  components/
    TranscriptEntryView.tsx
    FinalReportView.tsx
    ToolCallView.tsx
    ApprovalPanel.tsx
    PlanPreview.tsx
    IntentGraphView.tsx
    InputSurface.tsx
    StatusLine.tsx
    PetFooter.tsx

  formatters/
    final-report.ts
    plan.ts
    tools.ts
    usage.ts

  state/
    transcript-store.ts
    input-store.ts
    run-store.ts
    approval-store.ts

  hooks/
    useTerminalSize.ts
    useKeyboardShortcuts.ts
    useMouseScroll.ts
```

### 拆分顺序

- [ ] 提取 `formatTuiFinalReportCompact`
- [ ] 提取 `formatTuiFinalReportSections`
- [ ] 提取 `FinalReportView`
- [ ] 提取 `PlanPreview`
- [ ] 提取 `ApprovalPanel`
- [ ] 提取 `ToolCallView`
- [ ] 提取 transcript row badge/color logic
- [ ] 提取 input editor
- [ ] 保留 `tui.tsx` 作为组合入口

### 验收标准

- [ ] `apps/cli/src/tui.tsx` 行数明显下降
- [ ] final report formatter 有单独测试
- [ ] plan formatter 有单独测试
- [ ] approval panel policy summary 有单独测试
- [ ] 现有快捷键行为不变

---

## P1-2. FinalReport schema version

### 目标

`FinalReport` 已经成为 CLI、TUI、benchmark、session ledger 的共享协议。需要给它版本，避免后续破坏自动化脚本。

### TODO

- [ ] 增加 `version: 1`
- [ ] 定义 `FinalReportV1`
- [ ] session ledger 中记录 `final_report.version`
- [ ] `braincode run --json` 输出 version
- [ ] 增加 migration placeholder

### 建议类型

```ts
type FinalReportV1 = {
  version: 1
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
    confidence?: number
    reason?: string
    workers: FinalReportWorker[]
  }
  todos: FinalReportTodo[]
  patch?: PatchSummary
  checks?: PatchCheckSummary
  review?: ReviewDecision
  metrics?: FinalReportMetrics
  modelSummary: string
  warnings: string[]
}
```

### 验收标准

- [ ] `--json` 输出稳定可解析
- [ ] benchmark 消费 `FinalReportV1`
- [ ] TUI/CLI 都只依赖版本化字段
- [ ] 文档里说明 schema 兼容策略

---

## P1-3. Permission Policy v2 边界测试

### 目标

Permission Policy 是高风险模块，需要补强边界测试。

### 测试项

#### Path rules

- [ ] `src/auth/foo.ts`
- [ ] `src/auth/../auth/foo.ts`
- [ ] Windows 路径 `src\auth\foo.ts`
- [ ] symlink 指向 project 外
- [ ] patch 新增文件
- [ ] patch 删除文件
- [ ] patch rename
- [ ] patch binary file
- [ ] patch `/dev/null`
- [ ] quoted diff path
- [ ] space in filename
- [ ] unicode filename

#### Command rules

- [ ] `git push`
- [ ] `git    push`
- [ ] `npm publish`
- [ ] `pnpm publish`
- [ ] `bun publish`
- [ ] `rm -rf`
- [ ] `sudo rm -rf`
- [ ] `sh -c "git push"`
- [ ] `bash -lc "npm publish"`
- [ ] command with newline
- [ ] command with semicolon
- [ ] command with `&&`
- [ ] command with env prefix: `NODE_ENV=test npm publish`
- [ ] package script indirectly containing denied command

#### Approval mode

- [ ] read-only mode blocks write/execute
- [ ] allow-edits approves edit but blocks execute
- [ ] yes approves ask rules
- [ ] yes cannot bypass deny
- [ ] radical cannot bypass deny
- [ ] TUI approval panel shows matched policy summary

### 验收标准

- [ ] deny 规则不可绕过
- [ ] ask 规则可被 TUI/yes/radical 批准
- [ ] policy match 写入 tool result details
- [ ] review required path 会强制 review worker

---

# P2. 扩展能力与真实项目适配

## P2-1. Check Adapter 接口

### 目标

当前 checks 以 JS package scripts 为主。下一步抽象 check adapters，支持非 JS 项目。

### 设计

```ts
type CheckAdapter = {
  id: string
  detect(projectRoot: string): Promise<boolean>
  selectChecks(input: {
    projectRoot: string
    patchKind: PatchKind
    policy: CheckPolicy
  }): Promise<CheckCommand[]>
  run(command: CheckCommand): Promise<PatchCheckResult>
}

type CheckCommand = {
  name: string
  command: string
  args: string[]
  reason: string
}
```

### 第一阶段

- [ ] `js-package` adapter
- [ ] 保持现有 bun/pnpm/yarn/npm 行为
- [ ] `.braincode/checks.json` 继续可覆盖

### 第二阶段

- [ ] `go` adapter：`go test ./...`
- [ ] `rust` adapter：`cargo test`
- [ ] `python` adapter：`pytest` / `uv run pytest`
- [ ] `java` adapter：`mvn test` / `gradle test`

### 验收标准

- [ ] JS 项目行为不回退
- [ ] 非 JS 项目可以至少识别并提示 adapter missing
- [ ] final report 显示 adapter 和 reason

---

## P2-2. Review changes_requested 自动返工

### 目标

当前 review gate 能给出 `changes_requested`，但下一步可以让 Braincode 自动进入第二轮修复。

### 流程

```text
primary patch
→ checks
→ review
→ changes_requested
→ corrective primary run
→ checks again
→ review again
→ final report
```

### TODO

- [ ] 增加 `maxReviewIterations`
- [ ] 默认 auto 模式最多 1 次返工
- [ ] radical 模式最多 2 次返工
- [ ] review requiredChanges 作为 corrective prompt
- [ ] second patch summary 要区分 attempt
- [ ] final report 展示 review iteration count

### 风险控制

- [ ] 如果 second attempt 改动变大，强制人工确认
- [ ] 如果 checks 从 passed 变 failed，停止自动返工
- [ ] 如果 reviewer blocked，停止自动返工

### 验收标准

- [ ] reviewer 要求小修时可以自动修复
- [ ] 自动返工不会无限循环
- [ ] final report 说明每轮结果

---

## P2-3. Routing budget policy

### 目标

根据 token metrics 控制多 Agent 成本，避免小任务过度编排。

### TODO

- [ ] 增加 brain routing budget
- [ ] 对 tiny/docs-only 任务限制 support worker
- [ ] 对 auth/db/ci-risk 任务允许更高预算
- [ ] 如果上次同类任务 brain/primary ratio 太高，提示或降级 routing
- [ ] benchmark 输出 budget hit/miss

### 配置草案

```json
{
  "routingBudget": {
    "defaultMaxBrainToPrimaryTokenRatio": 2.5,
    "tinyTaskMaxWorkers": 1,
    "riskTaskMaxWorkers": 4,
    "warnWhenTokenRatioAbove": 3.0
  }
}
```

### 验收标准

- [ ] 小任务不会生成过多 worker
- [ ] 高风险任务仍可充分 review
- [ ] final report 出现 token ratio warning

---

## P2-4. 真实项目 dogfood 套件

### 目标

用 Braincode 自己作为测试项目，跑真实任务。

### 推荐任务

- [ ] 修改 README 文案
- [ ] 修一个真实 failing test
- [ ] 添加一个小工具单测
- [ ] 修改 permission policy
- [ ] 添加一个 CLI flag
- [ ] 修改 TUI formatter
- [ ] 添加 check adapter
- [ ] 修改 release workflow

### 每个 dogfood 记录

```text
task
mode
brain
models
patch
checks
review
tokens
tool calls
duration
manual intervention
result
```

### 验收标准

- [ ] 至少有 5 个 dogfood reports
- [ ] 能总结出 routing / review / checks 的真实收益
- [ ] README 或 docs 能展示真实案例

---

# P3. 文档与传播

## P3-1. 写一篇技术设计文档

### 文件

```text
docs/patch-engine.md
```

### 内容

- [ ] 为什么 Braincode 不是普通 AI CLI
- [ ] patch engine 链路
- [ ] runtime facts vs model summary
- [ ] Permission Policy v2
- [ ] smart checks
- [ ] review gate
- [ ] token-only metrics
- [ ] benchmark 方法

---

## P3-2. README 增加 benchmark 截图/文本

### TODO

- [ ] 添加 `benchmark --execute` 输出示例
- [ ] 添加 `run --allow-edits` final report 示例
- [ ] 添加 `doctor` 示例
- [ ] 添加 Safe Review Patch Demo 链接
- [ ] 添加 “Why not just use one coding agent?” 小节

### “Why not just use one coding agent?” 草稿

```md
Most coding agents let one model plan, edit, test, and review itself.

Braincode separates the workflow:

- routeBrain decides the role graph
- specialists inspect the code with isolated context
- the primary executor applies the patch
- checks run from runtime-owned policy
- review sees patch artifacts, not just the coder's explanation
- final report is built from runtime facts

This makes the final output auditable instead of purely conversational.
```

---

## P3-3. Issue templates

### TODO

- [ ] Bug report template
- [ ] Provider/model issue template
- [ ] MCP issue template
- [ ] Permission policy issue template
- [ ] Benchmark result template

### Benchmark issue template

```md
## Task

## Mode
- [ ] single-primary
- [ ] braincode-auto
- [ ] braincode-radical

## Result

## FinalReport JSON

## Expected

## Logs
```

---

# P4. 暂缓但保留的方向

## P4-1. PR Review Bot

未来可以把 Braincode 的 review gate 接到 GitHub PR：

```text
PR diff
→ review worker
→ checks summary
→ risk files
→ comments
```

近期不做，等 local patch engine 更稳定。

## P4-2. VS Code Extension

近期不做。CLI/TUI 先稳定。

## P4-3. Cloud / Team

近期不做。先把本地可信体验做好。

---

# 里程碑建议

## v0.2.7：Trust & Doctor

- [ ] CI
- [ ] doctor
- [ ] real GitHub badge
- [ ] FinalReport version
- [ ] CLI/TUI report polish

## v0.2.8：Benchmark Comparison

- [ ] benchmark compare
- [ ] single-primary baseline
- [ ] braincode-auto/radical comparison
- [ ] token ratio warning
- [ ] README benchmark example

## v0.2.9：TUI Maintainability

- [ ] TUI components split
- [ ] final report view split
- [ ] approval panel split
- [ ] plan preview split
- [ ] tests for formatters

## v0.3.0：Reliable Patch Engine

- [ ] permission edge cases
- [ ] check adapter interface
- [ ] review iteration v1
- [ ] dogfood reports
- [ ] patch-engine technical doc

---

# 一句话优先级

```text
先做 CI 和 doctor，让项目可信；
再做 benchmark compare，让差异可证明；
然后拆 TUI 和稳定 FinalReport，让项目可维护；
最后扩 check adapters 和 review iteration，让能力变强。
```
