// Token-usage accounting on top of the session journal: usage records, aggregate stats, per-session summaries.

import { join } from "node:path";
import { numberField, positiveNumberField, stringField } from "./json-io";
import { ensureBraincodeHome } from "./stores";
import { getBraincodeHome } from "./paths";
import { appendSessionRecord, listSessionFiles, parseSessionRecordLine, planFields, type SessionRunPhase, type TokenUsagePhase, type TokenUsageSessionRecord, type TokenUsageSnapshot, type TokenUsageTotals } from "./session-journal";

export type UsageStatsDetail = {
  sessionId: string;
  path: string;
  timestamp?: number;
  prompt?: string;
  brainId?: string;
  primaryRole?: string;
  role?: string;
  phase?: string;
  modelId?: string;
  provider?: string;
  agentSessionId?: string;
  taskId?: string;
  parentId?: string;
  turnId?: string;
  attempt?: number;
  usage: TokenUsageSnapshot;
};

export type UsageStatsBucket = TokenUsageTotals & {
  id: string;
  label: string;
  lastUsedAt?: number;
  provider?: string;
  modelId?: string;
  role?: string;
  phase?: string;
};

export type UsageStats = {
  generatedAt: number;
  sessions: number;
  totals: TokenUsageTotals;
  byModel: UsageStatsBucket[];
  byRole: UsageStatsBucket[];
  byPhase: UsageStatsBucket[];
  recent: UsageStatsDetail[];
};

export type SessionTokenUsageSummary = {
  sessionId: string;
  totals: TokenUsageTotals;
  byModel: UsageStatsBucket[];
  byRole: UsageStatsBucket[];
  byPhase: UsageStatsBucket[];
  records: UsageStatsDetail[];
};

export type UsageStatsOptions = {
  detailLimit?: number;
  sessionLimit?: number;
};

export async function appendTokenUsageRecord(
  sessionId: string,
  record: Omit<TokenUsageSessionRecord, "type" | "usage"> & { usage: unknown },
  home = getBraincodeHome(),
): Promise<void> {
  const usage = normalizeTokenUsage(record.usage);
  if (!usage) return;
  const normalized: TokenUsageSessionRecord = {
    type: "token_usage",
    ...record,
    usage,
  };
  await appendSessionRecord(sessionId, normalized, home);
}

export async function readUsageStats(
  home = getBraincodeHome(),
  options: UsageStatsOptions = {},
): Promise<UsageStats> {
  const paths = await ensureBraincodeHome(home);
  const sessionFiles = await listSessionFiles(paths, options.sessionLimit);

  const stats = createEmptyUsageStats();
  const modelBuckets = new Map<string, UsageStatsBucket>();
  const roleBuckets = new Map<string, UsageStatsBucket>();
  const phaseBuckets = new Map<string, UsageStatsBucket>();
  const detailLimit = Math.max(1, Math.floor(options.detailLimit ?? 500));

  for (const sessionFile of sessionFiles) {
    let lines: string[] = [];
    try {
      const text = await Bun.file(sessionFile.path).text();
      lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    } catch {
      continue;
    }

    let prompt: string | undefined;
    let brainId: string | undefined;
    let primaryRole: string | undefined;
    let sessionHasUsage = false;
    for (const line of lines) {
      const record = parseSessionRecordLine(line);
      if (!record) continue;
      if (record.type !== "run_start") continue;
      prompt = prompt ?? stringField(record, "prompt");
      const plan = planFields(record.plan);
      brainId = brainId ?? plan.brainId;
      primaryRole = primaryRole ?? plan.role;
    }

    for (const line of lines) {
      const record = parseSessionRecordLine(line);
      if (!record || record.type !== "token_usage") continue;
      const usage = normalizeTokenUsage(record.usage);
      if (!usage) continue;
      sessionHasUsage = true;
      const timestamp = numberField(record, "timestamp");
      const modelId = stringField(record, "modelId") ?? stringField(record, "model");
      const provider = stringField(record, "provider");
      const role = stringField(record, "role") ?? "unknown";
      const phase = stringField(record, "phase") ?? "unknown";
      const detail: UsageStatsDetail = {
        sessionId: sessionFile.sessionId,
        path: sessionFile.path,
        timestamp,
        prompt,
        brainId: brainId ?? stringField(record, "brainId"),
        primaryRole,
        role,
        phase,
        modelId,
        provider,
        agentSessionId: stringField(record, "agentSessionId"),
        taskId: stringField(record, "taskId"),
        parentId: stringField(record, "parentId"),
        turnId: stringField(record, "turnId"),
        attempt: numberField(record, "attempt"),
        usage,
      };
      stats.recent.push(detail);
      addTokenUsage(stats.totals, usage);
      if (modelId) {
        addUsageBucket(modelBuckets, {
          id: modelId,
          label: modelId,
          provider,
          modelId,
        }, usage, timestamp);
      }
      addUsageBucket(roleBuckets, {
        id: role,
        label: role,
        role,
      }, usage, timestamp);
      addUsageBucket(phaseBuckets, {
        id: phase,
        label: phase,
        phase,
      }, usage, timestamp);
    }
    if (sessionHasUsage) stats.sessions += 1;
  }

  stats.byModel = sortedUsageBuckets(modelBuckets);
  stats.byRole = sortedUsageBuckets(roleBuckets);
  stats.byPhase = sortedUsageBuckets(phaseBuckets);
  stats.recent.sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
  stats.recent = stats.recent.slice(0, detailLimit);
  return stats;
}

export async function readSessionTokenUsageSummary(
  sessionId: string,
  home = getBraincodeHome(),
): Promise<SessionTokenUsageSummary> {
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId)) {
    throw new Error(
      "sessionId may only contain letters, numbers, dots, underscores, and dashes",
    );
  }

  const paths = await ensureBraincodeHome(home);
  const path = join(paths.sessions, `${sessionId}.jsonl`);
  const summary: SessionTokenUsageSummary = {
    sessionId,
    totals: emptyTokenUsageTotals(),
    byModel: [],
    byRole: [],
    byPhase: [],
    records: [],
  };
  const modelBuckets = new Map<string, UsageStatsBucket>();
  const roleBuckets = new Map<string, UsageStatsBucket>();
  const phaseBuckets = new Map<string, UsageStatsBucket>();

  let lines: string[] = [];
  try {
    const text = await Bun.file(path).text();
    lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return summary;
  }

  let prompt: string | undefined;
  let brainId: string | undefined;
  let primaryRole: string | undefined;
  for (const line of lines) {
    const record = parseSessionRecordLine(line);
    if (!record || record.type !== "run_start") continue;
    prompt = prompt ?? stringField(record, "prompt");
    const plan = planFields(record.plan);
    brainId = brainId ?? plan.brainId;
    primaryRole = primaryRole ?? plan.role;
  }

  for (const line of lines) {
    const record = parseSessionRecordLine(line);
    if (!record || record.type !== "token_usage") continue;
    const usage = normalizeTokenUsage(record.usage);
    if (!usage) continue;
    const timestamp = numberField(record, "timestamp");
    const modelId = stringField(record, "modelId") ?? stringField(record, "model");
    const provider = stringField(record, "provider");
    const role = stringField(record, "role") ?? "unknown";
    const phase = stringField(record, "phase") ?? "unknown";
    const detail: UsageStatsDetail = {
      sessionId,
      path,
      timestamp,
      prompt,
      brainId: brainId ?? stringField(record, "brainId"),
      primaryRole,
      role,
      phase,
      modelId,
      provider,
      agentSessionId: stringField(record, "agentSessionId"),
      taskId: stringField(record, "taskId"),
      parentId: stringField(record, "parentId"),
      turnId: stringField(record, "turnId"),
      attempt: numberField(record, "attempt"),
      usage,
    };
    summary.records.push(detail);
    addTokenUsage(summary.totals, usage);
    if (modelId) {
      addUsageBucket(modelBuckets, {
        id: modelId,
        label: modelId,
        provider,
        modelId,
      }, usage, timestamp);
    }
    addUsageBucket(roleBuckets, {
      id: role,
      label: role,
      role,
    }, usage, timestamp);
    addUsageBucket(phaseBuckets, {
      id: phase,
      label: phase,
      phase,
    }, usage, timestamp);
  }

  summary.byModel = sortedUsageBuckets(modelBuckets);
  summary.byRole = sortedUsageBuckets(roleBuckets);
  summary.byPhase = sortedUsageBuckets(phaseBuckets);
  summary.records.sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
  return summary;
}

function createEmptyUsageStats(): UsageStats {
  return {
    generatedAt: Date.now(),
    sessions: 0,
    totals: emptyTokenUsageTotals(),
    byModel: [],
    byRole: [],
    byPhase: [],
    recent: [],
  };
}

function addUsageBucket(
  buckets: Map<string, UsageStatsBucket>,
  identity: Pick<UsageStatsBucket, "id" | "label" | "provider" | "modelId" | "role" | "phase">,
  usage: TokenUsageSnapshot,
  timestamp?: number,
): void {
  const bucket = buckets.get(identity.id) ?? {
    ...identity,
    ...emptyTokenUsageTotals(),
  };
  addTokenUsage(bucket, usage);
  if (timestamp !== undefined) {
    bucket.lastUsedAt = Math.max(bucket.lastUsedAt ?? 0, timestamp);
  }
  buckets.set(identity.id, bucket);
}

function sortedUsageBuckets(buckets: Map<string, UsageStatsBucket>): UsageStatsBucket[] {
  return Array.from(buckets.values()).sort((left, right) =>
    right.total - left.total || right.calls - left.calls || left.label.localeCompare(right.label),
  );
}

function emptyTokenUsage(): TokenUsageSnapshot {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function emptyTokenUsageTotals(): TokenUsageTotals {
  return { ...emptyTokenUsage(), calls: 0 };
}

export function normalizeTokenUsage(value: unknown): TokenUsageSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const input = positiveNumberField(record, [
    "input",
    "inputTokens",
    "input_tokens",
    "promptTokens",
    "prompt_tokens",
  ]);
  const output = positiveNumberField(record, [
    "output",
    "outputTokens",
    "output_tokens",
    "completionTokens",
    "completion_tokens",
  ]);
  const cacheRead = positiveNumberField(record, [
    "cacheRead",
    "cache_read",
    "cacheReadTokens",
    "cache_read_tokens",
  ]);
  const cacheWrite = positiveNumberField(record, [
    "cacheWrite",
    "cache_write",
    "cacheWriteTokens",
    "cache_write_tokens",
  ]);
  const explicitTotal = positiveNumberField(record, [
    "total",
    "totalTokens",
    "total_tokens",
  ]);
  const total = explicitTotal || input + output + cacheRead + cacheWrite;
  if (total <= 0) return undefined;
  return { input, output, cacheRead, cacheWrite, total };
}

function addTokenUsage(total: TokenUsageTotals, usage: TokenUsageSnapshot): void {
  total.input += usage.input;
  total.output += usage.output;
  total.cacheRead += usage.cacheRead;
  total.cacheWrite += usage.cacheWrite;
  total.total += usage.total;
  total.calls += 1;
}
