import { expect, test } from "bun:test"
import type { RuntimePlan } from "@braincode/agent-runtime"
import {
  formatHelp,
  formatPlanMetadataLine,
  formatPlanPreviewSummary,
  formatPlanWorkersBudgetLine,
} from "./tui"

test("formatHelp includes dynamically loaded skill commands", () => {
  const help = formatHelp([
    { name: "help", label: "/help", hint: "List all slash commands" },
    {
      name: "docs",
      label: "/docs",
      hint: "Skill (project) - invoke /docs <task>",
      insert: "/docs ",
      skill: {
        id: "docs",
        scope: "project",
        content: "# Docs",
        path: "/repo/.agents/skill/docs/SKILL.md",
      },
    },
  ])

  expect(help).toContain("/help")
  expect(help).toContain("/docs")
  expect(help).toContain("Skill (project)")
})

test("plan preview formatting exposes role, model, routing, workers, and budget", () => {
  const plan = {
    mode: "radical",
    brain: { id: "brain", name: "Brain" },
    role: "backend",
    piModel: { provider: "anthropic", id: "claude-sonnet" },
    toolExecution: "parallel",
    routing: {
      source: "router-brain",
      confidence: 0.86,
      reason: "API and schema work",
      maxWorkerAgents: 4,
      maxParallelAgents: 4,
      maxTodos: 8,
    },
    workers: [{ role: "backend" }, { role: "librarian" }],
    todos: [],
  } as unknown as RuntimePlan

  expect(formatPlanPreviewSummary(plan)).toContain("primary backend")
  expect(formatPlanMetadataLine(plan)).toContain("mode=radical")
  expect(formatPlanMetadataLine(plan)).toContain("model=anthropic/claude-sonnet")
  expect(formatPlanMetadataLine(plan)).toContain("routing=routeBrain")
  expect(formatPlanMetadataLine(plan)).toContain("confidence 86%")
  expect(formatPlanWorkersBudgetLine(plan)).toContain("backend (primary), librarian")
  expect(formatPlanWorkersBudgetLine(plan)).toContain("budget: workers 4, parallel 4, todos 8")
})
