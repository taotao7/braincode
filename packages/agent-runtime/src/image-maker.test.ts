import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeProviderApiKey, type ProjectSupport } from "@braincode/config"
import type { HandoffPacket } from "@braincode/context"
import type { ImageGenerationResult } from "@braincode/llm"
import { buildImageMakerPrompt, imageMakerWorkerResult, saveGeneratedImageArtifact, selectImageMakerModelCandidates } from "./image-maker"

test("selectImageMakerModelCandidates requires image generation capable models", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-image-maker-selection-home-test-"))
  try {
    await writeProviderApiKey("openai", "test-key", home)

    const candidates = await selectImageMakerModelCandidates(
      {
        modelId: "openai/gpt-image-2",
        thinkingLevel: "off",
        imageModel: {
          provider: "openai",
          modelId: "gpt-image-2",
          name: "GPT Image 2",
          baseUrl: "https://api.openai.com/v1",
          api: "openai-images",
        },
      },
      [],
      home,
    )

    expect(candidates[0]?.apiKey).toBe("test-key")
    expect(candidates[0]?.selection.configured.supportsImageGeneration).toBe(true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("saveGeneratedImageArtifact stores decoded images under the session directory", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-image-maker-home-test-"))
  try {
    const result: ImageGenerationResult = {
      provider: "openai",
      modelId: "gpt-image-2",
      base64: Buffer.from("image-bytes").toString("base64"),
      bytes: "image-bytes".length,
      mimeType: "image/jpeg",
    }

    const path = await saveGeneratedImageArtifact("session-1", result, home)

    expect(path.startsWith(join(home, "generated-images", "session-1"))).toBe(true)
    expect(path.endsWith(".jpg")).toBe(true)
    expect(await Bun.file(path).text()).toBe("image-bytes")
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("buildImageMakerPrompt includes worker guidance and project visual constraints", () => {
  const prompt = buildImageMakerPrompt({
    request: "make a product screenshot style hero image",
    workerResults: [
      {
        role: "designer",
        status: "completed",
        taskId: "designer-task",
        parentId: "session-1",
        goal: "Define visual direction",
        progress: { status: "completed", summary: "Use a concrete product surface." },
        summary: "Use a clean app UI, not abstract decoration.",
        risks: ["Avoid unreadable UI text."],
        nextQuestions: [],
      },
    ],
    projectSupport: {
      root: "/project",
      agents: { path: "/project/AGENTS.md", content: "Visual style applies." },
      skills: [],
    } as ProjectSupport,
  })

  expect(prompt).toContain("make a product screenshot style hero image")
  expect(prompt).toContain("Brain-supplied worker guidance")
  expect(prompt).toContain("Use a clean app UI")
  expect(prompt).toContain("Project visual constraints from AGENTS.md")
})

test("imageMakerWorkerResult records artifact metadata and revised prompt risk", () => {
  const handoff: HandoffPacket = {
    fromLayer: "brain",
    toLayer: "agent",
    id: "handoff-1",
    task: {
      id: "image-task",
      parentId: "session-1",
      layer: "agent",
      agentRole: "imageMaker",
      goal: "Generate an icon",
      progress: { status: "pending" },
      contextRefs: [],
    },
    constraints: [],
    expectedResult: "image",
  }
  const result = imageMakerWorkerResult(
    { role: "imageMaker", goal: "Generate an icon", todoIds: ["todo-image"] },
    handoff,
    "/tmp/icon.png",
    {
      provider: "openai",
      modelId: "gpt-image-2",
      base64: "",
      bytes: 42,
      mimeType: "image/png",
      revisedPrompt: "safer icon prompt",
    },
    "Generate an icon",
  )

  expect(result.status).toBe("completed")
  expect(result.taskId).toBe("image-task")
  expect(result.parentId).toBe("session-1")
  expect(result.todoIds).toEqual(["todo-image"])
  expect(result.artifacts).toEqual([{ kind: "artifact", uri: "/tmp/icon.png", label: "Generated image" }])
  expect(result.summary).toContain("Model: openai/gpt-image-2")
  expect(result.risks).toEqual(["Provider revised prompt: safer icon prompt"])
})
