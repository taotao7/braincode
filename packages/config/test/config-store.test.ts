import { mkdir, mkdtemp, rm, stat, utimes } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, expect, test } from "bun:test"
import { agentRoleSystemPrompts } from "@braincode/brain"
import { TAVILY_AUTH_PROVIDER, TAVILY_MCP_PACKAGE, TAVILY_MCP_SERVER_NAME, appendSessionRecord, appendTokenUsageRecord, configureTavilyMcpServer, createBraincodeAuthEnvRef, ensureBraincodeHome, extractMcpServerEntries, getBraincodePaths, getProjectSupportPaths, getProviderApiKey, getProviderOAuthCredentials, getUserSupportPaths, listSessions, normalizeHooks, normalizeTokenUsage, readAuthStatus, readBrains, readHookSources, readModels, readProjectChecks, readProjectSupport, readProviderApiKey, readSessionContext, readSessionTokenUsageSummary, readSettings, readTools, readUsageStats, readUserMcpConfig, readUserSupport, resolveMcpServerEnv, setHookHandlerEnabled, setMcpServerDisabled, setMcpServerTrusted, writeBrains, writeModels, writeProviderApiKey, writeProviderOAuthCredentials, writeSettings, writeTools } from "../src/index"

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

test("default models include the Image Maker generation model", async () => {
  const home = await makeTempHome()
  const models = await readModels(home)
  const imageModel = models.models.find((model) => (model as { id?: string }).id === "openai/gpt-image-2") as {
    api?: string
    supportsImageGeneration?: boolean
    supportsTools?: boolean
    supportsVision?: boolean
  } | undefined

  expect(imageModel).toMatchObject({
    api: "openai-images",
    supportsImageGeneration: true,
    supportsTools: false,
    supportsVision: false,
  })
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
    expect(projectPaths.skills).toBe(join(root, ".agents", "skills"))
    expect(projectPaths.checks).toBe(join(root, ".braincode", "checks.json"))
    expect(userPaths.mcp).toBe(join(home, "mcp.json"))
    expect(userPaths.skills).toBe(join(home, "skills"))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("MCP server entries can be listed and toggled disabled/trusted", async () => {
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

  await setMcpServerTrusted(filePath, "alpha", true)
  parsed = JSON.parse(await Bun.file(filePath).text())
  expect(parsed.servers.alpha.trusted).toBe(true)

  await setMcpServerTrusted(filePath, "alpha", false)
  parsed = JSON.parse(await Bun.file(filePath).text())
  expect(parsed.servers.alpha.trusted).toBeUndefined()

  await expect(setMcpServerDisabled(filePath, "missing", true)).rejects.toThrow("not found")
  await expect(setMcpServerDisabled(join(home, "missing.json"), "alpha", true)).rejects.toThrow("MCP config not found")

  const emptyPath = join(home, "empty-mcp.json")
  await Bun.write(emptyPath, JSON.stringify({ servers: null }))
  await expect(setMcpServerDisabled(emptyPath, "alpha", true)).rejects.toThrow("has no 'mcpServers' map")
})

test("Tavily quick config stores key in auth and MCP auth reference in user config", async () => {
  const home = await makeTempHome()

  const mcp = await configureTavilyMcpServer({ apiKey: " tvly-secret " }, home)
  const parsed = JSON.parse(await Bun.file(getUserSupportPaths(home).mcp).text())

  expect(mcp.serverNames).toEqual([TAVILY_MCP_SERVER_NAME])
  expect(parsed.mcpServers[TAVILY_MCP_SERVER_NAME]).toEqual({
    type: "stdio",
    command: "bunx",
    args: [TAVILY_MCP_PACKAGE],
    env: { TAVILY_API_KEY: createBraincodeAuthEnvRef(TAVILY_AUTH_PROVIDER) },
  })
  expect(await readProviderApiKey(TAVILY_AUTH_PROVIDER, home)).toBe("tvly-secret")
})

test("Tavily quick config preserves non-secret MCP env and can reuse saved auth", async () => {
  const home = await makeTempHome()
  await writeProviderApiKey(TAVILY_AUTH_PROVIDER, "tvly-saved", home)
  await Bun.write(getUserSupportPaths(home).mcp, JSON.stringify({
    mcpServers: {
      [TAVILY_MCP_SERVER_NAME]: {
        command: "custom",
        env: { DEFAULT_PARAMETERS: "{\"max_results\":5}", TAVILY_API_KEY: "old" },
        disabled: true,
      },
    },
  }))

  await configureTavilyMcpServer({}, home)
  const parsed = JSON.parse(await Bun.file(getUserSupportPaths(home).mcp).text())

  expect(parsed.mcpServers[TAVILY_MCP_SERVER_NAME].disabled).toBeUndefined()
  expect(parsed.mcpServers[TAVILY_MCP_SERVER_NAME].command).toBe("bunx")
  expect(parsed.mcpServers[TAVILY_MCP_SERVER_NAME].env).toEqual({
    DEFAULT_PARAMETERS: "{\"max_results\":5}",
    TAVILY_API_KEY: createBraincodeAuthEnvRef(TAVILY_AUTH_PROVIDER),
  })
})

test("readUserMcpConfig returns an empty user MCP document when missing", async () => {
  const home = await makeTempHome()
  const mcp = await readUserMcpConfig(home)

  expect(mcp.path).toBe(getUserSupportPaths(home).mcp)
  expect(mcp.config).toEqual({ mcpServers: {} })
  expect(mcp.serverNames).toEqual([])
})

test("resolveMcpServerEnv replaces Braincode auth references with API keys", () => {
  const env = resolveMcpServerEnv(
    { TAVILY_API_KEY: createBraincodeAuthEnvRef("tavily"), DEFAULT_PARAMETERS: "{}" },
    { providers: { tavily: { apiKey: "tvly-secret" } } },
  )

  expect(env).toEqual({ TAVILY_API_KEY: "tvly-secret", DEFAULT_PARAMETERS: "{}" })
  expect(() => resolveMcpServerEnv({ TAVILY_API_KEY: createBraincodeAuthEnvRef("tavily") }, { providers: {} })).toThrow("Missing API key")
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
  await mkdir(join(projectRoot, ".agents", "skills", "docs"), { recursive: true })
  await Bun.write(join(projectRoot, ".agents", "skills", "docs", "SKILL.md"), "# Docs skill\nSummarize project docs.\n")

  const support = await readProjectSupport(projectRoot)

  expect(support.agents?.content).toContain("Use Bun")
  expect(support.mcp?.serverNames).toEqual(["filesystem"])
  expect(support.skills.map((skill) => skill.id)).toEqual(["docs"])
  expect(support.skills[0]?.content).toContain("Docs skill")
})

test("readProjectChecks discovers optional project check policy", async () => {
  const projectRoot = await makeTempHome()
  await mkdir(join(projectRoot, ".braincode"), { recursive: true })
  await Bun.write(join(projectRoot, ".braincode", "checks.json"), JSON.stringify({
    strategy: "smart",
    policies: {
      "docs-only": { enabled: true, scripts: ["docs:check"], reason: "docs must build" },
      "auth-risk": { review: "required" },
    },
  }))

  const checks = await readProjectChecks(projectRoot)

  expect(checks?.path).toBe(join(projectRoot, ".braincode", "checks.json"))
  expect(checks?.config).toEqual({
    strategy: "smart",
    policies: {
      "docs-only": { enabled: true, scripts: ["docs:check"], reason: "docs must build" },
      "auth-risk": { review: "required" },
    },
  })
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
  expect(sources[1]?.document.hooks.Stop?.[0]?.hooks[0]?.trusted).toBe(true)
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
    "list_background",
    "kill_background",
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
    strategy: "smart",
    policies: {},
    timeoutMs: 180_000,
    maxOutputBytes: 24_000,
  })
  expect(tools.permissions?.paths).toContainEqual({ pattern: "src/auth/**", edit: "ask", review: "required" })
  expect(tools.permissions?.commands).toContainEqual({ pattern: "git push", policy: "deny" })
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
  const models = await readModels(home)
  expect(models.models[0]).toEqual({ id: "fast" })
  expect(models.models.some((model) => (model as { id?: string }).id === "openai/gpt-image-2")).toBe(false)
  const tools = await readTools(home)
  expect(tools.tools.find((tool) => tool.name === "read_file")?.enabled).toBe(false)
  expect(tools.tools.find((tool) => tool.name === "shell")?.enabled).toBe(true)
  expect(tools.checks?.enabled).toBe(true)
  expect(tools.permissions?.paths).toContainEqual({ pattern: "package.json", edit: "ask", review: "required" })
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

test("readModels migrates old default model catalogs to include Image Maker", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await Bun.write(
    paths.models,
    JSON.stringify({
      models: [
        { id: "azure-openai-responses/gpt-5.5" },
        { id: "anthropic/claude-sonnet-4-6" },
        { id: "google/gemini-3.1-pro-preview" },
        { id: "google/gemini-3-flash-preview" },
      ],
    }),
  )

  const models = await readModels(home)
  const imageModel = models.models.find((model) => (model as { id?: string }).id === "openai/gpt-image-2") as { api?: string; supportsImageGeneration?: boolean } | undefined

  expect(imageModel).toMatchObject({ api: "openai-images", supportsImageGeneration: true })
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
  const brain = brains.brains[0] as { planner?: { systemPrompt?: string }; roles?: Record<string, { modelId?: string; systemPrompt?: string; imageModel?: { provider?: string; modelId?: string } }> }

  expect(brain.roles?.coding).toBeUndefined()
  expect(brain.roles?.fastReply).toBeUndefined()
  expect(brain.roles?.research).toBeUndefined()
  expect(brain.planner?.systemPrompt).toBe(agentRoleSystemPrompts.routeBrain)
  expect(brain.roles?.routeBrain?.systemPrompt).toBe(agentRoleSystemPrompts.routeBrain)
  expect(brain.roles?.librarian?.systemPrompt).toBe(agentRoleSystemPrompts.librarian)
  expect(brain.roles?.rush?.systemPrompt).toBe(agentRoleSystemPrompts.rush)
  expect(brain.roles?.pet?.systemPrompt).toBe(agentRoleSystemPrompts.pet)
  expect(brain.roles?.imageMaker?.systemPrompt).toBe(agentRoleSystemPrompts.imageMaker)
  expect(brain.roles?.imageMaker?.modelId).toBe("openai/gpt-image-2")
  expect(brain.roles?.imageMaker?.imageModel).toBeUndefined()
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

test("token usage records aggregate by model, role, and phase", async () => {
  const home = await makeTempHome()

  expect(normalizeTokenUsage({ prompt_tokens: 100, completion_tokens: 25 })).toEqual({
    input: 100,
    output: 25,
    cacheRead: 0,
    cacheWrite: 0,
    total: 125,
  })

  await appendTokenUsageRecord("usage-session", {
    role: "routeBrain",
    phase: "router",
    brainId: "brain",
    modelId: "provider/router",
    provider: "provider",
    agentSessionId: "usage-session:router",
    usage: { input: 10, output: 5, totalTokens: 15 },
  }, home)
  await appendSessionRecord("usage-session", {
    type: "run_start",
    prompt: "implement stats",
    plan: { brain: { id: "brain" }, role: "backend" },
  }, home)
  await appendTokenUsageRecord("usage-session", {
    role: "backend",
    phase: "primary",
    modelId: "provider/main",
    provider: "provider",
    agentSessionId: "usage-session",
    usage: { prompt_tokens: 40, completion_tokens: 20, cache_read_tokens: 3 },
  }, home)
  await appendTokenUsageRecord("usage-session", {
    role: "backend",
    phase: "primary",
    modelId: "provider/main",
    provider: "provider",
    usage: { total: 0 },
  }, home)

  const stats = await readUsageStats(home)
  const sessionUsage = await readSessionTokenUsageSummary("usage-session", home)

  expect(stats.sessions).toBe(1)
  expect(stats.totals).toMatchObject({ calls: 2, input: 50, output: 25, cacheRead: 3, total: 78 })
  expect(stats.byModel.map((bucket) => [bucket.id, bucket.total])).toEqual([
    ["provider/main", 63],
    ["provider/router", 15],
  ])
  expect(stats.byRole.find((bucket) => bucket.id === "backend")?.calls).toBe(1)
  expect(stats.byPhase.find((bucket) => bucket.id === "router")?.total).toBe(15)
  expect(stats.recent).toHaveLength(2)
  expect(stats.recent[0]?.prompt).toBe("implement stats")
  expect(stats.recent[0]?.brainId).toBe("brain")
  expect(stats.recent[0]?.primaryRole).toBe("backend")
  expect(sessionUsage.totals).toMatchObject({ calls: 2, input: 50, output: 25, cacheRead: 3, total: 78 })
  expect(sessionUsage.byPhase.map((bucket) => [bucket.id, bucket.total])).toEqual([
    ["primary", 63],
    ["router", 15],
  ])
})

test("listSessions limits after sorting by recent session file time", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)
  const oldDate = new Date("2020-01-01T00:00:00.000Z")
  const latestDate = new Date("2026-01-01T00:00:00.000Z")

  for (let index = 0; index < 80; index++) {
    const filePath = join(paths.sessions, `old-${index}.jsonl`)
    await Bun.write(filePath, `${JSON.stringify({ type: "run_start", prompt: `old ${index}` })}\n`)
    await utimes(filePath, oldDate, oldDate)
  }
  const latestPath = join(paths.sessions, "latest.jsonl")
  await Bun.write(latestPath, `${JSON.stringify({ type: "run_start", prompt: "latest prompt" })}\n`)
  await utimes(latestPath, latestDate, latestDate)

  const sessions = await listSessions(home, 1)

  expect(sessions.map((session) => session.sessionId)).toEqual(["latest"])
  expect(sessions[0]?.prompt).toBe("latest prompt")
})

test("listSessions returns every session when given an unbounded limit", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  for (let index = 0; index < 80; index++) {
    const filePath = join(paths.sessions, `session-${index}.jsonl`)
    await Bun.write(filePath, `${JSON.stringify({ type: "run_start", prompt: `prompt ${index}` })}\n`)
  }

  const sessions = await listSessions(home, Number.POSITIVE_INFINITY)

  expect(sessions).toHaveLength(80)
})

test("listSessions filters by project root when requested", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  const write = async (id: string, root: string | undefined) => {
    const runStart: Record<string, unknown> = { type: "run_start", prompt: `prompt ${id}` }
    if (root !== undefined) runStart.projectSupport = { root }
    await Bun.write(join(paths.sessions, `${id}.jsonl`), `${JSON.stringify(runStart)}\n`)
  }

  await write("alpha-1", "/repo/alpha")
  await write("alpha-2", "/repo/alpha")
  await write("beta-1", "/repo/beta")
  await write("rootless", undefined)

  const alpha = await listSessions(home, Number.POSITIVE_INFINITY, { projectRoot: "/repo/alpha" })
  expect(alpha.map((session) => session.sessionId).sort()).toEqual(["alpha-1", "alpha-2"])
  expect(alpha.every((session) => session.projectRoot === "/repo/alpha")).toBe(true)

  // No filter returns every session, including ones without a recorded root.
  const all = await listSessions(home, Number.POSITIVE_INFINITY)
  expect(all).toHaveLength(4)
  expect(all.find((session) => session.sessionId === "rootless")?.projectRoot).toBeUndefined()
})

test("readUsageStats can limit parsing to recent session files", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)
  const oldPath = join(paths.sessions, "old-usage.jsonl")
  const latestPath = join(paths.sessions, "latest-usage.jsonl")
  await Bun.write(oldPath, [
    JSON.stringify({ type: "run_start", prompt: "old usage" }),
    JSON.stringify({ type: "token_usage", modelId: "old-model", role: "backend", phase: "primary", usage: { total: 1 } }),
  ].join("\n"))
  await Bun.write(latestPath, [
    JSON.stringify({ type: "run_start", prompt: "latest usage" }),
    JSON.stringify({ type: "token_usage", modelId: "latest-model", role: "backend", phase: "primary", usage: { total: 9 } }),
  ].join("\n"))
  await utimes(oldPath, new Date("2020-01-01T00:00:00.000Z"), new Date("2020-01-01T00:00:00.000Z"))
  await utimes(latestPath, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"))

  const stats = await readUsageStats(home, { sessionLimit: 1 })

  expect(stats.sessions).toBe(1)
  expect(stats.totals.total).toBe(9)
  expect(stats.byModel.map((bucket) => bucket.id)).toEqual(["latest-model"])
  expect(stats.recent[0]?.sessionId).toBe("latest-usage")
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
