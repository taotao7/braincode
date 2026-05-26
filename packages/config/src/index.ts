import { appendFile, chmod, mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { agentRoleSystemPrompts } from "@braincode/brain";
import {
  BRAINCODE_HOME_DIR_NAME,
  DEFAULT_CONFIG_HOST,
  DEFAULT_CONFIG_PORT,
} from "@braincode/shared";
import {
  createDefaultToolConfiguration,
  normalizeToolConfiguration,
  type ToolConfigDocument,
} from "@braincode/tools";

export type BraincodeMode = "auto" | "radical";

export type BraincodeSettings = {
  version: 1;
  mode: BraincodeMode;
  configServer: {
    host: string;
    port: number;
  };
  defaultBrainId: string;
  features?: {
    hooks?: boolean;
  };
};

export type BraincodeAuth = {
  providers: Record<string, unknown>;
};

export type BraincodeBrains = {
  brains: unknown[];
};

export type BraincodeModels = {
  models: unknown[];
  providers?: unknown[];
};

export type BraincodeTools = ToolConfigDocument;

export type AuthStatus = {
  configuredProviders: string[];
};

export type ProjectSupportPaths = {
  root: string;
  agents: string;
  mcp: string;
  skills: string;
  hooks: string;
};

export type ProjectInstructionFile = {
  path: string;
  content: string;
};

export type ProjectMcpConfig = {
  path: string;
  config: Record<string, unknown>;
  serverNames: string[];
};

export type ProjectSkill = {
  id: string;
  path: string;
  content: string;
};

export type ProjectSupport = {
  root: string;
  agents?: ProjectInstructionFile;
  mcp?: ProjectMcpConfig;
  skills: ProjectSkill[];
};

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

export type SessionRecord = {
  type: string;
  [key: string]: unknown;
};

export type BraincodePaths = {
  home: string;
  settings: string;
  auth: string;
  brains: string;
  models: string;
  tools: string;
  hooks: string;
  sessions: string;
  logs: string;
  cache: string;
};

export const defaultSettings: BraincodeSettings = {
  version: 1,
  mode: "auto",
  configServer: {
    host: DEFAULT_CONFIG_HOST,
    port: DEFAULT_CONFIG_PORT,
  },
  defaultBrainId: "brain",
  features: {
    hooks: true,
  },
};

export const defaultAuth: BraincodeAuth = { providers: {} };
export const defaultBrains: BraincodeBrains = {
  brains: [
    {
      id: "brain",
      name: "Brain",
      description: "Braincode routing profile for early development.",
      planner: {
        modelId: "azure-openai-responses/gpt-5.5",
        thinkingLevel: "xhigh",
        systemPrompt: agentRoleSystemPrompts.routeBrain,
      },
      roles: {
        routeBrain: {
          modelId: "azure-openai-responses/gpt-5.5",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "xhigh",
          systemPrompt: agentRoleSystemPrompts.routeBrain,
        },
        coding: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "medium",
          systemPrompt: agentRoleSystemPrompts.coding,
        },
        frontend: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "medium",
          systemPrompt: agentRoleSystemPrompts.frontend,
        },
        backend: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "medium",
          systemPrompt: agentRoleSystemPrompts.backend,
        },
        designer: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3-flash-preview",
          ],
          thinkingLevel: "medium",
          systemPrompt: agentRoleSystemPrompts.designer,
        },
        dba: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "anthropic/claude-sonnet-4-6",
          ],
          thinkingLevel: "high",
          systemPrompt: agentRoleSystemPrompts.dba,
        },
        devops: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "medium",
          systemPrompt: agentRoleSystemPrompts.devops,
        },
        security: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "anthropic/claude-sonnet-4-6",
          ],
          thinkingLevel: "high",
          systemPrompt: agentRoleSystemPrompts.security,
        },
        qa: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "low",
          systemPrompt: agentRoleSystemPrompts.qa,
        },
        research: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "low",
          systemPrompt: agentRoleSystemPrompts.research,
        },
        review: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "high",
          systemPrompt: agentRoleSystemPrompts.review,
        },
        summarize: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "low",
          systemPrompt: agentRoleSystemPrompts.summarize,
        },
        fastReply: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "minimal",
          systemPrompt: agentRoleSystemPrompts.fastReply,
        },
        oracle: {
          modelId: "azure-openai-responses/gpt-5.5",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "xhigh",
          systemPrompt: agentRoleSystemPrompts.oracle,
        },
        librarian: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "high",
          systemPrompt: agentRoleSystemPrompts.librarian,
        },
        rush: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "low",
          systemPrompt: agentRoleSystemPrompts.rush,
        },
      },
      routing: {
        maxParallelAgents: 2,
        preferCheapModelForSimpleTasks: true,
        escalateOnUncertainty: true,
        requireReviewForFileEdits: true,
      },
      context: {
        maxInputTokens: 120000,
        compaction: "auto",
        isolation: "strict",
      },
    },
  ],
};
export const defaultModels: BraincodeModels = {
  models: [
    {
      id: "azure-openai-responses/gpt-5.5",
      provider: "azure-openai-responses",
      modelId: "gpt-5.5",
      name: "GPT-5.5",
      api: "azure-openai-responses",
      contextWindow: 272000,
      supportsTools: true,
      defaultThinkingLevel: "xhigh",
    },
    {
      id: "anthropic/claude-sonnet-4-6",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      contextWindow: 200000,
      supportsTools: true,
      defaultThinkingLevel: "medium",
    },
    {
      id: "google/gemini-3.1-pro-preview",
      provider: "google",
      modelId: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      contextWindow: 1000000,
      supportsTools: true,
      defaultThinkingLevel: "high",
    },
    {
      id: "google/gemini-3-flash-preview",
      provider: "google",
      modelId: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview",
      contextWindow: 1000000,
      supportsTools: true,
      defaultThinkingLevel: "low",
    },
  ],
};
export const defaultTools: BraincodeTools = createDefaultToolConfiguration();
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

export function getBraincodeHome(): string {
  return join(homedir(), BRAINCODE_HOME_DIR_NAME);
}

export function getBraincodePaths(home = getBraincodeHome()): BraincodePaths {
  return {
    home,
    settings: join(home, "settings.json"),
    auth: join(home, "auth.json"),
    brains: join(home, "brains.json"),
    models: join(home, "models.json"),
    tools: join(home, "tools.json"),
    hooks: join(home, "hooks.json"),
    sessions: join(home, "sessions"),
    logs: join(home, "logs"),
    cache: join(home, "cache"),
  };
}

export function getProjectSupportPaths(
  projectRoot = process.cwd(),
): ProjectSupportPaths {
  return {
    root: projectRoot,
    agents: join(projectRoot, "AGENTS.md"),
    mcp: join(projectRoot, ".mcp.json"),
    skills: join(projectRoot, ".agents", "skill"),
    hooks: join(projectRoot, ".agents", "hooks.json"),
  };
}

async function writeJsonFile(path: string, value: unknown) {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) return fallback;

  const text = await file.text();
  if (!text.trim()) return fallback;

  return JSON.parse(text) as T;
}

async function readOptionalTextFile(path: string): Promise<string | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;

  const text = await file.text();
  return text.trim() ? text : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function extractMcpServerNames(config: Record<string, unknown>): string[] {
  const servers = asRecord(config.mcpServers) ?? asRecord(config.servers);
  if (!servers) return [];
  return Object.keys(servers).sort();
}

function stripMarkdownExtension(name: string): string {
  return name.replace(/\.md$/i, "");
}

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

async function readProjectSkills(skillsPath: string): Promise<ProjectSkill[]> {
  let entries;
  try {
    entries = await readdir(skillsPath, { withFileTypes: true });
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return [];
    throw error;
  }

  const skills: ProjectSkill[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      const skillPath = join(skillsPath, entry.name, "SKILL.md");
      const content = await readOptionalTextFile(skillPath);
      if (content) {
        skills.push({
          id: entry.name,
          path: skillPath,
          content,
        });
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      const skillPath = join(skillsPath, entry.name);
      const content = await readOptionalTextFile(skillPath);
      if (content) {
        skills.push({
          id: stripMarkdownExtension(entry.name),
          path: skillPath,
          content,
        });
      }
    }
  }

  return skills.sort((left, right) => left.id.localeCompare(right.id));
}

export async function readProjectSupport(
  projectRoot = process.cwd(),
): Promise<ProjectSupport> {
  const paths = getProjectSupportPaths(projectRoot);
  const agentsContent = await readOptionalTextFile(paths.agents);
  const mcpFile = Bun.file(paths.mcp);
  const mcpConfig = (await mcpFile.exists())
    ? asRecord(JSON.parse(await mcpFile.text()))
    : undefined;

  return {
    root: paths.root,
    agents: agentsContent
      ? {
          path: paths.agents,
          content: agentsContent,
        }
      : undefined,
    mcp: mcpConfig
      ? {
          path: paths.mcp,
          config: mcpConfig,
          serverNames: extractMcpServerNames(mcpConfig),
        }
      : undefined,
    skills: await readProjectSkills(paths.skills),
  };
}

export async function readUserHooks(
  home = getBraincodeHome(),
): Promise<HookSource> {
  const paths = await ensureBraincodeHome(home);
  const hooks = await readJsonFile<unknown>(paths.hooks, defaultHooks);
  const normalized = normalizeHooks(hooks);
  if (JSON.stringify(normalized) !== JSON.stringify(hooks)) {
    await writeJsonFile(paths.hooks, normalized);
  }
  return {
    kind: "user",
    path: paths.hooks,
    document: normalized,
  };
}

export async function readProjectHooks(
  projectRoot = process.cwd(),
): Promise<HookSource | undefined> {
  const paths = getProjectSupportPaths(projectRoot);
  const file = Bun.file(paths.hooks);
  if (!(await file.exists())) return undefined;

  const hooks = normalizeHooks(JSON.parse(await file.text()));
  return {
    kind: "project",
    path: paths.hooks,
    document: hooks,
  };
}

export async function readHookSources(
  home = getBraincodeHome(),
  projectRoot = process.cwd(),
): Promise<HookSource[]> {
  const userHooks = await readUserHooks(home);
  const projectHooks = await readProjectHooks(projectRoot);
  return projectHooks ? [userHooks, projectHooks] : [userHooks];
}

function assertSettings(value: BraincodeSettings) {
  if (value.version !== 1) {
    throw new Error("Unsupported settings version");
  }
  if (value.mode !== "auto" && value.mode !== "radical") {
    throw new Error("settings.mode must be either auto or radical");
  }
  if (!value.configServer || typeof value.configServer.host !== "string") {
    throw new Error("settings.configServer.host must be a string");
  }
  if (
    !Number.isInteger(value.configServer.port) ||
    value.configServer.port <= 0 ||
    value.configServer.port > 65535
  ) {
    throw new Error(
      "settings.configServer.port must be an integer from 1 to 65535",
    );
  }
  if (
    typeof value.defaultBrainId !== "string" ||
    !value.defaultBrainId.trim()
  ) {
    throw new Error("settings.defaultBrainId must be a non-empty string");
  }
  if (
    value.features?.hooks !== undefined &&
    typeof value.features.hooks !== "boolean"
  ) {
    throw new Error("settings.features.hooks must be a boolean");
  }
}

function assertDocumentArray(
  value: unknown,
  key: "brains" | "models" | "tools",
) {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as Record<string, unknown>)[key])
  ) {
    throw new Error(`${key}.json must contain a ${key} array`);
  }
}

function normalizeSettings(
  value: Partial<BraincodeSettings>,
): BraincodeSettings {
  return {
    ...defaultSettings,
    ...value,
    configServer: {
      ...defaultSettings.configServer,
      ...value.configServer,
    },
    features: {
      ...defaultSettings.features,
      ...value.features,
    },
  };
}

async function ensureJsonFile(path: string, value: unknown, mode?: number) {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    await writeJsonFile(path, value);
  }
  if (mode !== undefined) {
    await chmod(path, mode);
  }
}

export async function ensureBraincodeHome(
  home = getBraincodeHome(),
): Promise<BraincodePaths> {
  const paths = getBraincodePaths(home);

  await mkdir(paths.home, { recursive: true });
  await mkdir(paths.sessions, { recursive: true });
  await mkdir(paths.logs, { recursive: true });
  await mkdir(paths.cache, { recursive: true });

  await ensureJsonFile(paths.settings, defaultSettings);
  await ensureJsonFile(paths.auth, defaultAuth, 0o600);
  await ensureJsonFile(paths.brains, defaultBrains);
  await ensureJsonFile(paths.models, defaultModels);
  await ensureJsonFile(paths.tools, defaultTools);
  await ensureJsonFile(paths.hooks, defaultHooks);

  return paths;
}

export async function readSettings(
  home = getBraincodeHome(),
): Promise<BraincodeSettings> {
  const paths = await ensureBraincodeHome(home);
  const settings = await readJsonFile<Partial<BraincodeSettings>>(
    paths.settings,
    defaultSettings,
  );
  const normalized = normalizeSettings(settings);
  if (normalized.defaultBrainId === "default") {
    normalized.defaultBrainId = "brain";
    await writeJsonFile(paths.settings, normalized);
  }
  return normalized;
}

export async function writeSettings(
  settings: BraincodeSettings,
  home = getBraincodeHome(),
): Promise<void> {
  assertSettings(settings);
  const paths = await ensureBraincodeHome(home);
  await writeJsonFile(paths.settings, settings);
}

export async function readAuth(
  home = getBraincodeHome(),
): Promise<BraincodeAuth> {
  const paths = await ensureBraincodeHome(home);
  return readJsonFile(paths.auth, defaultAuth);
}

export async function writeProviderApiKey(
  provider: string,
  apiKey: string,
  home = getBraincodeHome(),
): Promise<void> {
  const normalizedProvider = provider.trim();
  if (!normalizedProvider) throw new Error("provider is required");
  if (!apiKey.trim()) return;

  const paths = await ensureBraincodeHome(home);
  const auth = await readAuth(home);
  auth.providers[normalizedProvider] = { apiKey: apiKey.trim() };
  await writeJsonFile(paths.auth, auth);
  await chmod(paths.auth, 0o600);
}

export function getProviderApiKey(
  auth: BraincodeAuth,
  provider: string,
): string | undefined {
  const value = auth.providers[provider];
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  if (typeof record.apiKey === "string" && record.apiKey.trim())
    return record.apiKey;
  return undefined;
}

export async function readProviderApiKey(
  provider: string,
  home = getBraincodeHome(),
): Promise<string | undefined> {
  const auth = await readAuth(home);
  return getProviderApiKey(auth, provider);
}

export async function readAuthStatus(
  home = getBraincodeHome(),
): Promise<AuthStatus> {
  const auth = await readAuth(home);
  return {
    configuredProviders: Object.keys(auth.providers),
  };
}

export async function readBrains(
  home = getBraincodeHome(),
): Promise<BraincodeBrains> {
  const paths = await ensureBraincodeHome(home);
  const brains = await readJsonFile(paths.brains, defaultBrains);
  if (migrateBrains(brains)) {
    await writeJsonFile(paths.brains, brains);
  }
  return brains;
}

function migrateBrains(document: BraincodeBrains): boolean {
  let changed = false;
  for (const brain of document.brains) {
    if (!brain || typeof brain !== "object") continue;
    const record = brain as Record<string, unknown>;
    if (record.id === "default") {
      record.id = "brain";
      changed = true;
    }
    if (record.name === "Default Brain") {
      record.name = "Brain";
      changed = true;
    }
  }
  return changed;
}

export async function writeBrains(
  brains: BraincodeBrains,
  home = getBraincodeHome(),
): Promise<void> {
  assertDocumentArray(brains, "brains");
  const paths = await ensureBraincodeHome(home);
  await writeJsonFile(paths.brains, brains);
}

export async function readModels(
  home = getBraincodeHome(),
): Promise<BraincodeModels> {
  const paths = await ensureBraincodeHome(home);
  return readJsonFile(paths.models, defaultModels);
}

export async function writeModels(
  models: BraincodeModels,
  home = getBraincodeHome(),
): Promise<void> {
  assertDocumentArray(models, "models");
  const paths = await ensureBraincodeHome(home);
  await writeJsonFile(paths.models, models);
}

export async function readTools(
  home = getBraincodeHome(),
): Promise<BraincodeTools> {
  const paths = await ensureBraincodeHome(home);
  const tools = await readJsonFile<BraincodeTools>(paths.tools, defaultTools);
  const normalized = normalizeToolConfiguration(tools);
  if (JSON.stringify(normalized) !== JSON.stringify(tools)) {
    await writeJsonFile(paths.tools, normalized);
  }
  return normalized;
}

export async function writeTools(
  tools: BraincodeTools,
  home = getBraincodeHome(),
): Promise<void> {
  assertDocumentArray(tools, "tools");
  const paths = await ensureBraincodeHome(home);
  await writeJsonFile(paths.tools, normalizeToolConfiguration(tools));
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
