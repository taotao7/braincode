// The runtime's only seam onto pi-agent-core. Every other module in this
// package imports the agent vocabulary (events, tools, messages, the Agent
// loop, compaction helpers) from here — never from pi-agent-core directly —
// so replacing or wrapping the agent engine stays a one-file change.
// Provider-level types (Model, Api, ImageContent, ...) come from
// @braincode/llm, which is the equivalent seam onto pi-ai.
export { Agent, estimateContextTokens, generateSummary } from "@earendil-works/pi-agent-core"
export type { AgentEvent, AgentMessage, AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
