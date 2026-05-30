import type { ToolApprovalRequest } from "@braincode/agent-runtime";
import type { BraincodeTools } from "@braincode/config";
import type { ToolCategory, ToolEvidenceCacheInfo } from "./tui-types";
import { TOOL_DETAIL_CHAR_LIMIT } from "./tui-constants";
import { formatElapsed, truncate } from "./tui-text";

export function classifyToolCall(toolName: string, args: unknown): ToolCategory {
  const name = toolName.toLowerCase();
  if (name.startsWith("mcp__")) return "mcp";
  if (
    /(web.?search|search_query|search-query|brave|tavily|serp|firecrawl|browser_search|web_fetch|fetch_url)/.test(
      name,
    )
  )
    return "websearch";
  if (
    /(shell|exec|execute|run_command|run-command|terminal|bash|zsh|cmd|powershell|spawn|subprocess|write_stdin)/.test(
      name,
    )
  )
    return "execute";
  if (
    /(apply_patch|edit|write|patch|delete|remove|rm_|rename|move|create_file|create-file|filesystem__write)/.test(
      name,
    )
  )
    return "write";
  if (
    /(read|grep|rg|search_files|search-files|list|find|get_file|get-code|snippet|open_file)/.test(
      name,
    )
  )
    return "read";
  const serialized = summarizeToolArgs(args).toLowerCase();
  if (
    /\b(rm\s+-rf|sudo|chmod|chown|git\s+push|git\s+reset|drop\s+table|delete\s+from)\b/.test(
      serialized,
    )
  )
    return "execute";
  return "tool";
}

export function toolCategoryTitle(category: ToolCategory): string {
  switch (category) {
    case "websearch":
      return "Web Search";
    case "execute":
      return "Execute";
    case "write":
      return "Write";
    case "read":
      return "Read";
    case "mcp":
      return "MCP";
    case "tool":
      return "Tool";
  }
}

export function toolCategoryColor(
  category: ToolCategory,
): "blue" | "cyan" | "green" | "red" | "yellow" | "magenta" | "gray" {
  switch (category) {
    case "websearch":
      return "blue";
    case "execute":
      return "yellow";
    case "write":
      return "magenta";
    case "read":
      return "cyan";
    case "mcp":
      return "magenta";
    case "tool":
      return "cyan";
  }
}

export function requiresToolDecision(
  category: ToolCategory,
  toolName: string,
  args: unknown,
): boolean {
  if (category === "mcp" || toolName.toLowerCase() === "web_search")
    return false;
  if (category === "execute" || category === "write") return true;
  const text = `${toolName} ${summarizeToolArgs(args)}`.toLowerCase();
  return /\b(rm\s+-rf|sudo|chmod|chown|git\s+push|git\s+reset|drop\s+table|delete\s+from|truncate\s+table)\b/.test(
    text,
  );
}

export function formatPermissionPolicySummary(
  policy: ToolApprovalRequest["permissionPolicy"],
): string | undefined {
  if (!policy || policy.matches.length === 0) return undefined;
  const matches = policy.matches.slice(0, 3).map((match) => {
    const review = match.reviewRequired ? ", review required" : "";
    return `${match.kind} ${match.target} -> ${match.action} (${match.pattern}${review})`;
  });
  if (policy.matches.length > matches.length) {
    matches.push(`${policy.matches.length - matches.length} more`);
  }
  return matches.join("; ");
}

export function toolApprovalAllowedByConfig(
  toolName: string,
  category: ToolCategory,
  document: BraincodeTools,
): boolean {
  const enabledAllowed = new Set(
    document.tools
      .filter((tool) => tool.enabled && tool.approvalPolicy === "allow")
      .map((tool) => tool.name),
  );
  if (enabledAllowed.has(toolName)) return true;
  const lower = toolName.toLowerCase();
  for (const name of enabledAllowed) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (lower === normalized || lower.endsWith(`__${normalized}`)) return true;
  }
  if (category === "execute" && enabledAllowed.has("shell")) return true;
  if (category === "write" && enabledAllowed.has("edit_file")) return true;
  if (
    category === "read" &&
    (enabledAllowed.has("read_file") || enabledAllowed.has("search_files"))
  )
    return true;
  return false;
}

export function formatToolStartText(toolName: string): string {
  return `${toolName} · running`;
}

export function formatToolEndText(
  toolName: string,
  isError: boolean,
  elapsedMs: number,
): string {
  const status = isError ? "failed" : "completed";
  return `${toolName} · ${status} (${elapsedMs}ms)`;
}

export function formatRepeatedReadToolText(
  toolName: string,
  duplicateCount: number,
): string {
  return `${toolName} · cached duplicate x${duplicateCount}`;
}

export function formatRepeatedReadToolDetail(
  duplicateCount: number,
  evidence: ToolEvidenceCacheInfo,
): string {
  const repeated =
    evidence.consecutiveCount && evidence.consecutiveCount >= 3
      ? ` · repeated ${evidence.consecutiveCount}x in a row`
      : "";
  const age =
    evidence.cacheAgeMs === undefined
      ? ""
      : ` · cache ${formatElapsed(evidence.cacheAgeMs)} old`;
  return `cache reused ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}${repeated}${age}`;
}

export function toolArgsObject(
  args: unknown,
): Record<string, unknown> | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args))
    return undefined;
  const record = args as Record<string, unknown>;
  return Object.keys(record).length > 0 ? record : undefined;
}

export function toolArgsCount(
  args: Record<string, unknown> | undefined,
): number {
  return args ? Object.keys(args).length : 0;
}

export function formatToolResultDetail(result: unknown): string | undefined {
  const summary = summarizeToolResult(result, TOOL_DETAIL_CHAR_LIMIT);
  return summary ? `result ${summary}` : undefined;
}

export function toolCallDisplayKey(
  toolName: string,
  args: Record<string, unknown> | undefined,
): string {
  return `${toolName.toLowerCase()}:${stableToolValue(args ?? {})}`;
}

export function stableToolValue(value: unknown): string {
  try {
    return JSON.stringify(toStableToolValue(value, new WeakSet())) ?? "";
  } catch {
    return String(value);
  }
}

export function toStableToolValue(
  value: unknown,
  seen: WeakSet<object>,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value))
    return value.map((item) => toStableToolValue(item, seen));
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = toStableToolValue(
      (value as Record<string, unknown>)[key],
      seen,
    );
  }
  seen.delete(value);
  return output;
}

export function getToolEvidenceCacheInfo(
  result: unknown,
): ToolEvidenceCacheInfo | undefined {
  if (!result || typeof result !== "object") return undefined;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details))
    return undefined;
  const evidence = (details as { evidenceCache?: unknown }).evidenceCache;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
    return undefined;
  const record = evidence as Record<string, unknown>;
  return {
    reused: typeof record.reused === "boolean" ? record.reused : undefined,
    callCount:
      typeof record.callCount === "number" ? record.callCount : undefined,
    consecutiveCount:
      typeof record.consecutiveCount === "number"
        ? record.consecutiveCount
        : undefined,
    cacheAgeMs:
      typeof record.cacheAgeMs === "number" ? record.cacheAgeMs : undefined,
    warning: typeof record.warning === "string" ? record.warning : undefined,
  };
}

export function formatToolArgLine(key: string, value: unknown): string {
  return `${key}=${summarizeArgValue(value)}`;
}

export function summarizeToolArgs(args: unknown): string {
  if (args === undefined || args === null) return "";
  if (typeof args === "string")
    return `"${truncate(args.replace(/\s+/g, " ").trim(), 80)}"`;
  if (typeof args !== "object") return String(args);
  try {
    const entries = Object.entries(args as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const parts = entries
      .slice(0, 4)
      .map(([key, value]) => `${key}=${summarizeArgValue(value)}`);
    if (entries.length > 4) parts.push(`+${entries.length - 4} more`);
    return `{${parts.join(", ")}}`;
  } catch {
    return "{...}";
  }
}

export function summarizeArgValue(value: unknown, maxLen = 40): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string")
    return `"${truncate(value.replace(/\s+/g, " "), maxLen)}"`;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return "{…}";
  return truncate(String(value), maxLen);
}

export function summarizeToolResult(result: unknown, maxLength = 120): string {
  if (!result) return "";
  if (typeof result === "string")
    return truncate(result.replace(/\s+/g, " ").trim(), maxLength);
  if (typeof result !== "object") return String(result);
  try {
    const record = result as {
      content?: unknown;
      details?: { content?: unknown; tools?: unknown[] };
      isError?: unknown;
    };
    const directContent = Array.isArray(record.content)
      ? record.content
      : Array.isArray(record.details?.content)
        ? record.details.content
        : [];
    if (directContent.length > 0) {
      const texts = directContent
        .map((part) =>
          part &&
          typeof part === "object" &&
          typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : "",
        )
        .filter(Boolean);
      const merged = texts.join(" ").replace(/\s+/g, " ").trim();
      if (merged) return truncate(merged, maxLength);
    }
    return truncate(JSON.stringify(result), maxLength);
  } catch {
    return "(unserializable result)";
  }
}
