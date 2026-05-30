import { randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { agentRoleSystemPrompts, type AgentRole } from "@braincode/brain";
import {
  BRAINCODE_HOME_DIR_NAME,
  DEFAULT_CONFIG_HOST,
  DEFAULT_CONFIG_PORT,
  normalizeModelApi,
} from "@braincode/shared";
import {
  createDefaultToolConfiguration,
  normalizeToolConfiguration,
  type ToolConfigDocument,
} from "@braincode/tools";

export type BraincodeMode = "auto" | "radical";
export type BraincodeTheme = "dark" | "light";

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

export type BraincodeOAuthCredentials = {
  refresh: string;
  access: string;
  expires: number;
  [key: string]: unknown;
};

export type BraincodeProviderOAuth = {
  providerId: string;
  credentials: BraincodeOAuthCredentials;
};

export type BraincodeProviderAuthRecord = {
  apiKey?: string;
  oauth?: BraincodeProviderOAuth;
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
  providerAuth: Array<{
    provider: string;
    kind: "api-key" | "oauth" | "unknown";
    oauthProviderId?: string;
    expires?: number;
  }>;
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

export type McpServerEntry = {
  type?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  http_headers?: Record<string, string>;
  disabled?: boolean;
  trusted?: boolean;
  [key: string]: unknown;
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

export type UserSupportPaths = {
  home: string;
  mcp: string;
  skills: string;
};

export type UserSupport = {
  home: string;
  mcp?: ProjectMcpConfig;
  skills: ProjectSkill[];
};

export const TAVILY_AUTH_PROVIDER = "tavily";
export const TAVILY_MCP_SERVER_NAME = "tavily";
export const TAVILY_MCP_PACKAGE = "tavily-mcp@latest";

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

export type UsageStatsOptions = {
  detailLimit?: number;
  sessionLimit?: number;
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
        imageMaker: {
          modelId: "openai/gpt-image-2",
          thinkingLevel: "off",
          imageModel: {
            provider: "openai",
            modelId: "gpt-image-2",
            name: "GPT Image 2",
            baseUrl: "https://api.openai.com/v1",
            api: "openai-images",
          },
          systemPrompt: agentRoleSystemPrompts.imageMaker,
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
        pet: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
          ],
          thinkingLevel: "minimal",
          systemPrompt: agentRoleSystemPrompts.pet,
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
    skills: join(projectRoot, ".agents", "skills"),
    hooks: join(projectRoot, ".agents", "hooks.json"),
  };
}

export function getUserSupportPaths(home = getBraincodeHome()): UserSupportPaths {
  return {
    home,
    mcp: join(home, "mcp.json"),
    skills: join(home, "skills"),
  };
}

async function writeJsonFile(path: string, value: unknown, mode?: number) {
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await Bun.write(tempPath, `${JSON.stringify(value, null, 2)}\n`);
    if (mode !== undefined) {
      await chmod(tempPath, mode);
    }
    await rename(tempPath, path);
    if (mode !== undefined) {
      await chmod(path, mode);
    }
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
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

export function extractMcpServerEntries(
  config: Record<string, unknown>,
): Array<{ name: string; entry: McpServerEntry }> {
  const servers = asRecord(config.mcpServers) ?? asRecord(config.servers);
  if (!servers) return [];
  return Object.entries(servers)
    .map(([name, value]) => ({
      name,
      entry: (asRecord(value) ?? {}) as McpServerEntry,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function detectMcpServersKey(parsed: Record<string, unknown>): "mcpServers" | "servers" {
  if (parsed.mcpServers && typeof parsed.mcpServers === "object") return "mcpServers";
  if (parsed.servers && typeof parsed.servers === "object") return "servers";
  return "mcpServers";
}

export function createBraincodeAuthEnvRef(provider: string): string {
  const normalizedProvider = provider.trim();
  if (!normalizedProvider) throw new Error("provider is required");
  return `\${BRAINCODE_AUTH:${normalizedProvider}}`;
}

function braincodeAuthProviderFromEnvRef(value: string): string | undefined {
  const match = /^\$\{BRAINCODE_AUTH:([^}]+)\}$/.exec(value.trim());
  return match?.[1]?.trim() || undefined;
}

export function resolveMcpServerEnv(
  env: Record<string, string> | undefined,
  auth: BraincodeAuth,
): Record<string, string> | undefined {
  if (!env) return undefined;

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const textValue = String(value);
    const provider = braincodeAuthProviderFromEnvRef(textValue);
    if (!provider) {
      resolved[key] = textValue;
      continue;
    }
    const apiKey = getProviderApiKey(auth, provider);
    if (!apiKey) {
      throw new Error(`Missing API key for MCP auth provider '${provider}'`);
    }
    resolved[key] = apiKey;
  }
  return resolved;
}

export function createTavilyMcpServerEntry(existing?: McpServerEntry): McpServerEntry {
  const env = {
    ...(existing?.env ?? {}),
    TAVILY_API_KEY: createBraincodeAuthEnvRef(TAVILY_AUTH_PROVIDER),
  };
  const entry: McpServerEntry = {
    ...(existing ?? {}),
    type: "stdio",
    command: "bunx",
    args: [TAVILY_MCP_PACKAGE],
    env,
  };
  delete entry.url;
  delete entry.http_headers;
  delete entry.disabled;
  return entry;
}

export async function readUserMcpConfig(
  home = getBraincodeHome(),
): Promise<ProjectMcpConfig> {
  const paths = getUserSupportPaths(home);
  const mcpFile = Bun.file(paths.mcp);
  const mcpConfig = (await mcpFile.exists())
    ? asRecord(JSON.parse(await mcpFile.text())) ?? { mcpServers: {} }
    : { mcpServers: {} };

  return {
    path: paths.mcp,
    config: mcpConfig,
    serverNames: extractMcpServerNames(mcpConfig),
  };
}

export async function upsertUserMcpServer(
  serverName: string,
  entry: McpServerEntry,
  home = getBraincodeHome(),
): Promise<ProjectMcpConfig> {
  const normalizedServerName = serverName.trim();
  if (!normalizedServerName) throw new Error("serverName is required");

  await ensureBraincodeHome(home);
  const paths = getUserSupportPaths(home);
  const mcp = await readUserMcpConfig(home);
  const parsed = mcp.config;
  const key = detectMcpServersKey(parsed);
  const servers = asRecord(parsed[key]) ?? {};
  servers[normalizedServerName] = entry as Record<string, unknown>;
  parsed[key] = servers;
  await writeJsonFile(paths.mcp, parsed);
  return readUserMcpConfig(home);
}

export async function configureTavilyMcpServer(
  options: { apiKey?: string } = {},
  home = getBraincodeHome(),
): Promise<ProjectMcpConfig> {
  const apiKey = options.apiKey?.trim() ?? "";
  if (apiKey) {
    await writeProviderApiKey(TAVILY_AUTH_PROVIDER, apiKey, home);
  } else if (!(await readProviderApiKey(TAVILY_AUTH_PROVIDER, home))) {
    throw new Error("Tavily API key is required");
  }

  const mcp = await readUserMcpConfig(home);
  const existing = extractMcpServerEntries(mcp.config).find((server) => server.name === TAVILY_MCP_SERVER_NAME)?.entry;
  return upsertUserMcpServer(
    TAVILY_MCP_SERVER_NAME,
    createTavilyMcpServerEntry(existing),
    home,
  );
}

export async function setMcpServerDisabled(
  filePath: string,
  serverName: string,
  disabled: boolean,
): Promise<void> {
  await setMcpServerBooleanFlag(filePath, serverName, "disabled", disabled);
}

export async function setMcpServerTrusted(
  filePath: string,
  serverName: string,
  trusted: boolean,
): Promise<void> {
  await setMcpServerBooleanFlag(filePath, serverName, "trusted", trusted);
}

async function setMcpServerBooleanFlag(
  filePath: string,
  serverName: string,
  flag: "disabled" | "trusted",
  enabled: boolean,
): Promise<void> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`MCP config not found at ${filePath}`);
  }
  const raw = await file.text();
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const key = detectMcpServersKey(parsed);
  const existing = asRecord(parsed[key]);
  if (!existing) {
    throw new Error(`MCP config at ${filePath} has no '${key}' map`);
  }
  if (!(serverName in existing)) {
    throw new Error(`MCP server '${serverName}' not found in ${filePath}`);
  }
  const entry = (asRecord(existing[serverName]) ?? {}) as McpServerEntry;
  if (enabled) {
    entry[flag] = true;
  } else {
    delete entry[flag];
  }
  existing[serverName] = entry as Record<string, unknown>;
  parsed[key] = existing;
  await writeJsonFile(filePath, parsed);
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

export async function readUserSupport(home = getBraincodeHome()): Promise<UserSupport> {
  const paths = getUserSupportPaths(home);
  const mcpFile = Bun.file(paths.mcp);
  const mcpConfig = (await mcpFile.exists())
    ? asRecord(JSON.parse(await mcpFile.text()))
    : undefined;

  return {
    home: paths.home,
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

export type SessionSummary = {
  sessionId: string;
  path: string;
  updatedAt: number;
  prompt?: string;
  brainId?: string;
  role?: string;
  summary?: string;
  status: "completed" | "failed" | "incomplete";
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
): Promise<SessionSummary[]> {
  const paths = await ensureBraincodeHome(home);
  const safeLimit = Math.max(1, Math.floor(limit));
  const candidates = await listSessionFiles(paths, safeLimit * 4);
  const records: Array<SessionSummary & { sortKey: number }> = [];
  for (const candidate of candidates) {
    const file = Bun.file(candidate.path);
    let prompt: string | undefined;
    let brainId: string | undefined;
    let role: string | undefined;
    let summary: string | undefined;
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
    records.push({ sessionId: candidate.sessionId, path: candidate.path, updatedAt: candidate.updatedAt, prompt, brainId, role, summary, status, sortKey: candidate.updatedAt });
  }
  records.sort((left, right) => right.sortKey - left.sortKey);
  return records.slice(0, safeLimit).map(({ sortKey: _drop, ...rest }) => rest);
}

type SessionFileCandidate = {
  sessionId: string;
  path: string;
  updatedAt: number;
};

async function listSessionFiles(paths: BraincodePaths, limit?: number): Promise<SessionFileCandidate[]> {
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

function parseSessionRecordLine(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
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

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumberField(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
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

function objectField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function planFields(plan: unknown): { brainId?: string; role?: string } {
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
  const { theme: _legacyTheme, ...settings } = value as Partial<
    BraincodeSettings
  > & { theme?: unknown };
  return {
    ...defaultSettings,
    ...settings,
    configServer: {
      ...defaultSettings.configServer,
      ...settings.configServer,
    },
    features: {
      ...defaultSettings.features,
      ...settings.features,
    },
  };
}

export function normalizeBraincodeTheme(value: unknown): BraincodeTheme {
  return value === "light" ? "light" : "dark";
}

async function ensureJsonFile(path: string, value: unknown, mode?: number) {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    await writeJsonFile(path, value, mode);
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
  const hadLegacyTheme = "theme" in (settings as Record<string, unknown>);
  const normalized = normalizeSettings(settings);
  let changed = hadLegacyTheme;
  if (normalized.defaultBrainId === "default") {
    normalized.defaultBrainId = "brain";
    changed = true;
  }
  if (changed) {
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
  await writeJsonFile(paths.auth, auth, 0o600);
  await chmod(paths.auth, 0o600);
}

export async function writeProviderOAuthCredentials(
  provider: string,
  oauthProviderId: string,
  credentials: BraincodeOAuthCredentials,
  home = getBraincodeHome(),
): Promise<void> {
  const normalizedProvider = provider.trim();
  const normalizedOAuthProviderId = oauthProviderId.trim();
  if (!normalizedProvider) throw new Error("provider is required");
  if (!normalizedOAuthProviderId) throw new Error("oauthProviderId is required");
  assertOAuthCredentials(credentials);

  const paths = await ensureBraincodeHome(home);
  const auth = await readAuth(home);
  auth.providers[normalizedProvider] = {
    oauth: {
      providerId: normalizedOAuthProviderId,
      credentials,
    },
  };
  await writeJsonFile(paths.auth, auth, 0o600);
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

export function getProviderOAuthCredentials(
  auth: BraincodeAuth,
  provider: string,
): BraincodeProviderOAuth | undefined {
  const value = auth.providers[provider];
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const oauth = record.oauth;
  if (!oauth || typeof oauth !== "object") return undefined;

  const oauthRecord = oauth as Record<string, unknown>;
  const providerId = oauthRecord.providerId;
  const credentials = oauthRecord.credentials;
  if (typeof providerId !== "string" || !providerId.trim()) return undefined;
  if (!isOAuthCredentials(credentials)) return undefined;
  return {
    providerId,
    credentials,
  };
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
  const providerAuth = Object.entries(auth.providers).map(([provider, value]) => {
    if (getProviderApiKey(auth, provider)) {
      return { provider, kind: "api-key" as const };
    }
    const oauth = getProviderOAuthCredentials(auth, provider);
    if (oauth) {
      return {
        provider,
        kind: "oauth" as const,
        oauthProviderId: oauth.providerId,
        expires: oauth.credentials.expires,
      };
    }
    return { provider, kind: "unknown" as const };
  });
  return {
    configuredProviders: Object.keys(auth.providers),
    providerAuth,
  };
}

function isOAuthCredentials(value: unknown): value is BraincodeOAuthCredentials {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.refresh === "string" &&
    record.refresh.trim().length > 0 &&
    typeof record.access === "string" &&
    record.access.trim().length > 0 &&
    typeof record.expires === "number" &&
    Number.isFinite(record.expires)
  );
}

function assertOAuthCredentials(credentials: BraincodeOAuthCredentials): void {
  if (!isOAuthCredentials(credentials)) {
    throw new Error("oauth credentials must include refresh, access, and expires");
  }
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

const legacySystemPromptPatterns: Partial<Record<AgentRole, readonly RegExp[]>> = {
  routeBrain: [/Prefer coding as the primary role/, /choose only worker agents that materially improve the result/],
  frontend: [/Own user-facing UI behavior: components, state, accessibility/],
  backend: [/Own server-side behavior: APIs, services, validation/],
  designer: [/Own UX quality: task flow, information architecture/],
  imageMaker: [/Own image creation requests, visual asset prompt construction/],
  dba: [/Own database safety and performance: schema design/],
  devops: [/Own build and runtime operations: CI\/CD/],
  security: [/Own security posture: authentication, authorization/],
  qa: [/Own verification quality: test strategy/],
  review: [/Own defect finding: correctness bugs/],
  summarize: [/Own compact handoff: preserve the user goal/],
  oracle: [/Own hard thinking: architecture decisions/],
  librarian: [/Own codebase understanding: map unfamiliar repositories/, /Own codebase understanding AND fact finding/],
  rush: [/Own odd jobs and quick one-off chores/, /Own quick one-off chores AND short conversational replies/],
};

function refreshLegacySystemPrompt(
  value: unknown,
  prompt: string,
  patterns: readonly RegExp[],
): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const systemPrompt = record.systemPrompt;
  if (typeof systemPrompt !== "string") return false;
  if (systemPrompt === prompt) return false;
  if (!patterns.some((pattern) => pattern.test(systemPrompt))) return false;
  record.systemPrompt = prompt;
  return true;
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
    if (
      refreshLegacySystemPrompt(
        record.planner,
        agentRoleSystemPrompts.routeBrain,
        legacySystemPromptPatterns.routeBrain ?? [],
      )
    ) {
      changed = true;
    }
    const roles = record.roles as Record<string, unknown> | undefined;
    if (roles && typeof roles === "object") {
      for (const [role, patterns] of Object.entries(legacySystemPromptPatterns) as Array<[AgentRole, readonly RegExp[]]>) {
        if (refreshLegacySystemPrompt(roles[role], agentRoleSystemPrompts[role], patterns)) {
          changed = true;
        }
      }
      if (!roles.pet) {
        const fallback = (roles.summarize ?? roles.rush) as Record<string, unknown> | undefined;
        if (fallback) {
          roles.pet = {
            modelId: fallback.modelId,
            fallbackModelIds: fallback.fallbackModelIds,
            thinkingLevel: "minimal",
            systemPrompt: agentRoleSystemPrompts.pet,
          };
          changed = true;
        }
      }
      if (!roles.imageMaker) {
        roles.imageMaker = {
          modelId: "openai/gpt-image-2",
          thinkingLevel: "off",
          imageModel: {
            provider: "openai",
            modelId: "gpt-image-2",
            name: "GPT Image 2",
            baseUrl: "https://api.openai.com/v1",
            api: "openai-images",
          },
          systemPrompt: agentRoleSystemPrompts.imageMaker,
        };
        changed = true;
      } else {
        const imageMaker = asRecord(roles.imageMaker);
        if (
          imageMaker &&
          imageMaker.modelId === "openai/gpt-image-2" &&
          !asRecord(imageMaker.imageModel)
        ) {
          imageMaker.imageModel = {
            provider: "openai",
            modelId: "gpt-image-2",
            name: "GPT Image 2",
            baseUrl: "https://api.openai.com/v1",
            api: "openai-images",
          };
          changed = true;
        }
      }
      // v0.2.0: drop the obsolete `coding`, `fastReply`, and `research` roles.
      // `coding` is subsumed by frontend/backend specialists. `fastReply` folds
      // into `rush`. `research` folds into `librarian`.
      for (const obsolete of ["coding", "fastReply", "research"]) {
        if (obsolete in roles) {
          delete roles[obsolete];
          changed = true;
        }
      }
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
  const models = await readJsonFile(paths.models, defaultModels);
  if (migrateModels(models)) {
    await writeJsonFile(paths.models, models);
  }
  return models;
}

export async function writeModels(
  models: BraincodeModels,
  home = getBraincodeHome(),
): Promise<void> {
  assertDocumentArray(models, "models");
  migrateModels(models);
  const paths = await ensureBraincodeHome(home);
  await writeJsonFile(paths.models, models);
}

function migrateModels(document: BraincodeModels): boolean {
  let changed = false;
  const withoutDefaultImageModel = document.models.filter((model) => (model as Record<string, unknown> | undefined)?.id !== "openai/gpt-image-2");
  if (withoutDefaultImageModel.length !== document.models.length) {
    document.models = withoutDefaultImageModel;
    changed = true;
  }
  for (const model of document.models) {
    if (!model || typeof model !== "object") continue;
    const record = model as Record<string, unknown>;
    if (typeof record.api !== "string") continue;

    const normalizedApi = normalizeModelApi(record.api);
    if (normalizedApi !== record.api) {
      record.api = normalizedApi;
      changed = true;
    }
  }
  return changed;
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
