// Project/user support-file discovery: AGENTS.md, MCP configs, skills, hooks, project checks.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { normalizePartialCheckRunnerConfiguration, type PartialCheckRunnerConfiguration } from "@braincode/tools";
import { asRecord, readOptionalTextFile, parseJsonRecordSafe, readJsonFile, writeJsonFile } from "./json-io";
import { defaultHooks, normalizeHooks, type HookSource } from "./hooks-config";
import { ensureBraincodeHome, getProviderApiKey, readProviderApiKey, writeProviderApiKey, type BraincodeAuth } from "./stores";
import { getBraincodeHome, getProjectSupportPaths, getUserSupportPaths } from "./paths";

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

export type ProjectChecksConfig = {
  path: string;
  config: PartialCheckRunnerConfiguration;
};

export type UserSupport = {
  home: string;
  agents?: ProjectInstructionFile;
  mcp?: ProjectMcpConfig;
  skills: ProjectSkill[];
};

export const TAVILY_AUTH_PROVIDER = "tavily";

export const TAVILY_MCP_SERVER_NAME = "tavily";

export const TAVILY_MCP_PACKAGE = "tavily-mcp@latest";

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
    ? parseJsonRecordSafe(paths.mcp, await mcpFile.text()) ?? { mcpServers: {} }
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
    ? parseJsonRecordSafe(paths.mcp, await mcpFile.text())
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

export async function readProjectChecks(
  projectRoot = process.cwd(),
): Promise<ProjectChecksConfig | undefined> {
  const paths = getProjectSupportPaths(projectRoot);
  const file = Bun.file(paths.checks);
  if (!(await file.exists())) return undefined;

  return {
    path: paths.checks,
    config: normalizePartialCheckRunnerConfiguration(JSON.parse(await file.text())),
  };
}

export async function readUserSupport(home = getBraincodeHome()): Promise<UserSupport> {
  const paths = getUserSupportPaths(home);
  const agentsContent = await readOptionalTextFile(paths.agents);
  const mcpFile = Bun.file(paths.mcp);
  const mcpConfig = (await mcpFile.exists())
    ? parseJsonRecordSafe(paths.mcp, await mcpFile.text())
    : undefined;

  return {
    home: paths.home,
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
