import type { AuthStatus, BraincodeBrains, BraincodeModels, BraincodeSettings, BraincodeTools } from "@braincode/config"

export type ApiSuccess<T> = {
  ok: true
  data: T
}

export type ApiError = {
  ok: false
  error: string
}

export type ApiResult<T> = ApiSuccess<T> | ApiError

export type HealthResponse = {
  name: "braincode"
  status: "ok"
}

export type SettingsResponse = ApiResult<BraincodeSettings>
export type BrainsResponse = ApiResult<BraincodeBrains>
export type ModelsResponse = ApiResult<BraincodeModels>
export type ToolsResponse = ApiResult<BraincodeTools>
export type AuthStatusResponse = ApiResult<AuthStatus>

export type ContextRef = {
  kind: "file" | "thread" | "summary" | "artifact"
  uri: string
  label?: string
}

export type AgentMessage = {
  id: string
  parentId?: string
  from: string
  to: string | "orchestrator"
  kind: "handoff" | "result" | "question" | "fact" | "artifact" | "error"
  payload: unknown
  contextRefs?: ContextRef[]
}
