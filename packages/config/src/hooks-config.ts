// Lifecycle hook configuration: schema, normalization, and the hooks.json store.

import { asRecord, readJsonFile, writeJsonFile } from "./json-io";
import { ensureBraincodeHome } from "./stores";
import { getBraincodeHome, getProjectSupportPaths } from "./paths";

export type HookEventName =
  | "SessionStart"
  | "SubagentStart"
  | "SubagentStop"
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PreCompact"
  | "PostCompact"
  | "UserPromptSubmit"
  | "Stop";

export type HookHandler = {
  type: string;
  command?: string;
  commandWindows?: string;
  command_windows?: string;
  timeout?: number;
  statusMessage?: string;
  async?: boolean;
  enabled?: boolean;
  trusted?: boolean;
};

export type HookMatcherGroup = {
  matcher?: string;
  hooks: HookHandler[];
};

export type BraincodeHooks = {
  hooks: Partial<Record<HookEventName, HookMatcherGroup[]>>;
};

export type HookSource = {
  kind: "user" | "project";
  path: string;
  document: BraincodeHooks;
};

export const defaultHooks: BraincodeHooks = { hooks: {} };

const hookEventNames: HookEventName[] = [
  "SessionStart",
  "SubagentStart",
  "SubagentStop",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "UserPromptSubmit",
  "Stop",
];

function normalizeHookHandler(value: unknown): HookHandler | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;

  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" && record.type.trim()
    ? record.type.trim()
    : "command";
  const handler: HookHandler = {
    type,
    enabled: record.enabled === false ? false : true,
    trusted: record.trusted === true,
  };
  if (typeof record.command === "string" && record.command.trim()) {
    handler.command = record.command.trim();
  }
  if (
    typeof record.commandWindows === "string" &&
    record.commandWindows.trim()
  ) {
    handler.commandWindows = record.commandWindows.trim();
  }
  if (
    typeof record.command_windows === "string" &&
    record.command_windows.trim()
  ) {
    handler.command_windows = record.command_windows.trim();
  }
  if (typeof record.timeout === "number" && Number.isFinite(record.timeout)) {
    handler.timeout = Math.max(1, record.timeout);
  }
  if (typeof record.statusMessage === "string" && record.statusMessage.trim()) {
    handler.statusMessage = record.statusMessage.trim();
  }
  if (record.async === true) {
    handler.async = true;
  }
  return handler;
}

function normalizeHookMatcherGroup(value: unknown): HookMatcherGroup | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.hooks)) return undefined;

  const hooks = record.hooks
    .map((hook) => normalizeHookHandler(hook))
    .filter((hook): hook is HookHandler => Boolean(hook));
  if (hooks.length === 0) return undefined;

  return {
    matcher:
      typeof record.matcher === "string" ? record.matcher.trim() : undefined,
    hooks,
  };
}

export function normalizeHooks(value: unknown): BraincodeHooks {
  const record = asRecord(value);
  const hooksRecord = asRecord(record?.hooks);
  if (!hooksRecord) return defaultHooks;

  const hooks: BraincodeHooks["hooks"] = {};
  for (const eventName of hookEventNames) {
    const groupsValue = hooksRecord[eventName];
    if (!Array.isArray(groupsValue)) continue;

    const groups = groupsValue
      .map((group) => normalizeHookMatcherGroup(group))
      .filter((group): group is HookMatcherGroup => Boolean(group));
    if (groups.length > 0) {
      hooks[eventName] = groups;
    }
  }
  return { hooks };
}

export async function setHookHandlerEnabled(
  filePath: string,
  eventName: HookEventName,
  matcherIndex: number,
  handlerIndex: number,
  enabled: boolean,
): Promise<void> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`hooks file not found at ${filePath}`);
  }
  const raw = await file.text();
  const parsed = normalizeHooks(JSON.parse(raw));
  const groups = parsed.hooks[eventName];
  if (!Array.isArray(groups) || !groups[matcherIndex]) {
    throw new Error(`hook group not found: ${eventName}[${matcherIndex}]`);
  }
  const handler = groups[matcherIndex].hooks[handlerIndex];
  if (!handler) {
    throw new Error(
      `hook handler not found: ${eventName}[${matcherIndex}][${handlerIndex}]`,
    );
  }
  handler.enabled = enabled;
  await writeJsonFile(filePath, parsed);
}
