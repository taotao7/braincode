import type { ImageContent, Model } from "@earendil-works/pi-ai"
import type { AgentRole, ImageModelPolicy, ModelPolicy, RoutedAgentRole } from "@braincode/brain"
import { isImageGenerationModel, readProviderRuntimeApiKey, resolveBuiltInPiModel, type BraincodeModel } from "@braincode/llm"
import { debugLog } from "@braincode/shared"

export type RuntimeModelSelection = {
  requested: ModelPolicy
  configured: BraincodeModel
  piModel: Model<any>
}

export type RuntimeModelRequirements = {
  requiresVision?: boolean
  requiresImageGeneration?: boolean
}

export type RuntimePiModelSummary = {
  provider: string
  id: string
  name: string
  contextWindow: number
}

export type RuntimeModelCandidate = {
  selection: RuntimeModelSelection
  apiKey: string
}

function runtimeModelSupportsVision(selection: RuntimeModelSelection): boolean {
  if (selection.configured.supportsVision === false) return false
  if (selection.piModel.input?.includes("image")) return true
  return selection.configured.supportsVision === true
}

function runtimeModelRequirementError(selection: RuntimeModelSelection, requirements?: RuntimeModelRequirements): string | undefined {
  if (requirements?.requiresImageGeneration) {
    return isImageGenerationModel(selection.configured) ? undefined : "image generation requires an OpenAI Images API model"
  }
  if (isImageGenerationModel(selection.configured)) {
    return "image generation models cannot run text agent turns"
  }
  if (requirements?.requiresVision && !runtimeModelSupportsVision(selection)) {
    return "image input requires a vision-capable model"
  }
  return undefined
}

export function runtimeModelRequirementsForImages(images: ImageContent[]): RuntimeModelRequirements | undefined {
  return images.length > 0 ? { requiresVision: true } : undefined
}

export function runtimeModelRequirementsForRole(role: AgentRole | RoutedAgentRole, images: ImageContent[]): RuntimeModelRequirements | undefined {
  if (role === "imageMaker") return { requiresImageGeneration: true }
  return runtimeModelRequirementsForImages(images)
}

function imageModelPolicyToBraincodeModel(imageModel: ImageModelPolicy): BraincodeModel {
  const provider = imageModel.provider.trim()
  const modelId = imageModel.modelId.trim()
  return {
    id: `${provider}/${modelId}`,
    provider,
    modelId,
    name: imageModel.name?.trim() || modelId,
    api: "openai-images",
    ...(imageModel.baseUrl?.trim() ? { baseUrl: imageModel.baseUrl.trim() } : {}),
    contextWindow: 32000,
    supportsTools: false,
    supportsVision: false,
    supportsImageGeneration: true,
    defaultThinkingLevel: "off",
  }
}

function imageGenerationSelectionFromPolicy(policy: ModelPolicy): RuntimeModelSelection | undefined {
  const imageModel = policy.imageModel
  if (!imageModel?.provider?.trim() || !imageModel.modelId?.trim()) return undefined
  const configured = imageModelPolicyToBraincodeModel(imageModel)
  return {
    requested: policy,
    configured,
    piModel: {
      id: configured.modelId,
      name: configured.name,
      provider: configured.provider,
      api: "openai-images",
      contextWindow: configured.contextWindow,
      maxTokens: 0,
    } as unknown as Model<any>,
  }
}

function createRuntimeModelSelection(policy: ModelPolicy, configured: BraincodeModel): RuntimeModelSelection {
  const piModel = isImageGenerationModel(configured)
    ? ({
        id: configured.modelId,
        name: configured.name,
        provider: configured.provider,
        api: configured.api ?? "openai-images",
        contextWindow: configured.contextWindow,
        maxTokens: 0,
      } as unknown as Model<any>)
    : resolveBuiltInPiModel(configured).piModel
  return {
    requested: policy,
    configured,
    piModel,
  }
}

export function selectRuntimeModel(policy: ModelPolicy, models: BraincodeModel[], requirements?: RuntimeModelRequirements): RuntimeModelSelection {
  if (requirements?.requiresImageGeneration) {
    const directImageSelection = imageGenerationSelectionFromPolicy(policy)
    if (directImageSelection) return directImageSelection
  }

  const modelIds = [policy.modelId, ...(policy.fallbackModelIds ?? [])].filter((modelId, index, values) => modelId && values.indexOf(modelId) === index)
  const errors: string[] = []
  debugLog("runtime", "selecting runtime model", { modelIds, configuredModelCount: models.length, requirements })

  for (const modelId of modelIds) {
    const configured = models.find((model) => model.id === modelId)
    if (!configured) {
      errors.push(`${modelId}: not configured`)
      continue
    }

    try {
      const selection = createRuntimeModelSelection(policy, configured)
      const requirementError = runtimeModelRequirementError(selection, requirements)
      if (requirementError) {
        errors.push(`${modelId}: ${requirementError}`)
        continue
      }
      return selection
    } catch (error) {
      errors.push(`${modelId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`Model policy references no usable model. Tried: ${errors.join("; ")}`)
}

export function toPiModelSummary(selection: RuntimeModelSelection): RuntimePiModelSummary {
  return {
    provider: selection.piModel.provider,
    id: selection.piModel.id,
    name: selection.piModel.name,
    contextWindow: selection.piModel.contextWindow,
  }
}

export async function selectRuntimeModelWithApiKey(policy: ModelPolicy, models: BraincodeModel[], home?: string, requirements?: RuntimeModelRequirements): Promise<RuntimeModelCandidate> {
  const candidates = await selectRuntimeModelCandidatesWithApiKey(policy, models, home, requirements)
  if (candidates[0]) return candidates[0]
  throw new Error("No usable model with API key for policy")
}

export async function selectRuntimeModelCandidatesWithApiKey(policy: ModelPolicy, models: BraincodeModel[], home?: string, requirements?: RuntimeModelRequirements): Promise<RuntimeModelCandidate[]> {
  const explicitIds = [policy.modelId, ...(policy.fallbackModelIds ?? [])].filter((modelId, index, values) => modelId && values.indexOf(modelId) === index)
  const errors: string[] = []
  const candidates: RuntimeModelCandidate[] = []

  for (const [index, modelId] of explicitIds.entries()) {
    try {
      const selection = selectRuntimeModel(
        { ...policy, modelId, fallbackModelIds: [], ...(index === 0 ? {} : { imageModel: undefined }) },
        models,
        requirements,
      )
      const apiKey = await readProviderRuntimeApiKey(selection.piModel.provider, home)
      if (!apiKey) {
        errors.push(`${modelId}: missing API key for provider '${selection.piModel.provider}'`)
        continue
      }
      candidates.push({ selection, apiKey })
    } catch (error) {
      errors.push(`${modelId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  debugLog("runtime", "runtime model candidates", {
    requestedModelIds: explicitIds,
    candidates: candidates.map(({ selection }) => ({
      configuredModelId: selection.configured.id,
      provider: selection.piModel.provider,
      modelId: selection.piModel.id,
      api: selection.configured.api,
    })),
    requirements,
    errors,
  })

  if (candidates.length > 0) return candidates
  throw new Error(`No usable model with API key for policy. Tried: ${errors.join("; ")}`)
}
