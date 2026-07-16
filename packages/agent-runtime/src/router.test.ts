import { expect, test } from "bun:test"
import { planAgentRouting } from "@braincode/brain"
import { formatInputModalityRoutingDirective, isRouterFastPathEligible, normalizeRouterDecision } from "./router"

test("normalizeRouterDecision respects an explicit allowed role set", () => {
  const fallback = {
    primaryRole: "rush" as const,
    workers: [{
      role: "rush" as const,
      goal: "Handle a tiny request.",
      reason: "Fallback role.",
    }],
    todos: [],
    dependencies: [],
    requiresReview: false,
    reason: "Fallback plan.",
  }

  const decision = normalizeRouterDecision(
    {
      role: "backend",
      workers: [{ role: "security", goal: "Review auth", reason: "Risky area" }],
      todos: [{ id: "review-auth", title: "Review auth behavior", role: "security" }],
    },
    fallback,
    { maxWorkerAgents: 4, maxTodos: 4 },
    ["frontend"],
  )

  expect(decision.primaryRole).toBe("frontend")
  expect(decision.workers.map((worker) => worker.role)).toEqual(["frontend"])
  expect(decision.todos.map((todo) => [todo.id, todo.role])).toEqual([["review-auth", "frontend"]])
})

test("normalizeRouterDecision preserves clarification requests from routeBrain", () => {
  const fallback = {
    primaryRole: "rush" as const,
    workers: [{
      role: "rush" as const,
      goal: "Handle a tiny request.",
      reason: "Fallback role.",
    }],
    todos: [],
    dependencies: [],
    requiresReview: false,
    reason: "Fallback plan.",
  }

  const decision = normalizeRouterDecision(
    {
      role: "backend",
      workers: [{ role: "backend", goal: "Implement once clarified", reason: "Likely backend work" }],
      todos: [{ id: "clarify", title: "Wait for clarified backend target", role: "backend" }],
      clarification: {
        required: true,
        reason: "Target API is missing",
        question: "Which API should change?",
        missing: ["target API"],
        options: [
          { id: "plan", label: "Plan first", description: "Return a backend plan only" },
          { id: "implement", label: "Implement", description: "Inspect the repo and make a scoped backend change" },
        ],
      },
    },
    fallback,
    { maxWorkerAgents: 4, maxTodos: 4 },
  )

  expect(decision.primaryRole).toBe("backend")
  expect(decision.clarification?.required).toBe(true)
  expect(decision.clarification?.question).toBe("Which API should change?")
  expect(decision.clarification?.options.map((option) => option.id)).toEqual(["plan", "implement"])
})

test("isRouterFastPathEligible accepts short conversational prompts", () => {
  for (const prompt of ["thanks!", "what does MCP stand for?", "你好", "什么是尾递归优化？"]) {
    expect(isRouterFastPathEligible(prompt, planAgentRouting(prompt), [])).toBe(true)
  }
})

test("isRouterFastPathEligible rejects work-shaped prompts", () => {
  const workPrompts = [
    "fix the login form validation in auth.ts",
    "run the tests and commit the changes",
    "修复登录页面的表单校验",
    "generate an image of a robot",
    "review this diff for security issues and edit the code",
  ]
  for (const prompt of workPrompts) {
    expect(isRouterFastPathEligible(prompt, planAgentRouting(prompt), [])).toBe(false)
  }
})

test("isRouterFastPathEligible rejects workspace-artifact references even without edit verbs", () => {
  // Edit verbs like rename/move/extract are easy to miss in the heuristic verb
  // list; any concrete file path / code identifier disqualifies the fast path.
  const artifactPrompts = [
    "rename parseCfg to parseConfig in src/utils.ts",
    "move the helper into shared/format.ts",
    "swap the order of arguments in `buildPlan`",
    "extract the retry_loop into its own function",
    "reorder the imports in index.ts",
  ]
  for (const prompt of artifactPrompts) {
    expect(isRouterFastPathEligible(prompt, planAgentRouting(prompt), [])).toBe(false)
  }
})

test("isRouterFastPathEligible rejects images, long prompts, and continuity context", () => {
  expect(isRouterFastPathEligible("hi", planAgentRouting("hi"), [{} as never])).toBe(false)
  const long = "why ".repeat(100)
  expect(isRouterFastPathEligible(long, planAgentRouting(long), [])).toBe(false)
  const continuity = "Conversation so far (most recent session activity):\nuser asked about X\n\nCurrent request:\nok do it"
  expect(isRouterFastPathEligible(continuity, planAgentRouting(continuity), [])).toBe(false)
})

test("formatInputModalityRoutingDirective calls out image routing constraints", () => {
  expect(formatInputModalityRoutingDirective([])).toBe("Input modality: text only.")
  const directive = formatInputModalityRoutingDirective([{} as never, {} as never])

  expect(directive).toContain("text plus 2 attached images")
  expect(directive).toContain("must run on a vision-capable model")
  expect(directive).toContain("Do not route to imageMaker merely because the user attached an image")
})
