import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Type } from "typebox"
import { appendSessionRecord, createBraincodeAuthEnvRef, ensureBraincodeHome, writeBrains, writeModels, writeProviderApiKey, writeSettings, type BraincodeBrains } from "@braincode/config"
import { collectMcpToolServers, collectPatchBaseline, collectPatchSummary, ContextHandoffRequiredError, createBraincodeAgentRuntime, createToolEvidenceCache, demoBenchmarkTasks, estimateProviderContextBytes, evaluateDemoBenchmarkPlan, executePromptFromConfig, expandPromptReferences, formatRoleModelCapabilityDirective, humanizeAgentRuntimeError, McpToolHub, normalizeReviewDecisionText, normalizeRouterDecision, normalizeRouterModelId, planRuntimeFromConfig, runConfiguredHooks, runDemoBenchmarkSuite, runPatchChecks, runPatchChecksWithApproval, selectRuntimeModel, type RuntimePlan, type ToolApprovalRequest } from "../src/index"

const TEST_ROLE_NAMES = ["routeBrain", "frontend", "backend", "designer", "imageMaker", "dba", "devops", "security", "qa", "review", "summarize", "oracle", "librarian", "rush", "pet"] as const

function createTestBrainDocument(modelId: string, fallbackModelIds: string[] = []): BraincodeBrains {
  const policy = { modelId, fallbackModelIds, thinkingLevel: "medium" as const }
  return {
    brains: [
      {
        id: "brain",
        name: "Brain",
        description: "Test brain",
        planner: policy,
        roles: Object.fromEntries(TEST_ROLE_NAMES.map((role) => [role, policy])),
        routing: {
          maxParallelAgents: 2,
          preferCheapModelForSimpleTasks: true,
          escalateOnUncertainty: true,
          requireReviewForFileEdits: true,
        },
        context: { maxInputTokens: 1000, compaction: "auto", isolation: "strict" },
      },
    ],
  }
}

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

test("collectMcpToolServers resolves Braincode auth env references", () => {
  const result = collectMcpToolServers({
    userMcp: {
      path: "/tmp/mcp.json",
      serverNames: ["tavily"],
      config: {
        mcpServers: {
          tavily: {
            command: "bunx",
            args: ["tavily-mcp@latest"],
            env: { TAVILY_API_KEY: createBraincodeAuthEnvRef("tavily") },
          },
        },
      },
    },
    auth: { providers: { tavily: { apiKey: "tvly-secret" } } },
  })

  expect(result.skipped).toEqual([])
  expect(result.servers[0]?.env).toEqual({ TAVILY_API_KEY: "tvly-secret" })
})

test("collectMcpToolServers skips MCP servers with unresolved auth refs", () => {
  const result = collectMcpToolServers({
    userMcp: {
      path: "/tmp/mcp.json",
      serverNames: ["tavily"],
      config: {
        mcpServers: {
          tavily: {
            command: "bunx",
            env: { TAVILY_API_KEY: createBraincodeAuthEnvRef("tavily") },
          },
        },
      },
    },
  })

  expect(result.servers).toEqual([])
  expect(result.skipped[0]?.reason).toContain("Missing API key")
})

test("collectMcpToolServers trusts user MCP but skips untrusted project MCP before auth resolution", () => {
  const userResult = collectMcpToolServers({
    userMcp: {
      path: "/tmp/user-mcp.json",
      serverNames: ["filesystem"],
      config: { mcpServers: { filesystem: { command: "filesystem-mcp" } } },
    },
  })
  expect(userResult.servers.map((server) => `${server.scope}:${server.name}`)).toEqual(["user:filesystem"])

  const projectResult = collectMcpToolServers({
    projectMcp: {
      path: "/tmp/project/.mcp.json",
      serverNames: ["filesystem"],
      config: {
        mcpServers: {
          filesystem: {
            command: "filesystem-mcp",
            env: { SECRET: createBraincodeAuthEnvRef("danger") },
          },
        },
      },
    },
    auth: { providers: {} },
  })
  expect(projectResult.servers).toEqual([])
  expect(projectResult.skipped).toEqual([
    { scope: "project", name: "filesystem", reason: "untrusted project MCP server" },
  ])

  const trustedProject = collectMcpToolServers({
    projectMcp: {
      path: "/tmp/project/.mcp.json",
      serverNames: ["filesystem"],
      config: {
        mcpServers: {
          filesystem: {
            command: "filesystem-mcp",
            trusted: true,
            env: { SECRET: createBraincodeAuthEnvRef("danger") },
          },
        },
      },
    },
    auth: { providers: { danger: { apiKey: "project-secret" } } },
  })
  expect(trustedProject.servers[0]?.env).toEqual({ SECRET: "project-secret" })
})

test("collectMcpToolServers lets project MCP shadow user MCP with the same server name", () => {
  const result = collectMcpToolServers({
    userMcp: {
      path: "/tmp/user-mcp.json",
      serverNames: ["filesystem"],
      config: { mcpServers: { filesystem: { command: "user-filesystem-mcp" } } },
    },
    projectMcp: {
      path: "/tmp/project/.mcp.json",
      serverNames: ["filesystem"],
      config: {
        mcpServers: {
          filesystem: { command: "project-filesystem-mcp", trusted: true },
        },
      },
    },
  })

  expect(result.servers.map((server) => `${server.scope}:${server.name}:${server.command}`)).toEqual([
    "project:filesystem:project-filesystem-mcp",
  ])
  expect(result.skipped).toEqual([
    { scope: "user", name: "filesystem", reason: "shadowed by project MCP server" },
  ])
})

test("collectMcpToolServers treats disabled project MCP as an explicit shadow over user MCP", () => {
  const result = collectMcpToolServers({
    userMcp: {
      path: "/tmp/user-mcp.json",
      serverNames: ["codebase-memory-mcp"],
      config: { mcpServers: { "codebase-memory-mcp": { command: "user-codebase-memory-mcp" } } },
    },
    projectMcp: {
      path: "/tmp/project/.mcp.json",
      serverNames: ["codebase-memory-mcp"],
      config: {
        mcpServers: {
          "codebase-memory-mcp": { command: "project-codebase-memory-mcp", disabled: true },
        },
      },
    },
  })

  expect(result.servers).toEqual([])
  expect(result.skipped).toEqual([
    { scope: "project", name: "codebase-memory-mcp", reason: "disabled" },
    { scope: "user", name: "codebase-memory-mcp", reason: "shadowed by project MCP server" },
  ])
})

test("McpToolHub surfaces MCP isError tool calls as failed tool executions", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-mcp-error-test-"))
  const serverScript = join(projectRoot, "server.js")
  await Bun.write(
    serverScript,
    [
      "const readline = require('node:readline');",
      "const rl = readline.createInterface({ input: process.stdin });",
      "function send(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n'); }",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') send(msg.id, { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'test' } });",
      "  else if (msg.method === 'tools/list') send(msg.id, { tools: [{ name: 'fail_tool', inputSchema: { type: 'object', properties: {} } }] });",
      "  else if (msg.method === 'tools/call') send(msg.id, { content: [{ type: 'text', text: 'boom' }], isError: true });",
      "});",
    ].join("\n"),
  )

  const hub = new McpToolHub()
  try {
    const report = await hub.connect([{ name: "test", scope: "user", command: "bun", args: [serverScript] }])
    expect(report.failed).toEqual([])
    const tool = hub.getTools().find((candidate) => candidate.name === "mcp__test__fail_tool")
    if (!tool) throw new Error("missing MCP tool")

    await expect(tool.execute("call-1", {} as never)).rejects.toThrow("boom")
  } finally {
    hub.shutdown()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("McpToolHub applies per-server connect timeouts", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-mcp-timeout-test-"))
  const serverScript = join(projectRoot, "server.js")
  await Bun.write(
    serverScript,
    [
      "const readline = require('node:readline');",
      "readline.createInterface({ input: process.stdin });",
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  )

  const hub = new McpToolHub()
  const startedAt = Date.now()
  try {
    const report = await hub.connect(
      [{ name: "slow", scope: "user", command: "bun", args: [serverScript] }],
      { perServerConnectTimeoutMs: 250 },
    )
    const elapsedMs = Date.now() - startedAt

    expect(report.connected).toEqual([])
    expect(report.failed[0]?.name).toBe("slow")
    expect(report.failed[0]?.error).toContain("initialize timeout")
    expect(elapsedMs).toBeLessThan(1500)
  } finally {
    hub.shutdown()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

// Minimal well-behaved stdio MCP server used by the hub-reuse tests below.
function writeEchoMcpServer(path: string, toolName: string): Promise<number> {
  return Bun.write(
    path,
    [
      "const readline = require('node:readline');",
      "const rl = readline.createInterface({ input: process.stdin });",
      "function send(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n'); }",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') send(msg.id, { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'test' } });",
      `  else if (msg.method === 'tools/list') send(msg.id, { tools: [{ name: '${toolName}', inputSchema: { type: 'object', properties: {} } }] });`,
      "  else if (msg.method === 'tools/call') send(msg.id, { content: [{ type: 'text', text: 'ok' }] });",
      "});",
    ].join("\n"),
  )
}

test("McpToolHub reuse: reports live cached servers as connected without re-listing", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-mcp-reuse-test-"))
  const serverScript = join(projectRoot, "server.js")
  await writeEchoMcpServer(serverScript, "echo")

  const hub = new McpToolHub()
  const server = { name: "test", scope: "user" as const, command: "bun", args: [serverScript] }
  try {
    const first = await hub.connect([server])
    expect(first.connected).toEqual([{ scope: "user", name: "test", toolCount: 1 }])

    // Second turn on the same hub: still reported connected, tools intact.
    const second = await hub.connect([server])
    expect(second.connected).toEqual([{ scope: "user", name: "test", toolCount: 1 }])
    expect(second.skipped).toEqual([])
    expect(hub.getTools().some((tool) => tool.name === "mcp__test__echo")).toBe(true)
  } finally {
    hub.shutdown()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("McpToolHub reuse: reconnects when a cached server's config changed", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-mcp-reconfig-test-"))
  const scriptA = join(projectRoot, "server-a.js")
  const scriptB = join(projectRoot, "server-b.js")
  await writeEchoMcpServer(scriptA, "tool_a")
  await writeEchoMcpServer(scriptB, "tool_b")

  const hub = new McpToolHub()
  try {
    await hub.connect([{ name: "test", scope: "user", command: "bun", args: [scriptA] }])
    expect(hub.getTools().some((tool) => tool.name === "mcp__test__tool_a")).toBe(true)

    // Same server name, different command args: the edited config must win.
    const report = await hub.connect([{ name: "test", scope: "user", command: "bun", args: [scriptB] }])
    expect(report.connected).toEqual([{ scope: "user", name: "test", toolCount: 1 }])
    expect(hub.getTools().some((tool) => tool.name === "mcp__test__tool_b")).toBe(true)
    expect(hub.getTools().some((tool) => tool.name === "mcp__test__tool_a")).toBe(false)
  } finally {
    hub.shutdown()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("McpToolHub reuse: prunes servers removed from config and drops their tools", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-mcp-prune-test-"))
  const serverScript = join(projectRoot, "server.js")
  await writeEchoMcpServer(serverScript, "echo")

  const hub = new McpToolHub()
  try {
    await hub.connect([{ name: "test", scope: "user", command: "bun", args: [serverScript] }])
    expect(hub.getTools().length).toBeGreaterThan(0)

    const pruned = hub.pruneRemovedServers([])
    expect(pruned).toBe(1)
    expect(hub.getTools()).toEqual([])

    // A later connect with the same config must reconnect from scratch.
    const report = await hub.connect([{ name: "test", scope: "user", command: "bun", args: [serverScript] }])
    expect(report.connected).toEqual([{ scope: "user", name: "test", toolCount: 1 }])
  } finally {
    hub.shutdown()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("McpToolHub reuse: a dead cached server is reconnected, not reported from cache", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-mcp-dead-test-"))
  const serverScript = join(projectRoot, "server.js")
  await writeEchoMcpServer(serverScript, "echo")

  const hub = new McpToolHub()
  const server = { name: "test", scope: "user" as const, command: "bun", args: [serverScript] }
  try {
    await hub.connect([server])
    // Kill the server child out-of-band (simulates a crash between turns).
    const records = (hub as unknown as { servers: Map<string, { connection: { child: { kill: () => void; pid?: number }; isAlive: () => boolean } }> }).servers
    const connection = [...records.values()][0]?.connection
    if (!connection) throw new Error("missing connection")
    connection.child.kill()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(connection.isAlive()).toBe(false)

    const report = await hub.connect([server])
    // Reconnected fresh: reported connected via a live handshake, and the
    // tool is backed by a working transport again.
    expect(report.connected).toEqual([{ scope: "user", name: "test", toolCount: 1 }])
    const tool = hub.getTools().find((candidate) => candidate.name === "mcp__test__echo")
    if (!tool) throw new Error("missing MCP tool after reconnect")
    const result = await tool.execute("call-1", {} as never) as { content: Array<{ text?: string }> }
    expect(result.content[0]?.text).toBe("ok")
  } finally {
    hub.shutdown()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("McpToolHub reuse: a second connect awaits an in-flight handshake instead of skipping", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-mcp-inflight-test-"))
  const serverScript = join(projectRoot, "server.js")
  await writeEchoMcpServer(serverScript, "echo")

  const hub = new McpToolHub()
  const server = { name: "test", scope: "user" as const, command: "bun", args: [serverScript] }
  try {
    // Simulates a turn that started a connect and returned early
    // (clarification / abort) without awaiting it: the next turn's connect
    // for the same server must wait out the in-flight handshake and report
    // it connected — never "skipped: already connecting" with zero tools.
    const firstTurn = hub.connect([server])
    const secondTurn = hub.connect([server])
    const [first, second] = await Promise.all([firstTurn, secondTurn])
    expect(first.connected).toEqual([{ scope: "user", name: "test", toolCount: 1 }])
    expect(second.skipped).toEqual([])
    expect(second.connected).toEqual([{ scope: "user", name: "test", toolCount: 1 }])
    expect(hub.getTools().some((tool) => tool.name === "mcp__test__echo")).toBe(true)
  } finally {
    hub.shutdown()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("normalizeRouterDecision does not inherit heuristic rush support for specialist routing", () => {
  const fallback = {
    primaryRole: "rush" as const,
    workers: [{
      role: "rush" as const,
      goal: "Handle the request when no specialist role has been chosen; escalate via handoff if it clearly belongs to a specialist.",
      reason: "Deterministic fallback used when no router decision is available.",
    }],
    todos: [],
    dependencies: [],
    requiresReview: false,
    reason: "Deterministic fallback plan.",
  }

  const decision = normalizeRouterDecision(
    {
      role: "librarian",
      todos: [
        { id: "gather-news", title: "Gather current news", role: "librarian" },
        { id: "todo-03-rush", title: "Handle fallback response", role: "rush" },
      ],
      workers: [{ role: "librarian", modelId: "custom/vision", goal: "Gather facts", reason: "Needs facts" }],
      dependencies: [
        { from: "todo-03-rush", to: "gather-news", reason: "fallback output feeds primary" },
      ],
      confidence: 0.92,
      reason: "current news requires external fact finding",
    },
    fallback,
    { maxWorkerAgents: 4, maxTodos: 8 },
  )

  expect(decision.primaryRole).toBe("librarian")
  expect(decision.workers[0]?.modelId).toBe("custom/vision")
  expect(decision.workers.map((worker) => worker.role)).toEqual(["librarian"])
  expect(decision.todos.map((todo) => [todo.id, todo.role])).toEqual([["gather-news", "librarian"]])
  expect(decision.dependencies).toEqual([])

  const modelDecision = normalizeRouterDecision(
    { role: "rush", modelId: "custom/vision" },
    fallback,
    { maxWorkerAgents: 4, maxTodos: 8 },
  )
  expect(modelDecision.modelId).toBe("custom/vision")
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

test("selectRuntimeModel skips text-only models when image input is required", () => {
  const selection = selectRuntimeModel(
    { modelId: "custom/text", fallbackModelIds: ["custom/vision"], thinkingLevel: "low" },
    [
      {
        id: "custom/text",
        provider: "custom-text",
        modelId: "text",
        name: "Text",
        api: "openai-completions",
        baseUrl: "http://localhost:9999/v1",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: "custom/vision",
        provider: "custom-vision",
        modelId: "vision",
        name: "Vision",
        api: "openai-completions",
        baseUrl: "http://localhost:9999/v1",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
      },
    ],
    { requiresVision: true },
  )

  expect(selection.configured.id).toBe("custom/vision")
})

test("selectRuntimeModel does not borrow unrelated catalog vision models for a role", () => {
  expect(() =>
    selectRuntimeModel(
      { modelId: "custom/text", thinkingLevel: "low" },
      [
        {
          id: "custom/text",
          provider: "custom-text",
          modelId: "text",
          name: "Text",
          api: "openai-completions",
          baseUrl: "http://localhost:9999/v1",
          contextWindow: 128000,
          supportsTools: true,
          supportsVision: false,
        },
        {
          id: "custom/vision",
          provider: "custom-vision",
          modelId: "vision",
          name: "Vision",
          api: "openai-completions",
          baseUrl: "http://localhost:9999/v1",
          contextWindow: 128000,
          supportsTools: true,
          supportsVision: true,
        },
      ],
      { requiresVision: true },
    ),
  ).toThrow("image input requires a vision-capable model")
})

test("selectRuntimeModel accepts an explicit vision model policy", () => {
  const selection = selectRuntimeModel(
    { modelId: "custom/vision", fallbackModelIds: [], thinkingLevel: "low" },
    [
      {
        id: "custom/text",
        provider: "custom-text",
        modelId: "text",
        name: "Text",
        api: "openai-completions",
        baseUrl: "http://localhost:9999/v1",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: "custom/vision",
        provider: "custom-vision",
        modelId: "vision",
        name: "Vision",
        api: "openai-completions",
        baseUrl: "http://localhost:9999/v1",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
      },
    ],
    { requiresVision: true },
  )

  expect(selection.configured.id).toBe("custom/vision")
})

test("normalizeRouterModelId stays inside the selected role policy chain", () => {
  const models = [
    {
      id: "custom/text",
      provider: "custom-text",
      modelId: "text",
      name: "Text",
      api: "openai-completions" as const,
      baseUrl: "http://localhost:9999/v1",
      contextWindow: 128000,
      supportsTools: true,
      supportsVision: false,
    },
    {
      id: "custom/brain-vision",
      provider: "custom-vision",
      modelId: "brain-vision",
      name: "Brain Vision",
      api: "openai-completions" as const,
      baseUrl: "http://localhost:9999/v1",
      contextWindow: 128000,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: "custom/unreferenced-vision",
      provider: "custom-vision",
      modelId: "unreferenced-vision",
      name: "Unreferenced Vision",
      api: "openai-completions" as const,
      baseUrl: "http://localhost:9999/v1",
      contextWindow: 128000,
      supportsTools: true,
      supportsVision: true,
    },
  ]

  expect(normalizeRouterModelId(undefined, models, { requiresVision: true }, undefined, new Set(["custom/text"]))).toBeUndefined()
  expect(normalizeRouterModelId("custom/brain-vision", models, { requiresVision: true }, undefined, new Set(["custom/text"]))).toBeUndefined()
  expect(normalizeRouterModelId("custom/unreferenced-vision", models, { requiresVision: true }, undefined, new Set(["custom/text", "custom/brain-vision"]))).toBeUndefined()
  expect(normalizeRouterModelId("custom/brain-vision", models, { requiresVision: true }, undefined, new Set(["custom/text", "custom/brain-vision"]))).toBe("custom/brain-vision")
})

test("selectRuntimeModel rejects text-only policies when image input has no vision fallback", () => {
  expect(() =>
    selectRuntimeModel(
      { modelId: "custom/text", thinkingLevel: "low" },
      [
        {
          id: "custom/text",
          provider: "custom-text",
          modelId: "text",
          name: "Text",
          api: "openai-completions",
          baseUrl: "http://localhost:9999/v1",
          contextWindow: 128000,
          supportsTools: true,
          supportsVision: false,
        },
      ],
      { requiresVision: true },
    ),
  ).toThrow("image input requires a vision-capable model")
})

test("selectRuntimeModel uses direct imageMaker image API config without models.json entry", () => {
  const selection = selectRuntimeModel(
    {
      modelId: "openai/gpt-image-2",
      thinkingLevel: "off",
      imageModel: {
        provider: "openai",
        modelId: "gpt-image-2",
        name: "GPT Image 2",
        baseUrl: "https://api.openai.com/v1",
        api: "openai-images",
      },
    },
    [],
    { requiresImageGeneration: true },
  )

  expect(selection.configured).toMatchObject({
    id: "openai/gpt-image-2",
    provider: "openai",
    modelId: "gpt-image-2",
    api: "openai-images",
    supportsImageGeneration: true,
  })
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

test("createBraincodeAgentRuntime auto-approves exposed tools in radical mode", async () => {
  const runtime = createBraincodeAgentRuntime({
    mode: "radical",
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
    args: { command: "git status --short" },
  } as never)

  expect(decision).toBeUndefined()
})

test("createBraincodeAgentRuntime enforces permission policy before approval mode", async () => {
  const runtime = createBraincodeAgentRuntime({
    mode: "radical",
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
    args: { command: "git push origin main" },
  } as never)

  expect(decision?.block).toBe(true)
  expect(decision?.reason).toContain("Permission policy denied")
})

test("createBraincodeAgentRuntime includes permission policy context in approval requests", async () => {
  let approvalRequest: ToolApprovalRequest | undefined
  let reviewRequired = false
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
    onPermissionPolicyEvaluation: (evaluation) => {
      reviewRequired = evaluation.reviewRequired
    },
    onToolApproval: (request) => {
      approvalRequest = request
      return { approved: true }
    },
  })

  const decision = await runtime.agent.beforeToolCall?.({
    toolCall: { id: "tool-call-1", name: "edit_file" },
    args: { path: "package.json", content: "{}" },
  } as never)

  expect(decision).toBeUndefined()
  expect(reviewRequired).toBe(true)
  expect(approvalRequest?.permissionPolicy).toMatchObject({
    action: "ask",
    reviewRequired: true,
  })
  expect(approvalRequest?.permissionPolicy?.matches[0]).toMatchObject({
    kind: "path",
    pattern: "package.json",
  })
})

test("createBraincodeAgentRuntime records tool approval decisions", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-tool-approval-audit-"))
  try {
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
      onToolApproval: () => ({ approved: true, reason: "ok", approver: "human" }),
      audit: { sessionId: "tool-approval-audit", home, phase: "primary", role: "backend", taskId: "task-1", parentId: "root-1", attempt: 1 },
    })

    const decision = await runtime.agent.beforeToolCall?.({
      toolCall: { id: "tool-call-1", name: "edit_file" },
      args: { path: "src/index.ts", content: "x" },
    } as never)

    expect(decision).toBeUndefined()
    const paths = await ensureBraincodeHome(home)
    const records = (await readFile(join(paths.sessions, "tool-approval-audit.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(records[0]).toMatchObject({
      type: "tool_approval_decision",
      toolCallId: "tool-call-1",
      toolName: "edit_file",
      decision: "approved",
      approver: "human",
      phase: "primary",
      role: "backend",
      taskId: "task-1",
      parentId: "root-1",
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("createBraincodeAgentRuntime reuses duplicate read-only tool evidence", async () => {
  let calls = 0
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
    toolEvidenceCache: createToolEvidenceCache(),
    tools: [
      {
        name: "read_file",
        label: "Read File",
        description: "test read",
        parameters: Type.Object({ path: Type.String() }),
        execute: async () => {
          calls += 1
          return { content: [{ type: "text", text: `read call ${calls}` }], details: { calls } }
        },
      },
    ],
  })

  const tool = runtime.agent.state.tools[0]
  if (!tool) throw new Error("missing wrapped tool")
  const first = await tool.execute("read-1", { path: "README.md" } as never)
  const second = await tool.execute("read-2", { path: "README.md" } as never)

  expect(calls).toBe(1)
  expect(first.content[0]?.type === "text" ? first.content[0].text : "").toBe("read call 1")
  expect(second.content[0]?.type === "text" ? second.content[0].text : "").toContain("Reusing cached read-only result")
  expect(second.content[0]?.type === "text" ? second.content[0].text : "").toContain("read call 1")
  expect((second.details as { evidenceCache?: { reused?: boolean; callCount?: number } }).evidenceCache).toMatchObject({
    reused: true,
    callCount: 2,
  })

  let repeated = second
  for (let index = 3; index <= 8; index++) {
    repeated = await tool.execute(`read-${index}`, { path: "README.md" } as never)
  }
  // Past the hard-block threshold the repeated call is intercepted (tool never
  // re-runs, content suppressed once the streak is long) and flagged blocked.
  const repeatedText = repeated.content[0]?.type === "text" ? repeated.content[0].text : ""
  expect(repeatedText).toContain("Blocked")
  expect(repeatedText).toContain("No new tool output is included")
  expect(repeatedText).not.toContain("read call 1")
  expect((repeated.details as { evidenceCache?: { blocked?: boolean } }).evidenceCache).toMatchObject({ blocked: true })
})

test("createBraincodeAgentRuntime invalidates evidence cache after shell calls", async () => {
  let readCalls = 0
  let shellCalls = 0
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
    toolEvidenceCache: createToolEvidenceCache(),
    tools: [
      {
        name: "read_file",
        label: "Read File",
        description: "test read",
        parameters: Type.Object({ path: Type.String() }),
        execute: async () => {
          readCalls += 1
          return { content: [{ type: "text", text: `read call ${readCalls}` }], details: { readCalls } }
        },
      },
      {
        name: "shell",
        label: "Shell",
        description: "test shell",
        parameters: Type.Object({ command: Type.String() }),
        execute: async () => {
          shellCalls += 1
          return { content: [{ type: "text", text: `shell call ${shellCalls}` }], details: { shellCalls } }
        },
      },
    ],
  })

  const readTool = runtime.agent.state.tools.find((tool) => tool.name === "read_file")
  const shellTool = runtime.agent.state.tools.find((tool) => tool.name === "shell")
  if (!readTool || !shellTool) throw new Error("missing wrapped tools")

  await readTool.execute("read-1", { path: "README.md" } as never)
  await shellTool.execute("shell-1", { command: "git status --short" } as never)
  const secondRead = await readTool.execute("read-2", { path: "README.md" } as never)

  expect(readCalls).toBe(2)
  expect(shellCalls).toBe(1)
  expect(secondRead.content[0]?.type === "text" ? secondRead.content[0].text : "").toContain("read call 2")
  expect(secondRead.content[0]?.type === "text" ? secondRead.content[0].text : "").not.toContain("Duplicate")
  expect((secondRead.details as { evidenceCache?: { callCount?: number; consecutiveCount?: number } }).evidenceCache).toMatchObject({
    callCount: 1,
    consecutiveCount: 1,
  })
})

test("humanizeAgentRuntimeError gives actionable provider configuration guidance", () => {
  expect(humanizeAgentRuntimeError(new Error("403 Kimi For Coding is currently only available for Coding Agents such as Kimi CLI, Claude Code, Roo Code, Kilo Code, etc."))).toContain("only accepts supported coding-agent clients")
  expect(humanizeAgentRuntimeError(new Error("Provider returned an empty assistant response from cliproxyapi/gpt-5.3-codex-spark via openai-responses."))).toContain("switching this model between `openai-responses` and `openai-completions`")
  expect(humanizeAgentRuntimeError(new Error("Model policy references no usable model. Tried: custom/text: image input requires a vision-capable model"))).toContain("marked as Vision-capable")
  expect(humanizeAgentRuntimeError(new ContextHandoffRequiredError({ estimatedBytes: 5_209_202, limitBytes: 2_097_152, sessionId: "session-1" }))).toContain("Context handoff required")
  expect(humanizeAgentRuntimeError(new Error('400 {"error":{"message":"total message size 5209202 exceeds limit 2097152"}}'))).toContain("Run `/handoff`")
})

test("estimateProviderContextBytes does not count raw image payloads across turns as handoff context", () => {
  const firstImageData = "a".repeat(5_000_000)
  const laterImageData = "b".repeat(5_000_000)
  const estimated = estimateProviderContextBytes(
    [
      {
        role: "user",
        content: [
          { type: "text", text: "what is in this image?" },
          { type: "image", data: firstImageData, mimeType: "image/png" },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "It is a screenshot." }],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "now compare this later image" },
          { type: "input_image", image_url: { url: `data:image/png;base64,${laterImageData}` } },
        ],
      },
    ] as never,
    "route the request",
  )

  expect(estimated).toBeLessThan(20_000)
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

test("runPatchChecksWithApproval skips command execution when approval is denied", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-checks-approval-test-"))
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-checks-approval-home-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        check: "bun -e \"await Bun.write('ran.txt', 'ran')\"",
      },
    }))

    const skipped = await runPatchChecksWithApproval(projectRoot, { timeoutMs: 10_000 }, {
      mode: "auto",
      sessionId: "approval-test",
      attempt: 1,
      onToolApproval: () => ({ approved: false, reason: "no commands", approver: "human" }),
      audit: { sessionId: "approval-test", home, phase: "primary", role: "backend", attempt: 1 },
    })

    expect(skipped.status).toBe("skipped")
    expect(skipped.reason).toContain("no commands")
    await expect(Bun.file(join(projectRoot, "ran.txt")).exists()).resolves.toBe(false)

    const passed = await runPatchChecksWithApproval(projectRoot, { timeoutMs: 10_000, maxOutputBytes: 4_000 }, {
      mode: "auto",
      sessionId: "approval-test",
      attempt: 2,
      onToolApproval: () => ({ approved: true, approver: "human" }),
      audit: { sessionId: "approval-test", home, phase: "primary", role: "backend", attempt: 2 },
    })

    expect(passed.status).toBe("passed")
    await expect(Bun.file(join(projectRoot, "ran.txt")).exists()).resolves.toBe(true)
    const paths = await ensureBraincodeHome(home)
    const records = (await readFile(join(paths.sessions, "approval-test.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(records.filter((record) => record.type === "tool_approval_decision").map((record) => [record.decision, record.approver])).toEqual([
      ["blocked", "human"],
      ["approved", "human"],
    ])
    expect(records.filter((record) => record.type === "tool_execution_summary").map((record) => record.event)).toEqual(["start", "end"])
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test("runPatchChecks uses npm when package-lock.json is present", async () => {
  const npmCheck = spawnSync("npm", ["--version"])
  if (npmCheck.status !== 0) return
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-npm-check-test-"))
  try {
    await Bun.write(join(projectRoot, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }))
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        check: "node -e \"console.log('npm check ok')\"",
      },
    }))

    const summary = await runPatchChecks(projectRoot, { timeoutMs: 10_000, maxOutputBytes: 4_000 })

    expect(summary.status).toBe("passed")
    expect(summary.results[0]?.command).toBe("npm")
    expect(summary.results[0]?.args).toEqual(["run", "check"])
    expect(summary.results[0]?.stdout).toContain("npm check ok")
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
    confidence: 0.73,
    rationale: "Patch is logically correct.",
    findings: [
      {
        severity: "high",
        file: "src/auth.ts",
        line: 42,
        evidence: "missing validation branch",
        issue: "Auth validation can be bypassed.",
        suggestion: "Validate before issuing the token.",
      },
    ],
    requiredChanges: [],
    blockingIssues: [],
    residualRisks: ["Manual auth flow not exercised."],
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
  expect(decision.confidence).toBe(0.73)
  expect(decision.rationale).toBe("Patch is logically correct.")
  expect(decision.findings[0]).toMatchObject({
    severity: "high",
    file: "src/auth.ts",
    line: 42,
    issue: "Auth validation can be bypassed.",
  })
  expect(decision.findings.at(-1)?.issue).toContain("Fix failing checks")
  expect(decision.requiredChanges[0]).toContain("test")
  expect(decision.residualRisks).toContain("Manual auth flow not exercised.")
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
  expect(decision.residualRisks).toEqual(["missing regression test"])
})

test("normalizeReviewDecisionText does not approve malformed review output without an explicit decision", () => {
  const decision = normalizeReviewDecisionText("looks fine to me", {
    summary: "looks fine to me",
    progress: { status: "completed" },
    risks: [],
    artifacts: [],
    nextQuestions: [],
  } as never)

  expect(decision.decision).toBe("changes_requested")
  expect(decision.requiredChanges[0]).toContain("explicit structured decision")
})

test("demo benchmark task catalog covers representative coding categories", () => {
  expect(new Set(demoBenchmarkTasks.map((task) => task.category))).toEqual(new Set([
    "readme-edit",
    "failing-test-fix",
    "auth-risk-change",
    "package-change",
    "security-review-only",
  ]))
  expect(new Set(demoBenchmarkTasks.map((task) => task.id)).size).toBe(demoBenchmarkTasks.length)
  expect(demoBenchmarkTasks.every((task) => task.prompt.trim().length > 0)).toBe(true)
})

test("evaluateDemoBenchmarkPlan scores router plans against benchmark expectations", () => {
  const task = demoBenchmarkTasks.find((candidate) => candidate.id === "auth-risk-change")
  if (!task) throw new Error("missing auth-risk-change task")

  const plan = {
    routing: { source: "router-brain" },
    role: "backend",
    workers: [
      { role: "security", todoIds: ["security-review"] },
      { role: "backend", todoIds: ["implement-auth"] },
      { role: "review", todoIds: ["review-auth"] },
    ],
    todos: [
      { id: "security-review", role: "security" },
      { id: "implement-auth", role: "backend" },
      { id: "review-auth", role: "review" },
    ],
    agentPlan: { requiresReview: true },
    context: { childContextIds: ["ctx-security", "ctx-backend", "ctx-review"] },
  } as RuntimePlan

  expect(evaluateDemoBenchmarkPlan(task, plan).filter((check) => check.status === "failed")).toEqual([])
})

test("evaluateDemoBenchmarkPlan skips specialist role checks for heuristic fallback", () => {
  const task = demoBenchmarkTasks.find((candidate) => candidate.id === "package-change")
  if (!task) throw new Error("missing package-change task")

  const plan = {
    routing: { source: "heuristic" },
    role: "rush",
    workers: [
      { role: "rush", todoIds: ["todo-01-rush"] },
      { role: "review", todoIds: ["todo-02-review"] },
    ],
    todos: [
      { id: "todo-01-rush", role: "rush" },
      { id: "todo-02-review", role: "review" },
    ],
    agentPlan: { requiresReview: true },
    context: { childContextIds: ["ctx-rush", "ctx-review"] },
  } as RuntimePlan

  const checks = evaluateDemoBenchmarkPlan(task, plan)
  expect(checks.find((check) => check.name === "primary_role")?.status).toBe("skipped")
  expect(checks.find((check) => check.name === "review_policy")?.status).toBe("passed")
})

test("runDemoBenchmarkSuite records plan runner failures", async () => {
  const result = await runDemoBenchmarkSuite(
    async () => {
      throw new Error("no planner")
    },
    { taskIds: ["readme-edit"], useRouterBrain: false },
  )

  expect(result.summary.totalTasks).toBe(1)
  expect(result.summary.failedTasks).toBe(1)
  expect(result.results[0]?.checks[0]?.name).toBe("plan_error")
  expect(result.results[0]?.error).toBe("no planner")
})

test("runConfiguredHooks runs explicitly trusted project hooks", async () => {
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
    expect(result.records[0]?.reason).toBeUndefined()
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

test("expandPromptReferences can skip session handoff briefs for heuristic previews", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-handoff-skip-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-handoff-skip-project-test-"))
  try {
    await appendSessionRecord("handoff-skip-test", {
      type: "run_start",
      prompt: "earlier task",
      plan: { brain: { id: "brain" }, role: "rush" },
      attempt: 1,
    }, home)
    await appendSessionRecord("handoff-skip-test", {
      type: "run_end",
      summary: "earlier summary",
      attempt: 1,
    }, home)
    await appendSessionRecord("handoff-skip-test", {
      type: "handoff",
      timestamp: Date.now(),
      summary: "BRIEF_MARKER cached handoff bullets",
      trigger: "manual",
    }, home)

    const result = await expandPromptReferences("continue from @@handoff-skip-test", projectRoot, home, { generateSessionHandoffs: false })

    expect(result.references[0]?.kind).toBe("session")
    expect(result.prompt).toContain("compact session context only")
    expect(result.prompt).toContain("earlier summary")
    expect(result.prompt).not.toContain("handoff brief")
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

test("planRuntimeFromConfig chooses a vision-capable model when prompt references an image", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-vision-plan-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-vision-plan-project-test-"))
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
            id: "custom/text",
            provider: "custom-text",
            modelId: "text",
            name: "Text",
            api: "openai-completions",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
            supportsVision: false,
          },
          {
            id: "custom/vision",
            provider: "custom-vision",
            modelId: "vision",
            name: "Vision",
            api: "openai-completions",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
            supportsVision: true,
          },
        ],
      },
      home,
    )
    await writeBrains(createTestBrainDocument("custom/text", ["custom/vision"]), home)
    const pngPath = join(projectRoot, "snap.png")
    await Bun.write(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    const plan = await planRuntimeFromConfig(`describe @${pngPath}`, home, { useRouterBrain: false, projectRoot })

    expect(plan.model.id).toBe("custom/vision")
    expect(plan.workers.every((worker) => worker.model.id === "custom/vision")).toBe(true)
    expect(plan.routing.source).toBe("heuristic")
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("planRuntimeFromConfig does not borrow a catalog vision model outside the selected role policy", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-vision-catalog-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-vision-catalog-project-test-"))
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
            id: "custom/text",
            provider: "custom-text",
            modelId: "text",
            name: "Text",
            api: "openai-completions",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
            supportsVision: false,
          },
          {
            id: "custom/vision",
            provider: "custom-vision",
            modelId: "vision",
            name: "Vision",
            api: "openai-completions",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
            supportsVision: true,
          },
        ],
      },
      home,
    )
    await writeBrains(createTestBrainDocument("custom/text"), home)
    const pngPath = join(projectRoot, "snap.png")
    await Bun.write(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    await expect(planRuntimeFromConfig(`describe @${pngPath}`, home, { useRouterBrain: false, projectRoot })).rejects.toThrow("image input requires a vision-capable model")
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("planRuntimeFromConfig requires routeBrain instead of heuristic fallback for image routing", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-vision-router-required-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-vision-router-required-project-test-"))
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
            id: "custom/text",
            provider: "custom-text",
            modelId: "text",
            name: "Text",
            api: "openai-completions",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
            supportsVision: false,
          },
          {
            id: "custom/brain-vision",
            provider: "custom-vision",
            modelId: "brain-vision",
            name: "Brain Vision",
            api: "openai-completions",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
            supportsVision: true,
          },
        ],
      },
      home,
    )
    const textPolicy = { modelId: "custom/text", fallbackModelIds: [], thinkingLevel: "low" as const }
    const routerPolicy = { modelId: "custom/brain-vision", fallbackModelIds: [], thinkingLevel: "medium" as const }
    await writeBrains(
      {
        brains: [
          {
            id: "brain",
            name: "Brain",
            description: "Test brain",
            planner: routerPolicy,
            roles: {
              ...Object.fromEntries(TEST_ROLE_NAMES.map((role) => [role, textPolicy])),
              routeBrain: routerPolicy,
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
    const pngPath = join(projectRoot, "snap.png")
    await Bun.write(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    await expect(planRuntimeFromConfig(`describe @${pngPath}`, home, { projectRoot })).rejects.toThrow("routeBrain failed before image routing could complete")
    await expect(planRuntimeFromConfig(`describe @${pngPath}`, home, { projectRoot })).rejects.toThrow("missing API key for provider 'custom-vision'")
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("formatRoleModelCapabilityDirective tells routeBrain which roles can receive image input", () => {
  const testBrain = createTestBrainDocument("custom/text").brains[0] as ReturnType<typeof createTestBrainDocument>["brains"][number] & { roles: Record<string, unknown> }
  testBrain.planner = { modelId: "custom/unreferenced-vision", fallbackModelIds: [], thinkingLevel: "medium" }
  testBrain.roles.oracle = { modelId: "custom/vision", fallbackModelIds: [], thinkingLevel: "high" }
  const directive = formatRoleModelCapabilityDirective(
    testBrain as never,
    [
      {
        id: "custom/text",
        provider: "custom-text",
        modelId: "text",
        name: "Text",
        api: "openai-completions",
        baseUrl: "http://localhost:9999/v1",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: "custom/vision",
        provider: "custom-vision",
        modelId: "vision",
        name: "Vision",
        api: "openai-completions",
        baseUrl: "http://localhost:9999/v1",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: "custom/unreferenced-vision",
        provider: "custom-vision",
        modelId: "unreferenced-vision",
        name: "Unreferenced Vision",
        api: "openai-completions",
        baseUrl: "http://localhost:9999/v1",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
      },
    ],
    [{ type: "image", data: "abc", mimeType: "image/png" }],
  )

  expect(directive).toContain("custom/vision: vision")
  expect(directive).not.toContain("custom/unreferenced-vision")
  expect(directive).toContain("rush: default chain custom/text; default chain cannot receive image input")
  expect(directive).toContain("oracle: default chain custom/vision; default chain can receive image input")
  expect(directive).toContain("Do not rebind a role to the planner model or to another role's model")
})

test("planRuntimeFromConfig supports routeBrain previews and heuristic diagnostics", async () => {
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
              imageMaker: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "off" },
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

    const plan = await planRuntimeFromConfig("review this patch", home, { useRouterBrain: false })

    expect(plan.mode).toBe("radical")
    // Heuristic diagnostics now route obvious patch review work to the review specialist.
    expect(plan.role).toBe("review")
    expect(plan.workers.map((worker) => worker.role)).toEqual(["review"])
    expect(plan.todos.map((todo) => [todo.role, todo.status])).toEqual([["review", "pending"]])
    expect(plan.context.layer).toBe("brain")
    expect(plan.context.childContextIds).toEqual(plan.workers.map((worker) => worker.contextId))
    expect(plan.toolExecution).toBe("parallel")
    expect(plan.routing.configuredMaxParallelAgents).toBe(2)
    expect(plan.routing.maxParallelAgents).toBe(4)
    expect(plan.routing.maxWorkerAgents).toBe(4)
    expect(plan.routing.maxTodos).toBe(8)
    expect(plan.piModel.name).toBe("Claude Sonnet 4.5")
    expect(plan.routing.source).toBe("heuristic")
    expect(plan.routing.reason).toBe("heuristic diagnostic; router brain not requested")

    const routerPreview = await planRuntimeFromConfig("review this patch", home)
    expect(routerPreview.routing.source).toBe("heuristic")
    expect(routerPreview.routing.reason).toBe("router brain unavailable or failed")
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("executePromptFromConfig pauses before workers when intent needs clarification", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-clarification-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-clarification-project-"))
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
            id: "custom/text",
            provider: "custom",
            modelId: "text",
            name: "Text",
            api: "openai-responses",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
          },
        ],
      },
      home,
    )
    await writeBrains(createTestBrainDocument("custom/text"), home)

    const result = await executePromptFromConfig({
      prompt: "优化一下",
      projectRoot,
      mcpLoadingStrategy: "eager",
      mcpStartupBudgetMs: 0,
    }, home)

    expect(result.finalReport.status).toBe("needs_clarification")
    expect(result.summary).toContain("需要先确认")
    expect(result.workerResults).toEqual([])
    expect(result.plan.agentPlan.clarification?.required).toBe(true)
    expect(result.plan.todos.every((todo) => todo.status === "blocked")).toBe(true)
    expect(result.finalReport.clarification?.options.map((option) => option.id)).toEqual([
      "make-scoped-change",
      "plan-first",
      "provide-details",
    ])
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("executePromptFromConfig records execution plan review before write-capable provider execution", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-plan-review-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-runtime-plan-review-project-"))
  const sessionId = "plan-review-test"
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
            id: "custom/text",
            provider: "custom",
            modelId: "text",
            name: "Text",
            api: "openai-responses",
            baseUrl: "http://127.0.0.1:9/v1",
            contextWindow: 128000,
            supportsTools: true,
          },
        ],
      },
      home,
    )
    await writeBrains(createTestBrainDocument("custom/text"), home)
    await writeProviderApiKey("custom", "test-key", home)

    await expect(executePromptFromConfig({
      prompt: "hello",
      sessionId,
      projectRoot,
      forceRoles: ["rush"],
      localToolMode: "read-write",
      onToolApproval: () => ({ approved: true }),
      mcpLoadingStrategy: "eager",
      mcpStartupBudgetMs: 0,
    }, home)).rejects.toThrow()

    const paths = await ensureBraincodeHome(home)
    const records = (await readFile(join(paths.sessions, `${sessionId}.jsonl`), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    const reviewIndex = records.findIndex((record) => record.type === "execution_plan_review")
    const runStartIndex = records.findIndex((record) => record.type === "run_start")
    const reviewRecord = records[reviewIndex]

    expect(reviewIndex).toBeGreaterThanOrEqual(0)
    expect(runStartIndex).toBeGreaterThan(reviewIndex)
    expect(reviewRecord.status).toBe("approved")
    expect(reviewRecord.proposedSideEffects.map((effect: { kind: string }) => effect.kind)).toEqual(["file_edit", "patch"])
    expect(reviewRecord.validationPlan.checks).toEqual(["smart package-script selection"])
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
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
              imageMaker: { modelId: "anthropic/claude-sonnet-4-5-20250929", thinkingLevel: "off" },
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

    // No usable router in tests → deterministic fallback still decomposes the
    // cross-domain login task into primary/support/review contexts.
    expect(plan.role).toBe("frontend")
    expect(plan.agentPlan.workers.map((worker) => worker.role)).toEqual(["frontend", "librarian", "backend", "security"])
    expect(plan.workers.map((worker) => worker.role)).toEqual(["frontend", "librarian", "backend", "security", "review"])
    expect(plan.context.childContextIds).toEqual(plan.workers.map((worker) => worker.contextId))
    expect(new Set(plan.context.childContextIds).size).toBe(plan.workers.length)
    expect(plan.todos.map((todo) => [todo.id, todo.role])).toEqual([
      ["map-context", "librarian"],
      ["assess-security", "security"],
      ["build-backend", "backend"],
      ["build-frontend", "frontend"],
      ["todo-05-review", "review"],
    ])
    expect(plan.dependencies).toContainEqual({ fromTodoId: "build-backend", toTodoId: "build-frontend", reason: "Frontend integration depends on the backend API contract." })
    expect(plan.dependencies).toContainEqual({ fromTodoId: "build-frontend", toTodoId: "todo-05-review", reason: "Review runs after implementation output exists." })
    expect(plan.dependencies.some((dependency) => dependency.fromTodoId === "build-frontend" && dependency.toTodoId === "build-backend")).toBe(false)
    expect(plan.workers.find((worker) => worker.role === "review")?.todoIds).toEqual(["todo-05-review"])
    expect(plan.workers.find((worker) => worker.role === "frontend")?.model.id).toBe("anthropic/claude-sonnet-4-5-20250929")
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

test("executePromptFromConfig does not use unrelated configured models as runtime fallback", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-runtime-no-global-fallback-test-"))
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
            id: "custom/text",
            provider: "custom-text",
            modelId: "text",
            name: "Text",
            api: "openai-completions",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
          },
          {
            id: "custom/unrelated",
            provider: "custom-unrelated",
            modelId: "unrelated",
            name: "Unrelated",
            api: "openai-completions",
            baseUrl: "http://localhost:9999/v1",
            contextWindow: 128000,
            supportsTools: true,
          },
        ],
      },
      home,
    )
    await writeBrains(createTestBrainDocument("custom/text"), home)
    await writeProviderApiKey("custom-unrelated", "unrelated-key", home)

    await expect(executePromptFromConfig({ prompt: "hello" }, home)).rejects.toThrow("custom/text: missing API key for provider 'custom-text'")
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
