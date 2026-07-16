// Session journal: the sessions/<id>.jsonl record protocol, append, listing, and context replay.

import { appendFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { numberField, objectField, stringArrayField, stringField } from "./json-io";
import { ensureBraincodeHome } from "./stores";
import { getBraincodeHome, getBraincodePaths, type BraincodePaths } from "./paths";

// ---------------------------------------------------------------------------
// Session journal protocol
//
// One discriminated union describes every record the runtime appends to
// sessions/<id>.jsonl. Writers get compile-time checking (discriminants,
// field names via excess-property checks, scalar types); readers still parse
// defensively because a journal on disk may predate the current schema.
// Payloads owned by higher layers (runtime plan, final report, handoff
// packets, worker results) are `unknown` here — this package records them,
// it does not interpret them.
// ---------------------------------------------------------------------------

export type SessionRunPhase = "planning" | "support" | "primary" | "review";

export type SessionHookRecordType =
  | "hook_session_start"
  | "hook_user_prompt_submit"
  | "hook_subagent_start"
  | "hook_subagent_stop"
  | "hook_stop";

export type SessionRecord =
  | { type: "run_start"; prompt: string; plan?: unknown; projectSupport?: unknown; attempt?: number }
  | { type: "run_end"; summary: string; workerResults?: unknown[]; patch?: unknown; checks?: unknown; reviewDecision?: unknown; finalReport?: unknown; fixIterations?: number; attempt?: number }
  | { type: "run_error"; error: string; attempt?: number; willFallback?: boolean }
  | { type: "worker_start"; phase: SessionRunPhase; worker: string; goal: string; handoff?: unknown; model?: string; agentSessionId?: string; attempt?: number }
  | { type: "worker_end"; phase: SessionRunPhase; worker: string; result?: unknown; attempt?: number }
  | { type: "worker_error"; phase: SessionRunPhase; worker: string; error?: string; handoff?: unknown; attempt?: number; willFallback?: boolean }
  | { type: "agent_message"; phase: SessionRunPhase; worker: string; message: unknown; attempt?: number }
  | { type: "todo_plan"; todos: unknown[]; dependencies?: unknown[]; reason?: string }
  | { type: "todo_update"; phase: SessionRunPhase; role?: string; status: string; todoIds: string[]; todos: unknown[]; summary?: string; error?: string }
  | { type: "context_plan"; context: unknown }
  | { type: "clarification_request"; clarification: unknown; attempt?: number }
  | { type: "check_summary"; status: "passed" | "failed" | "skipped"; reason?: string; patchKind?: string; selectedScripts?: string[]; reviewRequired?: boolean; results: unknown[]; attempt?: number; fixIteration?: number }
  | { type: "review_decision"; decision: "approved" | "changes_requested" | "blocked"; confidence?: number; rationale?: string; findings?: unknown[]; requiredChanges?: string[]; blockingIssues?: string[]; residualRisks?: string[]; coverage?: unknown; mode?: string; independence?: unknown; riskTier?: string; attempt?: number; fixIteration?: number }
  | { type: "review_artifacts_summary"; attempt?: number; fixIteration?: number; changedFiles?: string[]; diffTruncated?: boolean; checksStatus?: string; riskTier?: string; reviewMode?: string; independence?: unknown }
  | { type: "fix_iteration"; iteration: number; trigger: string; attempt?: number }
  | { type: "patch_summary"; changedFiles: unknown[]; preExistingChangedFiles?: unknown[]; diffStats?: unknown; attempt?: number }
  | { type: "final_report"; finalReport: unknown; attempt?: number }
  | { type: "mcp_connect"; report: unknown }
  | { type: "tool_call_count"; total: number; failed: number; byPhase: unknown[]; attempt?: number }
  | { type: "handoff"; summary: string; focus?: string; trigger?: "manual" | "auto"; timestamp?: number; estimatedBytes?: number; limitBytes?: number }
  | { type: "dynamic_dispatch"; phase: "request" | "result"; role: string; goal?: string; reason?: string; contextId: string; primaryRole?: string; status?: string; summary?: string }
  | ({ type: "execution_plan_review" } & Record<string, unknown>)
  | ({ type: "tool_approval_decision" } & Record<string, unknown>)
  | ({ type: "tool_execution_summary" } & Record<string, unknown>)
  | { type: SessionHookRecordType; eventName: string; matcher?: string; records: unknown[]; additionalContext: string[]; blockedReason?: string }
  | TokenUsageSessionRecord;

export type SessionRecordType = SessionRecord["type"];

export type TokenUsageSnapshot = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

export type TokenUsageTotals = TokenUsageSnapshot & {
  calls: number;
};

export type TokenUsagePhase =
  | "router"
  | "support"
  | "primary"
  | "review"
  | "pet"
  | "unknown";

export type TokenUsageSessionRecord = {
  type: "token_usage";
  role?: string;
  phase?: TokenUsagePhase | string;
  brainId?: string;
  modelId?: string;
  provider?: string;
  agentSessionId?: string;
  taskId?: string;
  parentId?: string;
  turnId?: string;
  attempt?: number;
  usage: TokenUsageSnapshot;
};

export type SessionSummary = {
  sessionId: string;
  path: string;
  updatedAt: number;
  prompt?: string;
  brainId?: string;
  role?: string;
  summary?: string;
  status: "completed" | "failed" | "incomplete";
  projectRoot?: string;
};

export type SessionContextEntry =
  | {
      type: "run";
      timestamp?: number;
      prompt?: string;
      brainId?: string;
      role?: string;
      summary?: string;
      status: SessionSummary["status"];
      attempt?: number;
    }
  | {
      type: "worker";
      timestamp?: number;
      phase?: string;
      role?: string;
      status: "completed" | "blocked" | "failed";
      summary?: string;
      error?: string;
      attempt?: number;
    }
  | {
      type: "todo";
      timestamp?: number;
      phase?: string;
      role?: string;
      status: "pending" | "running" | "completed" | "blocked" | "failed";
      title?: string;
      summary?: string;
      error?: string;
    }
  | {
      type: "check";
      timestamp?: number;
      status: "passed" | "failed" | "skipped";
      checks: Array<{
        name: string;
        status: "passed" | "failed";
        exitCode?: number | null;
        durationMs?: number;
      }>;
      reason?: string;
      attempt?: number;
    }
  | {
      type: "review";
      timestamp?: number;
      decision: "approved" | "changes_requested" | "blocked";
      rationale?: string;
      requiredChanges: string[];
      blockingIssues: string[];
      attempt?: number;
    }
  | {
      type: "error";
      timestamp?: number;
      error: string;
      attempt?: number;
      willFallback?: boolean;
    }
  | {
      type: "handoff";
      timestamp?: number;
      summary: string;
      focus?: string;
      trigger?: "manual" | "auto";
    };

export type SessionHandoffSnapshot = {
  summary: string;
  timestamp?: number;
  focus?: string;
  trigger?: "manual" | "auto";
  fresh: boolean;
};

export type SessionContext = SessionSummary & {
  entries: SessionContextEntry[];
  truncated: boolean;
  latestHandoff?: SessionHandoffSnapshot;
};

export async function listSessions(
  home = getBraincodeHome(),
  limit = 25,
  options: { projectRoot?: string } = {},
): Promise<SessionSummary[]> {
  const paths = await ensureBraincodeHome(home);
  const safeLimit = Math.max(1, Math.floor(limit));
  const filterRoot = options.projectRoot;
  // When filtering by project we must scan every session (a matching session may
  // be arbitrarily far down the recency list), so widen the file scan in that
  // case and apply the limit only after filtering.
  const fileScanLimit = filterRoot === undefined ? safeLimit * 4 : undefined;
  const candidates = await listSessionFiles(paths, fileScanLimit);
  const records: Array<SessionSummary & { sortKey: number }> = [];
  for (const candidate of candidates) {
    const file = Bun.file(candidate.path);
    let prompt: string | undefined;
    let brainId: string | undefined;
    let role: string | undefined;
    let summary: string | undefined;
    let projectRoot: string | undefined;
    let status: SessionSummary["status"] = "incomplete";
    try {
      const text = await file.text();
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as Record<string, unknown>;
          if (record.type === "run_start") {
            if (typeof record.prompt === "string" && !prompt) prompt = record.prompt;
            const plan = record.plan as { brain?: { id?: unknown }; role?: unknown } | undefined;
            if (plan?.brain && typeof plan.brain.id === "string") brainId = brainId ?? plan.brain.id;
            if (typeof plan?.role === "string") role = role ?? plan.role;
            const projectSupport = record.projectSupport as { root?: unknown } | undefined;
            if (typeof projectSupport?.root === "string" && !projectRoot) projectRoot = projectSupport.root;
          } else if (record.type === "run_end") {
            if (typeof record.summary === "string") summary = record.summary;
            status = "completed";
          } else if (record.type === "run_error" && status !== "completed") {
            if (typeof record.error === "string") summary = record.error;
            status = "failed";
          }
        } catch {
          // ignore malformed line
        }
      }
    } catch {
      // ignore unreadable session
    }
    if (filterRoot !== undefined && projectRoot !== filterRoot) continue;
    records.push({ sessionId: candidate.sessionId, path: candidate.path, updatedAt: candidate.updatedAt, prompt, brainId, role, summary, status, projectRoot, sortKey: candidate.updatedAt });
  }
  records.sort((left, right) => right.sortKey - left.sortKey);
  return records.slice(0, safeLimit).map(({ sortKey: _drop, ...rest }) => rest);
}

type SessionFileCandidate = {
  sessionId: string;
  path: string;
  updatedAt: number;
};

export async function listSessionFiles(paths: BraincodePaths, limit?: number): Promise<SessionFileCandidate[]> {
  let entries;
  try {
    entries = await readdir(paths.sessions, { withFileTypes: true });
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return [];
    throw error;
  }
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => {
      const path = join(paths.sessions, entry.name);
      return {
        sessionId: entry.name.replace(/\.jsonl$/, ""),
        path,
        updatedAt: Bun.file(path).lastModified,
      };
    })
    .sort((left, right) => right.updatedAt - left.updatedAt || right.sessionId.localeCompare(left.sessionId));
  return limit === undefined ? candidates : candidates.slice(0, Math.max(0, Math.floor(limit)));
}

export function parseSessionRecordLine(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

export function planFields(plan: unknown): { brainId?: string; role?: string } {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return {};
  const record = plan as Record<string, unknown>;
  const brain = objectField(record, "brain");
  return {
    brainId: brain ? stringField(brain, "id") : undefined,
    role: stringField(record, "role"),
  };
}

function sessionStatus(value: unknown, fallback: SessionSummary["status"]): SessionSummary["status"] {
  return value === "completed" || value === "failed" || value === "incomplete" ? value : fallback;
}

function workerSessionStatus(value: unknown): Extract<SessionContextEntry, { type: "worker" }>["status"] {
  return value === "failed" || value === "blocked" ? value : "completed";
}

export async function readSessionContext(
  sessionRef: string,
  home = getBraincodeHome(),
  maxEntries = 24,
): Promise<SessionContext | undefined> {
  const trimmed = sessionRef.trim();
  if (!trimmed) return undefined;

  const sessions = await listSessions(home, 100);
  let target = sessions.find((entry) => entry.sessionId === trimmed)
    ?? sessions.find((entry) => entry.sessionId.startsWith(trimmed));
  if (!target && /^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    const paths = await ensureBraincodeHome(home);
    const fullPath = join(paths.sessions, `${trimmed}.jsonl`);
    const file = Bun.file(fullPath);
    if (await file.exists()) {
      target = {
        sessionId: trimmed,
        path: fullPath,
        updatedAt: file.lastModified,
        status: "incomplete",
      };
    }
  }
  if (!target) return undefined;

  const entries: SessionContextEntry[] = [];
  let currentRun: Extract<SessionContextEntry, { type: "run" }> | undefined;
  let latestHandoffEntry: Extract<SessionContextEntry, { type: "handoff" }> | undefined;
  let handoffSupersededByActivity = false;
  const text = await Bun.file(target.path).text();
  for (const line of text.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    let record: Record<string, unknown>;
    try {
      const parsed = JSON.parse(trimmedLine);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      record = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const timestamp = numberField(record, "timestamp");
    const attempt = numberField(record, "attempt");
    if (record.type === "run_start") {
      if (currentRun) entries.push(currentRun);
      const plan = planFields(record.plan);
      currentRun = {
        type: "run",
        timestamp,
        prompt: stringField(record, "prompt"),
        brainId: plan.brainId,
        role: plan.role,
        status: "incomplete",
        attempt,
      };
      if (latestHandoffEntry) handoffSupersededByActivity = true;
    } else if (record.type === "run_end") {
      const entry: Extract<SessionContextEntry, { type: "run" }> = {
        ...(currentRun ?? { type: "run", status: "completed" as const }),
        summary: stringField(record, "summary"),
        status: "completed",
        attempt: attempt ?? currentRun?.attempt,
      };
      entries.push(entry);
      currentRun = undefined;
    } else if (record.type === "run_error") {
      const error = stringField(record, "error") ?? "unknown error";
      if (currentRun) {
        entries.push({
          ...currentRun,
          summary: error,
          status: "failed",
          attempt: attempt ?? currentRun.attempt,
        });
        currentRun = undefined;
      } else {
        entries.push({
          type: "error",
          timestamp,
          error,
          attempt,
          willFallback: typeof record.willFallback === "boolean" ? record.willFallback : undefined,
        });
      }
    } else if (record.type === "worker_end") {
      const result = objectField(record, "result");
      const progress = result ? objectField(result, "progress") : undefined;
      entries.push({
        type: "worker",
        timestamp,
        phase: stringField(record, "phase"),
        role: stringField(record, "worker"),
        status: workerSessionStatus(result?.status ?? progress?.status),
        summary: result ? stringField(result, "summary") : undefined,
        attempt,
      });
    } else if (record.type === "worker_error") {
      entries.push({
        type: "worker",
        timestamp,
        phase: stringField(record, "phase"),
        role: stringField(record, "worker"),
        status: "failed",
        error: stringField(record, "error") ?? "unknown worker error",
        attempt,
      });
    } else if (record.type === "todo_update") {
      const todosValue = record.todos;
      const todoRecords = Array.isArray(todosValue)
        ? todosValue.filter((todo): todo is Record<string, unknown> => Boolean(todo) && typeof todo === "object" && !Array.isArray(todo))
        : [];
      const rawStatus = stringField(record, "status");
      const status: Extract<SessionContextEntry, { type: "todo" }>["status"] = rawStatus === "pending" || rawStatus === "running" || rawStatus === "completed" || rawStatus === "blocked" || rawStatus === "failed" ? rawStatus : "pending";
      const shared = {
        timestamp,
        phase: stringField(record, "phase"),
        status,
        summary: stringField(record, "summary"),
        error: stringField(record, "error"),
      };
      if (todoRecords.length === 0) {
        entries.push({ type: "todo", ...shared, role: stringField(record, "role") });
      } else {
        for (const todo of todoRecords) {
          entries.push({
            type: "todo",
            ...shared,
            role: stringField(record, "role") ?? stringField(todo, "role"),
            title: stringField(todo, "title"),
            summary: shared.summary ?? stringField(todo, "summary"),
          });
        }
      }
    } else if (record.type === "check_summary") {
      const rawStatus = stringField(record, "status");
      const status: Extract<SessionContextEntry, { type: "check" }>["status"] =
        rawStatus === "passed" || rawStatus === "failed" || rawStatus === "skipped"
          ? rawStatus
          : "skipped";
      const rawResults = Array.isArray(record.results)
        ? record.results.filter((result): result is Record<string, unknown> => Boolean(result) && typeof result === "object" && !Array.isArray(result))
        : [];
      entries.push({
        type: "check",
        timestamp,
        status,
        reason: stringField(record, "reason"),
        attempt,
        checks: rawResults.map((result) => ({
          name: stringField(result, "name") ?? "unknown",
          status: stringField(result, "status") === "passed" ? "passed" : "failed",
          exitCode: typeof result.exitCode === "number" || result.exitCode === null ? result.exitCode : undefined,
          durationMs: numberField(result, "durationMs"),
        })),
      });
    } else if (record.type === "review_decision") {
      const rawDecision = stringField(record, "decision");
      const decision: Extract<SessionContextEntry, { type: "review" }>["decision"] =
        rawDecision === "approved" || rawDecision === "changes_requested" || rawDecision === "blocked"
          ? rawDecision
          : "blocked";
      entries.push({
        type: "review",
        timestamp,
        decision,
        rationale: stringField(record, "rationale"),
        requiredChanges: stringArrayField(record, "requiredChanges"),
        blockingIssues: stringArrayField(record, "blockingIssues"),
        attempt,
      });
    } else if (record.type === "handoff") {
      const summary = stringField(record, "summary");
      if (summary) {
        const trigger = record.trigger === "manual" || record.trigger === "auto" ? record.trigger : undefined;
        latestHandoffEntry = {
          type: "handoff",
          timestamp,
          summary,
          focus: stringField(record, "focus"),
          trigger,
        };
        handoffSupersededByActivity = false;
        entries.push(latestHandoffEntry);
      }
    }
  }
  if (currentRun) {
    entries.push(currentRun);
    if (latestHandoffEntry) handoffSupersededByActivity = true;
  }

  const bounded = Math.max(1, Math.floor(maxEntries));
  const runEntries = entries.filter((entry): entry is Extract<SessionContextEntry, { type: "run" }> => entry.type === "run");
  const latestRun = [...runEntries].reverse()[0];
  const latestError = [...entries].reverse().find((entry): entry is Extract<SessionContextEntry, { type: "error" }> => entry.type === "error");
  const firstPrompt = runEntries.find((entry) => entry.prompt)?.prompt;
  const latestHandoff: SessionHandoffSnapshot | undefined = latestHandoffEntry
    ? {
        summary: latestHandoffEntry.summary,
        timestamp: latestHandoffEntry.timestamp,
        focus: latestHandoffEntry.focus,
        trigger: latestHandoffEntry.trigger,
        fresh: !handoffSupersededByActivity,
      }
    : undefined;
  return {
    ...target,
    prompt: target.prompt ?? firstPrompt,
    brainId: target.brainId ?? latestRun?.brainId,
    role: target.role ?? latestRun?.role,
    summary: target.summary ?? latestRun?.summary ?? latestError?.error,
    status: target.status === "incomplete" ? latestRun?.status ?? target.status : target.status,
    entries: entries.slice(-bounded),
    truncated: entries.length > bounded,
    latestHandoff,
  };
}

export async function appendSessionRecord(
  sessionId: string,
  record: SessionRecord,
  home = getBraincodeHome(),
): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId)) {
    throw new Error(
      "sessionId may only contain letters, numbers, dots, underscores, and dashes",
    );
  }

  const paths = await ensureBraincodeHome(home);
  const line = JSON.stringify({ timestamp: Date.now(), ...record });
  await appendFile(
    join(paths.sessions, `${sessionId}.jsonl`),
    `${line}\n`,
    "utf8",
  );
}
