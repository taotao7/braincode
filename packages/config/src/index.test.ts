import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, expect, test } from "bun:test"
import { agentRoleSystemPrompts } from "@braincode/brain"
import { appendSessionRecord, ensureBraincodeHome, extractMcpServerEntries, getBraincodePaths, getProjectSupportPaths, getProviderApiKey, getProviderOAuthCredentials, getUserSupportPaths, normalizeHooks, readAuthStatus, readBrains, readHookSources, readModels, readProjectSupport, readProviderApiKey, readSessionContext, readSettings, readTools, readUserSupport, setHookHandlerEnabled, setMcpServerDisabled, writeBrains, writeModels, writeProviderApiKey, writeProviderOAuthCredentials, writeSettings, writeTools } from "./index"

const tempHomes: string[] = []

async function makeTempHome() {
  const home = await mkdtemp(join(tmpdir(), "braincode-config-test-"))
  tempHomes.push(home)
  return home
}

afterEach(async () => {
  await Promise.all(tempHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

test("ensureBraincodeHome creates config files and directories", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await expect(Bun.file(paths.settings).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.auth).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.brains).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.models).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.tools).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.hooks).exists()).resolves.toBe(true)

  expect((await stat(paths.sessions)).isDirectory()).toBe(true)
  expect((await stat(paths.logs)).isDirectory()).toBe(true)
  expect((await stat(paths.cache)).isDirectory()).toBe(true)
})

test("path helpers derive user and project support locations", async () => {
  const home = await makeTempHome()
  const root = await mkdtemp(join(tmpdir(), "braincode-config-paths-project-"))
  try {
    const braincodePaths = getBraincodePaths(home)
    const projectPaths = getProjectSupportPaths(root)
    const userPaths = getUserSupportPaths(home)

    expect(braincodePaths.tools).toBe(join(home, "tools.json"))
    expect(projectPaths.agents).toBe(join(root, "AGENTS.md"))
    expect(projectPaths.skills).toBe(join(root, ".agents", "skill"))
    expect(userPaths.mcp).toBe(join(home, "mcp.json"))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("MCP server entries can be listed and toggled disabled", async () => {
  const home = await makeTempHome()
  const filePath = join(home, "mcp.json")
  await Bun.write(filePath, JSON.stringify({
    servers: {
      zeta: { command: "zeta" },
      alpha: { command: "alpha" },
    },
  }))

  expect(extractMcpServerEntries({ servers: { b: { command: "b" }, a: { command: "a" } } }).map((entry) => entry.name)).toEqual(["a", "b"])

  await setMcpServerDisabled(filePath, "alpha", true)
  let parsed = JSON.parse(await Bun.file(filePath).text())
  expect(parsed.servers.alpha.disabled).toBe(true)

  await setMcpServerDisabled(filePath, "alpha", false)
  parsed = JSON.parse(await Bun.file(filePath).text())
  expect(parsed.servers.alpha.disabled).toBeUndefined()
  await expect(setMcpServerDisabled(filePath, "missing", true)).rejects.toThrow("not found")
  await expect(setMcpServerDisabled(join(home, "missing.json"), "alpha", true)).rejects.toThrow("MCP config not found")

  const emptyPath = join(home, "empty-mcp.json")
  await Bun.write(emptyPath, JSON.stringify({ servers: null }))
  await expect(setMcpServerDisabled(emptyPath, "alpha", true)).rejects.toThrow("has no 'mcpServers' map")
})

test("normalizeHooks keeps trusted command metadata and filters invalid groups", () => {
  const hooks = normalizeHooks({
    hooks: {
      Stop: [
        {
          matcher: "done",
          hooks: [
            {
              command: "echo stop",
              commandWindows: "cmd /c echo stop",
              command_windows: "cmd /c echo stop",
              timeout: 2,
              statusMessage: "Stopping",
              async: true,
              trusted: true,
            },
            null,
          ],
        },
        { hooks: [] },
      ],
      NotAnEvent: [{ hooks: [{ command: "ignored" }] }],
    },
  })

  const handler = hooks.hooks.Stop?.[0]?.hooks[0]
  expect(hooks.hooks.Stop).toHaveLength(1)
  expect(hooks.hooks.UserPromptSubmit).toBeUndefined()
  expect(handler?.command).toBe("echo stop")
  expect(handler?.commandWindows).toBe("cmd /c echo stop")
  expect(handler?.command_windows).toBe("cmd /c echo stop")
  expect(handler?.timeout).toBe(2)
  expect(handler?.statusMessage).toBe("Stopping")
  expect(handler?.async).toBe(true)
  expect(handler?.trusted).toBe(true)
})

test("readProjectSupport discovers AGENTS, MCP config, and local skills", async () => {
  const projectRoot = await makeTempHome()
  await Bun.write(join(projectRoot, "AGENTS.md"), "Use Bun for scripts.\n")
  await Bun.write(
    join(projectRoot, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        filesystem: { command: "bunx", args: ["mcp-filesystem"] },
      },
    }),
  )
  await mkdir(join(projectRoot, ".agents", "skill", "docs"), { recursive: true })
  await Bun.write(join(projectRoot, ".agents", "skill", "docs", "SKILL.md"), "# Docs skill\nSummarize project docs.\n")

  const support = await readProjectSupport(projectRoot)

  expect(support.agents?.content).toContain("Use Bun")
  expect(support.mcp?.serverNames).toEqual(["filesystem"])
  expect(support.skills.map((skill) => skill.id)).toEqual(["docs"])
  expect(support.skills[0]?.content).toContain("Docs skill")
})

test("readHookSources discovers user and project hook config", async () => {
  const home = await makeTempHome()
  const projectRoot = await makeTempHome()
  const homePaths = await ensureBraincodeHome(home)
  await mkdir(join(projectRoot, ".agents"), { recursive: true })
  await Bun.write(
    homePaths.hooks,
    JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo user", trusted: true }] }],
      },
    }),
  )
  await Bun.write(
    join(projectRoot, ".agents", "hooks.json"),
    JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "echo project", trusted: true }] }],
      },
    }),
  )

  const sources = await readHookSources(home, projectRoot)

  expect(sources.map((source) => source.kind)).toEqual(["user", "project"])
  expect(sources[0]?.document.hooks.UserPromptSubmit?.[0]?.hooks[0]?.trusted).toBe(true)
  expect(sources[1]?.document.hooks.Stop?.[0]?.hooks[0]?.trusted).toBe(false)
})

test("setHookHandlerEnabled toggles handlers and validates indexes", async () => {
  const home = await makeTempHome()
  const hooksPath = join(home, "hooks.json")
  await Bun.write(hooksPath, JSON.stringify({
    hooks: {
      Stop: [{ matcher: "done", hooks: [{ command: "echo done", enabled: true }] }],
    },
  }))

  await setHookHandlerEnabled(hooksPath, "Stop", 0, 0, false)
  let parsed = JSON.parse(await Bun.file(hooksPath).text())
  expect(parsed.hooks.Stop[0].hooks[0].enabled).toBe(false)

  await expect(setHookHandlerEnabled(join(home, "missing-hooks.json"), "Stop", 0, 0, true)).rejects.toThrow("hooks file not found")
  await expect(setHookHandlerEnabled(hooksPath, "UserPromptSubmit", 0, 0, true)).rejects.toThrow("hook group not found")
  await expect(setHookHandlerEnabled(hooksPath, "Stop", 0, 1, true)).rejects.toThrow("hook handler not found")

  await setHookHandlerEnabled(hooksPath, "Stop", 0, 0, true)
  parsed = JSON.parse(await Bun.file(hooksPath).text())
  expect(parsed.hooks.Stop[0].hooks[0].enabled).toBe(true)
})

test("readUserSupport discovers user MCP config and skills", async () => {
  const home = await makeTempHome()
  await Bun.write(
    join(home, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        browser: { command: "browser-mcp" },
      },
    }),
  )
  await mkdir(join(home, "skills"), { recursive: true })
  await Bun.write(join(home, "skills", "review.md"), "# Review skill\n")

  const support = await readUserSupport(home)

  expect(support.mcp?.serverNames).toEqual(["browser"])
  expect(support.skills.map((skill) => skill.id)).toEqual(["review"])
})

test("default tool configuration enables local coding tools with approval for writes and execution", async () => {
  const home = await makeTempHome()
  const tools = await readTools(home)

  expect(tools.tools.map((tool) => tool.name)).toEqual([
    "list_files",
    "read_file",
    "search_files",
    "edit_file",
    "apply_patch",
    "exec_command",
    "write_stdin",
    "shell",
    "git_diff",
    "get_changed_files",
    "run_script",
  ])
  expect(tools.tools.find((tool) => tool.name === "list_files")?.enabled).toBe(true)
  expect(tools.tools.find((tool) => tool.name === "read_file")?.enabled).toBe(true)
  expect(tools.tools.find((tool) => tool.name === "search_files")?.enabled).toBe(true)
  expect(tools.tools.find((tool) => tool.name === "edit_file")?.enabled).toBe(true)
  expect(tools.tools.find((tool) => tool.name === "edit_file")?.approvalPolicy).toBe("confirm-dangerous")
  expect(tools.tools.find((tool) => tool.name === "apply_patch")?.approvalPolicy).toBe("confirm-dangerous")
  expect(tools.tools.find((tool) => tool.name === "exec_command")?.approvalPolicy).toBe("confirm-dangerous")
  expect(tools.tools.find((tool) => tool.name === "write_stdin")?.approvalPolicy).toBe("confirm-dangerous")
  expect(tools.tools.find((tool) => tool.name === "shell")?.approvalPolicy).toBe("confirm-dangerous")
  expect(tools.tools.find((tool) => tool.name === "git_diff")?.approvalPolicy).toBe("allow")
  expect(tools.tools.find((tool) => tool.name === "get_changed_files")?.approvalPolicy).toBe("allow")
  expect(tools.tools.find((tool) => tool.name === "run_script")?.approvalPolicy).toBe("confirm-dangerous")
  expect(tools.checks).toEqual({
    enabled: true,
    scripts: [],
    timeoutMs: 180_000,
    maxOutputBytes: 24_000,
  })
})

test("legacy tool approval fields migrate to approval policies", async () => {
  const home = await makeTempHome()
  await writeTools(
    {
      tools: [
        {
          name: "shell",
          description: "Run shell commands in the current project workspace.",
          permissions: ["execute"],
          risk: "high",
          defaultEnabled: false,
          requiresApproval: true,
          enabled: true,
        } as never,
      ],
    },
    home,
  )

  const tools = await readTools(home)
  expect(tools.tools.find((tool) => tool.name === "shell")?.enabled).toBe(true)
  expect(tools.tools.find((tool) => tool.name === "shell")?.approvalPolicy).toBe("confirm-dangerous")
})

test("settings can be read and written from an explicit home", async () => {
  const home = await makeTempHome()
  const settings = await readSettings(home)

  const nextSettings = {
    ...settings,
    mode: "radical" as const,
    configServer: {
      ...settings.configServer,
      port: 18080,
    },
    defaultBrainId: "local-test",
  }

  await writeSettings(nextSettings, home)

  await expect(readSettings(home)).resolves.toEqual(nextSettings)
})

test("readSettings migrates legacy default brain id", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)
  const settings = await readSettings(home)
  await Bun.write(paths.settings, JSON.stringify({ ...settings, defaultBrainId: "default" }))

  const migrated = await readSettings(home)

  expect(migrated.defaultBrainId).toBe("brain")
  expect(JSON.parse(await Bun.file(paths.settings).text()).defaultBrainId).toBe("brain")
})

test("readSettings removes legacy manual theme preference", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)
  const settings = await readSettings(home)
  await Bun.write(paths.settings, JSON.stringify({ ...settings, theme: "light" }))

  const migrated = await readSettings(home)
  const stored = JSON.parse(await Bun.file(paths.settings).text())

  expect("theme" in migrated).toBe(false)
  expect("theme" in stored).toBe(false)
})

test("non-secret config documents can be read and written from an explicit home", async () => {
  const home = await makeTempHome()

  await writeBrains({ brains: [{ id: "brain" }] }, home)
  await writeModels({ models: [{ id: "fast" }] }, home)
  await writeTools(
    {
      tools: [
        {
          name: "read_file",
          description: "Read files inside the current project workspace.",
          permissions: ["read"],
          risk: "low",
          defaultEnabled: true,
          approvalPolicy: "allow",
          enabled: false,
        },
      ],
    },
    home,
  )

  await expect(readBrains(home)).resolves.toEqual({ brains: [{ id: "brain" }] })
  await expect(readModels(home)).resolves.toEqual({ models: [{ id: "fast" }] })
  const tools = await readTools(home)
  expect(tools.tools.find((tool) => tool.name === "read_file")?.enabled).toBe(false)
  expect(tools.tools.find((tool) => tool.name === "shell")?.enabled).toBe(true)
  expect(tools.checks?.enabled).toBe(true)
})

test("readModels migrates legacy OpenAI chat completions API ids", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await Bun.write(
    paths.models,
    JSON.stringify({
      models: [
        {
          id: "proxy/gemini",
          provider: "proxy",
          modelId: "gemini",
          api: "openai-chat-completions",
        },
      ],
    }),
  )

  const models = await readModels(home)
  expect((models.models[0] as { api?: string }).api).toBe("openai-completions")

  const stored = JSON.parse(await Bun.file(paths.models).text()) as { models: Array<{ api?: string }> }
  expect(stored.models[0]?.api).toBe("openai-completions")
})

test("readBrains migrates obsolete roles and stale default system prompts", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await Bun.write(
    paths.brains,
    JSON.stringify({
      brains: [
        {
          id: "brain",
          planner: {
            modelId: "planner",
            thinkingLevel: "xhigh",
            systemPrompt: "You are Braincode's route brain.\nPrefer coding as the primary role whenever the user asks to implement.",
          },
          roles: {
            routeBrain: {
              modelId: "planner",
              thinkingLevel: "xhigh",
              systemPrompt: "You are Braincode's route brain.\nPrefer coding as the primary role whenever the user asks to implement.",
            },
            coding: { modelId: "coding", thinkingLevel: "medium" },
            fastReply: { modelId: "fast", thinkingLevel: "minimal" },
            research: { modelId: "research", thinkingLevel: "low" },
            librarian: {
              modelId: "librarian",
              thinkingLevel: "high",
              systemPrompt: "You are Braincode's librarian agent.\nOwn codebase understanding: map unfamiliar repositories, locate relevant modules and symbols, trace relationships, and explain how pieces fit together.",
            },
            rush: {
              modelId: "rush",
              thinkingLevel: "low",
              systemPrompt: "You are Braincode's rush agent.\nOwn odd jobs and quick one-off chores that do not fit a specialist role.",
            },
            summarize: { modelId: "summarize", thinkingLevel: "low" },
          },
        },
      ],
    }),
  )

  const brains = await readBrains(home)
  const brain = brains.brains[0] as { planner?: { systemPrompt?: string }; roles?: Record<string, { systemPrompt?: string }> }

  expect(brain.roles?.coding).toBeUndefined()
  expect(brain.roles?.fastReply).toBeUndefined()
  expect(brain.roles?.research).toBeUndefined()
  expect(brain.planner?.systemPrompt).toBe(agentRoleSystemPrompts.routeBrain)
  expect(brain.roles?.routeBrain?.systemPrompt).toBe(agentRoleSystemPrompts.routeBrain)
  expect(brain.roles?.librarian?.systemPrompt).toBe(agentRoleSystemPrompts.librarian)
  expect(brain.roles?.rush?.systemPrompt).toBe(agentRoleSystemPrompts.rush)
  expect(brain.roles?.pet?.systemPrompt).toBe(agentRoleSystemPrompts.pet)
})

test("auth status lists configured provider names without returning secrets", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await Bun.write(paths.auth, JSON.stringify({ providers: { anthropic: { apiKey: "secret" } } }))

  await expect(readAuthStatus(home)).resolves.toEqual({
    configuredProviders: ["anthropic"],
    providerAuth: [{ provider: "anthropic", kind: "api-key" }],
  })
})

test("writeProviderApiKey trims provider and key and ignores empty keys", async () => {
  const home = await makeTempHome()

  await writeProviderApiKey(" anthropic ", " key ", home)
  await writeProviderApiKey("openai", "   ", home)

  expect(await readProviderApiKey("anthropic", home)).toBe("key")
  expect(await readProviderApiKey("openai", home)).toBeUndefined()
  await expect(writeProviderApiKey(" ", "key", home)).rejects.toThrow("provider is required")
})

test("getProviderApiKey supports string and object auth entries", () => {
  expect(getProviderApiKey({ providers: { anthropic: "sk-ant" } }, "anthropic")).toBe("sk-ant")
  expect(getProviderApiKey({ providers: { anthropic: { apiKey: "sk-ant-object" } } }, "anthropic")).toBe("sk-ant-object")
  expect(getProviderApiKey({ providers: { anthropic: { token: "not-supported" } } }, "anthropic")).toBeUndefined()
})

test("provider OAuth credentials are stored without returning secrets in status", async () => {
  const home = await makeTempHome()
  const expires = Date.now() + 60000

  await writeProviderOAuthCredentials(" openai-codex ", " openai-codex ", { access: "access", refresh: "refresh", expires, accountId: "acct" }, home)

  const auth = JSON.parse(await Bun.file(getBraincodePaths(home).auth).text())
  expect(auth.providers["openai-codex"].oauth.credentials.access).toBe("access")
  expect(getProviderOAuthCredentials(auth, "openai-codex")).toEqual({
    providerId: "openai-codex",
    credentials: { access: "access", refresh: "refresh", expires, accountId: "acct" },
  })
  await expect(readAuthStatus(home)).resolves.toEqual({
    configuredProviders: ["openai-codex"],
    providerAuth: [{ provider: "openai-codex", kind: "oauth", oauthProviderId: "openai-codex", expires }],
  })
  await expect(writeProviderOAuthCredentials(" ", "openai-codex", { access: "access", refresh: "refresh", expires }, home)).rejects.toThrow("provider is required")
})

test("non-secret config documents must keep their top-level arrays", async () => {
  const home = await makeTempHome()

  await expect(writeBrains({} as never, home)).rejects.toThrow("brains.json must contain a brains array")
  await expect(writeModels({} as never, home)).rejects.toThrow("models.json must contain a models array")
  await expect(writeTools({} as never, home)).rejects.toThrow("tools.json must contain a tools array")
})

test("appendSessionRecord writes jsonl session records", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await appendSessionRecord("test-session", { type: "run_start", prompt: "hello" }, home)

  const text = await Bun.file(join(paths.sessions, "test-session.jsonl")).text()
  expect(text.trim()).toContain('"type":"run_start"')
  await expect(appendSessionRecord("../escape", { type: "run_start", prompt: "bad" }, home)).rejects.toThrow("sessionId may only contain")
})

test("readSessionContext returns compact session records", async () => {
  const home = await makeTempHome()

  await appendSessionRecord("context-session", {
    type: "run_start",
    prompt: "implement feature",
    plan: { brain: { id: "brain" }, role: "frontend" },
    attempt: 1,
  }, home)
  await appendSessionRecord("context-session", {
    type: "worker_end",
    phase: "support",
    worker: "librarian",
    result: { status: "blocked", summary: "needs API docs" },
    attempt: 1,
  }, home)
  await appendSessionRecord("context-session", {
    type: "todo_update",
    phase: "support",
    role: "librarian",
    status: "completed",
    todos: [{ id: "todo-01-librarian", title: "Find prior work", role: "librarian", status: "completed" }],
    summary: "found relevant prior work",
  }, home)
  await appendSessionRecord("context-session", {
    type: "check_summary",
    status: "failed",
    results: [
      { name: "check", status: "passed", exitCode: 0, durationMs: 12 },
      { name: "test", status: "failed", exitCode: 1, durationMs: 34 },
    ],
    attempt: 1,
  }, home)
  await appendSessionRecord("context-session", {
    type: "review_decision",
    decision: "changes_requested",
    rationale: "tests failed",
    requiredChanges: ["fix failing test"],
    blockingIssues: [],
    attempt: 1,
  }, home)
  await appendSessionRecord("context-session", {
    type: "run_end",
    summary: "implemented feature",
    attempt: 1,
  }, home)

  const context = await readSessionContext("context-", home)

  expect(context?.sessionId).toBe("context-session")
  expect(context?.prompt).toBe("implement feature")
  expect(context?.summary).toBe("implemented feature")
  expect(context?.entries.map((entry) => entry.type)).toEqual(["worker", "todo", "check", "review", "run"])
  expect(context?.entries.find((entry) => entry.type === "worker")?.status).toBe("blocked")
  expect(context?.entries.find((entry) => entry.type === "todo")?.status).toBe("completed")
  expect(context?.entries.find((entry) => entry.type === "check")?.status).toBe("failed")
  expect(context?.entries.find((entry) => entry.type === "review")?.decision).toBe("changes_requested")
  expect(context?.entries.find((entry) => entry.type === "run")?.role).toBe("frontend")
})

test("readSessionContext handles failure, fallback, handoff, and truncation entries", async () => {
  const home = await makeTempHome()

  await appendSessionRecord("failure-session", {
    type: "run_error",
    error: "provider unavailable",
    willFallback: true,
    attempt: 1,
  }, home)
  await appendSessionRecord("failure-session", {
    type: "run_start",
    prompt: "resume work",
    plan: { role: "backend" },
    attempt: 2,
  }, home)
  await appendSessionRecord("failure-session", {
    type: "worker_error",
    phase: "support",
    worker: "librarian",
    error: "index unavailable",
    attempt: 2,
  }, home)
  await appendSessionRecord("failure-session", {
    type: "todo_update",
    phase: "primary",
    role: "backend",
    status: "unknown",
    summary: "waiting",
  } as never, home)
  await appendSessionRecord("failure-session", {
    type: "check_summary",
    status: "unknown",
    reason: "not configured",
    results: [{ status: "unknown", exitCode: null }],
    attempt: 2,
  } as never, home)
  await appendSessionRecord("failure-session", {
    type: "review_decision",
    decision: "unknown",
    rationale: "no reviewer",
    requiredChanges: [" fix "],
    blockingIssues: [" blocker "],
    attempt: 2,
  } as never, home)
  await appendSessionRecord("failure-session", {
    type: "handoff",
    summary: "continue backend work",
    focus: "tests",
    trigger: "auto",
  }, home)
  await appendSessionRecord("failure-session", {
    type: "run_start",
    prompt: "new activity",
    plan: {},
    attempt: 3,
  }, home)

  const context = await readSessionContext("failure-session", home)

  expect(context?.summary).toBe("provider unavailable")
  expect(context?.entries.find((entry) => entry.type === "error")?.willFallback).toBe(true)
  expect(context?.entries.find((entry) => entry.type === "worker")?.status).toBe("failed")
  expect(context?.entries.find((entry) => entry.type === "todo")?.status).toBe("pending")
  expect(context?.entries.find((entry) => entry.type === "check")?.status).toBe("skipped")
  expect(context?.entries.find((entry) => entry.type === "check")?.checks[0]).toEqual({ name: "unknown", status: "failed", exitCode: null })
  expect(context?.entries.find((entry) => entry.type === "review")?.decision).toBe("blocked")
  expect(context?.latestHandoff).toMatchObject({
    summary: "continue backend work",
    focus: "tests",
    trigger: "auto",
    fresh: false,
  })
  expect(context?.latestHandoff?.timestamp).toBeNumber()

  const truncated = await readSessionContext("failure-session", home, 2)
  expect(truncated?.truncated).toBe(true)
  expect(truncated?.entries).toHaveLength(2)
})
