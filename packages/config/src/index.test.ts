import { mkdtemp, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, expect, test } from "bun:test"
import { appendSessionRecord, ensureBraincodeHome, getProviderApiKey, readAuthStatus, readBrains, readModels, readSettings, readTools, writeBrains, writeModels, writeSettings, writeTools } from "./index"

const tempHomes: string[] = []

async function makeTempHome() {
  const home = await mkdtemp(join(tmpdir(), "braincode-config-test-"))
  tempHomes.push(home)
  return home
}

afterEach(async () => {
  await Promise.all(tempHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

test("ensureBraincodeHome creates config files and directories", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await expect(Bun.file(paths.settings).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.auth).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.brains).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.models).exists()).resolves.toBe(true)
  await expect(Bun.file(paths.tools).exists()).resolves.toBe(true)

  expect((await stat(paths.sessions)).isDirectory()).toBe(true)
  expect((await stat(paths.logs)).isDirectory()).toBe(true)
  expect((await stat(paths.cache)).isDirectory()).toBe(true)
})

test("settings can be read and written from an explicit home", async () => {
  const home = await makeTempHome()
  const settings = await readSettings(home)

  const nextSettings = {
    ...settings,
    mode: "radical" as const,
    configServer: {
      ...settings.configServer,
      port: 18080,
    },
    defaultBrainId: "local-test",
  }

  await writeSettings(nextSettings, home)

  await expect(readSettings(home)).resolves.toEqual(nextSettings)
})

test("non-secret config documents can be read and written from an explicit home", async () => {
  const home = await makeTempHome()

  await writeBrains({ brains: [{ id: "default" }] }, home)
  await writeModels({ models: [{ id: "fast" }] }, home)
  await writeTools({ tools: [{ name: "read" }] }, home)

  await expect(readBrains(home)).resolves.toEqual({ brains: [{ id: "default" }] })
  await expect(readModels(home)).resolves.toEqual({ models: [{ id: "fast" }] })
  await expect(readTools(home)).resolves.toEqual({ tools: [{ name: "read" }] })
})

test("auth status lists configured provider names without returning secrets", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await Bun.write(paths.auth, JSON.stringify({ providers: { anthropic: { apiKey: "secret" } } }))

  await expect(readAuthStatus(home)).resolves.toEqual({ configuredProviders: ["anthropic"] })
})

test("getProviderApiKey supports string and object auth entries", () => {
  expect(getProviderApiKey({ providers: { anthropic: "sk-ant" } }, "anthropic")).toBe("sk-ant")
  expect(getProviderApiKey({ providers: { anthropic: { apiKey: "sk-ant-object" } } }, "anthropic")).toBe("sk-ant-object")
  expect(getProviderApiKey({ providers: { anthropic: { token: "not-supported" } } }, "anthropic")).toBeUndefined()
})

test("non-secret config documents must keep their top-level arrays", async () => {
  const home = await makeTempHome()

  await expect(writeBrains({} as never, home)).rejects.toThrow("brains.json must contain a brains array")
  await expect(writeModels({} as never, home)).rejects.toThrow("models.json must contain a models array")
  await expect(writeTools({} as never, home)).rejects.toThrow("tools.json must contain a tools array")
})

test("appendSessionRecord writes jsonl session records", async () => {
  const home = await makeTempHome()
  const paths = await ensureBraincodeHome(home)

  await appendSessionRecord("test-session", { type: "run_start", prompt: "hello" }, home)

  const text = await Bun.file(join(paths.sessions, "test-session.jsonl")).text()
  expect(text.trim()).toContain('"type":"run_start"')
})
