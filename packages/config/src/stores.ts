// User-level config stores under ~/.braincode: settings, auth, brains, models, tools — including defaults and migrations.

import { chmod, mkdir } from "node:fs/promises";
import { agentRoleSystemPrompts, CORE_OPERATING_DIRECTIVES_HEADER, type AgentRole, type BrainModel, type BrainPreset, type ModelThinkingLevel } from "@braincode/brain";
import { DEFAULT_CONFIG_HOST, DEFAULT_CONFIG_PORT, normalizeModelApi } from "@braincode/shared";
import { createDefaultToolConfiguration, normalizeToolConfiguration, type ToolConfigDocument } from "@braincode/tools";
import { asRecord, ensureJsonFile, readJsonFile, writeJsonFile } from "./json-io";
import { defaultHooks } from "./hooks-config";
import { getBraincodeHome, getBraincodePaths, type BraincodePaths } from "./paths";

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
    dynamicDispatch?: boolean;
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
  brains: BrainPreset[];
};

// Canonical stored-model shape for models.json. Owned here (where the store
// lives) so defaults, migrations, and every reader share one compiler-checked
// schema; @braincode/llm re-exports this type and narrows `api` semantics at
// the provider boundary.
export type BraincodeModel = {
  id: string;
  provider: string;
  modelId: string;
  name: string;
  api?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  builtIn?: boolean;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision?: boolean;
  supportsImageGeneration?: boolean;
  defaultThinkingLevel?: ModelThinkingLevel;
};

export type BraincodeModelProviderEntry = {
  provider: string;
  baseUrl?: string;
  api?: string;
};

export type BraincodeModels = {
  models: BraincodeModel[];
  providers?: BraincodeModelProviderEntry[];
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
    dynamicDispatch: true,
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
      },
      roles: {
        routeBrain: {
          modelId: "azure-openai-responses/gpt-5.5",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "xhigh",
        },
        frontend: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "medium",
        },
        backend: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "medium",
        },
        designer: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3-flash-preview",
          ],
          thinkingLevel: "medium",
        },
        imageMaker: {
          modelId: "openai/gpt-image-2",
          thinkingLevel: "off",
        },
        dba: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "anthropic/claude-sonnet-4-6",
          ],
          thinkingLevel: "high",
        },
        devops: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "medium",
        },
        security: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "azure-openai-responses/gpt-5.5",
            "anthropic/claude-sonnet-4-6",
          ],
          thinkingLevel: "high",
        },
        qa: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "low",
        },
        review: {
          modelId: "google/gemini-3.1-pro-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "high",
        },
        summarize: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: ["anthropic/claude-sonnet-4-6"],
          thinkingLevel: "low",
        },
        oracle: {
          modelId: "azure-openai-responses/gpt-5.5",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "google/gemini-3.1-pro-preview",
          ],
          thinkingLevel: "xhigh",
        },
        librarian: {
          modelId: "anthropic/claude-sonnet-4-6",
          fallbackModelIds: [
            "google/gemini-3.1-pro-preview",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "high",
        },
        rush: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
            "azure-openai-responses/gpt-5.5",
          ],
          thinkingLevel: "low",
        },
        pet: {
          modelId: "google/gemini-3-flash-preview",
          fallbackModelIds: [
            "anthropic/claude-sonnet-4-6",
          ],
          thinkingLevel: "minimal",
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
    {
      id: "openai/gpt-image-2",
      provider: "openai",
      modelId: "gpt-image-2",
      name: "GPT Image 2",
      api: "openai-images",
      baseUrl: "https://api.openai.com/v1",
      contextWindow: 32000,
      supportsTools: false,
      supportsVision: false,
      supportsImageGeneration: true,
      defaultThinkingLevel: "off",
    },
  ],
};

export const defaultTools: BraincodeTools = createDefaultToolConfiguration();

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
  if (
    value.features?.dynamicDispatch !== undefined &&
    typeof value.features.dynamicDispatch !== "boolean"
  ) {
    throw new Error("settings.features.dynamicDispatch must be a boolean");
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

// Persistence contract for role prompts: a stored systemPrompt means "user
// customized — pinned"; an absent one means "follow the built-in default,
// including future releases' updates". Migration therefore normalizes stale
// or redundant stored prompts by REMOVING them (un-pinning back to the
// default) instead of overwriting them with today's default text, which
// would just re-pin them until the next migration.
function refreshLegacySystemPrompt(
  value: unknown,
  currentDefault: string,
  patterns: readonly RegExp[],
): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const systemPrompt = record.systemPrompt;
  if (typeof systemPrompt !== "string") return false;
  // A stored copy of the current default carries no information — drop it so
  // the role keeps following default updates across releases.
  if (systemPrompt === currentDefault) {
    delete record.systemPrompt;
    return true;
  }
  if (!patterns.some((pattern) => pattern.test(systemPrompt))) return false;
  // Some legacy patterns (imageMaker) also match the current default text. A
  // prompt carrying the current-generation marker (present in every default
  // built by buildAgentRoleSystemPrompt; legacy prompts predate it) is a user
  // customization derived from a current-generation default (exact copies
  // were handled above) — never a stale legacy prompt. Leave it pinned.
  if (systemPrompt.includes(CORE_OPERATING_DIRECTIVES_HEADER)) return false;
  delete record.systemPrompt;
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
      // Iterate every known role, not just those with legacy patterns: the
      // exact-copy un-pin must also reach roles whose prompt a previous
      // release seeded verbatim (e.g. pet) but that never had a legacy
      // pattern entry.
      for (const role of Object.keys(agentRoleSystemPrompts) as AgentRole[]) {
        if (refreshLegacySystemPrompt(roles[role], agentRoleSystemPrompts[role], legacySystemPromptPatterns[role] ?? [])) {
          changed = true;
        }
      }
      // New roles are created WITHOUT a stored systemPrompt: absent means
      // "follow the built-in default" (see refreshLegacySystemPrompt).
      if (!roles.pet) {
        const fallback = (roles.summarize ?? roles.rush) as Record<string, unknown> | undefined;
        if (fallback) {
          roles.pet = {
            modelId: fallback.modelId,
            fallbackModelIds: fallback.fallbackModelIds,
            thinkingLevel: "minimal",
          };
          changed = true;
        }
      }
      if (!roles.imageMaker) {
        roles.imageMaker = {
          modelId: "openai/gpt-image-2",
          thinkingLevel: "off",
        };
        changed = true;
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
  const modelIds = new Set(document.models.map((model) => (model as Record<string, unknown> | undefined)?.id).filter((id): id is string => typeof id === "string"));
  const hasDefaultTextModels = [
    "azure-openai-responses/gpt-5.5",
    "anthropic/claude-sonnet-4-6",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3-flash-preview",
  ].every((id) => modelIds.has(id));
  if (hasDefaultTextModels && !modelIds.has("openai/gpt-image-2")) {
    const defaultImageModel = defaultModels.models.find((model) => (model as Record<string, unknown> | undefined)?.id === "openai/gpt-image-2");
    if (defaultImageModel) {
      document.models.push(structuredClone(defaultImageModel));
      changed = true;
    }
  }
  for (const model of document.models) {
    if (!model || typeof model !== "object") continue;
    const record = model as Record<string, unknown>;
    if (typeof record.api !== "string") {
      continue;
    }

    const normalizedApi = normalizeModelApi(record.api);
    if (normalizedApi !== record.api) {
      record.api = normalizedApi;
      changed = true;
    }
    if (record.api === "openai-images") {
      if (record.supportsTools !== false) {
        record.supportsTools = false;
        changed = true;
      }
      if (record.supportsVision !== false) {
        record.supportsVision = false;
        changed = true;
      }
      if (record.supportsImageGeneration !== true) {
        record.supportsImageGeneration = true;
        changed = true;
      }
      if (record.defaultThinkingLevel !== "off") {
        record.defaultThinkingLevel = "off";
        changed = true;
      }
      if (typeof record.contextWindow !== "number") {
        record.contextWindow = 32000;
        changed = true;
      }
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
