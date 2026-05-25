import { expect, test } from "bun:test"
import { listBuiltInProviders, toBraincodeModel } from "./index"

test("listBuiltInProviders exposes Pi providers", () => {
  expect(listBuiltInProviders()).toContain("anthropic")
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
    contextWindow: 1000,
    supportsTools: true,
    defaultThinkingLevel: "off",
  })
})
