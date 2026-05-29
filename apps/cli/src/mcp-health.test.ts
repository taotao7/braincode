import { expect, test } from "bun:test"
import { checkMcpHealth } from "./mcp-health"

test("checkMcpHealth probes streamable HTTP MCP servers", async () => {
  let sawSessionHeader = false
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") {
        return new Response("method not allowed", { status: 405 })
      }
      const message = await request.json() as { id?: number; method?: string }
      if (message.method === "initialize") {
        return Response.json(
          {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2024-11-05",
              serverInfo: { name: "test-http-mcp", version: "1.0.0" },
            },
          },
          { headers: { "mcp-session-id": "session-1" } },
        )
      }
      if (message.method === "notifications/initialized") {
        return new Response(null, { status: 202 })
      }
      if (message.method === "tools/list") {
        sawSessionHeader = request.headers.get("mcp-session-id") === "session-1"
        return Response.json({
          jsonrpc: "2.0",
          id: message.id,
          result: { tools: [{ name: "search", inputSchema: { type: "object" } }] },
        })
      }
      return Response.json({ jsonrpc: "2.0", id: message.id, error: { message: "unknown method" } }, { status: 400 })
    },
  })

  try {
    const result = await checkMcpHealth({
      type: "http",
      url: `http://127.0.0.1:${server.port}`,
    })

    expect(result.status).toBe("ok")
    expect(result.toolCount).toBe(1)
    expect(result.serverInfo?.name).toBe("test-http-mcp")
    expect(sawSessionHeader).toBe(true)
  } finally {
    server.stop(true)
  }
})
