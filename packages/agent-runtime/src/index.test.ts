import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendSessionRecord, writeBrains, writeModels, writeSettings } from "@braincode/config"
import { createBraincodeAgentRuntime, executePromptFromConfig, expandPromptReferences, planRuntimeFromConfig, runConfiguredHooks, selectRuntimeModel } from "./index"

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
      plan: { brain: { id: "brain" }, role: "coding" },
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
      plan: { brain: { id: "brain" }, role: "coding" },
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
      plan: { brain: { id: "brain" }, role: "coding" },
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
              coding: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              research: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
              review: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              summarize: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "low" },
              fastReply: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "minimal" },
              oracle: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
              librarian: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
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
    expect(plan.role).toBe("review")
    expect(plan.workers.map((worker) => worker.role)).toEqual(["review"])
    expect(plan.todos.map((todo) => [todo.role, todo.status])).toEqual([["review", "pending"]])
    expect(plan.toolExecution).toBe("parallel")
    expect(plan.piModel.name).toBe("Claude Sonnet 4.5")
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
              coding: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "medium" },
              review: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "high" },
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

    expect(plan.role).toBe("coding")
    expect(plan.agentPlan.workers.map((worker) => worker.role)).toEqual(["coding", "frontend"])
    expect(plan.workers.map((worker) => worker.role)).toEqual(["coding", "frontend", "review"])
    expect(plan.todos.map((todo) => todo.role)).toEqual(["coding", "frontend", "review"])
    expect(plan.workers.find((worker) => worker.role === "review")?.todoIds).toEqual(["todo-03-review"])
    expect(plan.workers.find((worker) => worker.role === "frontend")?.model.id).toBe("anthropic/claude-sonnet-4-5-20250929")
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
