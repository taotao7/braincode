import { expect, test } from "bun:test"
import type { AgentTool } from "./pi-agent"
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

test("read-only dispatch_specialist call does not invalidate cached evidence despite the 'patch' substring", async () => {
  let reads = 0
  const cache = createToolEvidenceCache()
  const [readTool, dispatchTool] = wrapToolsWithEvidenceCache([
    {
      name: "read_file",
      label: "Read File",
      description: "test read",
      parameters: Type.Object({ path: Type.String() }),
      execute: async () => {
        reads += 1
        return { content: [{ type: "text", text: `read ${reads}` }], details: { reads } }
      },
    },
    {
      name: "dispatch_specialist",
      label: "Dispatch Specialist",
      description: "test dispatch",
      parameters: Type.Object({ role: Type.String(), goal: Type.String() }),
      execute: async () => ({ content: [{ type: "text", text: "specialist findings" }], details: { ok: true } }),
    },
  ] satisfies AgentTool[], cache)

  if (!readTool || !dispatchTool) throw new Error("missing wrapped tools")
  await readTool.execute("r1", { path: "a.ts" } as never)
  // A dispatch in between must not reset the read-only cache.
  await dispatchTool.execute("d1", { role: "security", goal: "audit" } as never)
  const second = await readTool.execute("r2", { path: "a.ts" } as never)

  expect(reads).toBe(1)
  expect(second.content[0]?.type === "text" ? second.content[0].text : "").toContain("Reusing cached read-only result")
})

test("wrapToolsWithEvidenceCache hard-blocks repeated identical read-only calls and stops re-running the tool", async () => {
  let calls = 0
  const [tool] = wrapToolsWithEvidenceCache([
    {
      name: "read_file",
      label: "Read File",
      description: "test read",
      parameters: Type.Object({ path: Type.String() }),
      execute: async () => {
        calls += 1
        return { content: [{ type: "text", text: `read call ${calls}` }], details: { calls } }
      },
    },
  ] satisfies AgentTool[], createToolEvidenceCache())

  if (!tool) throw new Error("missing wrapped tool")
  await tool.execute("read-1", { path: "a.ts" } as never) // real call, count 1
  await tool.execute("read-2", { path: "a.ts" } as never) // reused, count 2
  await tool.execute("read-3", { path: "a.ts" } as never) // reused, count 3
  const fourth = await tool.execute("read-4", { path: "a.ts" } as never) // count 4 -> blocked

  // The real tool only ran once; subsequent identical calls were served from cache.
  expect(calls).toBe(1)
  const fourthText = fourth.content[0]?.type === "text" ? fourth.content[0].text : ""
  expect(fourthText).toContain("Blocked")
  expect(fourthText).toContain("change direction")
  // Cached evidence is still attached so the model can answer from it.
  expect(fourthText).toContain("read call 1")
  expect((fourth.details as { evidenceCache?: { blocked?: boolean; consecutiveCount?: number } }).evidenceCache).toMatchObject({
    blocked: true,
    consecutiveCount: 4,
  })
})

test("wrapToolsWithEvidenceCache caches read-only MCP tools and web_search but not write MCP tools", async () => {
  let searchCalls = 0
  let writeCalls = 0
  const cache = createToolEvidenceCache()
  const [searchTool, webTool, writeTool] = wrapToolsWithEvidenceCache([
    {
      name: "mcp__codebase__search_graph",
      label: "Search Graph",
      description: "read-only mcp search",
      parameters: Type.Object({ query: Type.String() }),
      execute: async () => {
        searchCalls += 1
        return { content: [{ type: "text", text: `graph ${searchCalls}` }], details: { searchCalls } }
      },
    },
    {
      name: "web_search",
      label: "Web Search",
      description: "web search",
      parameters: Type.Object({ query: Type.String() }),
      execute: async () => ({ content: [{ type: "text", text: "web result" }], details: {} }),
    },
    {
      name: "mcp__fs__write_file",
      label: "Write File",
      description: "mutating mcp write",
      parameters: Type.Object({ path: Type.String(), content: Type.String() }),
      execute: async () => {
        writeCalls += 1
        return { content: [{ type: "text", text: `wrote ${writeCalls}` }], details: { writeCalls } }
      },
    },
  ] satisfies AgentTool[], cache)

  if (!searchTool || !webTool || !writeTool) throw new Error("missing wrapped tools")

  await searchTool.execute("s1", { query: "auth" } as never)
  const searchSecond = await searchTool.execute("s2", { query: "auth" } as never)
  expect(searchCalls).toBe(1)
  expect(searchSecond.content[0]?.type === "text" ? searchSecond.content[0].text : "").toContain("Reusing cached read-only result")

  // A write MCP call must invalidate the cache (mutating side effects).
  await writeTool.execute("w1", { path: "a.ts", content: "x" } as never)
  expect(writeCalls).toBe(1)
  const searchThird = await searchTool.execute("s3", { query: "auth" } as never)
  expect(searchCalls).toBe(2) // cache was reset by the write, so re-run
  expect((searchThird.details as { evidenceCache?: { reused?: boolean } }).evidenceCache).toMatchObject({ reused: false })

  // web_search dedups by identical args.
  await webTool.execute("web-1", { query: "weather" } as never)
  const webSecond = await webTool.execute("web-2", { query: "weather" } as never)
  expect(webSecond.content[0]?.type === "text" ? webSecond.content[0].text : "").toContain("Reusing cached read-only result")
})

test("a mutating MCP tool invalidates a cached read-only result so the next read is not stale", async () => {
  let snapshotCalls = 0
  const cache = createToolEvidenceCache()
  const [snapshotTool, clickTool] = wrapToolsWithEvidenceCache([
    {
      name: "mcp__chrome__take_snapshot",
      label: "Take Snapshot",
      description: "read-only page snapshot",
      parameters: Type.Object({}),
      execute: async () => {
        snapshotCalls += 1
        return { content: [{ type: "text", text: `snapshot ${snapshotCalls}` }], details: { snapshotCalls } }
      },
    },
    {
      name: "mcp__chrome__click",
      label: "Click",
      description: "mutating page click",
      parameters: Type.Object({ uid: Type.String() }),
      execute: async () => ({ content: [{ type: "text", text: "clicked" }], details: {} }),
    },
  ] satisfies AgentTool[], cache)

  if (!snapshotTool || !clickTool) throw new Error("missing wrapped tools")

  // 1. Snapshot is cached.
  await snapshotTool.execute("snap-1", {} as never)
  const reused = await snapshotTool.execute("snap-2", {} as never)
  expect(snapshotCalls).toBe(1)
  expect(reused.content[0]?.type === "text" ? reused.content[0].text : "").toContain("Reusing cached read-only result")

  // 2. A click mutates the page; it must reset the cache even though its name is
  //    not in the legacy invalidation list.
  await clickTool.execute("click-1", { uid: "btn" } as never)

  // 3. The next snapshot must re-run, not serve the pre-click cached snapshot.
  const fresh = await snapshotTool.execute("snap-3", {} as never)
  expect(snapshotCalls).toBe(2)
  expect(fresh.content[0]?.type === "text" ? fresh.content[0].text : "").toContain("snapshot 2")
  expect((fresh.details as { evidenceCache?: { reused?: boolean } }).evidenceCache).toMatchObject({ reused: false })
})

test("hard block fires even when the result is too large to cache, instead of re-running forever", async () => {
  let calls = 0
  const big = "x".repeat(2048)
  // maxBytes below the result size so nothing is ever cached.
  const [tool] = wrapToolsWithEvidenceCache([
    {
      name: "read_file",
      label: "Read File",
      description: "test read",
      parameters: Type.Object({ path: Type.String() }),
      execute: async () => {
        calls += 1
        return { content: [{ type: "text", text: `${big}-${calls}` }], details: { calls } }
      },
    },
  ] satisfies AgentTool[], createToolEvidenceCache({ maxBytes: 100 }))

  if (!tool) throw new Error("missing wrapped tool")
  // Calls 1-3 re-run (no cache, below threshold); call 4 hard-blocks WITHOUT a
  // cached entry, so the real tool stops running.
  await tool.execute("r1", { path: "a.ts" } as never)
  await tool.execute("r2", { path: "a.ts" } as never)
  await tool.execute("r3", { path: "a.ts" } as never)
  expect(calls).toBe(3)
  const fourth = await tool.execute("r4", { path: "a.ts" } as never)
  expect(calls).toBe(3) // tool was NOT run a 4th time
  const fourthText = fourth.content[0]?.type === "text" ? fourth.content[0].text : ""
  expect(fourthText).toContain("Blocked")
  expect(fourthText).toContain("too large to retain")
  expect((fourth.details as { evidenceCache?: { blocked?: boolean; reused?: boolean } }).evidenceCache).toMatchObject({
    blocked: true,
    reused: false,
  })
})
