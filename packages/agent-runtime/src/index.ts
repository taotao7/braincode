export type AgentRunRequest = {
  prompt: string
  sessionId?: string
}

export type AgentRunResult = {
  sessionId: string
  summary: string
}
