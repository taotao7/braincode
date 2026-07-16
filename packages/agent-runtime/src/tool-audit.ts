import type { AgentEvent } from "./pi-agent"
import type { AgentRole } from "@braincode/brain"
import { appendSessionRecord } from "@braincode/config"
import type { RuntimeMetricsPhase } from "./metrics"
import type { ToolApprovalRequest } from "./runtime-agent"

export type ToolAuditScope = {
  sessionId: string
  home?: string
  phase: RuntimeMetricsPhase
  role?: AgentRole | string
  agentSessionId?: string
  taskId?: string
  parentId?: string
  attempt?: number
  brainId?: string
}

export type ToolApprovalAuditDecision = "allowed" | "approved" | "auto_approved" | "blocked" | "denied"

export type ToolApprovalAuditApprover = "human" | "permission_policy" | "mode_policy" | "runtime_policy"

export type ToolApprovalDecisionRecord = {
  type: "tool_approval_decision"
  toolCallId: string
  toolName: string
  decision: ToolApprovalAuditDecision
  approver: ToolApprovalAuditApprover
  phase: RuntimeMetricsPhase
  role?: string
  agentSessionId?: string
  taskId?: string
  parentId?: string
  attempt?: number
  brainId?: string
  reason?: string
  argsSummary?: unknown
  permissionPolicy?: ToolApprovalRequest["permissionPolicy"]
}

export type ToolExecutionSummaryRecord = {
  type: "tool_execution_summary"
  event: "start" | "end"
  toolCallId: string
  toolName: string
  phase: RuntimeMetricsPhase
  role?: string
  agentSessionId?: string
  taskId?: string
  parentId?: string
  attempt?: number
  brainId?: string
  argsSummary?: unknown
  isError?: boolean
  resultSummary?: unknown
}

export async function recordToolApprovalDecision(
  scope: ToolAuditScope | undefined,
  input: Omit<ToolApprovalDecisionRecord, "type" | "phase" | "role" | "agentSessionId" | "taskId" | "parentId" | "attempt" | "brainId">,
): Promise<void> {
  if (!scope?.sessionId) return
  await appendSessionRecord(scope.sessionId, {
    type: "tool_approval_decision",
    ...scopeFields(scope),
    ...input,
  }, scope.home)
}

export async function recordToolExecutionEvent(
  scope: ToolAuditScope | undefined,
  event: AgentEvent,
): Promise<void> {
  if (!scope?.sessionId) return
  if (event.type === "tool_execution_start") {
    await appendSessionRecord(scope.sessionId, {
      type: "tool_execution_summary",
      event: "start",
      ...scopeFields(scope),
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      argsSummary: summarizeJson(event.args),
    }, scope.home)
  } else if (event.type === "tool_execution_end") {
    await appendSessionRecord(scope.sessionId, {
      type: "tool_execution_summary",
      event: "end",
      ...scopeFields(scope),
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      isError: event.isError,
      resultSummary: summarizeJson(event.result),
    }, scope.home)
  }
}

export async function recordToolExecutionSummary(
  scope: ToolAuditScope | undefined,
  input: Omit<ToolExecutionSummaryRecord, "type" | "phase" | "role" | "agentSessionId" | "taskId" | "parentId" | "attempt" | "brainId">,
): Promise<void> {
  if (!scope?.sessionId) return
  await appendSessionRecord(scope.sessionId, {
    type: "tool_execution_summary",
    ...scopeFields(scope),
    ...input,
  }, scope.home)
}

export function summarizeJson(value: unknown, maxChars = 1600): unknown {
  const normalized = normalizeJson(value, 0)
  const text = safeJson(normalized)
  if (text.length <= maxChars) return normalized
  return {
    truncated: true,
    chars: text.length,
    preview: text.slice(0, maxChars),
  }
}

function scopeFields(scope: ToolAuditScope) {
  return {
    phase: scope.phase,
    role: scope.role,
    agentSessionId: scope.agentSessionId,
    taskId: scope.taskId,
    parentId: scope.parentId,
    attempt: scope.attempt,
    brainId: scope.brainId,
  }
}

function normalizeJson(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return String(value)
  if (depth >= 4) return "[MaxDepth]"
  if (Array.isArray(value)) {
    const output = value.slice(0, 20).map((item) => normalizeJson(item, depth + 1))
    if (value.length > output.length) output.push(`[+${value.length - output.length} more]`)
    return output
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const output: Record<string, unknown> = {}
    for (const key of Object.keys(record).slice(0, 40)) {
      output[key] = normalizeJson(record[key], depth + 1)
    }
    const extra = Object.keys(record).length - Object.keys(output).length
    if (extra > 0) output.__truncatedKeys = extra
    return output
  }
  return String(value)
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return String(value)
  }
}
