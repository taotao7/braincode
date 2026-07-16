// This package's only seam onto pi-agent-core: the tool contract that local
// coding tools implement. Import AgentTool/AgentToolResult from here (or from
// the package index), never from pi-agent-core directly, so swapping the
// agent engine's tool contract stays a one-file change.
export type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
