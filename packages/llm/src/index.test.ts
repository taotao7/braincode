import { expect, test } from "bun:test"
import { listBuiltInModelCatalog, listBuiltInProviders, toBraincodeModel } from "./index"

test("listBuiltInProviders exposes Pi providers", () => {
  expect(listBuiltInProviders()).toContain("anthropic")
})

test("listBuiltInModelCatalog exposes selectable provider models", () => {
  const catalog = listBuiltInModelCatalog()
  const anthropic = catalog.find((entry) => entry.provider === "anthropic")

  expect(anthropic?.models.some((model) => model.modelId === "claude-sonnet-4-5-20250929")).toBe(true)
})

test("toBraincodeModel maps a Pi model into Braincode metadata", () => {
  const model = {
    id: "example-model",
    name: "Example Model",
    api: "example-api",
    provider: "example-provider",
    baseUrl: "https://example.test",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000,
    maxTokens: 100,
  } as never

  expect(toBraincodeModel(model)).toEqual({
    id: "example-provider/example-model",
    provider: "example-provider",
    modelId: "example-model",
    name: "Example Model",
    api: "example-api",
    baseUrl: "https://example.test",
    contextWindow: 1000,
    supportsTools: true,
    defaultThinkingLevel: "off",
  })
})
