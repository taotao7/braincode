import { expect, test } from "bun:test"
import { formatInputModalityRoutingDirective, normalizeRouterDecision } from "./router"

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

test("formatInputModalityRoutingDirective calls out image routing constraints", () => {
  expect(formatInputModalityRoutingDirective([])).toBe("Input modality: text only.")
  const directive = formatInputModalityRoutingDirective([{} as never, {} as never])

  expect(directive).toContain("text plus 2 attached images")
  expect(directive).toContain("must run on a vision-capable model")
  expect(directive).toContain("Do not route to imageMaker merely because the user attached an image")
})
