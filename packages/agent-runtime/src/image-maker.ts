import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { ModelPolicy, RoutedAgentRole } from "@braincode/brain"
import { getBraincodeHome, type ProjectSupport, type UserSupport } from "@braincode/config"
import { agentToBrainContextTransfer, type HandoffPacket, type WorkerResult } from "@braincode/context"
import type { BraincodeModel, ImageGenerationResult } from "@braincode/llm"
import { selectRuntimeModelCandidatesWithApiKey, type RuntimeModelCandidate } from "./model-selection"
import type { PromptWorkerResult } from "./review"
import { formatWorkerResults } from "./review"

export type ImageMakerWorkerPlan = {
  role: RoutedAgentRole
  goal: string
  todoIds?: string[]
}

export type ImageMakerWorkerResult = WorkerResult & {
  role: RoutedAgentRole
  goal: string
  todoIds: string[]
  status: "completed"
}

type ImageMakerSupportContext = ProjectSupport & {
  user?: UserSupport
}

export async function selectImageMakerModelCandidates(
  policy: ModelPolicy,
  models: BraincodeModel[],
  home?: string,
): Promise<RuntimeModelCandidate[]> {
  return selectRuntimeModelCandidatesWithApiKey(policy, models, home, { requiresImageGeneration: true })
}

function imageExtension(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return "jpg"
  if (/webp/i.test(mimeType)) return "webp"
  return "png"
}

export async function saveGeneratedImageArtifact(sessionId: string, result: ImageGenerationResult, home?: string): Promise<string> {
  const root = join(home ?? getBraincodeHome(), "generated-images", sessionId)
  await mkdir(root, { recursive: true })
  const path = join(root, `image-${Date.now()}.${imageExtension(result.mimeType)}`)
  await Bun.write(path, Buffer.from(result.base64, "base64"))
  return path
}

export function buildImageMakerPrompt(input: {
  request: string
  workerResults?: PromptWorkerResult[]
  projectSupport?: ImageMakerSupportContext
}): string {
  const sections = [
    "Create a raster image asset for this Braincode request.",
    "Use the user's requested subject, style, and constraints. Avoid adding visible text unless the user explicitly asked for text in the image.",
    "",
    "User request:",
    input.request,
  ]
  if (input.workerResults && input.workerResults.length > 0) {
    sections.push("", "Brain-supplied worker guidance:", formatWorkerResults(input.workerResults))
  }
  if (input.projectSupport?.agents || input.projectSupport?.user?.agents) {
    sections.push("", "Visual constraints from AGENTS.md may apply; honor explicit brand or safety constraints when they are relevant.")
  }
  return sections.join("\n")
}

export function imageMakerWorkerResult(
  worker: ImageMakerWorkerPlan,
  handoff: HandoffPacket,
  artifactPath: string,
  generation: ImageGenerationResult,
  prompt: string,
): ImageMakerWorkerResult {
  const summary = [
    `Generated image artifact: ${artifactPath}`,
    `Model: ${generation.provider}/${generation.modelId}`,
    `Bytes: ${generation.bytes}`,
    "Prompt:",
    prompt,
  ].join("\n")
  return {
    ...agentToBrainContextTransfer,
    handoffId: handoff.id,
    taskId: handoff.task.id,
    parentId: handoff.task.parentId,
    progress: {
      status: "completed",
      summary: `Generated image artifact at ${artifactPath}.`,
    },
    role: worker.role,
    goal: worker.goal,
    todoIds: worker.todoIds ?? [],
    status: "completed",
    summary,
    artifacts: [{ kind: "artifact", uri: artifactPath, label: "Generated image" }],
    risks: generation.revisedPrompt ? [`Provider revised prompt: ${generation.revisedPrompt}`] : [],
    nextQuestions: [],
  }
}
