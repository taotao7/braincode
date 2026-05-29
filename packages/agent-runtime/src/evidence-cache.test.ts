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
  expect((second.details as { evidenceCache?: { reused?: boolean; callCount?: number; currentEntries?: number; evictedEntries?: number } }).evidenceCache).toMatchObject({
    reused: true,
    callCount: 2,
    currentEntries: 1,
    evictedEntries: 0,
  })
  expect((second.details as { evidenceCache?: { approxBytes?: number } }).evidenceCache?.approxBytes).toBeGreaterThan(0)
})

test("wrapToolsWithEvidenceCache evicts least recently used entries by maxEntries", async () => {
  let calls = 0
  const [tool] = wrapToolsWithEvidenceCache([
    {
      name: "read_file",
      label: "Read File",
      description: "test read",
      parameters: Type.Object({ path: Type.String() }),
      execute: async (_toolCallId, params) => {
        calls += 1
        return { content: [{ type: "text", text: `read ${(params as { path: string }).path} call ${calls}` }], details: { calls } }
      },
    },
  ] satisfies AgentTool[], createToolEvidenceCache({ maxEntries: 2 }))

  if (!tool) throw new Error("missing wrapped tool")
  await tool.execute("read-a-1", { path: "a.ts" } as never)
  await tool.execute("read-b-1", { path: "b.ts" } as never)
  await tool.execute("read-a-2", { path: "a.ts" } as never)
  const c = await tool.execute("read-c-1", { path: "c.ts" } as never)
  const b = await tool.execute("read-b-2", { path: "b.ts" } as never)

  expect(calls).toBe(4)
  expect(c.content[0]?.type === "text" ? c.content[0].text : "").toContain("read c.ts call 3")
  expect(b.content[0]?.type === "text" ? b.content[0].text : "").toContain("read b.ts call 4")
  expect((b.details as { evidenceCache?: { currentEntries?: number; evictedEntries?: number } }).evidenceCache).toMatchObject({
    currentEntries: 2,
    evictedEntries: 2,
  })
})

test("wrapToolsWithEvidenceCache evicts entries by byte limit", async () => {
  let calls = 0
  const [tool] = wrapToolsWithEvidenceCache([
    {
      name: "search_files",
      label: "Search Files",
      description: "test search",
      parameters: Type.Object({ query: Type.String() }),
      execute: async (_toolCallId, params) => {
        calls += 1
        return { content: [{ type: "text", text: `${(params as { query: string }).query}:${"x".repeat(40)}` }], details: { calls } }
      },
    },
  ] satisfies AgentTool[], createToolEvidenceCache({ maxBytes: 100 }))

  if (!tool) throw new Error("missing wrapped tool")
  await tool.execute("search-a", { query: "a" } as never)
  const second = await tool.execute("search-b", { query: "b" } as never)

  expect(calls).toBe(2)
  expect((second.details as { evidenceCache?: { currentEntries?: number; evictedEntries?: number; approxBytes?: number } }).evidenceCache).toMatchObject({
    currentEntries: 1,
    evictedEntries: 1,
  })
  expect((second.details as { evidenceCache?: { approxBytes?: number } }).evidenceCache?.approxBytes).toBeLessThanOrEqual(100)
})

test("wrapToolsWithEvidenceCache expires entries by ttl", async () => {
  let calls = 0
  const [tool] = wrapToolsWithEvidenceCache([
    {
      name: "git_diff",
      label: "Git Diff",
      description: "test diff",
      parameters: Type.Object({}),
      execute: async () => {
        calls += 1
        return { content: [{ type: "text", text: `diff call ${calls}` }], details: { calls } }
      },
    },
  ] satisfies AgentTool[], createToolEvidenceCache({ ttlMs: 0 }))

  if (!tool) throw new Error("missing wrapped tool")
  await tool.execute("diff-1", {} as never)
  const second = await tool.execute("diff-2", {} as never)

  expect(calls).toBe(2)
  expect(second.content[0]?.type === "text" ? second.content[0].text : "").toContain("diff call 2")
  expect((second.details as { evidenceCache?: { reused?: boolean; currentEntries?: number; evictedEntries?: number } }).evidenceCache).toMatchObject({
    reused: false,
    currentEntries: 1,
    evictedEntries: 1,
  })
})
