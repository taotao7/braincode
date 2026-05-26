import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeBrains, writeModels, writeSettings } from "@braincode/config"
import { createBraincodeAgentRuntime, executePromptFromConfig, planRuntimeFromConfig, selectRuntimeModel } from "./index"

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
    expect(plan.toolExecution).toBe("parallel")
    expect(plan.piModel.name).toBe("Claude Sonnet 4.5")
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
