import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core"
import type { Model } from "@earendil-works/pi-ai"
import { getModePolicy, selectAgentRole, selectBrain, selectModelPolicy, type AgentRole, type BrainModel, type BraincodeMode, type ModelPolicy } from "@braincode/brain"
import { appendSessionRecord, defaultBrains, defaultModels, readBrains, readModels, readProviderApiKey, readSettings } from "@braincode/config"
import type { BraincodeModel } from "@braincode/llm"
import { resolveBuiltInPiModel } from "@braincode/llm"
import { debugLog } from "@braincode/shared"

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
  routing: {
    source: "router-brain" | "heuristic"
    confidence?: number
    reason?: string
  }
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

type RouterDecision = {
  role: AgentRole
  confidence?: number
  reason?: string
}

const roleSystemPrompts: Record<AgentRole, string> = {
  routeBrain: "You are Braincode's router brain. Classify user intent, choose the best specialized role, and return compact structured routing decisions. Do not solve the task yourself unless routing is impossible.",
  coding: "You are Braincode's coding agent. Make small correct code changes, follow repository conventions, run focused verification, and report outcomes honestly.",
  frontend: "You are Braincode's frontend agent. Build accessible UI, component behavior, browser interactions, styling, and user-facing polish while matching the product's visual language.",
  backend: "You are Braincode's backend agent. Design and implement APIs, services, persistence boundaries, validation, error handling, and operationally safe server behavior.",
  designer: "You are Braincode's design agent. Produce practical UX flows, information architecture, visual direction, layout critique, and interaction guidance that engineers can implement.",
  dba: "You are Braincode's DBA agent. Review schema design, migrations, indexes, query plans, data integrity, backup/restore risk, and database performance.",
  devops: "You are Braincode's DevOps agent. Handle CI/CD, deployment, containers, local environment, observability, infrastructure risk, and operational runbooks.",
  security: "You are Braincode's security agent. Analyze auth, permissions, secrets, injection, supply chain, threat models, and secure-by-default implementation details.",
  qa: "You are Braincode's QA agent. Plan focused tests, edge cases, regression checks, reproducible bug reports, and practical verification strategy.",
  research: "You are Braincode's research agent. Find relevant facts quickly, cite concrete files or sources, and return concise actionable findings.",
  review: "You are Braincode's review agent. Inspect code for correctness, regressions, security issues, and missing tests. Prioritize concrete findings.",
  summarize: "You are Braincode's summarizer agent. Preserve decisions, changed files, validation results, caveats, and next steps in compact handoff form.",
  fastReply: "You are Braincode's fast reply agent. Answer simple questions directly and avoid unnecessary tool use or long explanations.",
  oracle: "You are Braincode's oracle agent. Provide deep reasoning, architecture guidance, debugging plans, and tradeoff analysis for difficult engineering tasks.",
  librarian: "You are Braincode's librarian agent. Understand large or external codebases, trace architecture, and return precise file/function-level explanations.",
}

export function selectRuntimeModel(policy: ModelPolicy, models: BraincodeModel[]): RuntimeModelSelection {
  const modelIds = [policy.modelId, ...(policy.fallbackModelIds ?? [])].filter((modelId, index, values) => modelId && values.indexOf(modelId) === index)
  const errors: string[] = []
  debugLog("runtime", "selecting runtime model", { modelIds, configuredModelCount: models.length })

  for (const modelId of modelIds) {
    const configured = models.find((model) => model.id === modelId)
    if (!configured) {
      errors.push(`${modelId}: not configured`)
      continue
    }

    try {
      const { piModel } = resolveBuiltInPiModel(configured)
      return {
        requested: policy,
        configured,
        piModel,
      }
    } catch (error) {
      errors.push(`${modelId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`Model policy references no usable model. Tried: ${errors.join("; ")}`)
}

async function selectRuntimeModelWithApiKey(policy: ModelPolicy, models: BraincodeModel[], home?: string): Promise<{ selection: RuntimeModelSelection; apiKey: string }> {
  const candidates = await selectRuntimeModelCandidatesWithApiKey(policy, models, home)
  if (candidates[0]) return candidates[0]
  throw new Error("No usable model with API key for policy")
}

async function selectRuntimeModelCandidatesWithApiKey(policy: ModelPolicy, models: BraincodeModel[], home?: string): Promise<Array<{ selection: RuntimeModelSelection; apiKey: string }>> {
  const modelIds = [policy.modelId, ...(policy.fallbackModelIds ?? [])].filter((modelId, index, values) => modelId && values.indexOf(modelId) === index)
  const errors: string[] = []
  const candidates: Array<{ selection: RuntimeModelSelection; apiKey: string }> = []

  for (const modelId of modelIds) {
    try {
      const selection = selectRuntimeModel({ ...policy, modelId, fallbackModelIds: [] }, models)
      const apiKey = await readProviderApiKey(selection.piModel.provider, home)
      if (!apiKey) {
        errors.push(`${modelId}: missing API key for provider '${selection.piModel.provider}'`)
        continue
      }
      candidates.push({ selection, apiKey })
    } catch (error) {
      errors.push(`${modelId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (candidates.length > 0) return candidates
  throw new Error(`No usable model with API key for policy. Tried: ${errors.join("; ")}`)
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

function isAgentRole(value: unknown): value is AgentRole {
  return value === "coding" || value === "frontend" || value === "backend" || value === "designer" || value === "dba" || value === "devops" || value === "security" || value === "qa" || value === "research" || value === "review" || value === "summarize" || value === "fastReply" || value === "oracle" || value === "librarian" || value === "routeBrain"
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
  return JSON.parse(candidate)
}

async function routePromptWithBrain(prompt: string, brain: BrainModel, models: BraincodeModel[], mode: BraincodeMode, home?: string): Promise<RouterDecision | undefined> {
  const routerPolicy = brain.planner ?? brain.roles.routeBrain
  if (!routerPolicy?.modelId) return undefined

  try {
    const { selection: routerSelection, apiKey } = await selectRuntimeModelWithApiKey(routerPolicy, models, home)

    const runtime = createBraincodeAgentRuntime({
      mode,
      systemPrompt: roleSystemPrompts.routeBrain,
      model: routerSelection.configured,
      policy: routerPolicy,
      getApiKey: (provider) => (provider === routerSelection.piModel.provider ? apiKey : undefined),
    })

    await runtime.agent.prompt(`Choose exactly one role for this user prompt.

Allowed roles:
- coding: implement or modify code
- frontend: UI, browser behavior, CSS, components, and user-facing product polish
- backend: APIs, services, validation, persistence boundaries, and server behavior
- designer: UX flows, visual direction, interaction design, and product layout
- dba: database schema, migrations, indexes, query plans, and data integrity
- devops: CI/CD, deployment, containers, infrastructure, and operations
- security: auth, permissions, secrets, vulnerabilities, and threat modeling
- qa: tests, regression checks, quality strategy, and reproducible bugs
- research: find information or inspect code/docs
- review: review, audit, check, or find bugs
- summarize: summarize or create handoff context
- fastReply: short/simple conversational answer
- oracle: deep reasoning, planning, architecture, or hard debugging
- librarian: external/large-codebase understanding

Return only JSON in this shape:
{"role":"coding|frontend|backend|designer|dba|devops|security|qa|research|review|summarize|fastReply|oracle|librarian","confidence":0.0,"reason":"short reason"}

User prompt:
${prompt}`)

    const text = extractAssistantText(runtime.agent.state.messages)
    const parsed = extractJsonObject(text) as { role?: unknown; confidence?: unknown; reason?: unknown }
    if (!isAgentRole(parsed.role) || parsed.role === "routeBrain") throw new Error(`invalid router role: ${String(parsed.role)}`)

    const decision = {
      role: parsed.role,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    }
    debugLog("runtime", "router brain selected role", decision)
    return decision
  } catch (error) {
    debugLog("runtime", "router brain failed; falling back to heuristic", { error: error instanceof Error ? error.message : String(error) })
    return undefined
  }
}

async function buildRuntimePlan(prompt: string, home: string | undefined, useRouterBrain: boolean): Promise<RuntimePlan> {
  const [settings, brainDocument, modelDocument] = await Promise.all([readSettings(home), readBrains(home), readModels(home)])
  const brains = brainDocument.brains.length > 0 ? brainDocument.brains : defaultBrains.brains
  const models = modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models
  const brain = selectBrain(brains as BrainModel[], settings.defaultBrainId)
  const routerDecision = useRouterBrain ? await routePromptWithBrain(prompt, brain, models as BraincodeModel[], settings.mode, home) : undefined
  const role = routerDecision?.role ?? selectAgentRole(prompt)
  const policy = selectModelPolicy(brain, role)
  const selection = selectRuntimeModel(policy, models as BraincodeModel[])
  const modePolicy = getModePolicy(settings.mode)
  const routing = routerDecision
    ? { source: "router-brain" as const, confidence: routerDecision.confidence, reason: routerDecision.reason }
    : { source: "heuristic" as const, reason: useRouterBrain ? "router brain unavailable or failed" : "dry-run/default heuristic route" }
  debugLog("runtime", "planned runtime", { mode: settings.mode, brainId: brain.id, role, routingSource: routing.source, modelId: selection.configured.id, provider: selection.piModel.provider })

  return {
    mode: settings.mode,
    modeDescription: modePolicy.description,
    brain: {
      id: brain.id,
      name: brain.name,
      description: brain.description,
    },
    role,
    routing,
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

export async function planRuntimeFromConfig(prompt: string, home?: string): Promise<RuntimePlan> {
  return buildRuntimePlan(prompt, home, false)
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
  const plan = await buildRuntimePlan(request.prompt, home, true)
  const modelDocument = await readModels(home)
  const models = modelDocument.models.length > 0 ? modelDocument.models : defaultModels.models
  const candidates = await selectRuntimeModelCandidatesWithApiKey(plan.policy, models as BraincodeModel[], home)

  const sessionId = request.sessionId ?? crypto.randomUUID()

  let lastError: unknown
  for (const [attempt, { selection, apiKey }] of candidates.entries()) {
    plan.model = selection.configured
    plan.piModel = {
      provider: selection.piModel.provider,
      id: selection.piModel.id,
      name: selection.piModel.name,
      contextWindow: selection.piModel.contextWindow,
    }
    await appendSessionRecord(sessionId, { type: "run_start", prompt: request.prompt, plan, attempt: attempt + 1 }, home)

    const runtime = createBraincodeAgentRuntime({
      mode: plan.mode,
      systemPrompt: roleSystemPrompts[plan.role],
      model: plan.model,
      policy: plan.policy,
      sessionId,
      getApiKey: (provider) => (provider === plan.piModel.provider ? apiKey : undefined),
    })

    try {
      await runtime.agent.prompt(request.prompt)
      const summary = extractAssistantText(runtime.agent.state.messages)
      await appendSessionRecord(sessionId, { type: "run_end", summary, attempt: attempt + 1 }, home)
      return { sessionId, summary, plan }
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      await appendSessionRecord(sessionId, { type: "run_error", error: message, attempt: attempt + 1, willFallback: attempt < candidates.length - 1 }, home)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
