import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, expect, test } from "bun:test"
import { ensureBraincodeHome } from "@braincode/config"
import { formatDoctorReport, runDoctor } from "./doctor"

const servers: Array<{ stop(force?: boolean): void }> = []

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true)
})

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

test("runDoctor --checks scopes output and status to project checks", async () => {
  const home = await tempDir("braincode-doctor-home-")
  const projectRoot = await tempDir("braincode-doctor-project-")
  await ensureBraincodeHome(home)
  await writeFile(join(projectRoot, "package.json"), JSON.stringify({ scripts: { check: "tsc --noEmit", test: "bun test" } }))
  await mkdir(join(projectRoot, ".braincode"), { recursive: true })
  await writeFile(join(projectRoot, ".braincode", "checks.json"), JSON.stringify({ scripts: [{ name: "check", command: "bun run check" }] }))

  const report = await runDoctor({ home, projectRoot, checksOnly: true })

  expect(report.status).toBe("ok")
  expect(report.config).toEqual([])
  expect(report.models).toEqual([])
  expect(report.tools).toEqual([])
  expect(report.permissions).toEqual([])
  expect(report.mcp).toEqual([])
  expect(report.checks.some((check) => check.id === "package.json" && check.status === "ok")).toBe(true)
  expect(formatDoctorReport(report)).toContain("Checks:")
  expect(formatDoctorReport(report)).not.toContain("MCP:")
})

test("runDoctor --mcp probes trusted project MCP health", async () => {
  const home = await tempDir("braincode-doctor-home-")
  const projectRoot = await tempDir("braincode-doctor-project-")
  await ensureBraincodeHome(home)

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const message = await request.json() as { id?: number; method?: string }
      if (message.method === "initialize") {
        return Response.json({
          jsonrpc: "2.0",
          id: message.id,
          result: { protocolVersion: "2024-11-05", serverInfo: { name: "doctor-test-mcp" } },
        })
      }
      if (message.method === "notifications/initialized") return new Response(null, { status: 202 })
      if (message.method === "tools/list") {
        return Response.json({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "ping" }] } })
      }
      return Response.json({ jsonrpc: "2.0", id: message.id, error: { message: "unknown method" } }, { status: 400 })
    },
  })
  servers.push(server)

  await writeFile(join(projectRoot, ".mcp.json"), JSON.stringify({
    mcpServers: {
      local: { type: "http", url: `http://127.0.0.1:${server.port}`, trusted: true },
    },
  }))

  const report = await runDoctor({ home, projectRoot, mcpOnly: true, mcpHealthTimeoutMs: 1000 })

  expect(report.config).toEqual([])
  expect(report.checks).toEqual([])
  expect(report.mcp.some((check) => check.id === "project-mcp-local-health" && check.status === "ok" && check.message.includes("1 tool"))).toBe(true)
})

test("runDoctor marks untrusted project MCP health as skipped", async () => {
  const home = await tempDir("braincode-doctor-home-")
  const projectRoot = await tempDir("braincode-doctor-project-")
  await ensureBraincodeHome(home)
  await writeFile(join(projectRoot, ".mcp.json"), JSON.stringify({
    mcpServers: {
      unsafe: { type: "http", url: "http://127.0.0.1:1" },
    },
  }))

  const report = await runDoctor({ home, projectRoot, mcpOnly: true, mcpHealthTimeoutMs: 50 })

  expect(report.status).toBe("warning")
  expect(report.mcp.some((check) => check.id === "project-mcp-unsafe-trusted" && check.status === "warning")).toBe(true)
  expect(report.mcp.some((check) => check.id === "project-mcp-unsafe-health" && check.status === "skipped")).toBe(true)
})
