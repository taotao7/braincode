import { expect, test } from "bun:test"
import { applyWorkerMcpToolContext, buildPrimaryPrompt, createWorkerHandoff, formatMcpUsageGuidance, formatProjectSupportPromptSection, runWorkerPool, type ExecutedWorkerResult } from "./workers"
import type { AgentTool } from "./pi-agent"
import type { RuntimeWorkerPlan } from "./router"

function executedResult(index: number, status: ExecutedWorkerResult["status"] = "completed"): ExecutedWorkerResult {
  return {
    fromLayer: "agent",
    toLayer: "brain",
    handoffId: `handoff-${index}`,
    taskId: `task-${index}`,
    parentId: "parent",
    progress: { status: status === "completed" ? "completed" : status, summary: `worker ${index}` },
    summary: `worker ${index} summary`,
    artifacts: [],
    risks: [],
    nextQuestions: [],
    role: "librarian",
    goal: `goal ${index}`,
    todoIds: [`todo-${index}`],
    status,
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}


function testWorker(overrides: Partial<RuntimeWorkerPlan> = {}): RuntimeWorkerPlan {
  return {
    role: "librarian",
    goal: "Map the relevant files.",
    reason: "Repository context is needed.",
    contextId: "ctx-worker",
    model: {
      id: "model",
      provider: "test",
      modelId: "model",
      name: "Model",
      contextWindow: 1000,
      supportsTools: true,
    },
    policy: { modelId: "model", thinkingLevel: "low" },
    piModel: { provider: "test", id: "model", name: "Model", contextWindow: 1000 },
    ...overrides,
  }
}

test("createWorkerHandoff includes project support context refs", () => {
  const handoff = createWorkerHandoff(
    testWorker(),
    "parent-task",
    "support",
    {
      root: "/repo",
      agents: { path: "/repo/AGENTS.md", content: "agent rules" },
      mcp: {
        path: "/repo/.mcp.json",
        serverNames: ["docs"],
        config: { mcpServers: {} },
      },
      skills: [{ id: "local-skill", path: "/repo/.agents/skills/local/SKILL.md", content: "skill rules" }],
      user: {
        home: "/home/.braincode",
        agents: { path: "/home/.braincode/AGENTS.md", content: "user rules" },
        mcp: {
          path: "/home/.braincode/mcp.json",
          serverNames: ["browser"],
          config: { mcpServers: {} },
        },
        skills: [{ id: "global-skill", path: "/home/.braincode/skills/global/SKILL.md", content: "global rules" }],
      },
    } as never,
  )

  expect(handoff.task.id).toBe("ctx-worker")
  expect(handoff.task.parentId).toBe("parent-task")
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/AGENTS.md", label: "AGENTS.md" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/.mcp.json", label: ".mcp.json" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/.agents/skills/local/SKILL.md", label: "skill:local-skill" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/home/.braincode/AGENTS.md", label: "user AGENTS.md" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/home/.braincode/mcp.json", label: "user mcp.json" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/home/.braincode/skills/global/SKILL.md", label: "user-skill:global-skill" })
})

test("worker prompt helpers expose project and user support plus primary tool guidance", () => {
  const support = formatProjectSupportPromptSection({
    root: "/repo",
    agents: { path: "/repo/AGENTS.md", content: "Use Bun." },
    mcp: { path: "/repo/.mcp.json", serverNames: ["docs"], config: {} },
    skills: [{ id: "project-docs", path: "/repo/.agents/skills/docs/SKILL.md", content: "Project docs skill." }],
    user: {
      home: "/home/.braincode",
      agents: { path: "/home/.braincode/AGENTS.md", content: "Prefer concise replies." },
      mcp: { path: "/home/.braincode/mcp.json", serverNames: ["browser"], config: {} },
      skills: [{ id: "global-review", path: "/home/.braincode/skills/review.md", content: "Global review skill." }],
    },
  } as never)
  const primaryPrompt = buildPrimaryPrompt("fix the failing test", [], "backend", undefined, ["read_file", "exec_command"])

  expect(support).toContain("User-global AGENTS.md (/home/.braincode/AGENTS.md):")
  expect(support).toContain("Prefer concise replies.")
  expect(support).toContain("Project AGENTS.md (/repo/AGENTS.md):")
  expect(support).toContain("Use Bun.")
  expect(support).toContain("User-global MCP config (/home/.braincode/mcp.json):")
  expect(support).toContain("Project MCP config (/repo/.mcp.json):")
  expect(support).toContain("User-global skills (~/.braincode/skills):")
  expect(support).toContain("Global review skill.")
  expect(support).toContain("Project-local skills (.agents/skills):")
  expect(support).toContain("Project docs skill.")
  expect(primaryPrompt).toContain("Available tools: exec_command, read_file")
  expect(primaryPrompt).toContain("Shell/command execution is available")
})

test("formatProjectSupportPromptSection preserves project support before large user-global support", () => {
  const support = formatProjectSupportPromptSection({
    root: "/repo",
    agents: { path: "/repo/AGENTS.md", content: "Project rule: use Bun." },
    mcp: undefined,
    skills: [{ id: "project-docs", path: "/repo/.agents/skills/docs/SKILL.md", content: "Project docs skill." }],
    user: {
      home: "/home/.braincode",
      agents: { path: "/home/.braincode/AGENTS.md", content: "User rule.\n".repeat(10_000) },
      mcp: undefined,
      skills: [],
    },
  } as never)

  expect(support).toContain("Project AGENTS.md (/repo/AGENTS.md):")
  expect(support).toContain("Project rule: use Bun.")
  expect(support).toContain("Project-local skills (.agents/skills):")
  expect(support.indexOf("Project AGENTS.md")).toBeLessThan(support.indexOf("User-global AGENTS.md"))
})

test("buildPrimaryPrompt surfaces web_search for live info and steers away from config files", () => {
  const primaryPrompt = buildPrimaryPrompt("明天成都天气", [], "librarian", undefined, ["read_file", "web_search", "mcp__tavily__tavily_search"])
  expect(primaryPrompt).toContain("Web search is available through web_search")
  expect(primaryPrompt).toContain("Connected MCP tools usable directly: mcp__tavily__tavily_search")
  expect(primaryPrompt).toContain("Do not read ~/.braincode secret/config files")
})

test("buildPrimaryPrompt prepends the environment section when provided", () => {
  const envSection = "Environment:\n- Working directory: /repo/project\n- Today's date: 2026-05-31\n"
  const primaryPrompt = buildPrimaryPrompt("fix the bug", [], "backend", undefined, ["read_file"], envSection)
  expect(primaryPrompt.startsWith("Environment:")).toBe(true)
  expect(primaryPrompt).toContain("- Working directory: /repo/project")
  expect(primaryPrompt).toContain("User request:\nfix the bug")
})

test("buildPrimaryPrompt includes user-facing response style guidance", () => {
  const primaryPrompt = buildPrimaryPrompt("explain this function", [], "rush", undefined, ["read_file"])
  expect(primaryPrompt).toContain("Response style:")
  expect(primaryPrompt).toContain("Reply in the language the user used")
})

test("buildPrimaryPrompt tells the agent to connect MCP when only mcp__connect is present", () => {
  const primaryPrompt = buildPrimaryPrompt("latest news", [], "librarian", undefined, ["read_file", "mcp__connect"])
  expect(primaryPrompt).toContain("MCP servers are still connecting")
  expect(primaryPrompt).toContain("call mcp__connect first")
  expect(primaryPrompt).not.toContain("Web search is available through web_search")
})

test("buildPrimaryPrompt adds capability guidance for connected browser/3D MCP servers", () => {
  const primaryPrompt = buildPrimaryPrompt("review the homepage", [], "frontend", undefined, [
    "read_file",
    "mcp__chrome-devtools__navigate_page",
    "mcp__codebase_memory_mcp__search_graph",
    "mcp__chrome-devtools__take_screenshot",
    "mcp__blender__get_scene_info",
  ])
  expect(primaryPrompt).toContain("A real browser is connected via the 'chrome-devtools' MCP server")
  expect(primaryPrompt).toContain("A codebase knowledge graph is connected via the 'codebase_memory_mcp' MCP server")
  expect(primaryPrompt).toContain("prefer graph tools such as search_graph")
  expect(primaryPrompt).toContain("A Blender instance is connected via the 'blender' MCP server")
})

test("formatMcpUsageGuidance keys off server name and emits one line per connected server", () => {
  const lines = formatMcpUsageGuidance([
    "mcp__chrome-devtools__navigate_page",
    "mcp__chrome-devtools__take_screenshot",
    "mcp__codebase_memory_mcp__search_graph",
    "mcp__blender__render",
    "mcp__some-other__do_thing",
  ])
  expect(lines).toHaveLength(4)
  expect(lines.some((line) => line.includes("'chrome-devtools'") && line.includes("real browser"))).toBe(true)
  expect(lines.some((line) => line.includes("'codebase_memory_mcp'") && line.includes("knowledge graph"))).toBe(true)
  expect(lines.some((line) => line.includes("'blender'") && line.includes("Blender"))).toBe(true)
  expect(lines.some((line) => line.includes("'some-other'") && line.includes("exposes real capabilities"))).toBe(true)
})

test("applyWorkerMcpToolContext prepends MCP guidance only when the worker has MCP tools", () => {
  const tool = (name: string): AgentTool => ({ name } as unknown as AgentTool)
  const base = "Run this isolated Braincode worker handoff."

  const withMcp = applyWorkerMcpToolContext(base, [tool("read_file"), tool("mcp__chrome-devtools__navigate_page")])
  expect(withMcp).toContain("Connected MCP tools available to you this run:")
  expect(withMcp).toContain("mcp__chrome-devtools__navigate_page")
  expect(withMcp).toContain("A real browser is connected")
  expect(withMcp.endsWith(base)).toBe(true)

  const withoutMcp = applyWorkerMcpToolContext(base, [tool("read_file"), tool("mcp__connect")])
  expect(withoutMcp).toBe(base)
})

test("runWorkerPool refills a freed slot before the slowest worker in the wave finishes", async () => {
  // limit=2, 4 independent workers. Worker 0 is slow; the rest are fast. Under a
  // wave-barrier scheduler, worker 2 could not start until worker 0 finished.
  // The continuous pool must start worker 2 the instant a fast worker frees a slot.
  const gate0 = deferred<void>()
  const startOrder: number[] = []
  const controls = [gate0.promise, Promise.resolve(), Promise.resolve(), Promise.resolve()]

  const resultsPromise = runWorkerPool({
    count: 4,
    limit: 2,
    isReady: () => true,
    runWorker: async (index) => {
      startOrder.push(index)
      await controls[index]
      return executedResult(index)
    },
    onBlocked: async (index) => executedResult(index, "blocked"),
  })

  // Worker 0 stays gated. Workers 1-3 each free a slot as they resolve, so the
  // pool must launch 2 and 3 while worker 0 is still in flight.
  await new Promise((resolve) => setTimeout(resolve, 5))
  expect(startOrder.slice(0, 3)).toEqual([0, 1, 2])
  gate0.resolve()

  const results = await resultsPromise
  expect(results.map((result) => result.taskId)).toEqual(["task-0", "task-1", "task-2", "task-3"])
})

test("runWorkerPool never exceeds the concurrency limit", async () => {
  let inflight = 0
  let peak = 0
  const results = await runWorkerPool({
    count: 6,
    limit: 3,
    isReady: () => true,
    runWorker: async (index) => {
      inflight += 1
      peak = Math.max(peak, inflight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inflight -= 1
      return executedResult(index)
    },
    onBlocked: async (index) => executedResult(index, "blocked"),
  })

  expect(peak).toBeLessThanOrEqual(3)
  expect(results).toHaveLength(6)
})

test("runWorkerPool launches a dependent worker only after its upstream completes", async () => {
  // Worker 1 (todo-1) depends on worker 0 (todo-0). Worker 1 must not start
  // until worker 0's completed result is visible, and must receive it as prior.
  const gate0 = deferred<void>()
  let dependentPrior: ExecutedWorkerResult[] = []

  const isReady = (index: number, current: ReadonlyArray<ExecutedWorkerResult | undefined>) => {
    if (index === 0) return true
    return current[0]?.status === "completed"
  }

  const resultsPromise = runWorkerPool({
    count: 2,
    limit: 4,
    isReady,
    runWorker: async (index, priorResults) => {
      if (index === 1) {
        dependentPrior = priorResults
        return executedResult(1)
      }
      await gate0.promise
      return executedResult(0)
    },
    onBlocked: async (index) => executedResult(index, "blocked"),
  })

  // While worker 0 is gated, worker 1 is not ready and must not have run.
  await new Promise((resolve) => setTimeout(resolve, 5))
  expect(dependentPrior).toEqual([])
  gate0.resolve()

  const results = await resultsPromise
  expect(results.map((result) => result.taskId)).toEqual(["task-0", "task-1"])
  expect(dependentPrior.map((result) => result.taskId)).toEqual(["task-0"])
})

test("runWorkerPool blocks dependents when their upstream fails", async () => {
  // Worker 1 depends on worker 0. Worker 0 fails, so worker 1 is never ready
  // and must be routed through onBlocked instead of runWorker.
  const ran = new Set<number>()
  const blocked = new Set<number>()

  const isReady = (index: number, current: ReadonlyArray<ExecutedWorkerResult | undefined>) => {
    if (index === 0) return true
    return current[0]?.status === "completed"
  }

  const results = await runWorkerPool({
    count: 2,
    limit: 4,
    isReady,
    runWorker: async (index) => {
      ran.add(index)
      return executedResult(index, index === 0 ? "failed" : "completed")
    },
    onBlocked: async (index) => {
      blocked.add(index)
      return executedResult(index, "blocked")
    },
  })

  expect(ran.has(0)).toBe(true)
  expect(ran.has(1)).toBe(false)
  expect(blocked.has(1)).toBe(true)
  expect(results.map((result) => result.status)).toEqual(["failed", "blocked"])
})

test("runWorkerPool surfaces one rejection and observes concurrent failures without unhandled rejections", async () => {
  // Two workers fail almost simultaneously (e.g. a shared abort). The pool must
  // reject with one of the errors and must not leave the other rejection
  // unobserved (which would crash the process via unhandledRejection).
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason)
  }
  process.on("unhandledRejection", onUnhandled)
  try {
    await expect(runWorkerPool({
      count: 2,
      limit: 2,
      isReady: () => true,
      runWorker: async (index) => {
        await new Promise((resolve) => setTimeout(resolve, index === 0 ? 1 : 2))
        throw new Error(`worker ${index} exploded`)
      },
      onBlocked: async (index) => executedResult(index, "blocked"),
    })).rejects.toThrow("exploded")
    // Give the second rejection a tick to surface if it were unobserved.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(unhandled).toEqual([])
  } finally {
    process.off("unhandledRejection", onUnhandled)
  }
})

test("computeDependencyUpstreamContextIds shares results only along declared dependency edges", async () => {
  const { computeDependencyUpstreamContextIds } = await import("./workers")
  const workers = [
    testWorker({ role: "security", contextId: "ctx-security", todoIds: ["todo-security"] }),
    testWorker({ role: "frontend", contextId: "ctx-frontend", todoIds: ["todo-frontend"] }),
    testWorker({ role: "qa", contextId: "ctx-qa", todoIds: ["todo-qa"] }),
  ]
  const upstreams = computeDependencyUpstreamContextIds(workers, [
    { fromTodoId: "todo-security", toTodoId: "todo-qa" },
  ])

  // Independent workers receive nothing, regardless of completion order.
  expect(upstreams[0]!.size).toBe(0)
  expect(upstreams[1]!.size).toBe(0)
  // The dependent worker receives only its declared upstream.
  expect([...upstreams[2]!]).toEqual(["ctx-security"])
})
