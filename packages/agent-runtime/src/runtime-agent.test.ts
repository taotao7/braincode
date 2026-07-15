import { expect, test } from "bun:test"
import { requireAssistantText } from "./runtime-agent"

test("requireAssistantText joins assistant text blocks", () => {
  const text = requireAssistantText([
    {
      role: "assistant",
      content: [
        { type: "text", text: "first" },
        { type: "thinking", thinking: "hidden" },
        { type: "text", text: "second" },
      ],
    },
  ], { stage: "test", modelId: "model" })

  expect(text).toBe("first\nsecond")
})

test("requireAssistantText reports empty assistant responses with model context", () => {
  expect(() => requireAssistantText([
    { role: "assistant", content: [] },
  ], { modelId: "model", provider: "provider", api: "openai-completions" })).toThrow("Provider returned an empty assistant response from provider/model via openai-completions")
})

test("mutating MCP tools require approval while read-only MCP tools do not", async () => {
  const { toolCallRequiresApproval } = await import("./runtime-agent")

  expect(toolCallRequiresApproval("mcp__chrome-devtools__take_snapshot", {})).toBe(false)
  expect(toolCallRequiresApproval("mcp__codebase-memory__search_graph", {})).toBe(false)
  expect(toolCallRequiresApproval("mcp__connect", {})).toBe(false)
  expect(toolCallRequiresApproval("web_search", {})).toBe(false)

  expect(toolCallRequiresApproval("mcp__chrome-devtools__click", {})).toBe(true)
  expect(toolCallRequiresApproval("mcp__filesystem__write_file", {})).toBe(true)
  expect(toolCallRequiresApproval("mcp__deploy__run_release", {})).toBe(true)
})
