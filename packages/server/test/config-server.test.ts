import { afterAll, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defaultBrains, defaultModels, readBrains, readModels, type BraincodeModels, type BraincodeSettings } from "@braincode/config"
import { createConfigRequestHandler, startConfigServer } from "../src/index"

const tempDirs: string[] = []

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// All requests are served in-process against a temp braincode home, so tests
// never read or mutate the real ~/.braincode.
async function makeHandler(): Promise<{ handle: (method: string, path: string, body?: unknown) => Promise<Response>; home: string; projectRoot: string }> {
  const home = await makeTempDir("braincode-server-test-home-")
  const projectRoot = await makeTempDir("braincode-server-test-project-")
  const handler = createConfigRequestHandler({ home, projectRoot })
  return {
    home,
    projectRoot,
    handle: (method, path, body) =>
      handler(new Request(`http://localhost${path}`, {
        method,
        ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      })),
  }
}

async function apiData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { ok: boolean; data?: T; error?: string }
  expect(payload.ok).toBe(true)
  return payload.data as T
}

test("GET /api/health reports ok", async () => {
  const { handle } = await makeHandler()
  const response = await handle("GET", "/api/health")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ name: "braincode", status: "ok" })
})

test("unknown routes return a 404 ApiResult error", async () => {
  const { handle } = await makeHandler()
  const response = await handle("GET", "/api/nope")
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ ok: false, error: "Not found" })
})

test("GET then PUT /api/settings round-trips through the injected home", async () => {
  const { handle } = await makeHandler()
  const settings = await apiData<BraincodeSettings>(await handle("GET", "/api/settings"))
  expect(settings.defaultBrainId).toBeDefined()

  const updated = { ...settings, defaultBrainId: "rush" }
  await apiData(await handle("PUT", "/api/settings", updated))
  const reread = await apiData<BraincodeSettings>(await handle("GET", "/api/settings"))
  expect(reread.defaultBrainId).toBe("rush")
})

test("GET /api/brains seeds defaults when the store is empty", async () => {
  const { handle, home } = await makeHandler()
  await writeFile(join(home, "brains.json"), JSON.stringify({ ...defaultBrains, brains: [] }))
  const brains = await apiData<typeof defaultBrains>(await handle("GET", "/api/brains"))
  expect(brains.brains.length).toBe(defaultBrains.brains.length)
  // The seeded defaults must also have been persisted, not just returned.
  const persisted = await readBrains(home)
  expect(persisted.brains.length).toBe(defaultBrains.brains.length)
})

test("PUT /api/brains persists and GET returns the stored document", async () => {
  const { handle } = await makeHandler()
  const brains = await apiData<typeof defaultBrains>(await handle("GET", "/api/brains"))
  const renamed = { ...brains, brains: brains.brains.map((brain, index) => (index === 0 ? { ...brain, name: "Renamed Brain" } : brain)) }
  await apiData(await handle("PUT", "/api/brains", renamed))
  const reread = await apiData<typeof defaultBrains>(await handle("GET", "/api/brains"))
  expect(reread.brains[0]?.name).toBe("Renamed Brain")
})

test("GET /api/models seeds defaults and PUT round-trips custom models", async () => {
  const { handle, home } = await makeHandler()
  await writeFile(join(home, "models.json"), JSON.stringify({ ...defaultModels, models: [] }))
  const models = await apiData<BraincodeModels>(await handle("GET", "/api/models"))
  expect(models.models.length).toBe(defaultModels.models.length)

  const custom: BraincodeModels = {
    ...models,
    models: [
      {
        id: "proxy/custom-1",
        provider: "proxy",
        modelId: "custom-1",
        name: "Custom One",
        api: "openai-completions",
        baseUrl: "https://proxy.example.com/v1",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        defaultThinkingLevel: "medium",
      },
    ],
  }
  await apiData(await handle("PUT", "/api/models", custom))
  expect((await readModels(home)).models.map((model) => model.id)).toEqual(["proxy/custom-1"])
})

test("GET /api/role-prompts exposes the built-in role prompt map", async () => {
  const { handle } = await makeHandler()
  const data = await apiData<{ prompts: Record<string, string> }>(await handle("GET", "/api/role-prompts"))
  expect(Object.keys(data.prompts).length).toBeGreaterThan(0)
})

test("POST /api/provider-api-key stores the key and auth status reflects it", async () => {
  const { handle } = await makeHandler()
  const status = await apiData<{ providerAuth: Array<{ provider: string; kind: string }> }>(
    await handle("POST", "/api/provider-api-key", { provider: "openrouter", apiKey: "sk-test-123" }),
  )
  expect(status.providerAuth).toEqual([{ provider: "openrouter", kind: "api-key" }])

  const reread = await apiData<{ providerAuth: Array<{ provider: string; kind: string }> }>(await handle("GET", "/api/auth/status"))
  expect(reread.providerAuth.some((entry) => entry.provider === "openrouter" && entry.kind === "api-key")).toBe(true)
})

test("POST /api/provider-api-key without a key fails with a 500 ApiResult", async () => {
  const { handle } = await makeHandler()
  const response = await handle("POST", "/api/provider-api-key", { provider: "openrouter" })
  expect(response.status).toBe(500)
  const payload = (await response.json()) as { ok: boolean; error?: string }
  expect(payload.ok).toBe(false)
  expect(payload.error).toContain("apiKey is required")
})

test("malformed JSON bodies fail as an ApiResult error instead of crashing", async () => {
  const { handle } = await makeHandler()
  const handler = createConfigRequestHandler({ home: await makeTempDir("braincode-server-test-home-") })
  const response = await handler(new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: "{not json",
  }))
  expect(response.status).toBe(500)
  expect(((await response.json()) as { ok: boolean }).ok).toBe(false)
  // Keep the shared handle referenced so both handlers exercised the same suite setup.
  await handle("GET", "/api/health")
})

test("GET then PUT /api/tools round-trips tool configuration", async () => {
  const { handle } = await makeHandler()
  const tools = await apiData<{ tools: Array<{ name: string; enabled: boolean }> }>(await handle("GET", "/api/tools"))
  expect(tools.tools.length).toBeGreaterThan(0)

  const toggled = { ...tools, tools: tools.tools.map((tool, index) => (index === 0 ? { ...tool, enabled: !tool.enabled } : tool)) }
  await apiData(await handle("PUT", "/api/tools", toggled))
  const reread = await apiData<{ tools: Array<{ name: string; enabled: boolean }> }>(await handle("GET", "/api/tools"))
  expect(reread.tools[0]?.enabled).toBe(toggled.tools[0]?.enabled)
})

test("POST /api/permission-preview evaluates the stored permission policy", async () => {
  const { handle } = await makeHandler()
  const preview = await apiData<{ action: string }>(
    await handle("POST", "/api/permission-preview", { toolName: "edit_file", path: "src/index.ts" }),
  )
  expect(typeof preview.action).toBe("string")
  expect(preview.action.length).toBeGreaterThan(0)
})

test("GET /api/mcp/user returns an empty server map for a fresh home", async () => {
  const { handle } = await makeHandler()
  const data = await apiData<{ mcp: { path: string; serverNames: string[] } }>(await handle("GET", "/api/mcp/user"))
  expect(data.mcp.serverNames).toEqual([])
  expect(data.mcp.path.endsWith("mcp.json")).toBe(true)
})

test("GET /api/health-check detects the project package manager from lockfiles", async () => {
  const { handle, projectRoot } = await makeHandler()
  await writeFile(join(projectRoot, "pnpm-lock.yaml"), "lockfileVersion: 9\n")
  const data = await apiData<{ packageManager: { name: string; lockfile: string | null; detected: boolean }; providers: unknown[]; models: unknown[] }>(
    await handle("GET", "/api/health-check"),
  )
  expect(data.packageManager).toEqual({ name: "pnpm", lockfile: "pnpm-lock.yaml", detected: true })
  expect(Array.isArray(data.providers)).toBe(true)
  expect(Array.isArray(data.models)).toBe(true)
})

test("GET /api/usage-stats returns an empty aggregate for a fresh home", async () => {
  const { handle } = await makeHandler()
  const data = await apiData<{ totals?: unknown }>(await handle("GET", "/api/usage-stats"))
  expect(data).toBeDefined()
})

test("startConfigServer serves requests over HTTP against the injected home", async () => {
  const home = await makeTempDir("braincode-server-test-home-")
  const projectRoot = await makeTempDir("braincode-server-test-project-")
  const handle = await startConfigServer({ host: "127.0.0.1", port: 0, home, projectRoot })
  try {
    const response = await fetch(`${handle.url}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: "braincode", status: "ok" })
  } finally {
    handle.server.stop(true)
  }
})
