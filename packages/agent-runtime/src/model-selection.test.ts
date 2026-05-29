import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeProviderApiKey } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { selectRuntimeModelCandidatesWithApiKey } from "./model-selection"

const textModel: BraincodeModel = {
  id: "custom/text",
  provider: "text-provider",
  modelId: "text",
  name: "Text",
  api: "openai-completions",
  baseUrl: "http://localhost:9999/v1",
  contextWindow: 128000,
  supportsTools: true,
  supportsVision: false,
}

const visionModel: BraincodeModel = {
  id: "custom/vision",
  provider: "vision-provider",
  modelId: "vision",
  name: "Vision",
  api: "openai-completions",
  baseUrl: "http://localhost:9999/v1",
  contextWindow: 128000,
  supportsTools: true,
  supportsVision: true,
}

test("selectRuntimeModelCandidatesWithApiKey keeps the policy chain and applies vision/API-key requirements", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-model-selection-test-"))
  try {
    await writeProviderApiKey("vision-provider", "vision-secret", home)

    const candidates = await selectRuntimeModelCandidatesWithApiKey(
      { modelId: "custom/text", fallbackModelIds: ["custom/vision"], thinkingLevel: "low" },
      [textModel, visionModel],
      home,
      { requiresVision: true },
    )

    expect(candidates.map(({ selection }) => selection.configured.id)).toEqual(["custom/vision"])
    expect(candidates[0]?.apiKey).toBe("vision-secret")
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
