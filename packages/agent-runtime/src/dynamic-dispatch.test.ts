import { expect, test } from "bun:test"
import type { AgentToolResult } from "@earendil-works/pi-agent-core"
import { createBrainTaskContext } from "@braincode/context"
import { createDispatchSpecialistTool, dispatchableRoles, dispatchSpecialistMaxForMode, formatDispatchToolGuidance, type DispatchSpecialistToolOptions } from "./dynamic-dispatch"
import type { RuntimePlan } from "./router"
import type { ExecutedWorkerResult } from "./workers"

function executedResult(role: ExecutedWorkerResult["role"], taskId: string, goal: string): ExecutedWorkerResult {
  return {
    fromLayer: "agent",
    toLayer: "brain",
    handoffId: `handoff-${taskId}`,
    taskId,
    parentId: "brain-ctx",
    progress: { status: "completed", summary: `did ${goal}` },
    summary: `findings for ${goal}`,
    artifacts: [],
    risks: [],
    nextQuestions: [],
    role,
    goal,
    todoIds: [],
    status: "completed",
  }
}

function testPlan(mode: RuntimePlan["mode"] = "auto", role: RuntimePlan["role"] = "backend"): RuntimePlan {
  return {
    mode,
    modeDescription: "test",
    brain: { id: "brain", name: "Brain", description: "test" },
    context: createBrainTaskContext({ id: "brain-ctx", goal: "Build the login API.", childContextIds: [] }),
    role,
    agentPlan: { primaryRole: role, workers: [], todos: [], dependencies: [], requiresReview: false, reason: "test" },
    todos: [],
    dependencies: [],
    workers: [],
    routing: { source: "heuristic" },
    model: { id: "m", provider: "test", modelId: "m", name: "M", contextWindow: 1000, supportsTools: true },
    policy: { modelId: "m", thinkingLevel: "low" },
    piModel: { provider: "test", id: "m", name: "M", contextWindow: 1000 },
    toolExecution: "parallel",
  }
}

function testOptions(overrides: Partial<DispatchSpecialistToolOptions> = {}): DispatchSpecialistToolOptions {
  return {
    plan: testPlan(),
    models: [],
    home: undefined,
    sessionId: "session-1",
    projectSupport: { root: "/repo", agents: undefined, mcp: undefined, skills: [] } as never,
    hookContext: {} as never,
    readOnlyTools: [],
    toolEvidenceCache: {} as never,
    dispatchedResults: [],
    runWorker: async (role, goal) => executedResult(role, `dispatched-${role}-${goal.length}`, goal),
    ...overrides,
  }
}

function resultDetails(result: AgentToolResult<unknown>): { tool: string; ok: boolean; error?: string; role?: string; budget?: { used: number; max: number } } {
  return result.details as never
}

test("dispatchable roles exclude review, rush, and imageMaker", () => {
  expect(dispatchableRoles).not.toContain("review")
  expect(dispatchableRoles).not.toContain("rush")
  expect(dispatchableRoles).not.toContain("imageMaker")
  expect(dispatchableRoles).toContain("security")
  expect(dispatchableRoles).toContain("oracle")
  expect(dispatchableRoles).toContain("librarian")
})

test("mode bounds dispatch budget: auto tighter than radical", () => {
  expect(dispatchSpecialistMaxForMode("auto")).toBe(2)
  expect(dispatchSpecialistMaxForMode("radical")).toBe(4)
})

test("rejects roles outside the dispatchable allow-list without consuming budget", async () => {
  const options = testOptions()
  const { tool, count } = createDispatchSpecialistTool(options)
  const result = await tool.execute("call-1", { role: "review", goal: "review my code" } as never)
  const details = resultDetails(result)
  expect(details.ok).toBe(false)
  expect(details.error).toContain("not dispatchable")
  expect(count()).toBe(0)
  expect(options.dispatchedResults).toHaveLength(0)
})

test("rejects an empty goal so the isolated specialist always has self-contained context", async () => {
  const { tool, count } = createDispatchSpecialistTool(testOptions())
  const result = await tool.execute("call-1", { role: "security", goal: "   " } as never)
  expect(resultDetails(result).ok).toBe(false)
  expect(resultDetails(result).error).toContain("self-contained goal")
  expect(count()).toBe(0)
})

test("successful dispatch returns structured findings and records the result", async () => {
  const options = testOptions()
  const { tool, count } = createDispatchSpecialistTool(options)
  const result = await tool.execute("call-1", { role: "security", goal: "audit the token flow" } as never)
  const details = resultDetails(result)
  expect(details.ok).toBe(true)
  expect(details.role).toBe("security")
  expect(details.budget).toEqual({ used: 1, max: 2 })
  expect(count()).toBe(1)
  expect(options.dispatchedResults).toHaveLength(1)
  expect(options.dispatchedResults[0]?.role).toBe("security")
  // The specialist's findings are surfaced to the primary as text.
  const text = result.content.find((part) => part.type === "text")
  expect(text && "text" in text ? text.text : "").toContain("findings for audit the token flow")
})

test("enforces the per-run dispatch budget and denies once exhausted", async () => {
  const options = testOptions({ plan: testPlan("auto") })
  const { tool, count } = createDispatchSpecialistTool(options)

  const first = await tool.execute("c1", { role: "security", goal: "audit auth" } as never)
  const second = await tool.execute("c2", { role: "dba", goal: "review schema" } as never)
  expect(resultDetails(first).ok).toBe(true)
  expect(resultDetails(second).ok).toBe(true)
  expect(count()).toBe(2)

  const third = await tool.execute("c3", { role: "oracle", goal: "weigh the tradeoff" } as never)
  expect(resultDetails(third).ok).toBe(false)
  expect(resultDetails(third).error).toContain("budget exhausted")
  // Denied dispatch must not run a worker or grow the result set.
  expect(count()).toBe(2)
  expect(options.dispatchedResults).toHaveLength(2)
})

test("radical mode allows more dispatches than auto", async () => {
  const options = testOptions({ plan: testPlan("radical") })
  const { tool, count } = createDispatchSpecialistTool(options)
  for (let i = 0; i < 4; i += 1) {
    const result = await tool.execute(`c${i}`, { role: "librarian", goal: `map area ${i}` } as never)
    expect(resultDetails(result).ok).toBe(true)
  }
  expect(count()).toBe(4)
  const overflow = await tool.execute("c5", { role: "librarian", goal: "map area 5" } as never)
  expect(resultDetails(overflow).ok).toBe(false)
})

test("concurrent dispatches in one batch cannot collectively exceed the budget", async () => {
  // Two parallel calls under an auto budget of 2 are both allowed; a third
  // launched while the first two are still in flight must be denied because the
  // slot reservation counts in-flight dispatches, not just completed ones.
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  const options = testOptions({
    plan: testPlan("auto"),
    runWorker: async (role, goal) => {
      await gate
      return executedResult(role, `dispatched-${goal}`, goal)
    },
  })
  const { tool, count } = createDispatchSpecialistTool(options)

  const p1 = tool.execute("c1", { role: "security", goal: "a" } as never)
  const p2 = tool.execute("c2", { role: "dba", goal: "b" } as never)
  // Give the two reservations a chance to register before the third call.
  await new Promise((resolve) => setTimeout(resolve, 5))
  const denied = await tool.execute("c3", { role: "oracle", goal: "c" } as never)
  expect(resultDetails(denied).ok).toBe(false)
  expect(resultDetails(denied).error).toContain("budget exhausted")

  release()
  const [r1, r2] = await Promise.all([p1, p2])
  expect(resultDetails(r1).ok).toBe(true)
  expect(resultDetails(r2).ok).toBe(true)
  expect(count()).toBe(2)
})

test("dispatch guidance names the tool, the budget, and the roles", () => {
  const guidance = formatDispatchToolGuidance("auto")
  expect(guidance).toContain("dispatch_specialist")
  expect(guidance).toContain("up to 2")
  expect(guidance).toContain("security")
  expect(guidance).toContain("isolated")
})
