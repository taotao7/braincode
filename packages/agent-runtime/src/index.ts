import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core"
import type { Model } from "@earendil-works/pi-ai"
import { getModePolicy, selectAgentRole, selectBrain, selectModelPolicy, type AgentRole, type BrainModel, type BraincodeMode, type ModelPolicy } from "@braincode/brain"
import { defaultBrains, defaultModels, readBrains, readModels, readSettings } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { resolveBuiltInPiModel } from "@braincode/llm"

export type AgentRunRequest = {
  prompt: string
  sessionId?: string
}

export type AgentRunResult = {
  sessionId: string
  summary: string
}

export type RuntimeModelSelection = {
  requested: ModelPolicy
  configured: BraincodeModel
  piModel: Model<any>
}

export type BraincodeAgentRuntimeOptions = {
  mode: BraincodeMode
  systemPrompt: string
  model: BraincodeModel
  policy: ModelPolicy
  sessionId?: string
  onEvent?: (event: AgentEvent) => void | Promise<void>
}

export type BraincodeAgentRuntime = {
  agent: Agent
  selection: RuntimeModelSelection
}

export type RuntimePlan = {
  mode: BraincodeMode
  modeDescription: string
  brain: Pick<BrainModel, "id" | "name" | "description">
  role: AgentRole
  model: BraincodeModel
  policy: ModelPolicy
  piModel: {
    provider: string
    id: string
    name: string
    contextWindow: number
  }
  toolExecution: "sequential" | "parallel"
}

export function selectRuntimeModel(policy: ModelPolicy, models: BraincodeModel[]): RuntimeModelSelection {
  const configured = models.find((model) => model.id === policy.modelId)
  if (!configured) {
    throw new Error(`Model policy references unknown model id: ${policy.modelId}`)
  }

  const { piModel } = resolveBuiltInPiModel(configured)

  return {
    requested: policy,
    configured,
    piModel,
  }
}

export function createBraincodeAgentRuntime(options: BraincodeAgentRuntimeOptions): BraincodeAgentRuntime {
  const { piModel } = resolveBuiltInPiModel(options.model)
  const agent = new Agent({
    sessionId: options.sessionId,
    initialState: {
      systemPrompt: options.systemPrompt,
      model: piModel,
      thinkingLevel: options.policy.thinkingLevel,
      tools: [],
      messages: [],
    },
    toolExecution: options.mode === "radical" ? "parallel" : "sequential",
  })

  if (options.onEvent) {
    agent.subscribe((event) => options.onEvent?.(event))
  }

  return {
    agent,
    selection: {
      requested: options.policy,
      configured: options.model,
      piModel,
    },
  }
}

export async function planRuntimeFromConfig(prompt: string, home?: string): Promise<RuntimePlan> {
  const [settings, brainDocument, modelDocument] = await Promise.all([readSettings(home), readBrains(home), readModels(home)])
  const brains = brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains
  const models = modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models
  const brain = selectBrain(brains as BrainModel[], settings.defaultBrainId)
  const role = selectAgentRole(prompt)
  const policy = selectModelPolicy(brain, role)
  const selection = selectRuntimeModel(policy, models as BraincodeModel[])
  const modePolicy = getModePolicy(settings.mode)

  return {
    mode: settings.mode,
    modeDescription: modePolicy.description,
    brain: {
      id: brain.id,
      name: brain.name,
      description: brain.description,
    },
    role,
    model: selection.configured,
    policy,
    piModel: {
      provider: selection.piModel.provider,
      id: selection.piModel.id,
      name: selection.piModel.name,
      contextWindow: selection.piModel.contextWindow,
    },
    toolExecution: settings.mode === "radical" ? "parallel" : "sequential",
  }
}
