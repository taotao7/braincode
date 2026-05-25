import { getModel, getProviders, type Api, type Model, type ModelThinkingLevel, type Provider } from "@earendil-works/pi-ai"

export type BraincodeModel = {
  id: string
  provider: Provider
  modelId: string
  name: string
  contextWindow: number
  supportsTools: boolean
  defaultThinkingLevel?: ModelThinkingLevel
}

export type ModelResolutionResult = {
  braincodeModel: BraincodeModel
  piModel: Model<Api>
}

export function listBuiltInProviders(): string[] {
  return getProviders()
}

export function resolveBuiltInPiModel(model: BraincodeModel): ModelResolutionResult {
  try {
    return {
      braincodeModel: model,
      piModel: getModel(model.provider as never, model.modelId as never) as Model<Api>,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to resolve model ${model.provider}/${model.modelId}: ${message}`)
  }
}

export function toBraincodeModel(model: Model<Api>): BraincodeModel {
  return {
    id: `${model.provider}/${model.id}`,
    provider: model.provider,
    modelId: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    supportsTools: true,
    defaultThinkingLevel: model.reasoning ? "medium" : "off",
  }
}
