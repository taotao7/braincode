import { expect, test } from "bun:test"
import { buildPrimaryPrompt, createWorkerHandoff, formatProjectSupportPromptSection, runWorkerPool, type ExecutedWorkerResult } from "./workers"
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
    } as never,
  )

  expect(handoff.task.id).toBe("ctx-worker")
  expect(handoff.task.parentId).toBe("parent-task")
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/AGENTS.md", label: "AGENTS.md" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/.mcp.json", label: ".mcp.json" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/.agents/skills/local/SKILL.md", label: "skill:local-skill" })
})

test("worker prompt helpers expose project support and primary tool guidance", () => {
  const support = formatProjectSupportPromptSection({
    root: "/repo",
    agents: { path: "/repo/AGENTS.md", content: "Use Bun." },
    mcp: undefined,
    skills: [],
  } as never)
  const primaryPrompt = buildPrimaryPrompt("fix the failing test", [], "backend", undefined, ["read_file", "exec_command"])

  expect(support).toContain("AGENTS.md (/repo/AGENTS.md):")
  expect(support).toContain("Use Bun.")
  expect(primaryPrompt).toContain("Available tools: exec_command, read_file")
  expect(primaryPrompt).toContain("Shell/command execution is available")
})

test("buildPrimaryPrompt surfaces web_search for live info and steers away from config files", () => {
  const primaryPrompt = buildPrimaryPrompt("明天成都天气", [], "librarian", undefined, ["read_file", "web_search", "mcp__tavily__tavily_search"])
  expect(primaryPrompt).toContain("Web search is available through web_search")
  expect(primaryPrompt).toContain("Connected MCP tools usable directly: mcp__tavily__tavily_search")
  expect(primaryPrompt).toContain("Do not read ~/.braincode config files")
})

test("buildPrimaryPrompt tells the agent to connect MCP when only mcp__connect is present", () => {
  const primaryPrompt = buildPrimaryPrompt("latest news", [], "librarian", undefined, ["read_file", "mcp__connect"])
  expect(primaryPrompt).toContain("MCP servers are still connecting")
  expect(primaryPrompt).toContain("call mcp__connect first")
  expect(primaryPrompt).not.toContain("Web search is available through web_search")
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
