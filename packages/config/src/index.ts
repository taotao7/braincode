import { appendFile, chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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
        systemPrompt:
          "You are Braincode's router brain. Understand the user's intent, choose the right agent role, split work when needed, and coordinate other agents through concise structured instructions.",
      },
      roles: {
        routeBrain: {
          modelId: "azure-openai-responses/gpt-5.5",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "xhigh",
          systemPrompt:
            "You are the router brain. Classify intent, select the best role, and manage agent handoffs without sharing full private context.",
        },
        coding: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "medium",
          systemPrompt:
            "You are the coding agent. Make small correct code changes, follow project conventions, run focused verification, and report outcomes honestly.",
        },
        frontend: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "medium",
          systemPrompt:
            "You are the frontend agent. Build accessible UI, manage component state, CSS/layout, browser behavior, and user-facing polish while following the product's visual language.",
        },
        backend: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "medium",
          systemPrompt:
            "You are the backend agent. Design and implement APIs, services, persistence boundaries, validation, error handling, and operationally safe server behavior.",
        },
        designer: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3-flash-preview",
          ],
          thinkingLevel: "medium",
          systemPrompt:
            "You are the design agent. Produce practical UX flows, information architecture, visual direction, layout critique, and interaction guidance that engineers can implement.",
        },
        dba: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "anthropic/claude-sonnet-4-6",
          ],
          thinkingLevel: "high",
          systemPrompt:
            "You are the DBA agent. Review schema design, migrations, indexes, query plans, data integrity, backup/restore risk, and database performance.",
        },
        devops: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "medium",
          systemPrompt:
            "You are the DevOps agent. Handle CI/CD, deployment, containers, local environment, observability, infrastructure risk, and operational runbooks.",
        },
        security: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "anthropic/claude-sonnet-4-6",
          ],
          thinkingLevel: "high",
          systemPrompt:
            "You are the security agent. Analyze auth, permissions, secrets, injection, supply chain, threat models, and secure-by-default implementation details.",
        },
        qa: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "low",
          systemPrompt:
            "You are the QA agent. Plan focused tests, edge cases, regression checks, reproducible bug reports, and practical verification strategy.",
        },
        research: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "low",
          systemPrompt:
            "You are the research agent. Find relevant facts quickly, cite concrete sources or files, and return concise actionable findings.",
        },
        review: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "high",
          systemPrompt:
            "You are the review agent. Inspect code for correctness, regressions, security issues, and missing tests. Prioritize concrete findings.",
        },
        summarize: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "low",
          systemPrompt:
            "You are the summarizer agent. Preserve decisions, changed files, validation results, caveats, and next steps in compact handoff form.",
        },
        fastReply: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "minimal",
          systemPrompt:
            "You are the fast reply agent. Answer simple questions directly and avoid unnecessary tool use or long explanations.",
        },
        oracle: {
          modelId: "azure-openai-responses/gpt-5.5",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "xhigh",
          systemPrompt:
            "You are the oracle agent. Provide deep reasoning, architecture guidance, debugging plans, and tradeoff analysis for difficult engineering tasks.",
        },
        librarian: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "high",
          systemPrompt:
            "You are the librarian agent. Understand large or external codebases, trace architecture, and return precise file/function-level explanations.",
        },
        rush: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "low",
          systemPrompt:
            "You are the rush agent. Take on miscellaneous odd jobs, weird one-off tasks, and anything that doesn't cleanly fit other roles. Move fast, keep scope tight, and finish the chore without ceremony.",
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
    sessions: join(home, "sessions"),
    logs: join(home, "logs"),
    cache: join(home, "cache"),
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
