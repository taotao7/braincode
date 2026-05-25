import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core"
import type { Model } from "@earendil-works/pi-ai"
import { getModePolicy, selectAgentRole, selectBrain, selectModelPolicy, type AgentRole, type BrainModel, type BraincodeMode, type ModelPolicy } from "@braincode/brain"
import { appendSessionRecord, defaultBrains, defaultModels, readBrains, readModels, readProviderApiKey, readSettings } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { resolveBuiltInPiModel } from "@braincode/llm"

export type AgentRunRequest = {
  prompt: string
  sessionId?: string
}

export type AgentRunResult = {
  sessionId: string
  summary: string
  plan: RuntimePlan
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
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined
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
    getApiKey: options.getApiKey,
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

function extractAssistantText(messages: unknown[]): string {
  const assistantMessages = messages.filter((message) => {
    return typeof message === "object" && message !== null && (message as { role?: unknown }).role === "assistant"
  })

  const lastAssistant = assistantMessages.at(-1) as { content?: unknown } | undefined
  if (!lastAssistant || !Array.isArray(lastAssistant.content)) return ""

  return lastAssistant.content
    .filter((content): content is { type: "text"; text: string } => {
      return typeof content === "object" && content !== null && (content as { type?: unknown }).type === "text" && typeof (content as { text?: unknown }).text === "string"
    })
    .map((content) => content.text)
    .join("\n")
}

export async function executePromptFromConfig(request: AgentRunRequest, home?: string): Promise<AgentRunResult> {
  const plan = await planRuntimeFromConfig(request.prompt, home)
  const apiKey = await readProviderApiKey(plan.piModel.provider, home)

  if (!apiKey) {
    throw new Error(`Missing API key for provider '${plan.piModel.provider}'. Add it to ~/.braincode/auth.json under providers.${plan.piModel.provider}.apiKey`)
  }

  const sessionId = request.sessionId ?? crypto.randomUUID()
  await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan }, home)

  const runtime = createBraincodeAgentRuntime({
    mode: plan.mode,
    systemPrompt: "You are Braincode, a coding-first AI agent. Follow the user's request concisely and safely.",
    model: plan.model,
    policy: plan.policy,
    sessionId,
    getApiKey: (provider) => (provider === plan.piModel.provider ? apiKey : undefined),
  })

  try {
    await runtime.agent.prompt(request.prompt)
    const summary = extractAssistantText(runtime.agent.state.messages)
    await appendSessionRecord(sessionId, { type: "run_end", summary }, home)
    return { sessionId, summary, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await appendSessionRecord(sessionId, { type: "run_error", error: message }, home)
    throw error
  }
}
