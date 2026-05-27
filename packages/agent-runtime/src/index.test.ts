import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendSessionRecord, writeBrains, writeModels, writeSettings } from "@braincode/config"
import { collectPatchBaseline, collectPatchSummary, createBraincodeAgentRuntime, executePromptFromConfig, expandPromptReferences, normalizeReviewDecisionText, planRuntimeFromConfig, runConfiguredHooks, runPatchChecks, selectRuntimeModel } from "./index"

test("selectRuntimeModel rejects unknown configured model ids before runtime execution", () => {
  expect(() =>
    selectRuntimeModel(
      { modelId: "missing", thinkingLevel: "low" },
      [
        {
          id: "known",
          provider: "anthropic",
          modelId: "claude-sonnet-4-5-20250929",
          name: "Claude Sonnet 4.5",
          contextWindow: 200000,
          supportsTools: true,
        },
      ],
    ),
  ).toThrow("Model policy references no usable model")
})

test("selectRuntimeModel falls back when the primary model is unavailable", () => {
  const selection = selectRuntimeModel(
    { modelId: "missing", fallbackModelIds: ["known"], thinkingLevel: "low" },
    [
      {
        id: "known",
        provider: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
        contextWindow: 200000,
        supportsTools: true,
      },
    ],
  )

  expect(selection.configured.id).toBe("known")
})

test("createBraincodeAgentRuntime normalizes minimal thinking for OpenAI-compatible models", () => {
  const runtime = createBraincodeAgentRuntime({
    mode: "auto",
    systemPrompt: "test",
    model: {
      id: "custom/fast",
      provider: "custom",
      modelId: "fast",
      name: "Fast",
      api: "openai-responses",
      baseUrl: "http://localhost:9999/v1",
      contextWindow: 128000,
      supportsTools: true,
    },
    policy: { modelId: "custom/fast", thinkingLevel: "minimal" },
  })

  expect(runtime.agent.state.thinkingLevel).toBe("low")
})

test("createBraincodeAgentRuntime blocks risky tools when no approval callback exists", async () => {
  const runtime = createBraincodeAgentRuntime({
    mode: "auto",
    systemPrompt: "test",
    model: {
      id: "custom/fast",
      provider: "custom",
      modelId: "fast",
      name: "Fast",
      api: "openai-responses",
      baseUrl: "http://localhost:9999/v1",
      contextWindow: 128000,
      supportsTools: true,
    },
    policy: { modelId: "custom/fast", thinkingLevel: "low" },
  })

  const decision = await runtime.agent.beforeToolCall?.({
    toolCall: { id: "tool-call-1", name: "shell" },
    args: { command: "echo hi" },
  } as never)

  expect(decision?.block).toBe(true)
  expect(decision?.reason).toContain("approval callback is required")
})

test("collectPatchSummary captures changed files and diff stats", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-patch-summary-test-"))
  try {
    expect(spawnSync("git", ["init"], { cwd: projectRoot }).status).toBe(0)
    await Bun.write(join(projectRoot, "tracked.txt"), "before\n")
    expect(spawnSync("git", ["add", "tracked.txt"], { cwd: projectRoot }).status).toBe(0)
    expect(spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"], { cwd: projectRoot }).status).toBe(0)

    await Bun.write(join(projectRoot, "tracked.txt"), "after\n")
    await Bun.write(join(projectRoot, "new.txt"), "new\n")

    const summary = await collectPatchSummary(projectRoot)

    expect([...(summary?.changedFiles ?? [])].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: "new.txt", status: "??" },
      { path: "tracked.txt", status: "M" },
    ])
    expect(summary?.diffStats.filesChanged).toBe(2)
    expect(summary?.diffStats.insertions).toBe(1)
    expect(summary?.diffStats.deletions).toBe(1)
    expect(summary?.diffStats.untrackedFiles).toBe(1)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("collectPatchSummary separates baseline changes and includes staged stats", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-patch-baseline-test-"))
  try {
    expect(spawnSync("git", ["init"], { cwd: projectRoot }).status).toBe(0)
    await Bun.write(join(projectRoot, "preexisting.txt"), "clean\n")
    await Bun.write(join(projectRoot, "after.txt"), "clean\n")
    expect(spawnSync("git", ["add", "."], { cwd: projectRoot }).status).toBe(0)
    expect(spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"], { cwd: projectRoot }).status).toBe(0)

    await Bun.write(join(projectRoot, "preexisting.txt"), "dirty before run\n")
    const baseline = await collectPatchBaseline(projectRoot)

    await Bun.write(join(projectRoot, "after.txt"), "changed after baseline\n")
    await Bun.write(join(projectRoot, "staged.txt"), "staged\n")
    expect(spawnSync("git", ["add", "staged.txt"], { cwd: projectRoot }).status).toBe(0)
    await Bun.write(join(projectRoot, "untracked.txt"), "untracked\n")

    const summary = await collectPatchSummary(projectRoot, baseline)

    expect([...(summary?.changedFiles ?? [])].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: "after.txt", status: "M" },
      { path: "staged.txt", status: "A" },
      { path: "untracked.txt", status: "??" },
    ])
    expect(summary?.preExistingChangedFiles).toEqual([{ path: "preexisting.txt", status: "M" }])
    expect(summary?.diffStats.stagedRaw).toContain("1 file changed")
    expect(summary?.diffStats.untrackedFiles).toBe(1)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("runPatchChecks discovers package scripts and captures failures", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-checks-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        check: "bun -e \"console.log('check ok')\"",
        lint: "bun -e \"console.error('lint failed'); process.exit(2)\"",
      },
    }))

    const summary = await runPatchChecks(projectRoot, { timeoutMs: 10_000, maxOutputBytes: 4_000 })

    expect(summary.status).toBe("failed")
    expect(summary.results.map((result) => [result.name, result.status])).toEqual([
      ["check", "passed"],
      ["lint", "failed"],
    ])
    expect(summary.results[0]?.stdout).toContain("check ok")
    expect(summary.results[1]?.stderr).toContain("lint failed")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("runPatchChecks skips projects without recognized check scripts", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-checks-skip-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "bun --version" } }))

    const summary = await runPatchChecks(projectRoot)

    expect(summary.status).toBe("skipped")
    expect(summary.reason).toContain("no check")
    expect(summary.results).toEqual([])
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("runPatchChecks supports configured script selection and disabled checks", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-checks-config-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        check: "bun -e \"console.log('default check')\"",
        custom: "bun -e \"console.log('custom check')\"",
      },
    }))

    const configured = await runPatchChecks(projectRoot, {
      scripts: ["custom"],
      timeoutMs: 10_000,
      maxOutputBytes: 4_000,
    })
    const disabled = await runPatchChecks(projectRoot, { enabled: false })

    expect(configured.status).toBe("passed")
    expect(configured.results.map((result) => result.name)).toEqual(["custom"])
    expect(configured.results[0]?.stdout).toContain("custom check")
    expect(disabled.status).toBe("skipped")
    expect(disabled.reason).toContain("disabled")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("normalizeReviewDecisionText parses typed decisions and gates failed checks", () => {
  const review = {
    summary: "No code issue found.",
    progress: { status: "completed" },
    risks: [],
    artifacts: [],
    nextQuestions: [],
  } as never
  const decision = normalizeReviewDecisionText(JSON.stringify({
    decision: "approved",
    rationale: "Patch is logically correct.",
    requiredChanges: [],
    blockingIssues: [],
  }), review, {
    status: "failed",
    results: [
      {
        name: "test",
        command: "bun",
        args: ["run", "test"],
        status: "failed",
        exitCode: 1,
        signal: null,
        durationMs: 10,
        stdout: "",
        stderr: "failed",
        timedOut: false,
      },
    ],
  })

  expect(decision.decision).toBe("changes_requested")
  expect(decision.rationale).toBe("Patch is logically correct.")
  expect(decision.requiredChanges[0]).toContain("test")
})

test("normalizeReviewDecisionText falls back to risks when decision is missing", () => {
  const decision = normalizeReviewDecisionText("plain review", {
    summary: "Found an issue.",
    progress: { status: "completed" },
    risks: ["missing regression test"],
    artifacts: [],
    nextQuestions: [],
  } as never)

  expect(decision.decision).toBe("changes_requested")
  expect(decision.rationale).toBe("Found an issue.")
})

test("runConfiguredHooks executes trusted project command hooks", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-hook-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-hook-project-test-"))
  try {
    await mkdir(join(projectRoot, ".agents"), { recursive: true })
    const hookScript = join(projectRoot, "prompt-hook.js")
    await Bun.write(
      hookScript,
      [
        "let input = '';",
        "process.stdin.on('data', (chunk) => input += chunk);",
        "process.stdin.on('end', () => {",
        "  const event = JSON.parse(input);",
        "  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event.hook_event_name, additionalContext: `checked ${event.prompt}` } }));",
        "});",
      ].join("\n"),
    )
    await Bun.write(
      join(projectRoot, ".agents", "hooks.json"),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: "command",
                  command: `bun ${JSON.stringify(hookScript)}`,
                  trusted: true,
                  timeout: 5,
                },
              ],
            },
          ],
        },
      }),
    )

    const result = await runConfiguredHooks(
      "UserPromptSubmit",
      { prompt: "hello" },
      { sessionId: "hook-test", cwd: projectRoot, home, model: "test-model" },
    )

    expect(result.blockedReason).toBeUndefined()
    expect(result.additionalContext).toEqual(["checked hello"])
    expect(result.records[0]?.status).toBe("completed")
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("expandPromptReferences inlines compact session references", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-session-ref-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-session-ref-project-test-"))
  try {
    await appendSessionRecord("session-ref-test", {
      type: "run_start",
      prompt: "old task",
      plan: { brain: { id: "brain" }, role: "rush" },
      attempt: 1,
    }, home)
    await appendSessionRecord("session-ref-test", {
      type: "run_end",
      summary: "old summary",
      attempt: 1,
    }, home)

    const result = await expandPromptReferences("continue from @@session-ref-test", projectRoot, home)

    expect(result.references[0]?.kind).toBe("session")
    expect(result.references[0]?.sessionId).toBe("session-ref-test")
    expect(result.prompt).toContain("Session reference @@session-ref-test")
    expect(result.prompt).toContain("old task")
    expect(result.prompt).toContain("old summary")
    expect(result.prompt).toContain("compact session context only")
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("expandPromptReferences reuses a cached handoff brief without re-summarizing", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-handoff-cache-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-handoff-cache-project-test-"))
  try {
    await appendSessionRecord("handoff-cache-test", {
      type: "run_start",
      prompt: "earlier task",
      plan: { brain: { id: "brain" }, role: "rush" },
      attempt: 1,
    }, home)
    await appendSessionRecord("handoff-cache-test", {
      type: "run_end",
      summary: "earlier summary",
      attempt: 1,
    }, home)
    await appendSessionRecord("handoff-cache-test", {
      type: "handoff",
      timestamp: Date.now(),
      summary: "BRIEF_MARKER cached handoff bullets",
      trigger: "manual",
    }, home)

    const result = await expandPromptReferences("continue from @@handoff-cache-test", projectRoot, home)

    expect(result.references[0]?.kind).toBe("session")
    expect(result.prompt).toContain("handoff brief")
    expect(result.prompt).toContain("BRIEF_MARKER cached handoff bullets")
    expect(result.prompt).not.toContain("compact session context only")
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("expandPromptReferences regenerates a handoff if newer activity supersedes the cached brief", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-handoff-stale-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-handoff-stale-project-test-"))
  try {
    await appendSessionRecord("handoff-stale-test", {
      type: "handoff",
      timestamp: Date.now() - 1000,
      summary: "STALE_MARKER older brief",
      trigger: "manual",
    }, home)
    await appendSessionRecord("handoff-stale-test", {
      type: "run_start",
      prompt: "new activity after handoff",
      plan: { brain: { id: "brain" }, role: "rush" },
      attempt: 1,
    }, home)
    await appendSessionRecord("handoff-stale-test", {
      type: "run_end",
      summary: "new activity summary",
      attempt: 1,
    }, home)

    const result = await expandPromptReferences("continue from @@handoff-stale-test", projectRoot, home)

    // ensureSessionHandoff will attempt to regenerate; without API keys in the test env it throws.
    // The fallback path uses formatSessionContext, which exposes the mechanical context marker
    // and does NOT inline the stale brief as if it were fresh.
    expect(result.prompt).toContain("compact session context only")
    expect(result.prompt).not.toContain("handoff brief:\nSession handoff-stale-test")
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("expandPromptReferences attaches supported images as base64 ImageContent", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-image-ref-project-test-"))
  try {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03])
    const pngPath = join(projectRoot, "snap.png")
    await Bun.write(pngPath, pngBytes)

    const result = await expandPromptReferences(`look at @${pngPath}`, projectRoot)

    expect(result.references[0]?.kind).toBe("image")
    expect(result.images).toHaveLength(1)
    expect(result.images[0]?.type).toBe("image")
    expect(result.images[0]?.mimeType).toBe("image/png")
    expect(result.images[0]?.data).toBe(pngBytes.toString("base64"))
    expect(result.prompt).toContain("attached to this message")
    expect(result.prompt).not.toContain("could not be inlined")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("expandPromptReferences keeps unsupported image formats as text-only references", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-image-svg-test-"))
  try {
    const svgPath = join(projectRoot, "diagram.svg")
    await Bun.write(svgPath, "<svg xmlns=\"http://www.w3.org/2000/svg\"/>")

    const result = await expandPromptReferences(`see @${svgPath}`, projectRoot)

    expect(result.references[0]?.kind).toBe("image")
    expect(result.images).toHaveLength(0)
    expect(result.prompt).toContain("format not inlineable as image")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("planRuntimeFromConfig loads settings, brain, and model without executing a provider call", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-test-"))
  try {
    await writeSettings(
      {
        version: 1,
        mode: "radical",
        configServer: { host: "127.0.0.1", port: 14580 },
        defaultBrainId: "brain",
      },
      home,
    )
    await writeModels(
      {
        models: [
          {
            id: "anthropic/claude-sonnet-4-5-20250929",
            provider: "anthropic",
            modelId: "claude-sonnet-4-5-20250929",
            name: "Claude Sonnet 4.5",
            contextWindow: 200000,
            supportsTools: true,
          },
        ],
      },
      home,
    )
    await writeBrains(
      {
        brains: [
          {
            id: "brain",
            name: "Brain",
            description: "Test brain",
            planner: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
            roles: {
              routeBrain: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              frontend: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              backend: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              designer: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              dba: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              devops: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              security: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              qa: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
              review: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              summarize: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
              oracle: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              librarian: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              rush: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
              pet: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "minimal" },
            },
            routing: {
              maxParallelAgents: 2,
              preferCheapModelForSimpleTasks: true,
              escalateOnUncertainty: true,
              requireReviewForFileEdits: true,
            },
            context: { maxInputTokens: 1000, compaction: "auto", isolation: "strict" },
          },
        ],
      },
      home,
    )

    const plan = await planRuntimeFromConfig("review this patch", home)

    expect(plan.mode).toBe("radical")
    // No LLM router available in tests → planAgentRouting falls back to rush.
    // The real LLM-driven routeBrain (in production) picks the right specialist.
    expect(plan.role).toBe("rush")
    expect(plan.workers.map((worker) => worker.role)).toEqual(["rush"])
    expect(plan.todos.map((todo) => [todo.role, todo.status])).toEqual([["rush", "pending"]])
    expect(plan.context.layer).toBe("brain")
    expect(plan.context.childContextIds).toEqual(plan.workers.map((worker) => worker.contextId))
    expect(plan.toolExecution).toBe("parallel")
    expect(plan.routing.configuredMaxParallelAgents).toBe(2)
    expect(plan.routing.maxParallelAgents).toBe(4)
    expect(plan.routing.maxWorkerAgents).toBe(4)
    expect(plan.routing.maxTodos).toBe(8)
    expect(plan.piModel.name).toBe("Claude Sonnet 4.5")
    expect(plan.routing.source).toBe("heuristic")
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("planRuntimeFromConfig exposes isolated worker plans and mandatory review", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-workers-test-"))
  try {
    await writeSettings(
      {
        version: 1,
        mode: "auto",
        configServer: { host: "127.0.0.1", port: 14580 },
        defaultBrainId: "brain",
      },
      home,
    )
    await writeModels(
      {
        models: [
          {
            id: "anthropic/claude-sonnet-4-5-20250929",
            provider: "anthropic",
            modelId: "claude-sonnet-4-5-20250929",
            name: "Claude Sonnet 4.5",
            contextWindow: 200000,
            supportsTools: true,
          },
        ],
      },
      home,
    )
    await writeBrains(
      {
        brains: [
          {
            id: "brain",
            name: "Brain",
            description: "Test brain",
            planner: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
            roles: {
              routeBrain: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              frontend: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              backend: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              designer: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              dba: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              devops: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              security: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              qa: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
              review: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              summarize: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
              oracle: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              librarian: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              rush: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
              pet: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "minimal" },
            },
            routing: {
              maxParallelAgents: 2,
              preferCheapModelForSimpleTasks: true,
              escalateOnUncertainty: true,
              requireReviewForFileEdits: true,
            },
            context: { maxInputTokens: 1000, compaction: "auto", isolation: "strict" },
          },
        ],
      },
      home,
    )

    const plan = await planRuntimeFromConfig("implement a secure frontend login flow", home)

    // No LLM router in tests → deterministic rush fallback. Because the prompt
    // contains "implement" (file-edit risk pattern), brain policy injects a
    // review worker automatically.
    expect(plan.role).toBe("rush")
    expect(plan.agentPlan.workers.map((worker) => worker.role)).toEqual(["rush"])
    expect(plan.workers.map((worker) => worker.role)).toEqual(["rush", "review"])
    expect(plan.context.childContextIds).toEqual(plan.workers.map((worker) => worker.contextId))
    expect(new Set(plan.context.childContextIds).size).toBe(plan.workers.length)
    expect(plan.todos.map((todo) => todo.role)).toEqual(["rush", "review"])
    expect(plan.dependencies.map((dependency) => [dependency.fromTodoId, dependency.toTodoId])).toEqual([
      ["todo-01-rush", "todo-02-review"],
    ])
    expect(plan.workers.find((worker) => worker.role === "review")?.todoIds).toEqual(["todo-02-review"])
    expect(plan.workers.find((worker) => worker.role === "rush")?.model.id).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(plan.routing.maxParallelAgents).toBe(2)
    expect(plan.routing.maxWorkerAgents).toBe(2)
    expect(plan.routing.maxTodos).toBe(6)
    expect(plan.routing.source).toBe("heuristic")
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("executePromptFromConfig fails clearly before provider execution when auth is missing", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-auth-test-"))
  try {
    await expect(executePromptFromConfig({ prompt: "hello" }, home)).rejects.toThrow("No usable model with API key")
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
