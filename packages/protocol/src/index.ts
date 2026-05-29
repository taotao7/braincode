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

export type SettingsResponse<T = unknown> = ApiResult<T>
export type BrainsResponse<T = unknown> = ApiResult<T>
export type ModelsResponse<T = unknown> = ApiResult<T>
export type ToolsResponse<T = unknown> = ApiResult<T>
export type AuthStatusResponse<T = unknown> = ApiResult<T>

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
