import { expect, test } from "bun:test"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { Type } from "typebox"
import { createToolEvidenceCache, wrapToolsWithEvidenceCache } from "./evidence-cache"

test("wrapToolsWithEvidenceCache reuses read-only results with stable argument keys", async () => {
  let calls = 0
  const [tool] = wrapToolsWithEvidenceCache([
    {
      name: "read_file",
      label: "Read File",
      description: "test read",
      parameters: Type.Object({
        path: Type.String(),
        options: Type.Optional(Type.Object({
          a: Type.Number(),
          b: Type.Number(),
        })),
      }),
      execute: async () => {
        calls += 1
        return { content: [{ type: "text", text: `read call ${calls}` }], details: { calls } }
      },
    },
  ] satisfies AgentTool[], createToolEvidenceCache())

  if (!tool) throw new Error("missing wrapped tool")
  await tool.execute("read-1", { path: "README.md", options: { b: 2, a: 1 } } as never)
  const second = await tool.execute("read-2", { options: { a: 1, b: 2 }, path: "README.md" } as never)

  expect(calls).toBe(1)
  expect(second.content[0]?.type === "text" ? second.content[0].text : "").toContain("Reusing cached read-only result")
  expect((second.details as { evidenceCache?: { reused?: boolean; callCount?: number } }).evidenceCache).toMatchObject({
    reused: true,
    callCount: 2,
  })
})
