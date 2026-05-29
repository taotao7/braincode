import { expect, test } from "bun:test"
import { buildPrimaryPrompt, createWorkerHandoff, formatProjectSupportPromptSection } from "./workers"
import type { RuntimeWorkerPlan } from "./router"

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
      skills: [{ id: "local-skill", path: "/repo/.agents/skill/local/SKILL.md", content: "skill rules" }],
    } as never,
  )

  expect(handoff.task.id).toBe("ctx-worker")
  expect(handoff.task.parentId).toBe("parent-task")
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/AGENTS.md", label: "AGENTS.md" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/.mcp.json", label: ".mcp.json" })
  expect(handoff.task.contextRefs).toContainEqual({ kind: "file", uri: "/repo/.agents/skill/local/SKILL.md", label: "skill:local-skill" })
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
