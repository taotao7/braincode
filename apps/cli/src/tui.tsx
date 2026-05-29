import React, {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Box, render, Text, useApp, useInput, useStdout } from "ink";
import { render as renderMarkdown, strip as stripMarkdown } from "markdansi";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import {
  ensureSessionHandoff,
  executePromptFromConfig,
  humanizeAgentRuntimeError,
  isHandoffRequiredError,
  isProviderMessageSizeLimitError,
  planRuntimeFromConfig,
  type AgentEvent,
  type FinalReport,
  type RuntimePlan,
  type TodoLifecycleEvent,
  type ToolApprovalDecision,
  type ToolApprovalRequest,
  type WorkerLifecycleEvent,
} from "@braincode/agent-runtime";
import {
  extractMcpServerEntries,
  listSessions,
  readAuth,
  readBrains,
  readHookSources,
  readProjectSupport,
  readSessionContext,
  readSettings,
  readTools,
  readUserSupport,
  resolveMcpServerEnv,
  setHookHandlerEnabled,
  setMcpServerDisabled,
  setMcpServerTrusted,
  writeSettings,
  type BraincodeMode,
  type BraincodeTheme,
  type BraincodeTools,
  type HookEventName,
  type HookHandler,
  type HookSource,
  type McpServerEntry,
  type ProjectSupport,
  type SessionContext,
  type SessionSummary,
  type UserSupport,
} from "@braincode/config";
import type { BrainModel } from "@braincode/brain";
import { readClipboardImageOrText } from "./clipboard";
import { checkMcpHealth, type McpHealthResult } from "./mcp-health";
import { fuzzyFilter, listProjectFiles } from "./project-files";
import { BrainPet } from "./brain-pet";
import { usePetWatcher, type PetWatcherSnapshotItem } from "./pet-watcher";
import {
  buildEditPreview,
  displayEditPath,
  extractEditArgs,
  resolveEditPath,
  snapshotFileContent,
  type EditArgs,
  type EditPreview,
  type EditRow,
} from "./tool-edit-preview";
import { isWideChar, moveDraftCursorVertically } from "./input-cursor";

type TranscriptItem = {
  id: string;
  kind:
    | "user"
    | "status"
    | "assistant"
    | "error"
    | "help"
    | "panel"
    | "tool"
    | "thinking"
    | "worker"
    | "todo"
    | "queued"
    | "decision"
    | "report";
  text: string;
  collapsed?: boolean;
  plan?: RuntimePlan;
  finalReport?: FinalReport;
  toolName?: string;
  toolCategory?: ToolCategory;
  toolStatus?: "running" | "ok" | "failed";
  workerStatus?: "running" | "completed" | "blocked" | "failed";
  todoStatus?: "pending" | "running" | "completed" | "blocked" | "failed";
  decisionStatus?: "pending" | "approved" | "blocked";
  todoId?: string;
  startedAt?: number;
  finishedAt?: number;
  queueId?: string;
  editPreview?: EditPreview;
  toolArgs?: Record<string, unknown>;
  toolDetail?: string;
  streaming?: boolean;
};

type ToolCategory = "websearch" | "execute" | "write" | "read" | "mcp" | "tool";

type TokenUsageSnapshot = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

type RunStatusState = {
  startedAt: number;
  label: string;
  tokens: TokenUsageSnapshot;
  frame: number;
};

type InputState = {
  draft: string;
  cursor: number;
};

type DraftMetrics = {
  empty: boolean;
  lineCount: number;
  hiddenAbove: number;
  hiddenBelow: number;
};

type QueuedTask = {
  id: string;
  prompt: string;
  displayText: string;
  skipCommand: boolean;
  forceRoles?: string[];
  itemId: string;
};

type TranscriptRenderEntry = {
  item: TranscriptItem;
  index: number;
  continuation: boolean;
  showDivider: boolean;
  collapsible: boolean;
  rowStart: number;
  rowEnd: number;
};

type StoreUpdate<T> = T | ((previous: T) => T);

type TuiStore<T> = {
  getSnapshot: () => T;
  setSnapshot: (update: StoreUpdate<T>) => void;
  subscribe: (listener: () => void) => () => void;
};

function createTuiStore<T>(initial: T): TuiStore<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    setSnapshot: (update) => {
      const next =
        typeof update === "function"
          ? (update as (previous: T) => T)(snapshot)
          : update;
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function useStableTuiStore<T>(initial: T): TuiStore<T> {
  const store = useRef<TuiStore<T> | null>(null);
  if (!store.current) store.current = createTuiStore(initial);
  return store.current;
}

function useTuiStoreSnapshot<T>(store: TuiStore<T>): T {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

type CommandDefinition = {
  name: string;
  label: string;
  hint: string;
  insert?: string;
  skill?: {
    id: string;
    scope: "user" | "project";
    content: string;
    path: string;
  };
};

const COMMANDS: CommandDefinition[] = [
  { name: "help", label: "/help", hint: "List all slash commands" },
  {
    name: "plan",
    label: "/plan",
    hint: "Preview routeBrain planning; add --heuristic for diagnostics",
    insert: "/plan ",
  },
  {
    name: "intent",
    label: "/intent",
    hint: "Show the current task decomposition and dependency graph",
  },
  { name: "mcp", label: "/mcp", hint: "Interactive MCP control panel" },
  { name: "hooks", label: "/hooks", hint: "Interactive hooks control panel" },
  { name: "sessions", label: "/sessions", hint: "Browse recent sessions" },
  {
    name: "resume",
    label: "/resume",
    hint: "Resume a session by id",
    insert: "/resume ",
  },
  {
    name: "new",
    label: "/new",
    hint: "Start a fresh session (clears transcript)",
  },
  {
    name: "handoff",
    label: "/handoff",
    hint: "Fork a new session (or pass <session-id> to summarize another)",
    insert: "/handoff ",
  },
  {
    name: "brain",
    label: "/brain",
    hint: "View Brain catalog and switch default brain",
  },
  {
    name: "mode",
    label: "/mode",
    hint: "View or switch execution mode: auto/radical",
    insert: "/mode ",
  },
  { name: "theme", label: "/theme", hint: "Show the system-resolved theme" },
  { name: "auto", label: "/auto", hint: "Switch execution mode to auto" },
  {
    name: "radical",
    label: "/radical",
    hint: "Switch execution mode to radical",
  },
  {
    name: "team-test",
    label: "/team-test",
    hint: "Diagnostic: force every role to run the prompt in parallel",
    insert: "/team-test ",
  },
  {
    name: "skill",
    label: "/skill",
    hint: "List project skills (.agents/skill)",
  },
  {
    name: "agents",
    label: "/agents",
    hint: "Show AGENTS.md location and length",
  },
  { name: "files", label: "/files", hint: "Refresh the @file index" },
  { name: "clear", label: "/clear", hint: "Clear transcript" },
  { name: "exit", label: "/exit", hint: "Quit the TUI" },
];

type Overlay =
  | { kind: "command"; filter: string; selected: number }
  | { kind: "file"; filter: string; selected: number; anchor: number }
  | { kind: "session"; filter: string; selected: number; anchor: number }
  | null;

type McpPanelEntry = {
  scope: "user" | "project";
  filePath: string;
  name: string;
  entry: McpServerEntry;
  health: "pending" | "skipped" | "ok" | "error";
  detail?: string;
  toolCount?: number;
  latencyMs?: number;
  serverInfo?: { name?: string; version?: string };
};

type McpPanelState = {
  entries: McpPanelEntry[];
  selected: number;
  message?: string;
};

type HookPanelEntry = {
  scope: "user" | "project";
  filePath: string;
  eventName: HookEventName;
  matcher: string | undefined;
  matcherIndex: number;
  handlerIndex: number;
  handler: HookHandler;
};

type HookPanelState = {
  entries: HookPanelEntry[];
  selected: number;
  message?: string;
};

type SessionPanelState = {
  entries: SessionSummary[];
  selected: number;
  message?: string;
};

type BrainPanelState = {
  brains: BrainModel[];
  defaultBrainId: string;
  selected: number;
  message?: string;
};

type IntentPanelState = {
  plan: RuntimePlan;
};

type RuntimeErrorPanelState = {
  title: string;
  message: string;
};

type ToastTone = "info" | "error";

type ToastState = {
  id: string;
  text: string;
  tone: ToastTone;
};

type PlanCommandArgument = {
  prompt: string;
  useRouterBrain: boolean;
  displayText: string;
};

type DecisionOptionId = "approve" | "approve_session" | "block";

type DecisionOption = {
  id: DecisionOptionId;
  label: string;
  description: string;
  checked: boolean;
};

type DecisionPanelState = {
  id: string;
  itemId: string;
  sessionId: string;
  toolName: string;
  toolCategory: ToolCategory;
  argsSummary: string;
  selected: number;
  options: DecisionOption[];
};

type BraincodeTuiProps = {
  initialPrompt?: string;
};

export async function runTui(initialPrompt?: string): Promise<void> {
  const restoreDebugSink = await configureTuiDebugSink();
  const instance = render(<BraincodeTui initialPrompt={initialPrompt} />);
  try {
    await instance.waitUntilExit();
  } finally {
    restoreDebugSink();
  }
}

const INPUT_MIN_LINES = 1;
const INPUT_MAX_LINES = 6;
const INPUT_PROMPT_PREFIX = "› ";
const FRAME_RESERVED_COLUMNS = 4;
const INPUT_BOX_HORIZONTAL_CHROME = 4; // left/right border plus padding
const INK_RENDER_SAFETY_ROWS = 1;
const OVERLAY_SUGGESTION_MIN_ROWS = 4;
const OVERLAY_SUGGESTION_MAX_ROWS = 12;
const PET_PANEL_MIN_WIDTH = 28;
const PET_PANEL_MAX_WIDTH = 42;
const RUN_SPINNER_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;
const COLLAPSED_TEXT_LINE_LIMIT = 10;
const COLLAPSIBLE_TEXT_LINE_THRESHOLD = 18;
const COLLAPSIBLE_TEXT_CHAR_THRESHOLD = 2400;
const RESTORED_TEXT_CHUNK_LINE_LIMIT = 12;
const RESTORED_TEXT_CHUNK_CHAR_LIMIT = 1800;
const TOOL_DETAIL_CHAR_LIMIT = 320;
const TRANSCRIPT_MOUSE_WHEEL_ROWS = 4;
const RUN_STATUS_ANIMATION_MS = 140;
const RUN_STATUS_HIGHLIGHT_COLOR = "#ffffff";
const DEFAULT_STREAM_FLUSH_MS = 1000;
const STREAM_FLUSH_MIN_CHARS = 600;
const STREAM_FLUSH_MAX_WAIT_MS = 2500;
const PET_SNAPSHOT_FLUSH_MS = 1000;
const TUI_ANIMATIONS_ENABLED = process.env.BRAINCODE_TUI_ANIMATIONS === "true";
const TUI_MOUSE_ENABLED = process.env.BRAINCODE_TUI_MOUSE !== "false";

type UiColor =
  | "blue"
  | "cyan"
  | "green"
  | "yellow"
  | "magenta"
  | "red"
  | "gray";

type TuiTheme = {
  name: BraincodeTheme;
  label: string;
  colors: Record<UiColor, string> & {
    text: string;
    muted: string;
    border: string;
    focusedBorder: string;
  };
};

const TUI_THEMES: Record<BraincodeTheme, TuiTheme> = {
  dark: {
    name: "dark",
    label: "Analog Dream: Magnetic Night",
    colors: {
      text: "#d4d4d4",
      muted: "#8a8f96",
      border: "#3a3f45",
      focusedBorder: "#ffb86c",
      blue: "#8be9fd",
      cyan: "#8be9fd",
      green: "#50fa7b",
      yellow: "#ffb86c",
      magenta: "#bd93f9",
      red: "#ff5555",
      gray: "#8a8f96",
    },
  },
  light: {
    name: "light",
    label: "Analog Dream: Beige Terminal",
    colors: {
      text: "#2d2a27",
      muted: "#6b6560",
      border: "#c4b8a8",
      focusedBorder: "#d65d0e",
      blue: "#076678",
      cyan: "#458588",
      green: "#79740e",
      yellow: "#d65d0e",
      magenta: "#b16286",
      red: "#9d0006",
      gray: "#6b6560",
    },
  },
};

const TuiThemeContext = React.createContext<TuiTheme>(TUI_THEMES.dark);

function useTuiTheme(): TuiTheme {
  return useContext(TuiThemeContext);
}

function isBraincodeTheme(value: string): value is BraincodeTheme {
  return value === "dark" || value === "light";
}

function tone(theme: TuiTheme, color: UiColor): string {
  return theme.colors[color];
}

function readThemeOverride(): BraincodeTheme | undefined {
  const envTheme = process.env.BRAINCODE_THEME?.trim().toLowerCase();
  return isBraincodeTheme(envTheme ?? "")
    ? (envTheme as BraincodeTheme)
    : undefined;
}

function detectSystemAppearanceTheme(): BraincodeTheme {
  const colorFgBg = process.env.COLORFGBG;
  const background = colorFgBg?.split(";").at(-1);
  const backgroundCode = background ? Number(background) : Number.NaN;
  if (Number.isFinite(backgroundCode)) {
    return backgroundCode >= 7 && backgroundCode !== 8 ? "light" : "dark";
  }

  if (process.platform === "darwin") {
    try {
      const output = execFileSync(
        "defaults",
        ["read", "-g", "AppleInterfaceStyle"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      )
        .trim()
        .toLowerCase();
      return output.includes("dark") ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  return "dark";
}

function detectSystemTheme(): BraincodeTheme {
  return readThemeOverride() ?? detectSystemAppearanceTheme();
}

const BRAIN_LOGO: ReadonlyArray<string> = [
  "   ██████╗ ██████╗  █████╗ ██╗███╗   ██╗",
  "   ██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║",
  "   ██████╔╝██████╔╝███████║██║██╔██╗ ██║",
  "   ██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║",
  "   ██████╔╝██║  ██║██║  ██║██║██║ ╚████║",
  "   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝",
];

async function configureTuiDebugSink(): Promise<() => void> {
  if (
    process.env.BRAINCODE_DEBUG !== "true" ||
    process.env.BRAINCODE_DEBUG_FILE?.trim()
  ) {
    return () => {};
  }
  const previous = process.env.BRAINCODE_DEBUG_FILE;
  const debugDir = join(homedir(), ".braincode");
  const debugFile = join(debugDir, "debug.log");
  try {
    await mkdir(debugDir, { recursive: true });
    process.env.BRAINCODE_DEBUG_FILE = debugFile;
    return () => {
      if (previous === undefined) delete process.env.BRAINCODE_DEBUG_FILE;
      else process.env.BRAINCODE_DEBUG_FILE = previous;
    };
  } catch {
    return () => {};
  }
}

function BraincodeTui({ initialPrompt }: BraincodeTuiProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalCols, setTerminalCols] = useState<number>(
    stdout?.columns ?? 80,
  );
  const [terminalRows, setTerminalRows] = useState<number>(stdout?.rows ?? 24);
  useEffect(() => {
    if (!stdout) return;
    const handler = () => {
      setTerminalCols(stdout.columns ?? 80);
      setTerminalRows(stdout.rows ?? 24);
    };
    stdout.on("resize", handler);
    return () => {
      stdout.off("resize", handler);
    };
  }, [stdout]);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const projectRoot = useMemo(() => process.cwd(), []);
  const initialDraft = initialPrompt ?? "";
  const initialCursor = initialDraft.length;
  const [running, setRunning] = useState(false);
  const activeRunAbort = useRef<AbortController | null>(null);
  const inputStore = useStableTuiStore<InputState>({
    draft: initialDraft,
    cursor: initialCursor,
  });
  const draftMetricsStore = useStableTuiStore<DraftMetrics>(
    draftMetricsFromWindow(
      initialDraft,
      clipDraftToWindow(
        initialDraft,
        initialCursor,
        inputTextWidth(stdout?.columns ?? 80),
        INPUT_MAX_LINES,
      ),
    ),
  );
  const transcriptStore = useStableTuiStore<TranscriptItem[]>([]);
  const transcriptScrollStore = useStableTuiStore<number | null>(null);
  const runStatusStore = useStableTuiStore<RunStatusState | null>(null);
  const toastStore = useStableTuiStore<ToastState | null>(null);
  const queueLengthStore = useStableTuiStore(0);
  const footerRowsStore = useStableTuiStore(3);
  const petSnapshotStore = useStableTuiStore<PetWatcherSnapshotItem[]>([]);
  const [mode, setMode] = useState<BraincodeMode>("auto");
  const [themeName, setThemeName] = useState<BraincodeTheme>(() =>
    detectSystemTheme(),
  );
  const [projectSupport, setProjectSupport] = useState<ProjectSupport | null>(
    null,
  );
  const [userSupport, setUserSupport] = useState<UserSupport | null>(null);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [sessionSuggestions, setSessionSuggestions] = useState<
    SessionSummary[]
  >([]);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [mcpPanel, setMcpPanel] = useState<McpPanelState | null>(null);
  const [hookPanel, setHookPanel] = useState<HookPanelState | null>(null);
  const [sessionPanel, setSessionPanel] = useState<SessionPanelState | null>(
    null,
  );
  const [brainPanel, setBrainPanel] = useState<BrainPanelState | null>(null);
  const [intentPlan, setIntentPlan] = useState<RuntimePlan | null>(null);
  const [intentPanel, setIntentPanel] = useState<IntentPanelState | null>(null);
  const [runtimeErrorPanel, setRuntimeErrorPanel] =
    useState<RuntimeErrorPanelState | null>(null);
  const [decisionPanel, setDecisionPanel] = useState<DecisionPanelState | null>(
    null,
  );
  const initialRan = useRef(false);
  const lastEscapeAt = useRef(0);
  const DOUBLE_ESC_MS = 500;
  const queueRef = useRef<QueuedTask[]>([]);
  const promptHistory = useRef<string[]>([]);
  const promptHistoryIndex = useRef<number | null>(null);
  const draftBeforePromptHistory = useRef("");
  const pendingDecisionResolve = useRef<
    ((decision: ToolApprovalDecision) => void) | null
  >(null);
  const sessionApprovedToolPrompts = useRef<Set<string>>(new Set());
  const usageByTurn = useRef<Map<string, TokenUsageSnapshot>>(new Map());
  const activeUsageKey = useRef<string | null>(null);
  const runUsage = useRef<TokenUsageSnapshot>(emptyTokenUsage());
  const verticalCursorColumn = useRef<number | null>(null);
  const transcriptFoldPreference = useRef<boolean | null>(null);
  const transcriptViewportState = useRef({
    totalRows: 0,
    viewportRows: 0,
    scrollTop: 0,
    maxScrollTop: 0,
    scrollAnchors: [0],
  });
  const mouseInputBuffer = useRef("");
  const petSnapshotFlush = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getItems = () => transcriptStore.getSnapshot();
  const getInputState = () => inputStore.getSnapshot();
  const publishPetSnapshot = () => {
    const snapshot = getItems()
      .slice(-12)
      .map((item) => ({
        kind: item.kind,
        text: item.text,
        toolName: item.toolName,
        toolStatus: item.toolStatus,
        workerStatus: item.workerStatus,
      }));
    petSnapshotStore.setSnapshot((previous) =>
      samePetSnapshot(previous, snapshot) ? previous : snapshot,
    );
  };
  const schedulePetSnapshot = () => {
    if (petSnapshotFlush.current) return;
    petSnapshotFlush.current = setTimeout(() => {
      petSnapshotFlush.current = null;
      publishPetSnapshot();
    }, PET_SNAPSHOT_FLUSH_MS);
  };
  const setItems = (update: StoreUpdate<TranscriptItem[]>) => {
    const previous = transcriptStore.getSnapshot();
    const nextRaw =
      typeof update === "function"
        ? (update as (previous: TranscriptItem[]) => TranscriptItem[])(previous)
        : update;
    const next = normalizeTranscriptItemsForFoldPreference(
      nextRaw,
      transcriptFoldPreference.current,
    );
    if (Object.is(previous, next)) return;
    transcriptStore.setSnapshot(next);
    if (next.length === 0 || previous.length === 0) {
      publishPetSnapshot();
    } else {
      schedulePetSnapshot();
    }
  };
  const bumpQueue = () => queueLengthStore.setSnapshot(queueRef.current.length);

  useEffect(() => {
    return () => {
      if (petSnapshotFlush.current) clearTimeout(petSnapshotFlush.current);
    };
  }, []);

  const dynamicCommands = useMemo<CommandDefinition[]>(() => {
    const skills: CommandDefinition[] = [];
    const seen = new Set<string>(COMMANDS.map((command) => command.name));
    const addSkills = (
      list: Array<{ id: string; path: string; content: string }> | undefined,
      scope: "user" | "project",
    ) => {
      if (!list) return;
      for (const skill of list) {
        const safeId = skill.id.toLowerCase();
        if (seen.has(safeId)) continue;
        seen.add(safeId);
        skills.push({
          name: safeId,
          label: `/${skill.id}`,
          hint: `Skill (${scope}) — invoke /${skill.id} <task>`,
          insert: `/${skill.id} `,
          skill: {
            id: skill.id,
            scope,
            content: skill.content,
            path: skill.path,
          },
        });
      }
    };
    addSkills(projectSupport?.skills, "project");
    addSkills(userSupport?.skills, "user");
    return [...COMMANDS, ...skills];
  }, [projectSupport?.skills, userSupport?.skills]);
  const overlaySuggestionLimit = Math.max(
    OVERLAY_SUGGESTION_MIN_ROWS,
    Math.min(OVERLAY_SUGGESTION_MAX_ROWS, terminalRows - 22),
  );

  function filteredCommandsDynamic(filter: string): CommandDefinition[] {
    if (!filter) return dynamicCommands;
    const lower = filter.toLowerCase();
    return dynamicCommands.filter(
      (command) =>
        command.name.startsWith(lower) ||
        command.label.toLowerCase().includes(lower),
    );
  }

  function commandOverlayMatches(filter: string): CommandDefinition[] {
    return filteredCommandsDynamic(filter).slice(0, overlaySuggestionLimit);
  }

  useEffect(() => {
    void (async () => {
      try {
        const settings = await readSettings();
        setMode(settings.mode);
      } catch (error) {
        appendItem({
          kind: "error",
          text: `Failed to read settings: ${formatError(error)}`,
        });
      }
      try {
        const support = await readProjectSupport(projectRoot);
        setProjectSupport(support);
      } catch (error) {
        appendItem({
          kind: "error",
          text: `Failed to read project support: ${formatError(error)}`,
        });
      }
      try {
        const support = await readUserSupport();
        setUserSupport(support);
      } catch (error) {
        appendItem({
          kind: "error",
          text: `Failed to read user support: ${formatError(error)}`,
        });
      }
      try {
        const files = await listProjectFiles(projectRoot);
        setProjectFiles(files);
      } catch (error) {
        appendItem({
          kind: "error",
          text: `Failed to list project files: ${formatError(error)}`,
        });
      }
      try {
        await refreshSessionSuggestions();
      } catch (error) {
        appendItem({
          kind: "error",
          text: `Failed to list sessions: ${formatError(error)}`,
        });
      }
    })();
  }, [projectRoot]);

  useEffect(() => {
    const syncThemeSoon = () => {
      setThemeName(detectSystemTheme());
    };

    syncThemeSoon();
    const timer = setInterval(syncThemeSoon, 30_000);
    process.on("SIGCONT", syncThemeSoon);
    process.on("SIGWINCH", syncThemeSoon);
    return () => {
      clearInterval(timer);
      process.off("SIGCONT", syncThemeSoon);
      process.off("SIGWINCH", syncThemeSoon);
    };
  }, []);

  useEffect(() => {
    const enableMouse = "\x1b[?1000h\x1b[?1006h";
    const disableMouse = "\x1b[?1000l\x1b[?1006l";
    if (!stdout || !process.stdin.isTTY) return;
    if (!TUI_MOUSE_ENABLED) {
      stdout.write(disableMouse);
      return;
    }
    stdout.write(enableMouse);
    const onData = (chunk: Buffer | string) => {
      mouseInputBuffer.current = `${mouseInputBuffer.current}${String(chunk)}`;
      const parsed = consumeMouseInput(mouseInputBuffer.current);
      mouseInputBuffer.current = parsed.rest;
      for (const scroll of parsed.scrolls) {
        scrollTranscriptBy(scroll * TRANSCRIPT_MOUSE_WHEEL_ROWS);
      }
    };
    process.stdin.on("data", onData);
    return () => {
      process.stdin.off("data", onData);
      stdout.write(disableMouse);
    };
  }, [stdout]);

  useEffect(() => {
    if (initialRan.current) return;
    initialRan.current = true;
    if (initialPrompt?.trim()) {
      void submitPrompt(initialPrompt);
    }
  }, []);

  function appendItem(item: Omit<TranscriptItem, "id">) {
    setItems((previous) => [
      ...previous,
      { id: crypto.randomUUID(), ...item },
    ]);
  }

  function scrollTranscriptBy(deltaRows: number) {
    const { maxScrollTop } = transcriptViewportState.current;
    if (maxScrollTop <= 0 || !Number.isFinite(deltaRows) || deltaRows === 0)
      return;
    transcriptScrollStore.setSnapshot((current) => {
      const currentTop =
        current === null
          ? maxScrollTop
          : transcriptViewportState.current.scrollTop;
      const next = nextTranscriptScrollTop(
        currentTop,
        deltaRows,
        transcriptViewportState.current.scrollAnchors,
        maxScrollTop,
      );
      return next >= maxScrollTop ? null : next;
    });
  }

  function scrollTranscriptTo(position: "top" | "bottom") {
    const { maxScrollTop } = transcriptViewportState.current;
    transcriptScrollStore.setSnapshot(
      position === "top" && maxScrollTop > 0 ? 0 : null,
    );
  }

  function toggleTranscriptFolds() {
    const foldable = getItems()
      .map(normalizeTranscriptItem)
      .filter(isTranscriptItemCollapsible);
    if (foldable.length === 0) {
      if (running) {
        transcriptFoldPreference.current = false;
        flash("Transcript expanded");
        return;
      }
      flash("No foldable transcript items");
      return;
    }

    const shouldExpand = foldable.some((item) => item.collapsed ?? false);
    const nextCollapsed = !shouldExpand;
    transcriptFoldPreference.current = nextCollapsed;
    const foldableIds = new Set(foldable.map((item) => item.id));
    setItems((previous) =>
      previous.map((item) =>
        foldableIds.has(item.id)
          ? { ...normalizeTranscriptItem(item), collapsed: nextCollapsed }
          : item,
      ),
    );
    flash(shouldExpand ? "Transcript expanded" : "Transcript collapsed");
  }

  function flash(text: string, tone: ToastTone = "info", durationMs = 2500) {
    const next: ToastState = { id: crypto.randomUUID(), text, tone };
    toastStore.setSnapshot(next);
    setTimeout(
      () =>
        toastStore.setSnapshot((current) =>
          current?.id === next.id ? null : current,
        ),
      durationMs,
    );
  }

  function startRunStatus(label: string) {
    usageByTurn.current = new Map();
    activeUsageKey.current = null;
    runUsage.current = emptyTokenUsage();
    runStatusStore.setSnapshot({
      startedAt: Date.now(),
      label,
      tokens: runUsage.current,
      frame: 0,
    });
  }

  function updateRunStatus(label: string) {
    runStatusStore.setSnapshot((previous) =>
      previous
        ? previous.label === label &&
          sameTokenUsage(previous.tokens, runUsage.current)
          ? previous
          : {
              ...previous,
              label,
              tokens: runUsage.current,
              frame:
                previous.label === label ? previous.frame : previous.frame + 1,
            }
        : { startedAt: Date.now(), label, tokens: runUsage.current, frame: 0 },
    );
  }

  function stopRunStatus() {
    activeUsageKey.current = null;
    runStatusStore.setSnapshot(null);
  }

  function interruptRun(): boolean {
    const controller = activeRunAbort.current;
    if (!running || !controller || controller.signal.aborted) return false;
    const resolveDecision = pendingDecisionResolve.current;
    pendingDecisionResolve.current = null;
    if (decisionPanel) {
      setItems((previous) =>
        previous.map((item) =>
          item.id === decisionPanel.itemId
            ? {
                ...item,
                decisionStatus: "blocked",
                text: `${toolCategoryTitle(decisionPanel.toolCategory)} · ${decisionPanel.toolName} · interrupted`,
              }
            : item,
        ),
      );
    }
    setDecisionPanel(null);
    resolveDecision?.({ approved: false, reason: "Run interrupted by Esc." });
    controller.abort();
    updateRunStatus("Interrupted by Esc...");
    flash("Run interrupted");
    return true;
  }

  function showRuntimeErrorPanel(
    error: unknown,
    title = "Runtime Error",
  ): string {
    const message = humanizeRuntimeError(error);
    setRuntimeErrorPanel({ title, message });
    const firstLine =
      message
        .split(/\r?\n/)
        .find((line) => line.trim())
        ?.trim() ?? title;
    flash(
      firstLine === title ? title : `${title}: ${firstLine}`,
      "error",
      6000,
    );
    return message;
  }

  function beginUsageTurn() {
    activeUsageKey.current = crypto.randomUUID();
  }

  function registerTokenUsage(message: unknown, key = activeUsageKey.current) {
    const usage = extractTokenUsage(message);
    if (!usage || !key) return;
    usageByTurn.current.set(key, usage);
    runUsage.current = sumTokenUsage(Array.from(usageByTurn.current.values()));
    runStatusStore.setSnapshot((previous) =>
      previous && !sameTokenUsage(previous.tokens, runUsage.current)
        ? { ...previous, tokens: runUsage.current }
        : previous,
    );
  }

  function rememberIntentPlan(plan: RuntimePlan) {
    setIntentPlan(plan);
    setIntentPanel((previous) => (previous ? { plan } : previous));
  }

  function patchIntentTodo(event: TodoLifecycleEvent) {
    const patchPlan = (plan: RuntimePlan): RuntimePlan => {
      const updateTodo = (todo: RuntimePlan["todos"][number]) =>
        todo.id === event.todo.id ? event.todo : todo;
      return {
        ...plan,
        todos: plan.todos.map(updateTodo),
        agentPlan: {
          ...plan.agentPlan,
          todos: plan.agentPlan.todos.map(updateTodo),
        },
      };
    };
    setIntentPlan((previous) => (previous ? patchPlan(previous) : previous));
    setIntentPanel((previous) =>
      previous ? { plan: patchPlan(previous.plan) } : previous,
    );
  }

  function showIntentPanel() {
    const plan =
      intentPlan ?? [...getItems()].reverse().find((item) => item.plan)?.plan;
    if (!plan) {
      appendItem({
        kind: "status",
        text: "No intent graph yet. Run /plan <prompt> or submit a task first.",
      });
      return;
    }
    setMcpPanel(null);
    setHookPanel(null);
    setSessionPanel(null);
    setBrainPanel(null);
    setOverlay(null);
    setIntentPanel({ plan });
  }

  function handleCommand(commandLine: string): boolean {
    const [commandRaw = "", ...rest] = commandLine.slice(1).trim().split(/\s+/);
    const command = commandRaw.toLowerCase();
    const argument = rest.join(" ").trim();

    const skillCommand = dynamicCommands.find(
      (entry) => entry.name === command && entry.skill,
    );
    if (skillCommand?.skill) {
      void invokeSkill(skillCommand.skill, argument);
      return true;
    }

    switch (command) {
      case "help":
      case "?":
        appendItem({ kind: "help", text: formatHelp(dynamicCommands) });
        return true;
      case "clear":
        setItems([]);
        scrollTranscriptTo("bottom");
        return true;
      case "exit":
      case "quit":
        exit();
        return true;
      case "plan":
        void previewPlan(argument);
        return true;
      case "intent":
        showIntentPanel();
        return true;
      case "mcp":
        showMcpPanel(argument);
        return true;
      case "hooks":
        void showHookPanel(argument);
        return true;
      case "sessions":
        void showSessionPanel();
        return true;
      case "resume":
        void resumeSession(argument);
        return true;
      case "new":
        startNewSession();
        return true;
      case "handoff":
      case "fork":
        void performHandoff(argument);
        return true;
      case "brain":
        void showBrainPanel(argument);
        return true;
      case "mode":
        void switchMode(argument);
        return true;
      case "theme":
        showTheme(argument);
        return true;
      case "auto":
        void switchMode("auto");
        return true;
      case "radical":
        void switchMode("radical");
        return true;
      case "team-test":
        invokeTeamTest(argument);
        return true;
      case "skill":
      case "skills":
        showSkillPanel(argument);
        return true;
      case "agents":
        showAgentsPanel();
        return true;
      case "files":
        void refreshFiles();
        return true;
      default:
        appendItem({
          kind: "error",
          text: `Unknown command: /${command}. Type /help for commands.`,
        });
        return true;
    }
  }

  async function refreshFiles() {
    appendItem({ kind: "status", text: "Refreshing project file index..." });
    try {
      const files = await listProjectFiles(projectRoot);
      setProjectFiles(files);
      flash(`Indexed ${files.length} files`);
    } catch (error) {
      appendItem({
        kind: "error",
        text: `File index failed: ${formatError(error)}`,
      });
    }
  }

  async function refreshSessionSuggestions(
    limit = 50,
  ): Promise<SessionSummary[]> {
    const sessions = await listSessions(undefined, limit);
    setSessionSuggestions(sessions);
    return sessions;
  }

  function showAgentsPanel() {
    if (!projectSupport) {
      appendItem({ kind: "status", text: "Project support is still loading." });
      return;
    }
    if (!projectSupport.agents) {
      appendItem({
        kind: "panel",
        text: "AGENTS.md not found in this project.",
      });
      return;
    }
    const { path, content } = projectSupport.agents;
    const lines = content.split(/\r?\n/).length;
    appendItem({
      kind: "panel",
      text: `AGENTS.md\n• path: ${path}\n• lines: ${lines}\n• bytes: ${content.length}`,
    });
  }

  function collectMcpEntries(): McpPanelEntry[] {
    const entries: McpPanelEntry[] = [];
    if (userSupport?.mcp) {
      for (const { name, entry } of extractMcpServerEntries(
        userSupport.mcp.config,
      )) {
        entries.push({
          scope: "user",
          filePath: userSupport.mcp.path,
          name,
          entry,
          health: "pending",
        });
      }
    }
    if (projectSupport?.mcp) {
      for (const { name, entry } of extractMcpServerEntries(
        projectSupport.mcp.config,
      )) {
        entries.push({
          scope: "project",
          filePath: projectSupport.mcp.path,
          name,
          entry,
          health: "pending",
        });
      }
    }
    return entries;
  }

  function showMcpPanel(argument: string) {
    if (!projectSupport || !userSupport) {
      appendItem({ kind: "status", text: "Support config is still loading." });
      return;
    }
    const entries = collectMcpEntries();
    if (entries.length === 0) {
      appendItem({
        kind: "panel",
        text: "No MCP servers configured.\n• User-global: write ~/.braincode/mcp.json\n• Project-local: write .mcp.json (with `mcpServers` map)",
      });
      return;
    }
    if (argument) {
      const target = [...entries]
        .reverse()
        .find((entry) => entry.name.toLowerCase() === argument.toLowerCase());
      if (!target) {
        appendItem({
          kind: "error",
          text: `No MCP server named '${argument}'. Known: ${entries.map((entry) => entry.name).join(", ")}`,
        });
        return;
      }
      appendItem({
        kind: "panel",
        text: `${target.scope === "user" ? "User" : "Project"} · ${target.name}  →  ${target.filePath}\n${JSON.stringify(target.entry, null, 2)}`,
      });
      return;
    }
    setOverlay(null);
    setIntentPanel(null);
    setMcpPanel({ entries, selected: 0 });
    for (let index = 0; index < entries.length; index++) {
      void runMcpHealth(index, entries[index]!);
    }
  }

  async function runMcpHealth(index: number, entry: McpPanelEntry) {
    if (entry.entry.disabled) {
      updateMcpEntry(entry.name, entry.filePath, () => ({
        health: "skipped",
        detail: "disabled",
      }));
      return;
    }
    if (entry.scope === "project" && entry.entry.trusted !== true) {
      updateMcpEntry(entry.name, entry.filePath, () => ({
        health: "skipped",
        detail: "untrusted project MCP server",
      }));
      return;
    }
    let env: Record<string, string> | undefined;
    try {
      env = resolveMcpServerEnv(entry.entry.env, await readAuth());
    } catch (error) {
      updateMcpEntry(entry.name, entry.filePath, () =>
        mergeHealth({ status: "error", error: formatError(error) }),
      );
      return;
    }
    const result = await checkMcpHealth({
      command: entry.entry.command,
      args: entry.entry.args,
      env,
      url: entry.entry.url,
      type: entry.entry.type,
      httpHeaders: entry.entry.http_headers,
    });
    updateMcpEntry(entry.name, entry.filePath, () => mergeHealth(result));
  }

  function updateMcpEntry(
    name: string,
    filePath: string,
    mutate: (entry: McpPanelEntry) => Partial<McpPanelEntry>,
  ) {
    setMcpPanel((previous) => {
      if (!previous) return previous;
      const entries = previous.entries.map((entry) => {
        if (entry.name !== name || entry.filePath !== filePath) return entry;
        return { ...entry, ...mutate(entry) };
      });
      return { ...previous, entries };
    });
  }

  async function toggleMcpEntry(target: McpPanelEntry) {
    const next = !target.entry.disabled;
    try {
      await setMcpServerDisabled(target.filePath, target.name, next);
    } catch (error) {
      setMcpPanel((previous) =>
        previous
          ? { ...previous, message: `Toggle failed: ${formatError(error)}` }
          : previous,
      );
      return;
    }
    updateMcpEntry(target.name, target.filePath, () => ({
      entry: { ...target.entry, disabled: next || undefined },
      health: next ? "skipped" : "pending",
      detail: next ? "disabled" : undefined,
      toolCount: undefined,
      latencyMs: undefined,
    }));
    setMcpPanel((previous) =>
      previous
        ? {
            ...previous,
            message: `${target.name} ${next ? "disabled" : "enabled"}`,
          }
        : previous,
    );
    if (target.scope === "project" && projectSupport) {
      try {
        setProjectSupport(await readProjectSupport(projectRoot));
      } catch {
        // ignore reload error
      }
    }
    if (target.scope === "user") {
      try {
        setUserSupport(await readUserSupport());
      } catch {
        // ignore reload error
      }
    }
    if (!next) {
      const refreshed: McpPanelEntry = {
        ...target,
        entry: { ...target.entry, disabled: undefined },
        health: "pending",
      };
      void runMcpHealth(0, refreshed);
    }
  }

  async function toggleMcpTrust(target: McpPanelEntry) {
    if (target.scope !== "project") {
      setMcpPanel((previous) =>
        previous
          ? { ...previous, message: `${target.name} is user-global and already trusted.` }
          : previous,
      );
      return;
    }
    const next = target.entry.trusted !== true;
    try {
      await setMcpServerTrusted(target.filePath, target.name, next);
    } catch (error) {
      setMcpPanel((previous) =>
        previous
          ? { ...previous, message: `Trust toggle failed: ${formatError(error)}` }
          : previous,
      );
      return;
    }
    updateMcpEntry(target.name, target.filePath, () => ({
      entry: { ...target.entry, trusted: next || undefined },
      health: target.entry.disabled ? "skipped" : "pending",
      detail: target.entry.disabled ? "disabled" : undefined,
      toolCount: undefined,
      latencyMs: undefined,
    }));
    setMcpPanel((previous) =>
      previous
        ? {
            ...previous,
            message: `${target.name} ${next ? "trusted" : "untrusted"}`,
          }
        : previous,
    );
    try {
      setProjectSupport(await readProjectSupport(projectRoot));
    } catch {
      // ignore reload error
    }
    if (next && !target.entry.disabled) {
      void runMcpHealth(0, {
        ...target,
        entry: { ...target.entry, trusted: true },
        health: "pending",
      });
    }
  }

  function viewMcpConfig(target: McpPanelEntry) {
    appendItem({
      kind: "panel",
      text: `${target.scope === "user" ? "User" : "Project"} · ${target.name}  →  ${target.filePath}\n${JSON.stringify(target.entry, null, 2)}`,
    });
  }

  function recheckMcp(target: McpPanelEntry) {
    if (target.entry.disabled) {
      setMcpPanel((previous) =>
        previous
          ? {
              ...previous,
              message: `${target.name} is disabled; enable it first.`,
            }
          : previous,
      );
      return;
    }
    updateMcpEntry(target.name, target.filePath, () => ({
      health: "pending",
      detail: undefined,
      toolCount: undefined,
      latencyMs: undefined,
    }));
    void runMcpHealth(0, { ...target, health: "pending" });
  }

  async function showHookPanel(argument: string) {
    let sources: HookSource[];
    try {
      sources = await readHookSources(undefined, projectRoot);
    } catch (error) {
      appendItem({
        kind: "error",
        text: `Hook config failed: ${formatError(error)}`,
      });
      return;
    }
    const entries: HookPanelEntry[] = [];
    for (const source of sources) {
      const eventNames = Object.keys(source.document.hooks) as HookEventName[];
      for (const eventName of eventNames.sort()) {
        const groups = source.document.hooks[eventName] ?? [];
        groups.forEach((group, matcherIndex) => {
          group.hooks.forEach((handler, handlerIndex) => {
            entries.push({
              scope: source.kind,
              filePath: source.path,
              eventName,
              matcher: group.matcher,
              matcherIndex,
              handlerIndex,
              handler,
            });
          });
        });
      }
    }
    if (entries.length === 0) {
      appendItem({
        kind: "panel",
        text: "No hooks configured.\n• User-global: ~/.braincode/hooks.json\n• Project-local: .agents/hooks.json",
      });
      return;
    }
    if (argument) {
      const filter = argument.toLowerCase();
      const matches = entries.filter(
        (entry) =>
          entry.eventName.toLowerCase().includes(filter) ||
          entry.handler.command?.toLowerCase().includes(filter),
      );
      if (matches.length === 0) {
        appendItem({ kind: "error", text: `No hook matches '${argument}'.` });
        return;
      }
      const lines = matches.map(
        (entry) =>
          `${entry.scope === "user" ? "user" : "proj"} · ${entry.eventName}${entry.matcher ? `[${entry.matcher}]` : ""} → ${entry.handler.command ?? "(no command)"}`,
      );
      appendItem({ kind: "panel", text: lines.join("\n") });
      return;
    }
    setMcpPanel(null);
    setIntentPanel(null);
    setOverlay(null);
    setHookPanel({ entries, selected: 0 });
  }

  async function toggleHookHandler(target: HookPanelEntry) {
    const nextEnabled = !(target.handler.enabled ?? true);
    try {
      await setHookHandlerEnabled(
        target.filePath,
        target.eventName,
        target.matcherIndex,
        target.handlerIndex,
        nextEnabled,
      );
    } catch (error) {
      setHookPanel((previous) =>
        previous
          ? { ...previous, message: `Toggle failed: ${formatError(error)}` }
          : previous,
      );
      return;
    }
    setHookPanel((previous) => {
      if (!previous) return previous;
      const entries = previous.entries.map((entry, index) => {
        if (index !== previous.selected) return entry;
        return {
          ...entry,
          handler: { ...entry.handler, enabled: nextEnabled },
        };
      });
      return {
        ...previous,
        entries,
        message: `${target.eventName} ${nextEnabled ? "enabled" : "disabled"}`,
      };
    });
  }

  function viewHookHandler(target: HookPanelEntry) {
    appendItem({
      kind: "panel",
      text: `${target.scope === "user" ? "User" : "Project"} · ${target.eventName}${target.matcher ? ` [${target.matcher}]` : ""}  →  ${target.filePath}\n${JSON.stringify(target.handler, null, 2)}`,
    });
  }

  async function showSessionPanel() {
    let sessions: SessionSummary[];
    try {
      sessions = (await refreshSessionSuggestions(50)).slice(0, 25);
    } catch (error) {
      appendItem({
        kind: "error",
        text: `Sessions failed: ${formatError(error)}`,
      });
      return;
    }
    if (sessions.length === 0) {
      appendItem({
        kind: "panel",
        text: "No sessions recorded yet. Sessions land under ~/.braincode/sessions/.",
      });
      return;
    }
    setMcpPanel(null);
    setHookPanel(null);
    setIntentPanel(null);
    setOverlay(null);
    setSessionPanel({ entries: sessions, selected: 0 });
  }

  async function resumeSession(argument: string) {
    const trimmed = argument.trim();
    if (!trimmed) {
      void showSessionPanel();
      return;
    }
    try {
      const sessions = await listSessions(undefined, 100);
      const target = sessions.find(
        (entry) =>
          entry.sessionId === trimmed || entry.sessionId.startsWith(trimmed),
      );
      if (!target) {
        appendItem({ kind: "error", text: `Session '${trimmed}' not found.` });
        return;
      }
      await applyResume(target);
    } catch (error) {
      appendItem({
        kind: "error",
        text: `Resume failed: ${formatError(error)}`,
      });
    }
  }

  async function applyResume(target: SessionSummary) {
    closeTransientSurfaces();
    applyDraftChange("");
    clearTerminalFrame();
    const context = await readSessionContext(target.sessionId, undefined, 1000);
    const restoredItems = restoreSessionTranscriptItems(context, target);
    clearTerminalFrame();
    setSessionId(target.sessionId);
    setItems(restoredItems);
    scrollTranscriptTo("bottom");
    closeTransientSurfaces();
    applyDraftChange("");
    flash(`Now writing to session ${target.sessionId.slice(0, 8)}`);
  }

  function closeTransientSurfaces() {
    setSessionPanel(null);
    setOverlay(null);
    setMcpPanel(null);
    setHookPanel(null);
    setBrainPanel(null);
    setIntentPanel(null);
    setRuntimeErrorPanel(null);
    setDecisionPanel(null);
  }

  function clearTerminalFrame() {
    stdout?.write("\x1b[2J\x1b[H");
  }

  function resetSurfaces() {
    queueRef.current = [];
    bumpQueue();
    setMcpPanel(null);
    setHookPanel(null);
    setSessionPanel(null);
    setBrainPanel(null);
    setIntentPanel(null);
    setRuntimeErrorPanel(null);
    setOverlay(null);
  }

  function startNewSession() {
    if (running) {
      appendItem({
        kind: "error",
        text: "Cannot start a new session while a task is running.",
      });
      return;
    }
    const newId = crypto.randomUUID();
    setSessionId(newId);
    resetSurfaces();
    scrollTranscriptTo("bottom");
    setItems([
      {
        id: crypto.randomUUID(),
        kind: "status",
        text: `New session ${newId.slice(0, 8)}`,
      },
    ]);
    applyDraftChange("");
    flash("New session");
  }

  async function performHandoff(argument: string) {
    if (running) {
      appendItem({
        kind: "error",
        text: "Cannot hand off while a task is running.",
      });
      return;
    }

    const tokens = argument.trim().split(/\s+/).filter(Boolean);
    let targetSessionId = sessionId;
    let focus = argument.trim();
    let mode: "current" | "other" = "current";
    if (tokens.length > 0 && isLikelySessionId(tokens[0]!)) {
      const candidate = tokens[0]!;
      try {
        const sessions = await listSessions(undefined, 100);
        const hit = sessions.find(
          (entry) =>
            entry.sessionId === candidate ||
            entry.sessionId.startsWith(candidate),
        );
        if (!hit) {
          appendItem({
            kind: "error",
            text: `Session '${candidate}' not found.`,
          });
          return;
        }
        targetSessionId = hit.sessionId;
        focus = tokens.slice(1).join(" ").trim();
        mode = "other";
      } catch (error) {
        appendItem({
          kind: "error",
          text: `Handoff lookup failed: ${formatError(error)}`,
        });
        return;
      }
    }

    if (mode === "current" && getItems().length === 0) {
      appendItem({
        kind: "error",
        text: "Nothing to hand off yet — current session is empty.",
      });
      return;
    }

    const previousId = targetSessionId;
    const statusId = crypto.randomUUID();
    scrollTranscriptTo("bottom");
    setItems((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        kind: "user",
        text: focus ? `/handoff ${focus}` : "/handoff",
      },
      {
        id: statusId,
        kind: "status",
        text:
          mode === "other"
            ? `Summarizing session ${previousId.slice(0, 8)} for handoff...`
            : "Summarizing this session for handoff...",
      },
    ]);
    applyDraftChange("");
    startRunStatus(
      mode === "other"
        ? `Summarizing session ${previousId.slice(0, 8)} for handoff...`
        : "Summarizing this session for handoff...",
    );
    setRunning(true);

    let summary = "";
    try {
      const result = await ensureSessionHandoff(previousId, {
        focus: focus || undefined,
        force: true,
        trigger: "manual",
      });
      summary = result.summary;
    } catch (error) {
      const message = showRuntimeErrorPanel(error, "Handoff Failed");
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        {
          id: crypto.randomUUID(),
          kind: "error",
          text: `Handoff summarization failed: ${message}`,
        },
      ]);
      setRunning(false);
      stopRunStatus();
      return;
    }
    setRunning(false);
    stopRunStatus();

    if (mode === "other") {
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        {
          id: crypto.randomUUID(),
          kind: "panel",
          text: `Handoff brief for session ${previousId.slice(0, 8)}\n\n${summary}`,
        },
      ]);
      flash(`Handoff brief written to ${previousId.slice(0, 8)}`);
      return;
    }

    const newId = crypto.randomUUID();
    setSessionId(newId);
    resetSurfaces();
    setItems([
      {
        id: crypto.randomUUID(),
        kind: "status",
        text: `Handoff ${previousId.slice(0, 8)} → ${newId.slice(0, 8)}`,
      },
      {
        id: crypto.randomUUID(),
        kind: "panel",
        text: `Handoff brief (from prior session)\n\n${summary}`,
      },
    ]);
    const draftSeed = focus ? `@@${previousId} ${focus}` : `@@${previousId} `;
    applyDraftChange(draftSeed);
    flash("Handoff ready — edit and submit to continue");
  }

  async function showBrainPanel(argument: string) {
    let document;
    let settings;
    try {
      [document, settings] = await Promise.all([readBrains(), readSettings()]);
    } catch (error) {
      appendItem({
        kind: "error",
        text: `Brain config failed: ${formatError(error)}`,
      });
      return;
    }
    const brains = (document.brains ?? []) as BrainModel[];
    if (brains.length === 0) {
      appendItem({
        kind: "panel",
        text: "No brains in ~/.braincode/brains.json. Configure via `braincode config`.",
      });
      return;
    }
    if (argument) {
      const target = brains.find(
        (brain) => brain.id.toLowerCase() === argument.toLowerCase(),
      );
      if (!target) {
        appendItem({
          kind: "error",
          text: `Unknown brain '${argument}'. Known: ${brains.map((brain) => brain.id).join(", ")}`,
        });
        return;
      }
      appendItem({
        kind: "panel",
        text: formatBrainDetail(target, settings.defaultBrainId),
      });
      return;
    }
    const selected = Math.max(
      0,
      brains.findIndex((brain) => brain.id === settings.defaultBrainId),
    );
    setSessionPanel(null);
    setHookPanel(null);
    setMcpPanel(null);
    setIntentPanel(null);
    setOverlay(null);
    setBrainPanel({
      brains,
      defaultBrainId: settings.defaultBrainId,
      selected,
    });
  }

  async function setDefaultBrain(target: BrainModel) {
    try {
      const current = await readSettings();
      if (current.defaultBrainId === target.id) {
        setBrainPanel((previous) =>
          previous
            ? { ...previous, message: `${target.id} is already the default.` }
            : previous,
        );
        return;
      }
      await writeSettings({ ...current, defaultBrainId: target.id });
      setBrainPanel((previous) =>
        previous
          ? {
              ...previous,
              defaultBrainId: target.id,
              message: `Default brain → ${target.id}`,
            }
          : previous,
      );
      flash(`Default brain → ${target.id}`);
    } catch (error) {
      setBrainPanel((previous) =>
        previous
          ? { ...previous, message: `Update failed: ${formatError(error)}` }
          : previous,
      );
    }
  }

  async function switchMode(argument: string) {
    const next = argument.trim().toLowerCase();
    if (!next) {
      appendItem({
        kind: "panel",
        text: `Execution mode: ${mode}\nUse /mode auto or /mode radical to switch. /auto and /radical are shortcuts.`,
      });
      return;
    }
    if (next !== "auto" && next !== "radical") {
      appendItem({ kind: "error", text: "Usage: /mode auto|radical" });
      return;
    }
    try {
      const current = await readSettings();
      if (current.mode === next) {
        setMode(next);
        flash(`Mode already ${next}`);
        appendItem({ kind: "status", text: `Mode remains ${next}.` });
        return;
      }
      await writeSettings({ ...current, mode: next });
      setMode(next);
      appendItem({
        kind: "status",
        text: `Mode → ${next}${running ? " (applies to the next run)" : ""}`,
      });
      flash(`Mode → ${next}`);
    } catch (error) {
      appendItem({
        kind: "error",
        text: `Mode switch failed: ${formatError(error)}`,
      });
    }
  }

  function showTheme(argument: string) {
    if (argument.trim()) {
      appendItem({
        kind: "error",
        text: "Theme follows system appearance automatically; Braincode only resolves dark or light palettes.",
      });
      return;
    }
    const override = readThemeOverride();
    const detected = override ?? detectSystemAppearanceTheme();
    const source = override ? "BRAINCODE_THEME" : "system appearance";
    setThemeName(detected);
    appendItem({
      kind: "panel",
      text: `Theme: ${detected}\nSource: ${source}\nPalettes: dark, light\nBackground: transparent`,
    });
  }

  function viewBrainDetail(target: BrainModel) {
    appendItem({
      kind: "panel",
      text: formatBrainDetail(target, brainPanel?.defaultBrainId ?? ""),
    });
  }

  function showSkillPanel(argument: string) {
    if (!projectSupport || !userSupport) {
      appendItem({ kind: "status", text: "Support config is still loading." });
      return;
    }
    const userSkills = userSupport.skills.map((skill) => ({
      scope: "user" as const,
      ...skill,
    }));
    const projectSkills = projectSupport.skills.map((skill) => ({
      scope: "project" as const,
      ...skill,
    }));
    const all = [...userSkills, ...projectSkills];
    if (all.length === 0) {
      appendItem({
        kind: "panel",
        text: "No skills available.\n• User-global: ~/.braincode/skills/<id>/SKILL.md\n• Project-local: .agents/skill/<id>/SKILL.md",
      });
      return;
    }
    if (!argument) {
      const lines: string[] = [];
      if (userSkills.length > 0) {
        lines.push(
          `User skills (${userSkills.length}) — ${userSupport.home}/skills`,
        );
        for (const skill of userSkills) {
          lines.push(
            `  • ${skill.id}  →  ${relative(userSupport.home, skill.path) || skill.path}`,
          );
        }
        lines.push("");
      }
      if (projectSkills.length > 0) {
        lines.push(
          `Project skills (${projectSkills.length}) — ${projectSupport.root}`,
        );
        for (const skill of projectSkills) {
          lines.push(
            `  • ${skill.id}  →  ${relative(projectRoot, skill.path) || skill.path}`,
          );
        }
        lines.push("");
      }
      lines.push(
        "Use /skill <id> to view the skill body (project shadows user when ids collide).",
      );
      appendItem({ kind: "panel", text: lines.join("\n").trimEnd() });
      return;
    }
    const target = [...projectSkills, ...userSkills].find(
      (skill) => skill.id.toLowerCase() === argument.toLowerCase(),
    );
    if (!target) {
      appendItem({
        kind: "error",
        text: `Unknown skill '${argument}'. Known: ${all.map((skill) => skill.id).join(", ")}`,
      });
      return;
    }
    const trimmed =
      target.content.length > 4000
        ? `${target.content.slice(0, 4000)}\n…(truncated)`
        : target.content;
    appendItem({
      kind: "panel",
      text: `${target.scope === "user" ? "User" : "Project"} · ${target.id}  →  ${target.path}\n\n${trimmed}`,
    });
  }

  const ALL_ROLES = [
    "frontend",
    "backend",
    "designer",
    "imageMaker",
    "dba",
    "devops",
    "security",
    "qa",
    "review",
    "summarize",
    "oracle",
    "librarian",
    "rush",
  ];

  function invokeTeamTest(argument: string) {
    const promptArg = argument.trim();
    if (!promptArg) {
      appendItem({
        kind: "error",
        text: "/team-test <prompt> needs a prompt to dispatch to every role.",
      });
      return;
    }
    const displayText = `/team-test ${promptArg}`;
    if (!running) {
      appendItem({
        kind: "panel",
        text: `Diagnostic /team-test · dispatching to ${ALL_ROLES.length} roles: ${ALL_ROLES.join(", ")}`,
      });
    }
    void submitPrompt(promptArg, {
      displayText,
      skipCommand: true,
      forceRoles: ALL_ROLES,
    });
  }

  async function invokeSkill(
    skill: {
      id: string;
      scope: "user" | "project";
      content: string;
      path: string;
    },
    argument: string,
  ) {
    const task = argument.trim();
    const skillPrompt = [
      `[Skill activation: ${skill.id} (${skill.scope})]`,
      "Use the instructions below as your operating playbook for this task. Apply them when relevant; do not narrate the playbook back unless asked.",
      "",
      "----- SKILL INSTRUCTIONS -----",
      skill.content.trim(),
      "----- END SKILL INSTRUCTIONS -----",
      "",
      task
        ? `Task:\n${task}`
        : "Task: (no explicit user task — proceed using the skill defaults).",
    ].join("\n");
    const displayText = task
      ? `/${skill.id} ${task}`
      : `/${skill.id}  (skill: ${skill.scope})`;
    void submitPrompt(skillPrompt, { displayText, skipCommand: true });
  }

  async function previewPlan(prompt: string) {
    const parsed = parsePlanCommandArgument(prompt);
    if ("error" in parsed) {
      appendItem({ kind: "error", text: parsed.error });
      return;
    }
    if (running) return;

    const statusId = crypto.randomUUID();
    const statusText = parsed.useRouterBrain
      ? "Planning route with routeBrain..."
      : "Planning heuristic route...";
    scrollTranscriptTo("bottom");
    setItems((previous) => [
      ...previous,
      { id: crypto.randomUUID(), kind: "user", text: parsed.displayText },
      { id: statusId, kind: "status", text: statusText },
    ]);
    applyDraftChange("");
    startRunStatus(statusText);
    setRunning(true);

    try {
      const plan = await planRuntimeFromConfig(parsed.prompt, undefined, {
        useRouterBrain: parsed.useRouterBrain,
      });
      rememberIntentPlan(plan);
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        {
          id: crypto.randomUUID(),
          kind: "status",
          text: formatPlanPreviewSummary(plan),
          plan,
        },
      ]);
    } catch (error) {
      const message = showRuntimeErrorPanel(error, "Plan Failed");
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        { id: crypto.randomUUID(), kind: "error", text: message },
      ]);
    } finally {
      setRunning(false);
      stopRunStatus();
      void refreshSessionSuggestions();
    }
  }

  function enqueueTask(
    prompt: string,
    options: {
      displayText?: string;
      skipCommand?: boolean;
      forceRoles?: string[];
    } = {},
  ): boolean {
    const trimmed = prompt.trim();
    if (!trimmed) return false;
    const displayText = options.displayText ?? trimmed;
    const itemId = crypto.randomUUID();
    const task: QueuedTask = {
      id: crypto.randomUUID(),
      prompt: trimmed,
      displayText,
      skipCommand: options.skipCommand ?? false,
      forceRoles: options.forceRoles,
      itemId,
    };
    queueRef.current = [...queueRef.current, task];
    setItems((previous) => [
      ...previous,
      {
        id: itemId,
        kind: "queued",
        text: `queued · ${truncate(displayText.replace(/\s+/g, " ").trim(), 140)}`,
        queueId: task.id,
      },
    ]);
    bumpQueue();
    applyDraftChange("");
    return true;
  }

  async function drainQueue() {
    while (queueRef.current.length > 0) {
      const next = queueRef.current[0]!;
      queueRef.current = queueRef.current.slice(1);
      bumpQueue();
      setItems((previous) =>
        previous.filter((item) => item.id !== next.itemId),
      );
      await submitPrompt(next.prompt, {
        displayText: next.displayText,
        skipCommand: next.skipCommand,
        forceRoles: next.forceRoles,
      });
    }
  }

  function editMostRecentQueuedTask(): boolean {
    if (queueRef.current.length === 0) return false;
    const queue = queueRef.current;
    const last = queue[queue.length - 1]!;
    queueRef.current = queue.slice(0, -1);
    bumpQueue();
    setItems((previous) => previous.filter((item) => item.id !== last.itemId));
    applyDraftChange(
      last.displayText.startsWith("/") ? last.displayText : last.prompt,
    );
    flash(`Editing queued task (${queueRef.current.length} still pending)`);
    return true;
  }

  async function submitPrompt(
    prompt: string,
    options: {
      displayText?: string;
      skipCommand?: boolean;
      forceRoles?: string[];
    } = {},
  ) {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    if (running) {
      enqueueTask(trimmed, options);
      flash(`Queued (${queueRef.current.length} pending)`);
      return;
    }

    if (!options.skipCommand && trimmed.startsWith("/")) {
      applyDraftChange("");
      handleCommand(trimmed);
      return;
    }

    const displayText = options.displayText ?? trimmed;
    scrollTranscriptTo("bottom");
    const userItem: TranscriptItem = {
      id: crypto.randomUUID(),
      kind: "user",
      text: displayText,
    };
    const statusId = crypto.randomUUID();
    setItems((previous) => [
      ...previous,
      userItem,
      { id: statusId, kind: "status", text: "Routing through Braincode..." },
    ]);
    applyDraftChange("");
    startRunStatus("Routing through Braincode...");
    setRunning(true);
    const runAbort = new AbortController();
    activeRunAbort.current = runAbort;

    let approvalMode: BraincodeMode = mode;
    const currentAssistant = { id: null as string | null, text: "" };
    let thinkingShown = false;
    let activeStreamPhase: "primary" | "support" | "review" | null = null;
    const toolItems = new Map<
      string,
      {
        itemId: string;
        toolName: string;
        toolCategory: ToolCategory;
        startedAt: number;
        argsObject: Record<string, unknown> | undefined;
        argsCount: number;
        argsKey: string;
        editArgs?: EditArgs;
        editBeforePromise?: Promise<string | null>;
      }
    >();
    const repeatedReadToolItems = new Map<string, { itemId: string }>();

    const updateItem = (itemId: string, patch: Partial<TranscriptItem>) => {
      setItems((previous) => {
        let changed = false;
        const next = previous.map((item) => {
          if (item.id !== itemId) return item;
          if (!transcriptPatchChangesItem(item, patch)) return item;
          changed = true;
          return { ...item, ...patch };
        });
        return changed ? next : previous;
      });
    };
    const appendItemRaw = (item: TranscriptItem) => {
      setItems((previous) => [...previous, item]);
    };
    const updateStatus = (next: string) => {
      updateItem(statusId, { text: next });
      updateRunStatus(next);
    };
    // Coalesce high-frequency text_delta updates so Ink is not asked to
    // repaint the full frame for every token.
    const parsedStreamFlushMs = Number.parseInt(
      process.env.BRAINCODE_STREAM_FLUSH_MS ?? "",
      10,
    );
    const STREAM_FLUSH_MS =
      Number.isFinite(parsedStreamFlushMs) && parsedStreamFlushMs > 0
        ? parsedStreamFlushMs
        : DEFAULT_STREAM_FLUSH_MS;
    let streamFlushHandle: ReturnType<typeof setTimeout> | null = null;
    let streamPendingId: string | null = null;
    let streamRenderedLength = 0;
    let streamLastFlushAt = Date.now();
    const shouldFlushStream = (force: boolean) => {
      if (force) return true;
      const pendingChars = currentAssistant.text.length - streamRenderedLength;
      if (pendingChars <= 0) return false;
      if (pendingChars >= STREAM_FLUSH_MIN_CHARS) return true;
      return Date.now() - streamLastFlushAt >= STREAM_FLUSH_MAX_WAIT_MS;
    };
    const flushStream = (force = true): boolean => {
      if (streamFlushHandle) {
        clearTimeout(streamFlushHandle);
        streamFlushHandle = null;
      }
      if (!streamPendingId) return false;
      if (!shouldFlushStream(force)) return false;
      const id = streamPendingId;
      const text = currentAssistant.text;
      streamPendingId = null;
      streamRenderedLength = text.length;
      streamLastFlushAt = Date.now();
      updateItem(id, { text, streaming: true });
      return true;
    };
    const scheduleStreamFlush = (id: string) => {
      streamPendingId = id;
      if (streamFlushHandle) return;
      streamFlushHandle = setTimeout(() => {
        streamFlushHandle = null;
        if (!streamPendingId) return;
        const pendingId = streamPendingId;
        if (!flushStream(false) && streamPendingId === pendingId) {
          scheduleStreamFlush(pendingId);
        }
      }, STREAM_FLUSH_MS);
    };
    const finalizeStreamingBuffers = () => {
      flushStream();
      if (currentAssistant.id && currentAssistant.text.length === 0) {
        const id = currentAssistant.id;
        setItems((previous) => previous.filter((item) => item.id !== id));
      }
      if (currentAssistant.id && currentAssistant.text.length > 0) {
        const id = currentAssistant.id;
        setItems((previous) =>
          previous.map((item) =>
            item.id === id
              ? normalizeTranscriptItem({ ...item, streaming: false })
              : item,
          ),
        );
      }
      currentAssistant.id = null;
      currentAssistant.text = "";
      streamRenderedLength = 0;
      streamLastFlushAt = Date.now();
      thinkingShown = false;
    };
    const ensureAssistantItem = () => {
      if (currentAssistant.id) return currentAssistant.id;
      const id = crypto.randomUUID();
      currentAssistant.id = id;
      currentAssistant.text = "";
      appendItemRaw({ id, kind: "assistant", text: "", streaming: true });
      return id;
    };
    const showThinkingStatus = () => {
      if (thinkingShown) return;
      thinkingShown = true;
      updateStatus("Thinking…");
    };

    const onEvent = (event: AgentEvent) => {
      switch (event.type) {
        case "agent_start":
          updateStatus("Agent starting…");
          return;
        case "turn_start":
          beginUsageTurn();
          finalizeStreamingBuffers();
          updateStatus("Turn in progress…");
          return;
        case "message_start":
          if (!activeUsageKey.current) beginUsageTurn();
          registerTokenUsage(event.message);
          return;
        case "message_update": {
          const update = event.assistantMessageEvent;
          registerTokenUsage("partial" in update ? update.partial : undefined);
          if (update.type === "done") registerTokenUsage(update.message);
          if (update.type === "error") registerTokenUsage(update.error);
          if (update.type === "text_delta") {
            if (activeStreamPhase !== "primary") return;
            const id = ensureAssistantItem();
            currentAssistant.text += update.delta;
            scheduleStreamFlush(id);
          } else if (update.type === "thinking_delta") {
            showThinkingStatus();
          } else if (update.type === "toolcall_start") {
            updateStatus("Tool Call · preparing arguments…");
          } else if (update.type === "toolcall_end") {
            const callName = update.toolCall?.name ?? "";
            if (callName) {
              const category = classifyToolCall(
                callName,
                update.toolCall?.arguments,
              );
              updateStatus(
                `Tool Call · ${toolCategoryTitle(category)} · ${callName}`,
              );
            }
          }
          return;
        }
        case "message_end":
          registerTokenUsage(event.message);
          return;
        case "tool_execution_start": {
          finalizeStreamingBuffers();
          const itemId = crypto.randomUUID();
          const argsObject = toolArgsObject(event.args);
          const argsCount = toolArgsCount(argsObject);
          const argsKey = toolCallDisplayKey(event.toolName, argsObject);
          const toolCategory = classifyToolCall(event.toolName, event.args);
          if (toolCategory !== "read") repeatedReadToolItems.clear();
          const editArgs =
            toolCategory === "write"
              ? (extractEditArgs(event.toolName, event.args) ?? undefined)
              : undefined;
          const editBeforePromise = editArgs
            ? snapshotFileContent(
                resolveEditPath(editArgs.filePath, projectRoot),
              )
            : undefined;
          const entry = {
            itemId,
            toolName: event.toolName,
            toolCategory,
            startedAt: Date.now(),
            argsObject,
            argsCount,
            argsKey,
            editArgs,
            editBeforePromise,
          };
          toolItems.set(event.toolCallId, entry);
          appendItemRaw({
            id: itemId,
            kind: "tool",
            toolStatus: "running",
            toolName: event.toolName,
            toolCategory,
            startedAt: Date.now(),
            text: formatToolStartText(event.toolName),
            toolArgs: argsObject,
            collapsed: true,
          });
          updateStatus(
            `Tool Call · ${toolCategoryTitle(toolCategory)} · running ${event.toolName}`,
          );
          return;
        }
        case "tool_execution_update": {
          const tracked = toolItems.get(event.toolCallId);
          if (!tracked) return;
          updateStatus(
            `Tool Call · ${toolCategoryTitle(tracked.toolCategory)} · streaming ${event.toolName}`,
          );
          return;
        }
        case "tool_execution_end": {
          const tracked = toolItems.get(event.toolCallId);
          if (!tracked) return;
          toolItems.delete(event.toolCallId);
          const elapsed = Date.now() - tracked.startedAt;
          const evidence = getToolEvidenceCacheInfo(event.result);
          if (
            tracked.toolCategory === "read" &&
            evidence?.reused &&
            (evidence.callCount ?? 0) > 1
          ) {
            const existing = repeatedReadToolItems.get(tracked.argsKey);
            const duplicateCount = Math.max(1, (evidence.callCount ?? 2) - 1);
            const text = formatRepeatedReadToolText(
              event.toolName,
              duplicateCount,
            );
            const toolDetail = formatRepeatedReadToolDetail(
              duplicateCount,
              evidence,
            );
            if (existing && existing.itemId !== tracked.itemId) {
              setItems((previous) =>
                previous.filter((item) => item.id !== tracked.itemId),
              );
              updateItem(existing.itemId, {
                toolStatus: event.isError ? "failed" : "ok",
                toolCategory: tracked.toolCategory,
                finishedAt: Date.now(),
                text,
                toolDetail,
                collapsed: true,
              });
            } else {
              repeatedReadToolItems.set(tracked.argsKey, {
                itemId: tracked.itemId,
              });
              updateItem(tracked.itemId, {
                toolStatus: event.isError ? "failed" : "ok",
                toolCategory: tracked.toolCategory,
                finishedAt: Date.now(),
                text,
                toolDetail,
                collapsed: true,
              });
            }
            updateStatus(
              `Tool Call · Read · reused cached ${event.toolName} (${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"})`,
            );
            return;
          }
          updateItem(tracked.itemId, {
            toolStatus: event.isError ? "failed" : "ok",
            toolCategory: tracked.toolCategory,
            finishedAt: Date.now(),
            text: formatToolEndText(event.toolName, event.isError, elapsed),
            toolDetail: formatToolResultDetail(event.result),
            collapsed: true,
          });
          if (tracked.editArgs) {
            const editArgs = tracked.editArgs;
            const beforePromise =
              tracked.editBeforePromise ?? Promise.resolve(null);
            const itemId = tracked.itemId;
            const isError = event.isError;
            void (async () => {
              const [before, after] = await Promise.all([
                beforePromise,
                snapshotFileContent(
                  resolveEditPath(editArgs.filePath, projectRoot),
                ),
              ]);
              const editPreview = buildEditPreview({
                filePath: displayEditPath(editArgs.filePath, projectRoot),
                before,
                after,
                success: !isError,
              });
              updateItem(itemId, { editPreview });
            })();
          }
          updateStatus(
            `Tool Call · ${toolCategoryTitle(tracked.toolCategory)} · ${event.isError ? "failed" : "done"} ${event.toolName}`,
          );
          return;
        }
        case "turn_end":
          registerTokenUsage(event.message);
          activeUsageKey.current = null;
          finalizeStreamingBuffers();
          updateStatus("Turn complete · waiting for next step…");
          return;
        case "agent_end":
          finalizeStreamingBuffers();
          updateStatus("Agent finished.");
          return;
      }
    };

    const workerItems = new Map<
      string,
      { itemId: string; startedAt: number }
    >();
    const todoItems = new Map<string, string>();
    const upsertTodoItem = (event: TodoLifecycleEvent) => {
      const itemId = todoItems.get(event.todo.id);
      const summary = event.summary || event.error;
      const text = `${event.todo.role} · ${event.todo.title}${summary ? ` · ${truncate(summary.replace(/\s+/g, " ").trim(), 120)}` : ""}`;
      if (itemId) {
        updateItem(itemId, {
          todoStatus: event.status,
          finishedAt:
            event.status === "completed" ||
            event.status === "failed" ||
            event.status === "blocked"
              ? Date.now()
              : undefined,
          text,
        });
        return;
      }
      const nextItemId = crypto.randomUUID();
      todoItems.set(event.todo.id, nextItemId);
      appendItemRaw({
        id: nextItemId,
        kind: "todo",
        todoId: event.todo.id,
        todoStatus: event.status,
        startedAt: event.status === "running" ? Date.now() : undefined,
        finishedAt:
          event.status === "completed" ||
          event.status === "failed" ||
          event.status === "blocked"
            ? Date.now()
            : undefined,
        text,
      });
    };
    const onPlan = (plan: RuntimePlan) => {
      approvalMode = plan.mode;
      rememberIntentPlan(plan);
      if (plan.todos.length === 0) return;
      finalizeStreamingBuffers();
      appendItemRaw({
        id: crypto.randomUUID(),
        kind: "panel",
        text: `Todo · ${plan.todos.length} planned task${plan.todos.length === 1 ? "" : "s"}`,
      });
      for (const todo of plan.todos) {
        upsertTodoItem({
          type: "todo_update",
          todo,
          status: todo.status,
          phase: "planning",
          role: todo.role,
        });
      }
    };
    const onTodoEvent = (event: TodoLifecycleEvent) => {
      finalizeStreamingBuffers();
      patchIntentTodo(event);
      upsertTodoItem(event);
    };
    const workerKey = (event: WorkerLifecycleEvent) =>
      `${event.phase}:${event.role}`;
    const onWorkerEvent = (event: WorkerLifecycleEvent) => {
      finalizeStreamingBuffers();
      const key = workerKey(event);
      const phaseLabel = formatWorkerPhase(event.phase);
      if (event.type === "worker_start") {
        activeStreamPhase = event.phase;
        const itemId = crypto.randomUUID();
        workerItems.set(key, { itemId, startedAt: Date.now() });
        appendItemRaw({
          id: itemId,
          kind: "worker",
          workerStatus: "running",
          startedAt: Date.now(),
          text: `${phaseLabel} · ${event.role}  →  ${event.modelId}  ${event.goal ? `· goal: ${truncate(event.goal, 80)}` : ""}`,
        });
        updateStatus(`${phaseLabel} ${event.role} running…`);
        return;
      }
      // worker_end
      if (activeStreamPhase === event.phase) activeStreamPhase = null;
      const tracked = workerItems.get(key);
      const itemId = tracked?.itemId;
      const elapsed = tracked ? Date.now() - tracked.startedAt : undefined;
      if (itemId) workerItems.delete(key);
      const text =
        event.status === "completed"
          ? `${phaseLabel} · ${event.role}  →  done${elapsed ? ` (${elapsed}ms)` : ""}  ${event.summary ? truncate(event.summary, 160) : ""}`
          : event.status === "blocked"
            ? `${phaseLabel} · ${event.role}  →  blocked${elapsed ? ` (${elapsed}ms)` : ""}  ${event.summary ? truncate(event.summary, 160) : ""}`
            : `${phaseLabel} · ${event.role}  →  failed${elapsed ? ` (${elapsed}ms)` : ""}  ${event.error ? truncate(event.error, 160) : ""}`;
      if (itemId) {
        updateItem(itemId, {
          workerStatus: event.status,
          finishedAt: Date.now(),
          text,
        });
      } else {
        appendItemRaw({
          id: crypto.randomUUID(),
          kind: "worker",
          workerStatus: event.status,
          finishedAt: Date.now(),
          text,
        });
      }
      updateStatus(`${phaseLabel} ${event.role} ${event.status}.`);
    };

    const onMcpReport = (
      report: import("@braincode/agent-runtime").McpHubConnectReport,
    ) => {
      if (
        report.toolCount === 0 &&
        report.failed.length === 0 &&
        report.skipped.length === 0
      )
        return;
      const parts: string[] = [];
      if (report.toolCount > 0)
        parts.push(
          `${report.toolCount} MCP tools from ${report.connected.length} server${report.connected.length === 1 ? "" : "s"}`,
        );
      if (report.failed.length > 0)
        parts.push(
          `failed: ${report.failed.map((entry) => `${entry.name}(${truncate(entry.error, 40)})`).join(", ")}`,
        );
      if (report.skipped.length > 0)
        parts.push(
          `skipped: ${report.skipped.map((entry) => `${entry.name}(${entry.reason})`).join(", ")}`,
        );
      const text = `MCP · ${parts.join(" · ")}`;
      setItems((previous) =>
        previous.map((item) =>
          item.id === statusId ? { ...item, text } : item,
        ),
      );
      updateRunStatus(text);
    };

    const onToolApproval = async (
      request: ToolApprovalRequest,
      signal?: AbortSignal,
    ): Promise<ToolApprovalDecision> => {
      const toolCategory = classifyToolCall(request.toolName, request.args);
      if (!requiresToolDecision(toolCategory, request.toolName, request.args))
        return { approved: true };
      if (approvalMode === "radical") {
        return { approved: true, reason: "auto-approved in radical mode" };
      }
      if (sessionApprovedToolPrompts.current.has(sessionId)) {
        return {
          approved: true,
          reason: `auto-approved for current session ${sessionId.slice(0, 8)}`,
        };
      }
      try {
        const configuredTools = await readTools();
        if (
          toolApprovalAllowedByConfig(
            request.toolName,
            toolCategory,
            configuredTools,
          )
        ) {
          return { approved: true };
        }
      } catch (error) {
        appendItemRaw({
          id: crypto.randomUUID(),
          kind: "status",
          text: `Tool config unavailable; asking for approval: ${formatError(error)}`,
        });
      }
      if (pendingDecisionResolve.current) {
        return {
          approved: false,
          reason: "Another tool decision is already pending.",
        };
      }

      finalizeStreamingBuffers();
      const itemId = crypto.randomUUID();
      const argsSummary = summarizeToolArgs(request.args);
      appendItemRaw({
        id: itemId,
        kind: "decision",
        decisionStatus: "pending",
        toolName: request.toolName,
        toolCategory,
        text: `${toolCategoryTitle(toolCategory)} · ${request.toolName} · waiting for selection`,
      });
      updateStatus(
        `Ask User · ${toolCategoryTitle(toolCategory)} approval needed`,
      );

      return await new Promise<ToolApprovalDecision>((resolve) => {
        const finish = (decision: ToolApprovalDecision) => {
          signal?.removeEventListener("abort", abort);
          pendingDecisionResolve.current = null;
          resolve(decision);
        };
        const abort = () => {
          setDecisionPanel(null);
          updateItem(itemId, {
            decisionStatus: "blocked",
            text: `${toolCategoryTitle(toolCategory)} · ${request.toolName} · blocked (aborted)`,
          });
          finish({ approved: false, reason: "Tool decision aborted." });
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        pendingDecisionResolve.current = finish;
        setDecisionPanel({
          id: request.toolCallId,
          itemId,
          sessionId,
          toolName: request.toolName,
          toolCategory,
          argsSummary,
          selected: 0,
          options: [
            {
              id: "approve",
              label: "Approve once",
              description: "Run this tool call now.",
              checked: true,
            },
            {
              id: "approve_session",
              label: "Current session",
              description: "Run this and stop asking in this session.",
              checked: false,
            },
            {
              id: "block",
              label: "Block",
              description: "Return a blocked tool result to the model.",
              checked: false,
            },
          ],
        });
      });
    };

    try {
      const result = await executePromptFromConfig({
        prompt: trimmed,
        sessionId,
        projectRoot,
        onPlan,
        onTodoEvent,
        onEvent,
        onToolApproval,
        onMcpReport,
        onWorkerEvent,
        forceRoles: options.forceRoles as never,
        ignoreDisabledLocalTools: approvalMode === "radical",
        signal: runAbort.signal,
      });
      rememberIntentPlan(result.plan);
      finalizeStreamingBuffers();
      const tokenSummary = formatRunTokenSummary(runUsage.current);
      setItems((previous) => {
        const normalizedPrevious = previous.map(normalizeTranscriptItem);
        const next = normalizedPrevious.filter((item) => item.id !== statusId);
        next.push({
          id: crypto.randomUUID(),
          kind: "status",
          text: `${result.plan.brain.id} → ${result.plan.role} → ${result.plan.piModel.provider}/${result.plan.piModel.id}${tokenSummary ? ` · ${tokenSummary}` : ""}`,
          plan: result.plan,
        });
        next.push({
          id: crypto.randomUUID(),
          kind: "report",
          text: formatTuiFinalReportCompact(result.finalReport),
          finalReport: result.finalReport,
          collapsed: true,
        });
        const trimmedSummary = normalizeAssistantText(
          (result.summary ?? "").trim(),
        );
        const hasMatchingAssistant =
          trimmedSummary &&
          normalizedPrevious.some(
            (item) =>
              item.kind === "assistant" && item.text.trim() === trimmedSummary,
          );
        const sawAssistantText = normalizedPrevious.some(
          (item) => item.kind === "assistant" && item.text.trim().length > 0,
        );
        if (trimmedSummary && !hasMatchingAssistant) {
          next.push(
            normalizeTranscriptItem({
              id: crypto.randomUUID(),
              kind: "assistant",
              text: trimmedSummary,
            }),
          );
        } else if (!trimmedSummary && !sawAssistantText) {
          next.push({
            id: crypto.randomUUID(),
            kind: "assistant",
            text: "(model returned no text — check tool calls above or run /sessions to inspect)",
          });
        }
        return next;
      });
    } catch (error) {
      finalizeStreamingBuffers();
      if (runAbort.signal.aborted || isAbortLikeError(error)) {
        setRuntimeErrorPanel(null);
        setItems((previous) => [
          ...previous.filter((item) => item.id !== statusId),
          {
            id: crypto.randomUUID(),
            kind: "status",
            text: "Run interrupted by Esc.",
          },
        ]);
        return;
      }
      const message = showRuntimeErrorPanel(error, "Run Failed");
      if (
        isHandoffRequiredError(error) ||
        isProviderMessageSizeLimitError(error)
      ) {
        applyDraftChange("/handoff ");
        flash(
          "Context boundary reached — run /handoff to continue from a compact packet",
          "error",
          6000,
        );
      }
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        { id: crypto.randomUUID(), kind: "error", text: message },
      ]);
    } finally {
      if (activeRunAbort.current === runAbort) activeRunAbort.current = null;
      setRunning(false);
      stopRunStatus();
    }
    if (queueRef.current.length > 0) {
      void drainQueue();
    }
  }

  function applyDraftChange(
    next: string,
    nextCursor?: number,
    options: { fromPromptHistory?: boolean } = {},
  ) {
    if (!options.fromPromptHistory) {
      promptHistoryIndex.current = null;
      draftBeforePromptHistory.current = "";
    }
    const cursorPosition = clamp(nextCursor ?? next.length, 0, next.length);
    verticalCursorColumn.current = null;
    inputStore.setSnapshot((previous) =>
      previous.draft === next && previous.cursor === cursorPosition
        ? previous
        : { draft: next, cursor: cursorPosition },
    );
    setOverlay((current) => {
      const nextOverlay = computeOverlay(next, cursorPosition, current);
      return sameOverlay(current, nextOverlay) ? current : nextOverlay;
    });
  }

  function insertAtCursor(insertion: string) {
    const { draft, cursor } = getInputState();
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    applyDraftChange(
      `${before}${insertion}${after}`,
      cursor + insertion.length,
    );
  }

  function deleteBeforeCursor() {
    const { draft, cursor } = getInputState();
    if (cursor === 0) return;
    const before = draft.slice(0, cursor - 1);
    const after = draft.slice(cursor);
    applyDraftChange(`${before}${after}`, cursor - 1);
  }

  function deleteAfterCursor() {
    const { draft, cursor } = getInputState();
    if (cursor >= draft.length) return;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor + 1);
    applyDraftChange(`${before}${after}`, cursor);
  }

  function moveCursor(delta: number) {
    const { draft } = getInputState();
    verticalCursorColumn.current = null;
    inputStore.setSnapshot((current) => ({
      draft: current.draft,
      cursor: clamp(current.cursor + delta, 0, draft.length),
    }));
  }

  function moveCursorVertical(delta: -1 | 1): boolean {
    const { draft, cursor } = getInputState();
    const width = inputTextWidth(terminalCols);
    const result = moveDraftCursorVertically({
      draft,
      cursor,
      width,
      delta,
      desiredColumn: verticalCursorColumn.current,
      promptPrefix: INPUT_PROMPT_PREFIX,
    });
    if (!result.moved) return false;
    verticalCursorColumn.current = result.desiredColumn;
    inputStore.setSnapshot((current) =>
      current.cursor === result.cursor
        ? current
        : { ...current, cursor: result.cursor },
    );
    return true;
  }

  function recordPromptHistory(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const previous = promptHistory.current;
    const next =
      previous[previous.length - 1] === trimmed
        ? previous
        : [...previous, trimmed].slice(-100);
    promptHistory.current = next;
    promptHistoryIndex.current = null;
    draftBeforePromptHistory.current = "";
  }

  function navigatePromptHistory(delta: -1 | 1): boolean {
    const history = promptHistory.current;
    if (history.length === 0) return false;

    const currentIndex = promptHistoryIndex.current;
    if (currentIndex === null) {
      if (delta > 0) return false;
      draftBeforePromptHistory.current = getInputState().draft;
      const nextIndex = history.length - 1;
      promptHistoryIndex.current = nextIndex;
      applyDraftChange(history[nextIndex]!, undefined, {
        fromPromptHistory: true,
      });
      return true;
    }

    const nextIndex = currentIndex + delta;
    if (nextIndex >= history.length) {
      promptHistoryIndex.current = null;
      applyDraftChange(draftBeforePromptHistory.current, undefined, {
        fromPromptHistory: true,
      });
      draftBeforePromptHistory.current = "";
      return true;
    }
    if (nextIndex < 0) return true;
    promptHistoryIndex.current = nextIndex;
    applyDraftChange(history[nextIndex]!, undefined, {
      fromPromptHistory: true,
    });
    return true;
  }

  async function handlePaste() {
    const dir = join(homedir(), ".braincode", "sessions", sessionId);
    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // ignore
    }
    const target = join(dir, `pasted-${Date.now()}.png`);
    const result = await readClipboardImageOrText(target);
    if (result.kind === "image") {
      const { draft, cursor } = getInputState();
      const token = `@${result.path}`;
      insertAtCursor(
        `${draft.length === 0 || draft.slice(0, cursor).endsWith(" ") ? "" : " "}${token} `,
      );
      flash(
        `Pasted image → ${relative(projectRoot, result.path) || result.path}`,
      );
      return;
    }
    if (result.kind === "text") {
      insertAtCursor(result.text);
      return;
    }
    if (result.kind === "empty") {
      flash("Clipboard is empty");
      return;
    }
    appendItem({ kind: "error", text: `Paste failed: ${result.reason}` });
  }

  function acceptOverlay() {
    if (!overlay) return false;
    if (overlay.kind === "command") {
      const filtered = commandOverlayMatches(overlay.filter);
      const command = filtered[overlay.selected] ?? filtered[0];
      if (!command) return false;
      if (command.insert) {
        applyDraftChange(command.insert);
      } else {
        applyDraftChange("");
        setOverlay(null);
        handleCommand(`/${command.name}`);
      }
      return true;
    }
    if (overlay.kind === "file") {
      const { draft } = getInputState();
      const matches = fuzzyFilter(
        projectFiles,
        overlay.filter,
        overlaySuggestionLimit,
      );
      const target = matches[overlay.selected] ?? matches[0];
      if (!target) return false;
      const before = draft.slice(0, overlay.anchor);
      const tail = draft.slice(overlay.anchor + 1 + overlay.filter.length);
      const insertion = `@${target} `;
      applyDraftChange(
        `${before}${insertion}${tail}`,
        before.length + insertion.length,
      );
      return true;
    }
    if (overlay.kind === "session") {
      const { draft } = getInputState();
      const matches = filterSessions(
        sessionSuggestions,
        overlay.filter,
        overlaySuggestionLimit,
      );
      const target = matches[overlay.selected] ?? matches[0];
      if (!target) {
        void refreshSessionSuggestions();
        return false;
      }
      const before = draft.slice(0, overlay.anchor);
      const tail = draft.slice(overlay.anchor + 2 + overlay.filter.length);
      const insertion = `@@${target.sessionId} `;
      applyDraftChange(
        `${before}${insertion}${tail}`,
        before.length + insertion.length,
      );
      return true;
    }
    return false;
  }

  function moveDecisionSelection(delta: number) {
    setDecisionPanel((current) => {
      if (!current || current.options.length === 0) return current;
      return {
        ...current,
        selected:
          (current.selected + delta + current.options.length) %
          current.options.length,
      };
    });
  }

  function checkDecisionSelection(optionId?: DecisionOptionId) {
    setDecisionPanel((current) => {
      if (!current) return current;
      const selectedId = optionId ?? current.options[current.selected]?.id;
      if (!selectedId) return current;
      return {
        ...current,
        selected: Math.max(
          0,
          current.options.findIndex((option) => option.id === selectedId),
        ),
        options: current.options.map((option) => ({
          ...option,
          checked: option.id === selectedId,
        })),
      };
    });
  }

  function finishDecision(optionId?: DecisionOptionId) {
    if (!decisionPanel) return;
    const selected = optionId
      ? decisionPanel.options.find((option) => option.id === optionId)
      : (decisionPanel.options.find((option) => option.checked) ??
        decisionPanel.options[decisionPanel.selected]);
    if (!selected) return;
    const approved =
      selected.id === "approve" || selected.id === "approve_session";
    const approvedForSession = selected.id === "approve_session";
    if (approvedForSession) {
      sessionApprovedToolPrompts.current.add(decisionPanel.sessionId);
    }
    setItems((previous) =>
      previous.map((item) =>
        item.id === decisionPanel.itemId
          ? {
              ...item,
              decisionStatus: approved ? "approved" : "blocked",
              text: `${toolCategoryTitle(decisionPanel.toolCategory)} · ${decisionPanel.toolName} · ${approvedForSession ? "approved for current session" : approved ? "approved once" : "blocked"}`,
            }
          : item,
      ),
    );
    if (approvedForSession) {
      flash(
        `Tool prompts disabled for session ${decisionPanel.sessionId.slice(0, 8)}`,
      );
    }
    setDecisionPanel(null);
    const resolve = pendingDecisionResolve.current;
    pendingDecisionResolve.current = null;
    resolve?.({
      approved,
      reason: approved
        ? undefined
        : `User blocked tool call: ${decisionPanel.toolName}`,
    });
  }

  useInput((input, key) => {
    if (isMouseInput(input)) return;

    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    const { draft, cursor } = getInputState();

    const scrollKey = key as typeof key & {
      pageUp?: boolean;
      pageDown?: boolean;
      home?: boolean;
      end?: boolean;
    };
    if (scrollKey.pageUp || scrollKey.pageDown) {
      const pageRows = Math.max(
        1,
        transcriptViewportState.current.viewportRows - 1,
      );
      scrollTranscriptBy(scrollKey.pageDown ? pageRows : -pageRows);
      return;
    }
    if (scrollKey.home || scrollKey.end) {
      scrollTranscriptTo(scrollKey.home ? "top" : "bottom");
      return;
    }
    if (!overlay && (key.ctrl || key.meta) && (key.upArrow || key.downArrow)) {
      scrollTranscriptBy(key.downArrow ? 1 : -1);
      return;
    }

    if (decisionPanel) {
      if (key.escape && interruptRun()) return;
      const nextMove = key.downArrow || (key.ctrl && input === "n");
      const prevMove = key.upArrow || (key.ctrl && input === "p");
      if (nextMove || prevMove) {
        moveDecisionSelection(nextMove ? 1 : -1);
        return;
      }
      if (input === " ") {
        checkDecisionSelection();
        return;
      }
      if (input === "y") {
        checkDecisionSelection("approve");
        finishDecision("approve");
        return;
      }
      if (input === "s") {
        checkDecisionSelection("approve_session");
        finishDecision("approve_session");
        return;
      }
      if (input === "n" || key.escape) {
        checkDecisionSelection("block");
        finishDecision("block");
        return;
      }
      if (key.return) {
        finishDecision();
        return;
      }
      return;
    }

    if (runtimeErrorPanel) {
      if (key.return || key.escape || input === "q") {
        setRuntimeErrorPanel(null);
      }
      return;
    }

    if (key.ctrl && input === "o") {
      if (intentPanel) {
        setIntentPanel(null);
      } else {
        showIntentPanel();
      }
      return;
    }

    if (key.ctrl && input === "t") {
      toggleTranscriptFolds();
      return;
    }

    if (key.escape) {
      const now = Date.now();
      const closedOverlay =
        mcpPanel ||
        hookPanel ||
        sessionPanel ||
        brainPanel ||
        intentPanel ||
        runtimeErrorPanel ||
        overlay;
      if (closedOverlay) {
        setMcpPanel(null);
        setHookPanel(null);
        setSessionPanel(null);
        setBrainPanel(null);
        setIntentPanel(null);
        setRuntimeErrorPanel(null);
        setOverlay(null);
        lastEscapeAt.current = now;
        return;
      }
      if (interruptRun()) return;
      if (draft.length > 0 && now - lastEscapeAt.current <= DOUBLE_ESC_MS) {
        applyDraftChange("");
        lastEscapeAt.current = 0;
        flash("Input cleared");
        return;
      }
      lastEscapeAt.current = now;
      if (draft.length > 0) flash("Press Esc again to clear input");
      return;
    }

    if (mcpPanel) {
      const total = mcpPanel.entries.length;
      const nextMove = key.downArrow || (key.ctrl && input === "n");
      const prevMove = key.upArrow || (key.ctrl && input === "p");
      if (total > 0 && (nextMove || prevMove)) {
        const delta = nextMove ? 1 : -1;
        setMcpPanel({
          ...mcpPanel,
          selected: (mcpPanel.selected + delta + total) % total,
          message: undefined,
        });
        return;
      }
      const target = mcpPanel.entries[mcpPanel.selected];
      if (!target) return;
      if (key.return || (key.ctrl && input === "r")) {
        recheckMcp(target);
        return;
      }
      if (input === " " || input === "e") {
        void toggleMcpEntry(target);
        return;
      }
      if (input === "t") {
        void toggleMcpTrust(target);
        return;
      }
      if (input === "v") {
        viewMcpConfig(target);
        return;
      }
      return;
    }

    if (hookPanel) {
      if (key.escape) {
        setHookPanel(null);
        return;
      }
      const total = hookPanel.entries.length;
      const nextMove = key.downArrow || (key.ctrl && input === "n");
      const prevMove = key.upArrow || (key.ctrl && input === "p");
      if (total > 0 && (nextMove || prevMove)) {
        const delta = nextMove ? 1 : -1;
        setHookPanel({
          ...hookPanel,
          selected: (hookPanel.selected + delta + total) % total,
          message: undefined,
        });
        return;
      }
      const target = hookPanel.entries[hookPanel.selected];
      if (!target) return;
      if (input === " " || input === "e") {
        void toggleHookHandler(target);
        return;
      }
      if (input === "v" || key.return) {
        viewHookHandler(target);
        return;
      }
      return;
    }

    if (brainPanel) {
      if (key.escape) {
        setBrainPanel(null);
        return;
      }
      const total = brainPanel.brains.length;
      const nextMove = key.downArrow || (key.ctrl && input === "n");
      const prevMove = key.upArrow || (key.ctrl && input === "p");
      if (total > 0 && (nextMove || prevMove)) {
        const delta = nextMove ? 1 : -1;
        setBrainPanel({
          ...brainPanel,
          selected: (brainPanel.selected + delta + total) % total,
          message: undefined,
        });
        return;
      }
      const target = brainPanel.brains[brainPanel.selected];
      if (!target) return;
      if (key.return || input === "s") {
        void setDefaultBrain(target);
        return;
      }
      if (input === "v") {
        viewBrainDetail(target);
        return;
      }
      return;
    }

    if (sessionPanel) {
      if (key.escape) {
        clearTerminalFrame();
        setSessionPanel(null);
        return;
      }
      const total = sessionPanel.entries.length;
      const nextMove = key.downArrow || (key.ctrl && input === "n");
      const prevMove = key.upArrow || (key.ctrl && input === "p");
      if (total > 0 && (nextMove || prevMove)) {
        const delta = nextMove ? 1 : -1;
        setSessionPanel({
          ...sessionPanel,
          selected: (sessionPanel.selected + delta + total) % total,
          message: undefined,
        });
        return;
      }
      const target = sessionPanel.entries[sessionPanel.selected];
      if (!target) return;
      if (key.return) {
        void applyResume(target).catch((error) =>
          appendItem({
            kind: "error",
            text: `Resume failed: ${formatError(error)}`,
          }),
        );
        return;
      }
      if (input === "v") {
        appendItem({
          kind: "panel",
          text: `${target.sessionId}\n  path: ${target.path}\n  status: ${target.status}\n  prompt: ${target.prompt ?? "(none)"}\n  summary: ${target.summary ?? "(none)"}`,
        });
        return;
      }
      return;
    }

    if (key.ctrl && (input === "v" || input === "\x16")) {
      void handlePaste();
      return;
    }

    if (overlay) {
      const total =
        overlay.kind === "command"
          ? commandOverlayMatches(overlay.filter).length
          : overlay.kind === "file"
            ? fuzzyFilter(projectFiles, overlay.filter, overlaySuggestionLimit)
                .length
            : filterSessions(
                sessionSuggestions,
                overlay.filter,
                overlaySuggestionLimit,
              ).length;
      const moveNext = key.downArrow || (key.ctrl && input === "n");
      const movePrev = key.upArrow || (key.ctrl && input === "p");
      if (total > 0 && (moveNext || movePrev)) {
        const delta = moveNext ? 1 : -1;
        setOverlay({
          ...overlay,
          selected: (overlay.selected + delta + total) % total,
        });
        return;
      }
    }

    if (overlay && key.tab) {
      if (acceptOverlay()) return;
    }

    if (!overlay && key.ctrl && input === "y") {
      if (editMostRecentQueuedTask()) return;
    }

    if (!overlay && key.ctrl && (input === "p" || input === "n")) {
      if (navigatePromptHistory(input === "n" ? 1 : -1)) return;
    }

    if (!overlay && ((key.return && key.shift) || input === "\n")) {
      insertAtCursor("\n");
      return;
    }

    if (key.return) {
      if (overlay && acceptOverlay()) return;
      recordPromptHistory(draft);
      void submitPrompt(draft);
      return;
    }

    if (!overlay && (key.upArrow || key.downArrow)) {
      const direction = key.downArrow ? 1 : -1;
      const moved = draft.length > 0 ? moveCursorVertical(direction) : false;
      if (moved) return;
      if (
        transcriptViewportState.current.maxScrollTop > 0 &&
        (draft.trim().length === 0 ||
          transcriptScrollStore.getSnapshot() !== null)
      ) {
        scrollTranscriptBy(direction);
        return;
      }
      if (
        key.upArrow &&
        draft.trim().length === 0 &&
        editMostRecentQueuedTask()
      )
        return;
      if (navigatePromptHistory(direction)) return;
      if (key.downArrow) return;
      if (key.upArrow && editMostRecentQueuedTask()) return;
      return;
    }

    if (key.leftArrow) {
      moveCursor(-1);
      return;
    }
    if (key.rightArrow) {
      moveCursor(1);
      return;
    }
    if (key.ctrl && input === "a") {
      verticalCursorColumn.current = null;
      inputStore.setSnapshot((current) =>
        current.cursor === 0 ? current : { ...current, cursor: 0 },
      );
      return;
    }
    if (key.ctrl && input === "e") {
      verticalCursorColumn.current = null;
      inputStore.setSnapshot((current) =>
        current.cursor === current.draft.length
          ? current
          : { ...current, cursor: current.draft.length },
      );
      return;
    }
    if (key.ctrl && input === "u") {
      applyDraftChange(draft.slice(cursor), 0);
      return;
    }
    if (key.ctrl && input === "k") {
      applyDraftChange(draft.slice(0, cursor), cursor);
      return;
    }
    if (key.ctrl && input === "w") {
      if (cursor === 0) return;
      const before = draft.slice(0, cursor);
      const after = draft.slice(cursor);
      const trimmedBefore = before.replace(/[^\s]*\s*$/u, "");
      applyDraftChange(`${trimmedBefore}${after}`, trimmedBefore.length);
      return;
    }
    if (key.backspace || key.delete) {
      deleteBeforeCursor();
      return;
    }
    if (key.ctrl && input === "d") {
      deleteAfterCursor();
      return;
    }

    if (!key.ctrl && !key.meta && input && !key.escape) {
      insertAtCursor(input);
    }
  });

  const commandMatches =
    overlay?.kind === "command" ? commandOverlayMatches(overlay.filter) : [];
  const fileMatches =
    overlay?.kind === "file"
      ? fuzzyFilter(projectFiles, overlay.filter, overlaySuggestionLimit)
      : [];
  const sessionMatches =
    overlay?.kind === "session"
      ? filterSessions(
          sessionSuggestions,
          overlay.filter,
          overlaySuggestionLimit,
        )
      : [];
  const projectMcpCount = projectSupport?.mcp?.serverNames.length ?? 0;
  const userMcpCount = userSupport?.mcp?.serverNames.length ?? 0;
  const projectSkillCount = projectSupport?.skills.length ?? 0;
  const userSkillCount = userSupport?.skills.length ?? 0;
  const contentWidth = frameContentWidth(terminalCols);
  const inputWidth = inputTextWidth(terminalCols);
  const projectPath = relative(homedir(), projectRoot) || projectRoot;
  const headerRootLimit = Math.max(18, Math.min(54, terminalCols - 92));
  const headerRoot = truncate(projectPath, headerRootLimit);
  const projectSummary = projectSupport
    ? `AGENTS ${projectSupport.agents ? "✓" : "·"} · mcp ${projectMcpCount} · skills ${projectSkillCount}`
    : "loading…";
  const userSummary = userSupport
    ? `mcp ${userMcpCount} · skills ${userSkillCount}`
    : "loading…";
  const tuiTheme = TUI_THEMES[themeName];
  const colors = tuiTheme.colors;
  const desiredPetPanelWidth = Math.max(
    PET_PANEL_MIN_WIDTH,
    Math.floor(contentWidth * 0.34),
  );
  const petPanelWidth = Math.min(
    PET_PANEL_MAX_WIDTH,
    desiredPetPanelWidth,
    Math.max(12, contentWidth - 12),
  );
  const footerTextWidth = Math.max(8, contentWidth - petPanelWidth - 1);
  const scrollHelp = TUI_MOUSE_ENABLED
    ? "PageUp/PageDown/wheel/Ctrl+↑↓ scroll"
    : "PageUp/PageDown/Ctrl+↑↓ scroll";
  const helpText = `Enter submits · / commands · ↑↓ scroll content when input is empty · Ctrl+P/N prompt history · Ctrl+T folds · ${scrollHelp} · select content to copy · End bottom · Ctrl+O intent · @ files · @@ sessions · Ctrl+V paste · Esc dismisses · Ctrl+C exits`;
  const sessionMatchRows =
    sessionMatches.length === 0
      ? 1
      : sessionMatches.reduce((sum, entry) => sum + (entry.prompt ? 2 : 1), 0);

  return (
    <TuiThemeContext.Provider value={tuiTheme}>
      <Box flexDirection="column" paddingX={1}>
        <Box
          borderStyle="round"
          borderColor={colors.focusedBorder}
          paddingX={1}
          marginBottom={1}
        >
          <Box flexDirection="row" alignItems="center">
            <Box flexDirection="column" marginRight={1}>
              <Text>
                <Badge label="BRAIN / CODE" backgroundColor="cyan" />
              </Text>
              <Text>
                <Badge
                  label={`${mode.toUpperCase()} / ${themeName.toUpperCase()}`.padEnd(
                    12,
                  )}
                  backgroundColor={mode === "radical" ? "magenta" : "green"}
                />
              </Text>
            </Box>

            <HeaderSeparator />

            <Box flexDirection="column" marginRight={1}>
              <HeaderMetaLine label="SESSION" value={sessionId.slice(0, 8)} />
              <HeaderMetaLine label="ROOT" value={headerRoot} />
            </Box>

            <HeaderSeparator />

            <Box flexDirection="column" marginRight={1}>
              <HeaderInfoLine
                label="PROJECT"
                backgroundColor="blue"
                value={projectSummary}
              />
              <HeaderInfoLine
                label="USER"
                backgroundColor="magenta"
                value={userSummary}
              />
            </Box>
          </Box>
        </Box>

        <TranscriptSurface
          transcriptStore={transcriptStore}
          transcriptScrollStore={transcriptScrollStore}
          toastStore={toastStore}
          queueLengthStore={queueLengthStore}
          draftMetricsStore={draftMetricsStore}
          viewportState={transcriptViewportState}
          contentWidth={contentWidth}
          terminalRows={terminalRows}
          brainPanel={brainPanel}
          intentPanel={intentPanel}
          sessionPanel={sessionPanel}
          hookPanel={hookPanel}
          mcpPanel={mcpPanel}
          overlay={overlay}
          commandMatchRows={Math.max(1, commandMatches.length)}
          fileMatchRows={Math.max(1, fileMatches.length)}
          sessionMatchRows={sessionMatchRows}
          decisionPanel={decisionPanel}
          runtimeErrorPanel={runtimeErrorPanel}
          running={running}
        />

        {brainPanel ? (
          <Box
            borderStyle="round"
            borderColor={colors.cyan}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.cyan} bold>
              Brains
            </Text>
            {brainPanel.brains.map((brain, index) => (
              <Box key={brain.id} flexDirection="column">
                <Text
                  color={
                    index === brainPanel.selected ? colors.green : undefined
                  }
                >
                  {index === brainPanel.selected ? "›" : " "}{" "}
                  {brain.id === brainPanel.defaultBrainId ? "★" : " "}{" "}
                  {brain.id} · planner={brain.planner.modelId} · frontend=
                  {brain.roles.frontend.modelId}
                </Text>
                <Text color={colors.gray}>
                  {" "}
                  {truncate(brain.description ?? "", 120)}
                </Text>
              </Box>
            ))}
            {brainPanel.message ? (
              <Text color={colors.cyan}>{brainPanel.message}</Text>
            ) : null}
            <Text color={colors.gray}>
              ↑↓ / Ctrl+P/N navigate · Enter/s set as default · v show roles ·
              Esc close
            </Text>
          </Box>
        ) : null}

        {intentPanel ? (
          <Box
            borderStyle="round"
            borderColor={colors.cyan}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.cyan} bold>
              Intent Graph
            </Text>
            {formatIntentGraphLines(
              intentPanel.plan,
              Math.max(40, terminalCols - 8),
            ).map((line, index) => (
              <Text
                key={index}
                color={tone(
                  tuiTheme,
                  isIntentGraphHeaderLine(line)
                    ? "cyan"
                    : line.startsWith("Notes:")
                      ? "yellow"
                      : "gray",
                )}
              >
                {line}
              </Text>
            ))}
            <Text color={colors.gray}>
              Ctrl+O / Esc close · /plan refreshes this graph
            </Text>
          </Box>
        ) : null}

        {sessionPanel ? (
          <Box
            borderStyle="round"
            borderColor={colors.blue}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.blue} bold>
              Sessions
            </Text>
            {sessionPanel.entries.map((entry, index) => (
              <Box key={entry.sessionId} flexDirection="column">
                <Text
                  color={
                    index === sessionPanel.selected ? colors.green : undefined
                  }
                >
                  {index === sessionPanel.selected ? "›" : " "}{" "}
                  {sessionStatusGlyph(entry.status)}{" "}
                  {entry.sessionId.slice(0, 8)} ·{" "}
                  {formatTimestamp(entry.updatedAt)}
                  {entry.role ? ` · ${entry.role}` : ""}
                </Text>
                {entry.prompt ? (
                  <Text color={colors.gray}>
                    {" "}
                    {truncate(entry.prompt.replace(/\s+/g, " ").trim(), 120)}
                  </Text>
                ) : null}
              </Box>
            ))}
            {sessionPanel.message ? (
              <Text color={colors.cyan}>{sessionPanel.message}</Text>
            ) : null}
            <Text color={colors.gray}>
              ↑↓ / Ctrl+P/N navigate · Enter resume · v details · Esc close
            </Text>
          </Box>
        ) : null}

        {hookPanel ? (
          <Box
            borderStyle="round"
            borderColor={colors.yellow}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.yellow} bold>
              Hooks
            </Text>
            {hookPanel.entries.map((entry, index) => (
              <Box
                key={`${entry.scope}:${entry.eventName}:${entry.matcherIndex}:${entry.handlerIndex}`}
                flexDirection="column"
              >
                <Text
                  color={
                    index === hookPanel.selected ? colors.green : undefined
                  }
                >
                  {index === hookPanel.selected ? "›" : " "}{" "}
                  {entry.handler.enabled === false ? "○" : "●"}{" "}
                  {entry.scope === "user" ? "user" : "proj"} · {entry.eventName}
                  {entry.matcher ? `[${entry.matcher}]` : ""}
                  {entry.handler.trusted ? " · trusted" : " · untrusted"}
                </Text>
                <Text color={colors.gray}>
                  {" "}
                  {truncate(
                    entry.handler.command ??
                      entry.handler.commandWindows ??
                      entry.handler.command_windows ??
                      "(no command)",
                    120,
                  )}
                </Text>
              </Box>
            ))}
            {hookPanel.message ? (
              <Text color={colors.cyan}>{hookPanel.message}</Text>
            ) : null}
            <Text color={colors.gray}>
              ↑↓ / Ctrl+P/N navigate · Enter/v view · Space/e enable·disable ·
              Esc close
            </Text>
          </Box>
        ) : null}

        {mcpPanel ? (
          <Box
            borderStyle="round"
            borderColor={colors.magenta}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.magenta} bold>
              MCP servers
            </Text>
            {mcpPanel.entries.map((entry, index) => (
              <Box key={`${entry.scope}:${entry.name}`} flexDirection="column">
                <Text
                  color={index === mcpPanel.selected ? colors.green : undefined}
                >
                  {index === mcpPanel.selected ? "›" : " "} {healthGlyph(entry)}{" "}
                  {entry.scope === "user" ? "user" : "proj"} · {entry.name}
                  {entry.entry.disabled ? " (disabled)" : ""}
                  {entry.scope === "project" && entry.entry.trusted !== true
                    ? " (untrusted)"
                    : ""}
                </Text>
                <Text color={colors.gray}>
                  {" "}
                  {describeMcpEntry(entry.entry)} — {describeHealth(entry)}
                </Text>
              </Box>
            ))}
            {mcpPanel.message ? (
              <Text color={colors.cyan}>{mcpPanel.message}</Text>
            ) : null}
            <Text color={colors.gray}>
              ↑↓ / Ctrl+P/N navigate · Enter recheck · Space/e enable·disable ·
              t trust · v view config · Esc close
            </Text>
          </Box>
        ) : null}

        {overlay?.kind === "command" ? (
          <Box
            borderStyle="single"
            borderColor={colors.magenta}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.magenta}>
              Commands {overlay.filter ? `(/${overlay.filter})` : ""}
            </Text>
            {commandMatches.length === 0 ? (
              <Text color={colors.gray}>No matching command</Text>
            ) : (
              commandMatches.map((command, index) => (
                <Text
                  key={command.name}
                  color={index === overlay.selected ? colors.green : undefined}
                >
                  {index === overlay.selected ? "› " : "  "}
                  {command.label} — {command.hint}
                </Text>
              ))
            )}
            <Text color={colors.gray}>
              Tab / Enter to accept · Esc to dismiss
            </Text>
          </Box>
        ) : null}

        {overlay?.kind === "file" ? (
          <Box
            borderStyle="single"
            borderColor={colors.yellow}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.yellow}>
              Files {overlay.filter ? `(@${overlay.filter})` : ""}
            </Text>
            {fileMatches.length === 0 ? (
              <Text color={colors.gray}>
                {projectFiles.length === 0
                  ? "Project index still loading…"
                  : "No matches"}
              </Text>
            ) : (
              fileMatches.map((path, index) => (
                <Text
                  key={path}
                  color={index === overlay.selected ? colors.green : undefined}
                >
                  {index === overlay.selected ? "› " : "  "}
                  {path}
                </Text>
              ))
            )}
            <Text color={colors.gray}>
              Tab / Enter to insert · Esc to dismiss
            </Text>
          </Box>
        ) : null}

        {overlay?.kind === "session" ? (
          <Box
            borderStyle="single"
            borderColor={colors.blue}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.blue}>
              Sessions {overlay.filter ? `(@@${overlay.filter})` : ""}
            </Text>
            {sessionMatches.length === 0 ? (
              <Text color={colors.gray}>
                {sessionSuggestions.length === 0
                  ? "No sessions indexed yet"
                  : "No matches"}
              </Text>
            ) : (
              sessionMatches.map((entry, index) => (
                <Box key={entry.sessionId} flexDirection="column">
                  <Text
                    color={
                      index === overlay.selected ? colors.green : undefined
                    }
                  >
                    {index === overlay.selected ? "› " : "  "}
                    {entry.sessionId.slice(0, 8)} ·{" "}
                    {sessionStatusGlyph(entry.status)} ·{" "}
                    {formatTimestamp(entry.updatedAt)}
                    {entry.role ? ` · ${entry.role}` : ""}
                  </Text>
                  {entry.prompt ? (
                    <Text color={colors.gray}>
                      {" "}
                      {truncate(entry.prompt.replace(/\s+/g, " ").trim(), 110)}
                    </Text>
                  ) : null}
                </Box>
              ))
            )}
            <Text color={colors.gray}>
              Tab / Enter to insert · Esc to dismiss
            </Text>
          </Box>
        ) : null}

        {decisionPanel ? (
          <Box
            borderStyle="double"
            borderColor={colors.yellow}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.yellow} bold>
              Ask User · Tool Decision
            </Text>
            <Text>
              <Text
                color={tone(
                  tuiTheme,
                  toolCategoryColor(decisionPanel.toolCategory),
                )}
                bold
              >
                [{toolCategoryTitle(decisionPanel.toolCategory)}]
              </Text>
              <Text color={colors.yellow}> {decisionPanel.toolName}</Text>
            </Text>
            {decisionPanel.argsSummary ? (
              <Text color={colors.gray}>args: {decisionPanel.argsSummary}</Text>
            ) : null}
            {decisionPanel.options.map((option, index) => (
              <Text
                key={option.id}
                color={tone(
                  tuiTheme,
                  index === decisionPanel.selected
                    ? "green"
                    : option.checked
                      ? "yellow"
                      : "gray",
                )}
              >
                {index === decisionPanel.selected ? "› " : "  "}
                {option.checked ? "[x]" : "[ ]"} {option.label} —{" "}
                {option.description}
              </Text>
            ))}
            <Text color={colors.gray}>
              ↑↓ / Ctrl+P/N navigate · Space checks · Enter confirms · y once ·
              s session · n/Esc blocks
            </Text>
          </Box>
        ) : null}

        {runtimeErrorPanel ? (
          <Box
            borderStyle="double"
            borderColor={colors.red}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Text color={colors.red} bold>
              {runtimeErrorPanel.title}
            </Text>
            {runtimeErrorPanel.message.split(/\r?\n/).map((line, index) => (
              <Text
                key={index}
                color={
                  line.startsWith("Hint:") || line.startsWith("Fix:")
                    ? colors.yellow
                    : undefined
                }
              >
                {line || " "}
              </Text>
            ))}
            <Text color={colors.gray}>Enter / Esc / q closes</Text>
          </Box>
        ) : null}

        <InputSurface
          inputStore={inputStore}
          draftMetricsStore={draftMetricsStore}
          footerRowsStore={footerRowsStore}
          runStatusStore={runStatusStore}
          running={running}
          inputWidth={inputWidth}
          contentWidth={contentWidth}
        />
        <FooterSurface
          toastStore={toastStore}
          queueLengthStore={queueLengthStore}
          footerRowsStore={footerRowsStore}
          petSnapshotStore={petSnapshotStore}
          running={running}
          contentWidth={contentWidth}
          footerTextWidth={footerTextWidth}
          petPanelWidth={petPanelWidth}
          helpText={helpText}
        />
      </Box>
    </TuiThemeContext.Provider>
  );
}

const TranscriptSurface = React.memo(function TranscriptSurface({
  transcriptStore,
  transcriptScrollStore,
  toastStore,
  queueLengthStore,
  draftMetricsStore,
  viewportState,
  contentWidth,
  terminalRows,
  brainPanel,
  intentPanel,
  sessionPanel,
  hookPanel,
  mcpPanel,
  overlay,
  commandMatchRows,
  fileMatchRows,
  sessionMatchRows,
  decisionPanel,
  runtimeErrorPanel,
  running,
}: {
  transcriptStore: TuiStore<TranscriptItem[]>;
  transcriptScrollStore: TuiStore<number | null>;
  toastStore: TuiStore<ToastState | null>;
  queueLengthStore: TuiStore<number>;
  draftMetricsStore: TuiStore<DraftMetrics>;
  viewportState: React.MutableRefObject<{
    totalRows: number;
    viewportRows: number;
    scrollTop: number;
    maxScrollTop: number;
    scrollAnchors: number[];
  }>;
  contentWidth: number;
  terminalRows: number;
  brainPanel: BrainPanelState | null;
  intentPanel: IntentPanelState | null;
  sessionPanel: SessionPanelState | null;
  hookPanel: HookPanelState | null;
  mcpPanel: McpPanelState | null;
  overlay: Overlay;
  commandMatchRows: number;
  fileMatchRows: number;
  sessionMatchRows: number;
  decisionPanel: DecisionPanelState | null;
  runtimeErrorPanel: RuntimeErrorPanelState | null;
  running: boolean;
}) {
  const theme = useTuiTheme();
  const colors = theme.colors;
  const items = useTuiStoreSnapshot(transcriptStore);
  const transcriptScrollTop = useTuiStoreSnapshot(transcriptScrollStore);
  const toast = useTuiStoreSnapshot(toastStore);
  const queueLength = useTuiStoreSnapshot(queueLengthStore);
  const draftMetrics = useTuiStoreSnapshot(draftMetricsStore);
  const fixedRows = estimateFixedFrameRows({
    brainPanel,
    intentPanel,
    sessionPanel,
    hookPanel,
    mcpPanel,
    overlay,
    commandMatchRows,
    fileMatchRows,
    sessionMatchRows,
    decisionPanel,
    runtimeErrorPanel,
    draftMetrics,
    running,
  });
  const showEmptyIntro = items.length === 0 && draftMetrics.empty;
  const transcriptChromeRows =
    items.length > 0 ? 1 : showEmptyIntro ? BRAIN_LOGO.length + 4 : 0;
  const nonTranscriptRows =
    fixedRows + transcriptChromeRows + estimateFooterRows(queueLength, toast);
  const transcriptLayout = useMemo(
    () => layoutTranscriptItems(items, contentWidth),
    [items, contentWidth],
  );
  const availableTranscriptRows = Math.max(
    1,
    terminalRows - nonTranscriptRows - INK_RENDER_SAFETY_ROWS,
  );
  const transcriptViewportRows = items.length > 0 ? availableTranscriptRows : 0;
  const transcriptViewport = useMemo(
    () =>
      viewportTranscriptLayout(
        transcriptLayout,
        transcriptViewportRows,
        transcriptScrollTop,
      ),
    [transcriptLayout, transcriptScrollTop, transcriptViewportRows],
  );
  const transcriptAnchors = useMemo(
    () =>
      transcriptScrollAnchors(
        transcriptLayout,
        transcriptViewport.maxScrollTop,
      ),
    [transcriptLayout, transcriptViewport.maxScrollTop],
  );
  viewportState.current = {
    totalRows: transcriptLayout.totalRows,
    viewportRows: transcriptViewport.viewportRows,
    scrollTop: transcriptViewport.scrollTop,
    maxScrollTop: transcriptViewport.maxScrollTop,
    scrollAnchors: transcriptAnchors,
  };
  const transcriptScrollSummary =
    transcriptScrollTop !== null && transcriptViewport.maxScrollTop > 0
      ? `${Math.round(transcriptViewport.scrollTop + transcriptViewport.viewportRows)}/${transcriptLayout.totalRows} rows`
      : "";

  if (showEmptyIntro) {
    return (
      <Box flexDirection="column" alignItems="center" marginY={1}>
        {BRAIN_LOGO.map((line, index) => (
          <Text key={`logo-${index}`} color={colors.cyan} bold>
            {line}
          </Text>
        ))}
        <Box marginTop={1}>
          <Text color={colors.gray}>
            type a prompt to begin · / for commands · @ for files · @@ for
            sessions
          </Text>
        </Box>
      </Box>
    );
  }

  if (items.length === 0) return null;

  return (
    <Box flexDirection="column">
      <SectionDivider
        label={
          transcriptScrollSummary
            ? `TRANSCRIPT ${transcriptScrollSummary}`
            : "TRANSCRIPT"
        }
        color="cyan"
        width={contentWidth}
      />
      <Box
        flexDirection="column"
        height={transcriptViewport.viewportRows}
        overflow="hidden"
      >
        {transcriptViewport.entries.map((entry) => (
          <TranscriptEntryView
            key={entry.item.id}
            entry={entry}
            width={contentWidth}
          />
        ))}
      </Box>
    </Box>
  );
});

const TranscriptEntryView = React.memo(function TranscriptEntryView({
  entry,
  width,
}: {
  entry: TranscriptRenderEntry;
  width: number;
}) {
  const theme = useTuiTheme();
  const colors = theme.colors;
  const { item, continuation, showDivider, collapsible } = entry;
  return (
    <Box flexDirection="column" marginBottom={1}>
      {showDivider ? <ThinDivider width={width} /> : null}
      <TranscriptLine
        item={item}
        width={width}
        continuation={continuation}
        collapsible={collapsible}
      />
      {item.kind === "tool" && !item.collapsed && item.toolArgs ? (
        <Box flexDirection="column" marginLeft={2}>
          {Object.entries(item.toolArgs).map(([key, value]) => (
            <Text key={key} color={colors.gray}>
              ↳ {formatToolArgLine(key, value)}
            </Text>
          ))}
        </Box>
      ) : null}
      {item.kind === "tool" && !item.collapsed && item.toolDetail ? (
        <Box flexDirection="column" marginLeft={2}>
          <Text color={colors.gray}>↳ {item.toolDetail}</Text>
        </Box>
      ) : null}
      {item.plan ? (
        <>
          <Text color={colors.gray}>{formatPlanMetadataLine(item.plan)}</Text>
          <Text color={colors.gray}>
            {formatPlanWorkersBudgetLine(item.plan)}
          </Text>
          {item.plan.routing.reason ? (
            <Text color={colors.gray}>
              reason: {truncate(cleanInline(item.plan.routing.reason), 140)}
            </Text>
          ) : null}
        </>
      ) : null}
      {item.plan?.todos.length ? (
        <Box flexDirection="column" marginLeft={2}>
          {item.plan.todos.map((todo) => (
            <Text
              key={todo.id}
              color={tone(
                theme,
                todo.status === "completed"
                  ? "green"
                  : todo.status === "failed" || todo.status === "blocked"
                    ? "red"
                    : todo.status === "running"
                      ? "yellow"
                      : "gray",
              )}
            >
              {todoGlyph(todo.status)} {todo.role} · {todo.title}
            </Text>
          ))}
        </Box>
      ) : null}
      {item.kind === "report" && item.finalReport && !item.collapsed ? (
        <Box flexDirection="column" marginLeft={2}>
          {formatTuiFinalReportSections(item.finalReport).map((line, index) => (
            <Text
              key={index}
              color={/^Warnings:|^- /.test(line) ? colors.yellow : colors.gray}
            >
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
      {item.editPreview ? <EditPreviewView preview={item.editPreview} /> : null}
    </Box>
  );
});

const InputSurface = React.memo(function InputSurface({
  inputStore,
  draftMetricsStore,
  footerRowsStore,
  runStatusStore,
  running,
  inputWidth,
  contentWidth,
}: {
  inputStore: TuiStore<InputState>;
  draftMetricsStore: TuiStore<DraftMetrics>;
  footerRowsStore: TuiStore<number>;
  runStatusStore: TuiStore<RunStatusState | null>;
  running: boolean;
  inputWidth: number;
  contentWidth: number;
}) {
  const { stdout } = useStdout();
  const theme = useTuiTheme();
  const colors = theme.colors;
  useTuiStoreSnapshot(draftMetricsStore);
  const input = inputStore.getSnapshot();
  const runStatus = useTuiStoreSnapshot(runStatusStore);
  const draftWindow = useMemo(
    () =>
      clipDraftToWindow(input.draft, input.cursor, inputWidth, INPUT_MAX_LINES),
    [input, inputWidth],
  );

  useEffect(() => {
    const syncInput = (mode: "paint" | "measure" | "status") => {
      const current = inputStore.getSnapshot();
      const currentWindow = clipDraftToWindow(
        current.draft,
        current.cursor,
        inputWidth,
        INPUT_MAX_LINES,
      );
      const nextMetrics = draftMetricsFromWindow(current.draft, currentWindow);
      const previousMetrics = draftMetricsStore.getSnapshot();
      if (!sameDraftMetrics(previousMetrics, nextMetrics)) {
        draftMetricsStore.setSnapshot(nextMetrics);
        return;
      }
      if (mode === "paint" && stdout) {
        paintInputSurface({
          stdout,
          theme,
          running,
          contentWidth,
          footerRows: footerRowsStore.getSnapshot(),
          runStatus: runStatusStore.getSnapshot(),
          draftWindow: currentWindow,
        });
      }
      if (mode === "status" && stdout && running) {
        paintRunStatusLine({
          stdout,
          theme,
          contentWidth,
          footerRows: footerRowsStore.getSnapshot(),
          runStatus: runStatusStore.getSnapshot(),
          draftWindow: currentWindow,
        });
      }
    };
    syncInput("measure");
    const unsubscribe = inputStore.subscribe(() => syncInput("paint"));
    let animationTimer: ReturnType<typeof setInterval> | null = null;
    if (running) {
      syncInput("paint");
      animationTimer = setInterval(
        () => syncInput("status"),
        RUN_STATUS_ANIMATION_MS,
      );
    }
    return () => {
      unsubscribe();
      if (animationTimer) clearInterval(animationTimer);
    };
  }, [
    contentWidth,
    draftMetricsStore,
    footerRowsStore,
    inputStore,
    inputWidth,
    running,
    runStatusStore,
    stdout,
    theme,
  ]);

  return (
    <>
      <SectionDivider
        label={running ? "RUNNING" : "INPUT"}
        color={running ? "yellow" : "green"}
        width={contentWidth}
      />
      {running ? (
        <RuntimeStatusLine
          status={
            runStatus ?? {
              startedAt: Date.now(),
              label: "Thinking…",
              tokens: emptyTokenUsage(),
              frame: 0,
            }
          }
          width={contentWidth}
        />
      ) : null}
      <Box
        borderStyle="single"
        borderColor={tone(theme, running ? "yellow" : "green")}
        paddingX={1}
        flexDirection="column"
        width={contentWidth}
        overflow="hidden"
      >
        {draftWindow.hiddenAbove > 0 ? (
          <Text color={colors.gray}>
            ↑ {draftWindow.hiddenAbove} more line
            {draftWindow.hiddenAbove === 1 ? "" : "s"}
          </Text>
        ) : null}
        {draftWindowDisplayLines(draftWindow).map((line, index) => (
          <DraftInputLine
            key={index}
            line={line}
            color={tone(theme, running ? "yellow" : "green")}
          />
        ))}
        {draftWindow.hiddenBelow > 0 ? (
          <Text color={colors.gray}>
            ↓ {draftWindow.hiddenBelow} more line
            {draftWindow.hiddenBelow === 1 ? "" : "s"}
          </Text>
        ) : null}
      </Box>
    </>
  );
});

const FooterSurface = React.memo(function FooterSurface({
  toastStore,
  queueLengthStore,
  footerRowsStore,
  petSnapshotStore,
  running,
  contentWidth,
  footerTextWidth,
  petPanelWidth,
  helpText,
}: {
  toastStore: TuiStore<ToastState | null>;
  queueLengthStore: TuiStore<number>;
  footerRowsStore: TuiStore<number>;
  petSnapshotStore: TuiStore<PetWatcherSnapshotItem[]>;
  running: boolean;
  contentWidth: number;
  footerTextWidth: number;
  petPanelWidth: number;
  helpText: string;
}) {
  const theme = useTuiTheme();
  const colors = theme.colors;
  const toast = useTuiStoreSnapshot(toastStore);
  const queueLength = useTuiStoreSnapshot(queueLengthStore);
  const petSnapshotItems = useTuiStoreSnapshot(petSnapshotStore);
  useEffect(() => {
    footerRowsStore.setSnapshot(estimateFooterRows(queueLength, toast));
  }, [footerRowsStore, queueLength, toast]);
  const petState = usePetWatcher({
    thinking: running,
    recentItems: petSnapshotItems,
    queueLength,
  });

  return (
    <Box
      width={contentWidth}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="flex-end"
    >
      <Box flexDirection="column" width={footerTextWidth}>
        <Text color={colors.gray} wrap="truncate-end">
          {helpText}
        </Text>
        {queueLength > 0 ? (
          <Text color={colors.yellow} wrap="truncate-end">
            {queueLength} task{queueLength === 1 ? "" : "s"} queued · Ctrl+Y
            edits the most recent
          </Text>
        ) : null}
        {toast ? <ToastView toast={toast} /> : null}
      </Box>
      <BrainPet
        thinking={running}
        status={petState.status}
        lines={petState.lines}
        width={petPanelWidth}
        animate={TUI_ANIMATIONS_ENABLED}
        activeColor={colors.magenta}
        activeStatusColor={colors.yellow}
        idleColor={colors.gray}
      />
    </Box>
  );
});

function paintInputSurface({
  stdout,
  theme,
  running,
  contentWidth,
  footerRows,
  runStatus,
  draftWindow,
}: {
  stdout: { write: (chunk: string) => unknown };
  theme: TuiTheme;
  running: boolean;
  contentWidth: number;
  footerRows: number;
  runStatus: RunStatusState | null;
  draftWindow: DraftWindow;
}) {
  const color = tone(theme, running ? "yellow" : "green");
  const rows = renderInputSurfaceRows({
    theme,
    color,
    running,
    contentWidth,
    runStatus,
    draftWindow,
  });
  const moveUp = Math.max(0, footerRows + rows.length);
  const output = [
    "\x1b7",
    moveUp > 0 ? `\x1b[${moveUp}A` : "",
    ...rows.map((row, index) =>
      index === rows.length - 1 ? `\r\x1b[2K${row}` : `\r\x1b[2K${row}\n`,
    ),
    "\x1b8",
  ].join("");
  stdout.write(output);
}

function paintRunStatusLine({
  stdout,
  theme,
  contentWidth,
  footerRows,
  runStatus,
  draftWindow,
}: {
  stdout: { write: (chunk: string) => unknown };
  theme: TuiTheme;
  contentWidth: number;
  footerRows: number;
  runStatus: RunStatusState | null;
  draftWindow: DraftWindow;
}) {
  const rows = renderInputSurfaceRows({
    theme,
    color: tone(theme, "yellow"),
    running: true,
    contentWidth,
    runStatus,
    draftWindow,
  });
  const statusRowIndex = 1;
  const statusRow = rows[statusRowIndex];
  if (!statusRow) return;
  const moveUp = Math.max(0, footerRows + rows.length - statusRowIndex);
  stdout.write(
    [
      "\x1b7",
      moveUp > 0 ? `\x1b[${moveUp}A` : "",
      `\r\x1b[2K${statusRow}`,
      "\x1b8",
    ].join(""),
  );
}

function renderInputSurfaceRows({
  theme,
  color,
  running,
  contentWidth,
  runStatus,
  draftWindow,
}: {
  theme: TuiTheme;
  color: string;
  running: boolean;
  contentWidth: number;
  runStatus: RunStatusState | null;
  draftWindow: DraftWindow;
}): string[] {
  const inputWidth = Math.max(1, contentWidth - INPUT_BOX_HORIZONTAL_CHROME);
  const label = running ? "RUNNING" : "INPUT";
  const divider = `${ansiColor(color)}[${label}] ${"─".repeat(Math.max(1, contentWidth - label.length - 4))}${ANSI_RESET}`;
  const top = `${ansiColor(color)}┌${"─".repeat(Math.max(1, contentWidth - 2))}┐${ANSI_RESET}`;
  const bottom = `${ansiColor(color)}└${"─".repeat(Math.max(1, contentWidth - 2))}┘${ANSI_RESET}`;
  const rows = [` ${divider}`, ` ${top}`];
  if (running) {
    rows.splice(
      1,
      0,
      ` ${renderRunStatusAnsiLine(runStatus, contentWidth, theme)}`,
    );
  }
  if (draftWindow.hiddenAbove > 0) {
    rows.push(
      renderInputBoxRow(
        `↑ ${draftWindow.hiddenAbove} more line${draftWindow.hiddenAbove === 1 ? "" : "s"}`,
        inputWidth,
        color,
      ),
    );
  }
  for (const line of draftWindowDisplayLines(draftWindow)) {
    rows.push(renderInputBoxDraftRow(line, inputWidth, color));
  }
  if (draftWindow.hiddenBelow > 0) {
    rows.push(
      renderInputBoxRow(
        `↓ ${draftWindow.hiddenBelow} more line${draftWindow.hiddenBelow === 1 ? "" : "s"}`,
        inputWidth,
        color,
      ),
    );
  }
  rows.push(` ${bottom}`);
  return rows;
}

function renderInputBoxRow(text: string, width: number, color: string): string {
  const fitted = fitVisualWidth(text, width);
  return ` ${ansiColor(color)}│${ANSI_RESET} ${ansiColor(color)}${fitted}${padVisual(fitted, width)}${ANSI_RESET} ${ansiColor(color)}│${ANSI_RESET}`;
}

function renderInputBoxDraftRow(
  line: DraftWindowLine,
  width: number,
  color: string,
): string {
  const rendered = renderDraftLineAnsi(line, width, color);
  return ` ${ansiColor(color)}│${ANSI_RESET} ${rendered.text}${padVisual(rendered.plain, width)} ${ansiColor(color)}│${ANSI_RESET}`;
}

function renderDraftLineAnsi(
  line: DraftWindowLine,
  width: number,
  color: string,
): { text: string; plain: string } {
  const fitted = fitDraftWindowLine(line, width);
  if (fitted.cursorOffset === null) {
    const text = fitted.text || " ";
    return { text: `${ansiColor(color)}${text}${ANSI_RESET}`, plain: text };
  }

  const chars = Array.from(fitted.text);
  const cursorOffset = clamp(fitted.cursorOffset, 0, chars.length);
  const before = chars.slice(0, cursorOffset).join("");
  const cursorChar = chars[cursorOffset] ?? " ";
  const after =
    cursorOffset < chars.length ? chars.slice(cursorOffset + 1).join("") : "";
  return {
    text: `${ansiColor(color)}${before}${ANSI_INVERSE}${cursorChar}${ANSI_INVERSE_OFF}${ansiColor(color)}${after}${ANSI_RESET}`,
    plain: `${before}${cursorChar}${after}`,
  };
}

type RunStatusTextChar = {
  char: string;
  color: UiColor;
  bold?: boolean;
};

function renderRunStatusAnsiLine(
  status: RunStatusState | null,
  width: number,
  theme: TuiTheme,
  now = Date.now(),
): string {
  const chars = buildRunStatusChars(status, now, width);
  const activeIndex = runStatusActiveIndex(chars, now);
  const plain = runStatusCharsText(chars);
  const rendered = chars
    .map((cell, index) => {
      const color = runStatusCharColor(theme, cell, index, activeIndex);
      return `${ansiColor(color)}${cell.char}`;
    })
    .join("");
  return `${rendered}${ANSI_RESET}${padVisual(plain, width)}`;
}

function buildRunStatusChars(
  status: RunStatusState | null,
  now: number,
  width: number,
): RunStatusTextChar[] {
  const effective =
    status ??
    ({
      startedAt: now,
      label: "Thinking…",
      tokens: emptyTokenUsage(),
      frame: 0,
    } satisfies RunStatusState);
  const elapsedMs = Math.max(0, now - effective.startedAt);
  const animationFrame = Math.floor(now / RUN_STATUS_ANIMATION_MS);
  const spinner =
    RUN_SPINNER_FRAMES[animationFrame % RUN_SPINNER_FRAMES.length];
  const label = truncate(
    effective.label.replace(/\s+/g, " ").trim() || "Thinking…",
    80,
  );
  const elapsed = formatElapsed(elapsedMs);
  const tokens = formatRunStatusTokens(effective.tokens);
  const chars: RunStatusTextChar[] = [];
  appendRunStatusChars(chars, spinner, "yellow", true);
  appendRunStatusChars(chars, " ", "yellow", true);
  appendRunStatusChars(chars, label, "yellow");
  appendRunStatusChars(
    chars,
    ` (${elapsed}${tokens ? ` · ${tokens}` : " · tokens pending"})`,
    "gray",
  );
  return fitRunStatusChars(chars, width);
}

function appendRunStatusChars(
  target: RunStatusTextChar[],
  text: string,
  color: UiColor,
  bold = false,
) {
  for (const char of text) target.push({ char, color, bold });
}

function fitRunStatusChars(
  chars: RunStatusTextChar[],
  width: number,
): RunStatusTextChar[] {
  if (visualWidth(runStatusCharsText(chars)) <= width) return chars;
  const limit = Math.max(1, width - 1);
  const fitted: RunStatusTextChar[] = [];
  let used = 0;
  for (const cell of chars) {
    const cellWidth = isWideChar(cell.char) ? 2 : 1;
    if (used + cellWidth > limit) break;
    fitted.push(cell);
    used += cellWidth;
  }
  fitted.push({ char: "…", color: "gray" });
  return fitted;
}

function runStatusActiveIndex(chars: RunStatusTextChar[], now: number): number {
  const highlightable = chars
    .map((cell, index) => (/\S/u.test(cell.char) ? index : -1))
    .filter((index) => index >= 0);
  if (highlightable.length === 0) return -1;
  return (
    highlightable[
      Math.floor(now / RUN_STATUS_ANIMATION_MS) % highlightable.length
    ] ?? -1
  );
}

function runStatusCharColor(
  theme: TuiTheme,
  cell: RunStatusTextChar,
  index: number,
  activeIndex: number,
): string {
  return index === activeIndex
    ? RUN_STATUS_HIGHLIGHT_COLOR
    : tone(theme, cell.color);
}

function runStatusCharsText(chars: RunStatusTextChar[]): string {
  return chars.map((cell) => cell.char).join("");
}

const ANSI_RESET = "\x1b[39m";
const ANSI_INVERSE = "\x1b[7m";
const ANSI_INVERSE_OFF = "\x1b[27m";

function ansiColor(hex: string): string {
  const match = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return "";
  const value = match[1]!;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function fitVisualWidth(text: string, width: number): string {
  if (visualWidth(text) <= width) return text;
  const limit = Math.max(1, width - 1);
  let output = "";
  let used = 0;
  for (const char of text) {
    const charWidth = isWideChar(char) ? 2 : 1;
    if (used + charWidth > limit) break;
    output += char;
    used += charWidth;
  }
  return `${output}…`;
}

function padVisual(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - visualWidth(text)));
}

function filteredCommands(filter: string): CommandDefinition[] {
  if (!filter) return COMMANDS;
  const lower = filter.toLowerCase();
  return COMMANDS.filter(
    (command) =>
      command.name.startsWith(lower) || command.label.includes(lower),
  );
}

function restoreSessionTranscriptItems(
  context: SessionContext | undefined,
  target: SessionSummary,
): TranscriptItem[] {
  const runEntries =
    context?.entries.filter(
      (
        entry,
      ): entry is Extract<SessionContext["entries"][number], { type: "run" }> =>
        entry.type === "run",
    ) ?? [];
  const restored: TranscriptItem[] = [];

  for (const entry of runEntries) {
    if (entry.prompt) {
      restored.push({
        id: crypto.randomUUID(),
        kind: "user",
        text: entry.prompt,
      });
    }
    if (entry.summary) {
      appendRestoredTextItems(
        restored,
        entry.status === "failed" ? "error" : "assistant",
        entry.summary,
      );
    } else if (entry.status !== "completed") {
      restored.push({
        id: crypto.randomUUID(),
        kind: "status",
        text: `Run${entry.attempt ? ` attempt ${entry.attempt}` : ""} is ${entry.status}.`,
      });
    }
  }

  if (restored.length === 0) {
    if (target.prompt)
      restored.push({
        id: crypto.randomUUID(),
        kind: "user",
        text: target.prompt,
      });
    if (target.summary) {
      appendRestoredTextItems(
        restored,
        target.status === "failed" ? "error" : "assistant",
        target.summary,
      );
    }
  }

  const restoredTurns = restored.filter((item) => item.kind === "user").length;
  const statusParts = [
    `Resumed session ${target.sessionId.slice(0, 8)} (${context?.status ?? target.status})`,
    restoredTurns > 0
      ? `restored ${restoredTurns} turn${restoredTurns === 1 ? "" : "s"}`
      : "no recorded turns found",
    context?.truncated ? "latest records only" : "",
  ].filter(Boolean);
  const statusItem: TranscriptItem = {
    id: crypto.randomUUID(),
    kind: "status",
    text: statusParts.join(" · "),
  };

  return [statusItem, ...restored].map(normalizeTranscriptItem);
}

function appendRestoredTextItems(
  items: TranscriptItem[],
  kind: "assistant" | "error",
  text: string,
) {
  for (const chunk of chunkRestoredText(text)) {
    items.push({
      id: crypto.randomUUID(),
      kind,
      text: chunk,
    });
  }
}

function chunkRestoredText(text: string): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join("\n"));
    current = [];
    currentChars = 0;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const lineParts =
      rawLine.length > RESTORED_TEXT_CHUNK_CHAR_LIMIT
        ? splitLongRestoredLine(rawLine)
        : [rawLine];
    for (const line of lineParts) {
      if (
        current.length >= RESTORED_TEXT_CHUNK_LINE_LIMIT ||
        currentChars + line.length > RESTORED_TEXT_CHUNK_CHAR_LIMIT
      ) {
        flush();
      }
      current.push(line);
      currentChars += line.length + 1;
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [text];
}

function splitLongRestoredLine(line: string): string[] {
  const chunks: string[] = [];
  for (
    let index = 0;
    index < line.length;
    index += RESTORED_TEXT_CHUNK_CHAR_LIMIT
  ) {
    chunks.push(line.slice(index, index + RESTORED_TEXT_CHUNK_CHAR_LIMIT));
  }
  return chunks;
}

function normalizeTranscriptItem(item: TranscriptItem): TranscriptItem {
  const text =
    item.kind === "assistant" && !item.streaming
      ? normalizeAssistantText(item.text)
      : item.text;
  const next = text === item.text ? item : { ...item, text };
  if (next.collapsed !== undefined) return next;
  return isTranscriptItemAutoCollapsed(next)
    ? { ...next, collapsed: true }
    : next;
}

function normalizeTranscriptItemForFoldPreference(
  item: TranscriptItem,
  preference: boolean | null,
): TranscriptItem {
  const normalized = normalizeTranscriptItem(item);
  if (preference === null || !isTranscriptItemCollapsible(normalized)) {
    return normalized;
  }
  return normalized.collapsed === preference
    ? normalized
    : { ...normalized, collapsed: preference };
}

function normalizeTranscriptItemsForFoldPreference(
  items: TranscriptItem[],
  preference: boolean | null,
): TranscriptItem[] {
  let changed = false;
  const normalized = items.map((item) => {
    const next = normalizeTranscriptItemForFoldPreference(item, preference);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? normalized : items;
}

function transcriptPatchChangesItem(
  item: TranscriptItem,
  patch: Partial<TranscriptItem>,
): boolean {
  return Object.entries(patch).some(
    ([key, value]) => !Object.is(item[key as keyof TranscriptItem], value),
  );
}

function sameTokenUsage(
  left: TokenUsageSnapshot,
  right: TokenUsageSnapshot,
): boolean {
  return (
    left.input === right.input &&
    left.output === right.output &&
    left.cacheRead === right.cacheRead &&
    left.cacheWrite === right.cacheWrite &&
    left.total === right.total
  );
}

function draftMetricsFromWindow(
  draft: string,
  draftWindow: DraftWindow,
): DraftMetrics {
  return {
    empty: draft.length === 0,
    lineCount: draftWindowDisplayLines(draftWindow).length,
    hiddenAbove: draftWindow.hiddenAbove,
    hiddenBelow: draftWindow.hiddenBelow,
  };
}

function sameDraftMetrics(left: DraftMetrics, right: DraftMetrics): boolean {
  return (
    left.empty === right.empty &&
    left.lineCount === right.lineCount &&
    left.hiddenAbove === right.hiddenAbove &&
    left.hiddenBelow === right.hiddenBelow
  );
}

function samePetSnapshot(
  left: ReadonlyArray<PetWatcherSnapshotItem>,
  right: ReadonlyArray<PetWatcherSnapshotItem>,
): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      !!other &&
      item.kind === other.kind &&
      item.text === other.text &&
      item.toolName === other.toolName &&
      item.toolStatus === other.toolStatus &&
      item.workerStatus === other.workerStatus
    );
  });
}

function isTranscriptItemCollapsible(item: TranscriptItem): boolean {
  if (item.streaming) return false;
  if (item.kind === "tool") return true;
  if (item.kind === "report") return true;
  return isTranscriptItemAutoCollapsed({
    ...item,
    text:
      item.kind === "assistant" ? normalizeAssistantText(item.text) : item.text,
  });
}

function isTranscriptItemAutoCollapsed(item: TranscriptItem): boolean {
  if (item.streaming) return false;
  if (item.kind === "tool") return true;
  if (item.kind === "report") return true;
  if (!["assistant", "panel", "help", "error"].includes(item.kind))
    return false;
  const lines = item.text.split(/\r?\n/);
  return (
    lines.length >= COLLAPSIBLE_TEXT_LINE_THRESHOLD ||
    item.text.length >= COLLAPSIBLE_TEXT_CHAR_THRESHOLD
  );
}

function layoutTranscriptItems(
  items: TranscriptItem[],
  width: number,
): {
  entries: TranscriptRenderEntry[];
  totalRows: number;
} {
  const entries: TranscriptRenderEntry[] = [];
  let row = 0;

  for (let index = 0; index < items.length; index++) {
    const previous =
      index > 0 ? normalizeTranscriptItem(items[index - 1]!) : undefined;
    const normalized = normalizeTranscriptItem(items[index]!);
    const collapsible = isTranscriptItemCollapsible(normalized);
    const displayText = normalized.collapsed
      ? collapseTranscriptText(normalized.text).text
      : normalized.text;
    const item =
      displayText === normalized.text
        ? normalized
        : { ...normalized, text: displayText };
    const continuation = previous
      ? isTranscriptContinuation(previous, item)
      : false;
    const showDivider = index > 0 && !continuation;
    const rowStart = row;
    if (showDivider) row += 1;
    const mainRows = estimateTranscriptItemRows(
      item,
      width,
      continuation,
      collapsible,
    );
    const supplementRows = estimateTranscriptSupplementRows(item, width);
    const itemRows = mainRows + supplementRows;
    row += itemRows + 1;
    entries.push({
      item,
      index,
      continuation,
      showDivider,
      collapsible,
      rowStart,
      rowEnd: row,
    });
  }

  return { entries, totalRows: row };
}

function viewportTranscriptLayout(
  layout: {
    entries: TranscriptRenderEntry[];
    totalRows: number;
  },
  viewportRows: number,
  requestedScrollTop: number | null,
): {
  entries: TranscriptRenderEntry[];
  scrollTop: number;
  maxScrollTop: number;
  viewportRows: number;
} {
  const height = Math.max(1, viewportRows);
  const maxScrollTop = Math.max(0, layout.totalRows - height);
  const requested = requestedScrollTop ?? maxScrollTop;
  const rawScrollTop = clamp(requested, 0, maxScrollTop);
  const first = layout.entries.find((entry) => entry.rowEnd > rawScrollTop);
  const scrollTop = first
    ? clamp(first.rowStart, 0, maxScrollTop)
    : rawScrollTop;
  const viewportEnd = scrollTop + height;
  const entries = layout.entries.filter(
    (entry) => entry.rowEnd > scrollTop && entry.rowStart < viewportEnd,
  );

  return { entries, scrollTop, maxScrollTop, viewportRows: height };
}

function transcriptScrollAnchors(
  layout: { entries: TranscriptRenderEntry[]; totalRows: number },
  maxScrollTop: number,
): number[] {
  const anchors = new Set<number>([0, maxScrollTop]);
  for (const entry of layout.entries) {
    anchors.add(clamp(entry.rowStart, 0, maxScrollTop));
  }
  return Array.from(anchors).sort((left, right) => left - right);
}

function nextTranscriptScrollTop(
  currentTop: number,
  deltaRows: number,
  anchors: number[],
  maxScrollTop: number,
): number {
  const current = clamp(Math.round(currentTop), 0, maxScrollTop);
  const target = clamp(Math.round(current + deltaRows), 0, maxScrollTop);
  if (target === current) return current;
  const orderedAnchors = anchors.length > 0 ? anchors : [0, maxScrollTop];

  if (deltaRows > 0) {
    const targetAnchor = orderedAnchors
      .filter((anchor) => anchor > current && anchor <= target)
      .at(-1);
    if (targetAnchor !== undefined) return targetAnchor;
    return orderedAnchors.find((anchor) => anchor > current) ?? maxScrollTop;
  }

  const targetAnchor = orderedAnchors.find(
    (anchor) => anchor >= target && anchor < current,
  );
  if (targetAnchor !== undefined) return targetAnchor;
  return orderedAnchors.filter((anchor) => anchor < current).at(-1) ?? 0;
}

function estimateFixedFrameRows({
  brainPanel,
  intentPanel,
  sessionPanel,
  hookPanel,
  mcpPanel,
  overlay,
  commandMatchRows,
  fileMatchRows,
  sessionMatchRows,
  decisionPanel,
  runtimeErrorPanel,
  draftMetrics,
  running,
}: {
  brainPanel: BrainPanelState | null;
  intentPanel: IntentPanelState | null;
  sessionPanel: SessionPanelState | null;
  hookPanel: HookPanelState | null;
  mcpPanel: McpPanelState | null;
  overlay: Overlay;
  commandMatchRows: number;
  fileMatchRows: number;
  sessionMatchRows: number;
  decisionPanel: DecisionPanelState | null;
  runtimeErrorPanel: RuntimeErrorPanelState | null;
  draftMetrics: DraftMetrics;
  running: boolean;
}): number {
  // Header border with two metadata rows plus the bottom margin.
  let rows = 5;

  if (brainPanel)
    rows += borderedPanelRows(
      2 + brainPanel.brains.length * 2 + (brainPanel.message ? 1 : 0),
    );
  if (intentPanel) rows += borderedPanelRows(8);
  if (sessionPanel)
    rows += borderedPanelRows(
      2 + sessionPanel.entries.length * 2 + (sessionPanel.message ? 1 : 0),
    );
  if (hookPanel)
    rows += borderedPanelRows(
      2 + hookPanel.entries.length * 2 + (hookPanel.message ? 1 : 0),
    );
  if (mcpPanel)
    rows += borderedPanelRows(
      2 + mcpPanel.entries.length * 2 + (mcpPanel.message ? 1 : 0),
    );

  if (overlay?.kind === "command")
    rows += borderedPanelRows(commandMatchRows + 2);
  if (overlay?.kind === "file") rows += borderedPanelRows(fileMatchRows + 2);
  if (overlay?.kind === "session")
    rows += borderedPanelRows(sessionMatchRows + 2);

  if (decisionPanel) {
    rows += borderedPanelRows(
      3 + decisionPanel.options.length + (decisionPanel.argsSummary ? 1 : 0),
    );
  }
  if (runtimeErrorPanel) {
    rows += borderedPanelRows(
      2 + runtimeErrorPanel.message.split(/\r?\n/).length,
    );
  }

  rows += 1;
  rows += 2;
  if (running) rows += 1;
  if (draftMetrics.hiddenAbove > 0) rows += 1;
  rows += draftMetrics.lineCount;
  if (draftMetrics.hiddenBelow > 0) rows += 1;

  return rows;
}

function estimateFooterRows(
  queueLength: number,
  toast: ToastState | null,
): number {
  const footerLeftRows = 1 + (queueLength > 0 ? 1 : 0) + (toast ? 3 : 0);
  return Math.max(3, footerLeftRows);
}

function borderedPanelRows(contentRows: number): number {
  return contentRows + 3;
}

function isTranscriptContinuation(
  previous: TranscriptItem,
  item: TranscriptItem,
): boolean {
  if (previous.kind === "tool" && item.kind === "tool") {
    return previous.toolCategory === item.toolCategory;
  }
  return false;
}

function estimateTranscriptItemRows(
  item: TranscriptItem,
  width: number,
  continuation: boolean,
  collapsible: boolean,
): number {
  if (item.kind === "user") {
    return rightAlignTranscriptRows(item.text, width, 6).length;
  }
  if (item.kind === "tool") return 1;
  if (isMarkdownTranscriptItem(item)) {
    const line = transcriptPlainLine(
      { ...item, text: renderTranscriptMarkdownPlain(item.text, width) },
      continuation,
      collapsible,
    );
    return wrapByVisualWidth(line, Math.max(20, width)).length;
  }
  const line = transcriptPlainLine(item, continuation, collapsible);
  return wrapByVisualWidth(line, Math.max(20, width)).length;
}

function estimateTranscriptSupplementRows(
  item: TranscriptItem,
  width: number,
): number {
  let rows = 0;
  if (item.kind === "tool" && !item.collapsed && item.toolArgs) {
    for (const [key, value] of Object.entries(item.toolArgs)) {
      rows += countWrappedRows(
        `↳ ${formatToolArgLine(key, value)}`,
        Math.max(10, width - 2),
      );
    }
  }
  if (item.kind === "tool" && !item.collapsed && item.toolDetail) {
    rows += countWrappedRows(`↳ ${item.toolDetail}`, Math.max(10, width - 2));
  }
  if (item.plan) {
    rows += countWrappedRows(formatPlanMetadataLine(item.plan), width);
    rows += countWrappedRows(formatPlanWorkersBudgetLine(item.plan), width);
    if (item.plan.routing.reason) {
      rows += countWrappedRows(
        `reason: ${truncate(cleanInline(item.plan.routing.reason), 140)}`,
        width,
      );
    }
    for (const todo of item.plan.todos) {
      rows += countWrappedRows(
        `${todoGlyph(todo.status)} ${todo.role} · ${todo.title}`,
        Math.max(10, width - 2),
      );
    }
  }
  if (item.kind === "report" && item.finalReport && !item.collapsed) {
    for (const line of formatTuiFinalReportSections(item.finalReport)) {
      rows += countWrappedRows(line, Math.max(10, width - 2));
    }
  }
  if (item.editPreview) {
    rows += countWrappedRows(
      `Edit ${item.editPreview.filePath}`,
      Math.max(10, width - 2),
    );
    const verb = item.editPreview.created
      ? "File created."
      : item.editPreview.deleted
        ? "File deleted."
        : "File edited.";
    const summary = item.editPreview.success
      ? `↳ Succeeded. ${verb} (+${item.editPreview.added} added, -${item.editPreview.removed} removed)`
      : `↳ Failed. (+${item.editPreview.added} would have been added, -${item.editPreview.removed} would have been removed)`;
    rows += countWrappedRows(summary, Math.max(10, width - 2));
    if (item.editPreview.binary) {
      rows += countWrappedRows(
        " (binary or oversized file — diff not rendered)",
        Math.max(10, width - 2),
      );
    }
    for (const hunk of item.editPreview.hunks) {
      if (hunk.unchangedAbove > 0) rows += 1;
      rows += hunk.rows.reduce(
        (sum, row) =>
          sum +
          countWrappedRows(
            editPreviewRowEstimateText(row),
            Math.max(10, width - 2),
          ),
        0,
      );
    }
    if (item.editPreview.truncated) rows += 1;
  }
  return rows;
}

function transcriptPlainLine(
  item: TranscriptItem,
  continuation: boolean,
  collapsible: boolean,
): string {
  const fold = collapsible ? (item.collapsed ? "▸ " : "▾ ") : "";
  if (item.kind === "tool") {
    const category = item.toolCategory ?? "tool";
    const prefix = continuation
      ? ` ↳ [${toolCategoryTitle(category)}]`
      : `[TOOL] · [${toolCategoryTitle(category)}]`;
    return `${prefix} ${fold}${item.text}`;
  }
  if (item.kind === "decision") {
    const category = item.toolCategory ?? "tool";
    const status = item.decisionStatus ?? "pending";
    return `[ASK] · [${toolCategoryTitle(category)}] · ${status.toUpperCase()} ${item.text}`;
  }
  const badge = transcriptBadge(item);
  return `${fold}[${badge.label}] ${item.text}`;
}

function isMarkdownTranscriptItem(item: TranscriptItem): boolean {
  return (item.kind === "assistant" && !item.streaming) || item.kind === "help";
}

function renderTranscriptMarkdown(text: string, width: number): string {
  return renderMarkdown(text, {
    width: Math.max(20, width),
    hyperlinks: false,
    codeGutter: false,
    codeWrap: true,
    tableBorder: "unicode",
  }).trimEnd();
}

function renderTranscriptMarkdownPlain(text: string, width: number): string {
  return stripMarkdown(text, {
    width: Math.max(20, width),
    hyperlinks: false,
    codeGutter: false,
    codeWrap: true,
    tableBorder: "unicode",
  }).trimEnd();
}

function collapseTranscriptText(text: string): {
  text: string;
  hiddenLines: number;
} {
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let nonCodeLines = 0;
  let hiddenLines = 0;
  let markerIndex: number | null = null;
  let inFence = false;

  for (const line of lines) {
    const isFence = /^\s*```/.test(line);
    if (inFence) {
      output.push(line);
      if (isFence) inFence = false;
      continue;
    }
    if (isFence) {
      output.push(line);
      inFence = true;
      continue;
    }
    if (nonCodeLines < COLLAPSED_TEXT_LINE_LIMIT) {
      output.push(line);
      nonCodeLines++;
      continue;
    }
    hiddenLines++;
    if (markerIndex === null) {
      markerIndex = output.length;
      output.push("");
    }
  }

  if (markerIndex !== null) {
    output[markerIndex] =
      `... ${hiddenLines} non-code line${hiddenLines === 1 ? "" : "s"} collapsed`;
  }

  return { text: output.join("\n"), hiddenLines };
}

function normalizeAssistantText(text: string): string {
  const result = parseWorkerResultEnvelope(text);
  return result ? formatWorkerResultEnvelope(result) : text;
}

function parseWorkerResultEnvelope(
  text: string,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? sliceJsonObject(trimmed);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const record = parsed as Record<string, unknown>;
    if (
      !("taskId" in record) ||
      !("summary" in record) ||
      !("progress" in record)
    )
      return null;
    return record;
  } catch {
    return null;
  }
}

function formatWorkerResultEnvelope(record: Record<string, unknown>): string {
  const progress =
    record.progress && typeof record.progress === "object"
      ? (record.progress as Record<string, unknown>)
      : undefined;
  const status =
    typeof progress?.status === "string" ? progress.status : "completed";
  const progressSummary =
    typeof progress?.summary === "string" ? cleanInline(progress.summary) : "";
  const summary =
    typeof record.summary === "string" ? record.summary.trim() : "";
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  const risks = Array.isArray(record.risks)
    ? record.risks.filter(
        (risk): risk is string =>
          typeof risk === "string" && risk.trim().length > 0,
      )
    : [];
  const lines: string[] = [
    `Worker result · ${status}${progressSummary ? ` · ${progressSummary}` : ""}`,
  ];
  if (summary) lines.push("", summary);
  const findingLabels = artifacts
    .map((artifact) =>
      artifact && typeof artifact === "object"
        ? (artifact as { kind?: unknown; label?: unknown }).label
        : undefined,
    )
    .filter(
      (label): label is string =>
        typeof label === "string" && label.trim().length > 0,
    );
  if (findingLabels.length > 0) {
    lines.push("", "Findings:");
    for (const label of findingLabels.slice(0, 8))
      lines.push(`- ${label.trim()}`);
    if (findingLabels.length > 8)
      lines.push(`- ... ${findingLabels.length - 8} more`);
  }
  if (risks.length > 0) {
    lines.push("", "Risks:");
    for (const risk of risks.slice(0, 4)) lines.push(`- ${risk.trim()}`);
    if (risks.length > 4) lines.push(`- ... ${risks.length - 4} more`);
  }
  return lines.join("\n").trim();
}

function sliceJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

function consumeMouseInput(input: string): {
  scrolls: number[];
  rest: string;
} {
  const scrolls: number[] = [];
  const regex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
  let match: RegExpExecArray | null;
  let consumedUntil = 0;
  while ((match = regex.exec(input))) {
    consumedUntil = regex.lastIndex;
    const code = Number(match[1]);
    const action = match[4];
    const button = code & 3;
    const isWheel = (code & 64) === 64;
    if (action === "M" && isWheel) {
      if (button === 0) scrolls.push(-1);
      if (button === 1) scrolls.push(1);
      continue;
    }
  }
  const rest =
    consumedUntil > 0
      ? input.slice(consumedUntil)
      : input.slice(Math.max(0, input.length - 32));
  return { scrolls, rest };
}

function isMouseInput(input: string): boolean {
  // Ink strips the leading ESC (treating it as an Escape key press) before
  // dispatching to useInput, leaving orphaned SGR sequences like `[<0;96;22M`.
  // Match both the raw (`\x1b[<...`) and stripped (`[<...`) forms.
  return /\x1b?\[<\d+;\d+;\d+[Mm]/.test(input);
}

function computeOverlay(
  draft: string,
  cursor: number,
  current: Overlay,
): Overlay {
  const head = draft.slice(0, cursor);
  if (draft.startsWith("/") && !head.includes(" ")) {
    const filter = head.slice(1);
    const previous = current?.kind === "command" ? current.selected : 0;
    return { kind: "command", filter, selected: Math.max(0, previous) };
  }
  const ref = lastReferenceTrigger(head);
  if (ref) {
    const segment = head.slice(ref.anchor + ref.marker.length);
    if (!segment.includes(" ")) {
      if (ref.marker === "@@") {
        const previous = current?.kind === "session" ? current.selected : 0;
        return {
          kind: "session",
          filter: segment,
          selected: previous,
          anchor: ref.anchor,
        };
      }
      const previous = current?.kind === "file" ? current.selected : 0;
      return {
        kind: "file",
        filter: segment,
        selected: previous,
        anchor: ref.anchor,
      };
    }
  }
  return null;
}

function sameOverlay(left: Overlay, right: Overlay): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.kind !== right.kind) return false;
  if (left.filter !== right.filter || left.selected !== right.selected)
    return false;
  if (left.kind === "command" && right.kind === "command") return true;
  if (left.kind === "file" && right.kind === "file")
    return left.anchor === right.anchor;
  if (left.kind === "session" && right.kind === "session")
    return left.anchor === right.anchor;
  return false;
}

function lastReferenceTrigger(
  head: string,
): { anchor: number; marker: "@" | "@@" } | null {
  for (let index = head.length - 1; index >= 0; index--) {
    const ch = head[index];
    if (ch === " ") return null;
    if (ch === "@") {
      if (index > 0 && head[index - 1] === "@") {
        const anchor = index - 1;
        if (anchor === 0 || head[anchor - 1] === " ")
          return { anchor, marker: "@@" };
        return null;
      }
      if (index === 0 || head[index - 1] === " ")
        return { anchor: index, marker: "@" };
      return null;
    }
  }
  return null;
}

function sessionSearchText(entry: SessionSummary): string {
  return [
    entry.sessionId,
    entry.sessionId.slice(0, 8),
    entry.prompt,
    entry.summary,
    entry.role,
    entry.brainId,
    entry.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterSessions(
  sessions: SessionSummary[],
  filter: string,
  limit: number,
): SessionSummary[] {
  if (!filter) return sessions.slice(0, limit);
  const lower = filter.toLowerCase();
  return sessions
    .filter((entry) => sessionSearchText(entry).includes(lower))
    .slice(0, limit);
}

function parsePlanCommandArgument(
  argument: string,
): PlanCommandArgument | { error: string } {
  const tokens = argument.trim().split(/\s+/).filter(Boolean);
  let useRouterBrain = true;
  let parsingFlags = true;
  const promptParts: string[] = [];

  for (const token of tokens) {
    if (parsingFlags && token === "--") {
      parsingFlags = false;
      continue;
    }
    if (parsingFlags && (token === "--router" || token === "--route-brain")) {
      useRouterBrain = true;
      continue;
    }
    if (parsingFlags && (token === "--heuristic" || token === "--no-router")) {
      useRouterBrain = false;
      continue;
    }
    if (parsingFlags && token.startsWith("--")) {
      return {
        error: `Unknown /plan flag '${token}'. Usage: /plan [--heuristic] <prompt>`,
      };
    }
    parsingFlags = false;
    promptParts.push(token);
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) return { error: "Usage: /plan [--heuristic] <prompt>" };

  return {
    prompt,
    useRouterBrain,
    displayText: useRouterBrain
      ? `/plan ${prompt}`
      : `/plan --heuristic ${prompt}`,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function frameContentWidth(terminalCols: number): number {
  return Math.max(20, terminalCols - FRAME_RESERVED_COLUMNS);
}

function inputTextWidth(terminalCols: number): number {
  return Math.max(
    20,
    frameContentWidth(terminalCols) - INPUT_BOX_HORIZONTAL_CHROME,
  );
}

function composeDraftLine(draft: string): string {
  return `${INPUT_PROMPT_PREFIX}${draft}`;
}

function wrapByVisualWidth(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  for (const char of text) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      currentWidth = 0;
      continue;
    }
    const charWidth = isWideChar(char) ? 2 : 1;
    if (currentWidth + charWidth > width) {
      lines.push(current);
      current = "";
      currentWidth = 0;
    }
    current += char;
    currentWidth += charWidth;
  }
  lines.push(current);
  return lines;
}

function countWrappedRows(text: string, width: number): number {
  return wrapByVisualWidth(text, Math.max(1, width)).length;
}

function editPreviewRowEstimateText(row: EditRow): string {
  const marker =
    row.kind === "removed" ? "-" : row.kind === "added" ? "+" : " ";
  return `000 000 ${marker} ${row.text}`;
}

function visualWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += isWideChar(char) ? 2 : 1;
  }
  return width;
}

function rightAlignTranscriptRows(
  text: string,
  width: number,
  firstLinePrefixWidth: number,
): Array<{ padding: string; line: string; first: boolean }> {
  const lineWidth = Math.max(20, width);
  const available = Math.max(8, lineWidth - firstLinePrefixWidth);
  const bubbleWidth = Math.max(
    8,
    Math.min(available, Math.floor(lineWidth * 0.72)),
  );
  return wrapByVisualWidth(text, bubbleWidth).map((line, index) => {
    const occupied =
      visualWidth(line) + (index === 0 ? firstLinePrefixWidth : 0);
    return {
      padding: " ".repeat(Math.max(0, lineWidth - occupied)),
      line,
      first: index === 0,
    };
  });
}

function locateCursorRow(text: string, cursor: number, width: number): number {
  if (width <= 0) return 0;
  let row = 0;
  let col = 0;
  let index = 0;
  for (const char of text) {
    if (index >= cursor) return row;
    if (char === "\n") {
      row++;
      col = 0;
    } else {
      const w = isWideChar(char) ? 2 : 1;
      if (col + w > width) {
        row++;
        col = 0;
      }
      col += w;
    }
    index += char.length;
  }
  return row;
}

type DraftWindowLine = {
  text: string;
  cursorOffset: number | null;
};

type DraftWindow = {
  lines: DraftWindowLine[];
  hiddenAbove: number;
  hiddenBelow: number;
};

type DraftWrapResult = {
  lines: DraftWindowLine[];
  cursorRow: number;
};

function draftWindowDisplayLines(draftWindow: DraftWindow): DraftWindowLine[] {
  const lines = draftWindow.lines.slice(0, INPUT_MAX_LINES);
  while (lines.length < INPUT_MIN_LINES)
    lines.push({ text: "", cursorOffset: null });
  return lines;
}

function fitDraftWindowLine(
  line: DraftWindowLine,
  width: number,
): DraftWindowLine {
  if (line.cursorOffset === null) {
    return { ...line, text: fitVisualWidth(line.text, width) };
  }
  if (draftWindowLineWidth(line) <= width) return line;

  const chars = Array.from(line.text);
  const cursorOffset = clamp(line.cursorOffset, 0, chars.length);
  const limit = Math.max(1, width - 1);
  const fitted: string[] = [];
  let used = 0;
  for (let index = 0; index < chars.length; index++) {
    if (index === cursorOffset) break;
    const char = chars[index]!;
    const charWidth = isWideChar(char) ? 2 : 1;
    if (used + charWidth > limit) break;
    fitted.push(char);
    used += charWidth;
  }
  fitted.push("…");
  return { text: fitted.join(""), cursorOffset: fitted.length - 1 };
}

function draftWindowLineWidth(line: DraftWindowLine): number {
  if (line.cursorOffset === null) return visualWidth(line.text || " ");
  const chars = Array.from(line.text);
  const cursorOffset = clamp(line.cursorOffset, 0, chars.length);
  return visualWidth(line.text) + (cursorOffset >= chars.length ? 1 : 0);
}

function wrapDraftWindowLines(
  text: string,
  cursorOffset: number,
  width: number,
): DraftWrapResult {
  const safeWidth = Math.max(1, width);
  const lines: DraftWindowLine[] = [{ text: "", cursorOffset: null }];
  let row = 0;
  let col = 0;
  let index = 0;
  let cursorRow = 0;
  let cursorMarked = false;

  const currentLine = () => lines[row]!;
  const markCursor = () => {
    if (cursorMarked) return;
    if (col >= safeWidth && currentLine().text.length > 0) startNewLine();
    currentLine().cursorOffset = Array.from(currentLine().text).length;
    cursorRow = row;
    cursorMarked = true;
  };
  const startNewLine = () => {
    row += 1;
    col = 0;
    lines.push({ text: "", cursorOffset: null });
  };

  for (const char of text) {
    if (!cursorMarked && index >= cursorOffset) markCursor();
    if (char === "\n") {
      index += char.length;
      startNewLine();
      if (!cursorMarked && index >= cursorOffset) markCursor();
      continue;
    }

    const charWidth = isWideChar(char) ? 2 : 1;
    if (col + charWidth > safeWidth && currentLine().text.length > 0) {
      startNewLine();
      if (!cursorMarked && index >= cursorOffset) markCursor();
    }
    currentLine().text += char;
    col += charWidth;
    index += char.length;
  }

  if (!cursorMarked) markCursor();
  return { lines, cursorRow };
}

function Badge({
  label,
  backgroundColor,
}: {
  label: string;
  backgroundColor: UiColor;
}) {
  const theme = useTuiTheme();
  return (
    <Text color={tone(theme, backgroundColor)} bold>
      [{label}]
    </Text>
  );
}

function HeaderSeparator() {
  const theme = useTuiTheme();
  return (
    <Box flexDirection="column" marginRight={1}>
      <Text color={theme.colors.gray}>│</Text>
      <Text color={theme.colors.gray}>│</Text>
    </Box>
  );
}

function HeaderMetaLine({ label, value }: { label: string; value: string }) {
  const theme = useTuiTheme();
  return (
    <Text>
      <Text color={theme.colors.gray} bold>
        {label.padEnd(7)}
      </Text>
      <Text color={theme.colors.gray}> {value}</Text>
    </Text>
  );
}

function HeaderInfoLine({
  label,
  backgroundColor,
  value,
}: {
  label: string;
  backgroundColor: UiColor;
  value: string;
}) {
  const theme = useTuiTheme();
  return (
    <Text>
      <Badge label={label.padEnd(7)} backgroundColor={backgroundColor} />
      <Text color={theme.colors.gray}> {value}</Text>
    </Text>
  );
}

function DraftInputLine({
  line,
  color,
}: {
  line: DraftWindowLine;
  color: string;
}) {
  if (line.cursorOffset === null) {
    return (
      <Text color={color} wrap="truncate-end">
        {line.text || " "}
      </Text>
    );
  }

  const fitted = fitDraftWindowLine(line, Number.MAX_SAFE_INTEGER);
  const chars = Array.from(fitted.text);
  const cursorOffset = clamp(fitted.cursorOffset ?? 0, 0, chars.length);
  const before = chars.slice(0, cursorOffset).join("");
  const cursorChar = chars[cursorOffset] ?? " ";
  const after =
    cursorOffset < chars.length ? chars.slice(cursorOffset + 1).join("") : "";

  return (
    <Text wrap="truncate-end">
      <Text color={color}>{before}</Text>
      <Text color={color} inverse>
        {cursorChar}
      </Text>
      <Text color={color}>{after}</Text>
    </Text>
  );
}

function SectionDivider({
  label,
  color,
  width,
}: {
  label: string;
  color: UiColor;
  width: number;
}) {
  const theme = useTuiTheme();
  const line = "─".repeat(Math.max(1, width - label.length - 4));
  return (
    <Text>
      <Badge label={label} backgroundColor={color} />
      <Text color={tone(theme, color)}> {line}</Text>
    </Text>
  );
}

function ThinDivider({ width }: { width: number }) {
  const theme = useTuiTheme();
  return (
    <Text color={theme.colors.gray}>
      {"·".repeat(Math.max(8, Math.min(width, 120)))}
    </Text>
  );
}

function clipDraftToWindow(
  draft: string,
  cursor: number,
  width: number,
  maxLines: number,
): DraftWindow {
  const safeWidth = Math.max(1, width);
  const cursorPosition = clamp(cursor, 0, draft.length);
  const composed = composeDraftLine(draft).replace(/\r\n/g, "\n");
  const cursorOffsetInComposed = INPUT_PROMPT_PREFIX.length + cursorPosition;
  const wrapped = wrapDraftWindowLines(
    composed,
    cursorOffsetInComposed,
    safeWidth,
  );
  if (wrapped.lines.length <= maxLines) {
    return { lines: wrapped.lines, hiddenAbove: 0, hiddenBelow: 0 };
  }
  let start = Math.max(0, wrapped.cursorRow - Math.floor(maxLines / 2));
  let end = start + maxLines;
  if (end > wrapped.lines.length) {
    end = wrapped.lines.length;
    start = Math.max(0, end - maxLines);
  }
  if (wrapped.cursorRow < start) {
    start = wrapped.cursorRow;
    end = start + maxLines;
  } else if (wrapped.cursorRow >= end) {
    end = wrapped.cursorRow + 1;
    start = Math.max(0, end - maxLines);
  }
  return {
    lines: wrapped.lines.slice(start, end),
    hiddenAbove: start,
    hiddenBelow: wrapped.lines.length - end,
  };
}

function TranscriptLine({
  item,
  width,
  continuation = false,
  collapsible = false,
}: {
  item: TranscriptItem;
  width: number;
  continuation?: boolean;
  collapsible?: boolean;
}) {
  const theme = useTuiTheme();
  const foldGlyph = collapsible ? (item.collapsed ? "▸ " : "▾ ") : "";
  if (item.kind === "user") {
    const rows = rightAlignTranscriptRows(item.text, width, 6);
    return (
      <Box flexDirection="column">
        {rows.map((row, index) => (
          <Text key={index}>
            <Text>{row.padding}</Text>
            {row.first ? (
              <>
                <Badge label="YOU" backgroundColor="blue" />
                <Text> </Text>
              </>
            ) : null}
            <Text color={tone(theme, colorFor(item))}>{row.line || " "}</Text>
          </Text>
        ))}
      </Box>
    );
  }
  if (item.kind === "thinking") {
    return <ThinkingTranscriptLine />;
  }
  if (item.kind === "tool") {
    const category = item.toolCategory ?? "tool";
    if (continuation) {
      return (
        <Text>
          <Text color={theme.colors.gray}> ↳ </Text>
          <Text color={tone(theme, toolCategoryColor(category))} bold>
            [{toolCategoryTitle(category)}]
          </Text>
          <Text color={tone(theme, colorFor(item))}>
            {" "}
            {foldGlyph}
            {item.text}
          </Text>
        </Text>
      );
    }
    return (
      <Text>
        <Badge label="TOOL" backgroundColor="yellow" />
        <Text color={theme.colors.gray}> · </Text>
        <Text color={tone(theme, toolCategoryColor(category))} bold>
          [{toolCategoryTitle(category)}]
        </Text>
        <Text color={tone(theme, colorFor(item))}>
          {" "}
          {foldGlyph}
          {item.text}
        </Text>
      </Text>
    );
  }
  if (item.kind === "decision") {
    const category = item.toolCategory ?? "tool";
    const status = item.decisionStatus ?? "pending";
    const statusColor =
      status === "approved" ? "green" : status === "blocked" ? "red" : "yellow";
    return (
      <Text>
        <Badge label="ASK" backgroundColor="yellow" />
        <Text color={theme.colors.gray}> · </Text>
        <Text color={tone(theme, toolCategoryColor(category))} bold>
          [{toolCategoryTitle(category)}]
        </Text>
        <Text color={theme.colors.gray}> · </Text>
        <Text color={tone(theme, statusColor)} bold>
          {status.toUpperCase()}
        </Text>
        <Text color={tone(theme, colorFor(item))}> {item.text}</Text>
      </Text>
    );
  }
  const badge = transcriptBadge(item);
  if (isMarkdownTranscriptItem(item)) {
    return (
      <Text>
        {foldGlyph ? <Text color={theme.colors.gray}>{foldGlyph}</Text> : null}
        <Badge label={badge.label} backgroundColor={badge.color} />
        <Text> {renderTranscriptMarkdown(item.text, width)}</Text>
      </Text>
    );
  }
  return (
    <Text>
      {foldGlyph ? <Text color={theme.colors.gray}>{foldGlyph}</Text> : null}
      <Badge label={badge.label} backgroundColor={badge.color} />
      <Text color={tone(theme, colorFor(item))}> {item.text}</Text>
    </Text>
  );
}

function ThinkingTranscriptLine() {
  const theme = useTuiTheme();
  return (
    <Text>
      <Badge label="THINKING" backgroundColor="yellow" />
      <Text color={theme.colors.gray}> working</Text>
      <Text color={theme.colors.yellow}> ...</Text>
    </Text>
  );
}

function transcriptBadge(item: TranscriptItem): {
  label: string;
  color: UiColor;
} {
  switch (item.kind) {
    case "assistant":
      return { label: "BRAIN", color: "green" };
    case "error":
      return { label: "ERROR", color: "red" };
    case "status":
      return { label: "STATUS", color: "cyan" };
    case "help":
      return { label: "HELP", color: "yellow" };
    case "panel":
      return { label: "PANEL", color: "magenta" };
    case "report":
      return {
        label: "REPORT",
        color: finalReportStatusColor(item.finalReport?.status),
      };
    case "worker":
      return {
        label: "AGENT",
        color:
          item.workerStatus === "failed"
            ? "red"
            : item.workerStatus === "blocked"
              ? "yellow"
              : "magenta",
      };
    case "todo":
      return {
        label: "TODO",
        color:
          item.todoStatus === "failed" || item.todoStatus === "blocked"
            ? "red"
            : item.todoStatus === "completed"
              ? "green"
              : "yellow",
      };
    case "queued":
      return { label: "QUEUE", color: "yellow" };
    case "user":
      return { label: "YOU", color: "blue" };
    case "thinking":
      return { label: "THINKING", color: "yellow" };
    case "tool":
      return { label: "TOOL", color: "yellow" };
    case "decision":
      return { label: "ASK", color: "yellow" };
  }
}

function finalReportStatusColor(status: FinalReport["status"] | undefined): UiColor {
  if (status === "approved") return "green";
  if (status === "changes_requested") return "yellow";
  if (status === "blocked") return "red";
  return "cyan";
}

function padLineNum(value: number | null, width: number): string {
  if (value === null) return " ".repeat(width);
  const str = String(value);
  return str.length >= width ? str : " ".repeat(width - str.length) + str;
}

function EditPreviewView({ preview }: { preview: EditPreview }) {
  const theme = useTuiTheme();
  const headlineColor = preview.success ? "green" : "red";
  const verb = preview.created
    ? "File created."
    : preview.deleted
      ? "File deleted."
      : "File edited.";
  const summary = preview.success
    ? `Succeeded. ${verb} (+${preview.added} added, -${preview.removed} removed)`
    : `Failed. (+${preview.added} would have been added, -${preview.removed} would have been removed)`;
  const widthOld = Math.max(
    2,
    String(preview.removed + preview.added + 1).length,
  );
  const widthNew = widthOld;
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color={theme.colors.gray}>Edit {preview.filePath}</Text>
      <Text color={tone(theme, headlineColor)}>↳ {summary}</Text>
      {preview.binary ? (
        <Text color={theme.colors.gray}>
          {" "}
          (binary or oversized file — diff not rendered)
        </Text>
      ) : null}
      {preview.hunks.map((hunk, i) => (
        <Box key={i} flexDirection="column">
          {hunk.unchangedAbove > 0 ? (
            <Text color={theme.colors.gray}>
              {"  "}… {hunk.unchangedAbove} unchanged lines …
            </Text>
          ) : null}
          {hunk.rows.map((row, j) => (
            <EditRowLine
              key={j}
              row={row}
              widthOld={widthOld}
              widthNew={widthNew}
            />
          ))}
        </Box>
      ))}
      {preview.truncated ? (
        <Text color={theme.colors.gray}>
          {"  "}… {preview.hiddenLines} more lines …
        </Text>
      ) : null}
    </Box>
  );
}

function EditRowLine({
  row,
  widthOld,
  widthNew,
}: {
  row: EditRow;
  widthOld: number;
  widthNew: number;
}) {
  const theme = useTuiTheme();
  if (row.kind === "context") {
    return (
      <Text color={theme.colors.gray}>
        {padLineNum(row.oldLine, widthOld)} {padLineNum(row.newLine, widthNew)}{" "}
        {row.text}
      </Text>
    );
  }
  if (row.kind === "removed") {
    return (
      <Text color={theme.colors.red}>
        {padLineNum(row.oldLine, widthOld)} {padLineNum(null, widthNew)} -{" "}
        {row.text}
      </Text>
    );
  }
  return (
    <Text color={theme.colors.green}>
      {padLineNum(null, widthOld)} {padLineNum(row.newLine, widthNew)} +{" "}
      {row.text}
    </Text>
  );
}

function ToastView({ toast }: { toast: ToastState }) {
  const theme = useTuiTheme();
  const isError = toast.tone === "error";
  const color = isError ? "red" : "cyan";
  return (
    <Box borderStyle="single" borderColor={tone(theme, color)} paddingX={1}>
      <Text color={tone(theme, color)} bold={isError} wrap="truncate-end">
        {isError ? "Error: " : ""}
        {toast.text}
      </Text>
    </Box>
  );
}

function RuntimeStatusLine({
  status,
  width,
}: {
  status: RunStatusState;
  width: number;
}) {
  const theme = useTuiTheme();
  const now = Date.now();
  const chars = buildRunStatusChars(status, now, width);
  const activeIndex = runStatusActiveIndex(chars, now);

  return (
    <Text>
      {chars.map((cell, index) => (
        <Text
          key={`${index}-${cell.char}`}
          color={runStatusCharColor(theme, cell, index, activeIndex)}
          bold={cell.bold || index === activeIndex}
        >
          {cell.char}
        </Text>
      ))}
    </Text>
  );
}

const INTENT_BIT_UP = 1;
const INTENT_BIT_RIGHT = 2;
const INTENT_BIT_DOWN = 4;
const INTENT_BIT_LEFT = 8;

const INTENT_BIT_CHARS: Record<number, string> = {
  0: " ",
  1: "│",
  2: "─",
  3: "└",
  4: "│",
  5: "│",
  6: "┌",
  7: "├",
  8: "─",
  9: "┘",
  10: "─",
  11: "┴",
  12: "┐",
  13: "┤",
  14: "┬",
  15: "┼",
};

function cleanInline(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatRoutingSourceLabel(
  source: RuntimePlan["routing"]["source"],
): string {
  switch (source) {
    case "router-brain":
      return "routeBrain";
    case "heuristic":
      return "heuristic";
  }
}

function formatRoutingConfidence(plan: RuntimePlan): string | undefined {
  return typeof plan.routing.confidence === "number"
    ? `${Math.round(plan.routing.confidence * 100)}%`
    : undefined;
}

function formatRoutingDescriptor(plan: RuntimePlan): string {
  const parts = [formatRoutingSourceLabel(plan.routing.source)];
  const confidence = formatRoutingConfidence(plan);
  if (confidence) parts.push(`confidence ${confidence}`);
  return parts.join(" · ");
}

export function formatPlanPreviewSummary(plan: RuntimePlan): string {
  return `${plan.brain.id} → primary ${plan.role} → ${plan.piModel.provider}/${plan.piModel.id} · ${formatRoutingDescriptor(plan)}`;
}

export function formatPlanMetadataLine(plan: RuntimePlan): string {
  return `mode=${plan.mode} · primary=${plan.role} · model=${plan.piModel.provider}/${plan.piModel.id} · routing=${formatRoutingDescriptor(plan)} · tools=${plan.toolExecution}`;
}

export function formatPlanWorkersBudgetLine(plan: RuntimePlan): string {
  const workers = plan.workers
    .map((worker) =>
      worker.role === plan.role ? `${worker.role} (primary)` : worker.role,
    )
    .join(", ");
  const budget = [
    typeof plan.routing.maxWorkerAgents === "number"
      ? `workers ${plan.routing.maxWorkerAgents}`
      : "",
    typeof plan.routing.maxParallelAgents === "number"
      ? `parallel ${plan.routing.maxParallelAgents}`
      : "",
    typeof plan.routing.maxTodos === "number"
      ? `todos ${plan.routing.maxTodos}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");
  return `workers: ${workers || "(none)"}${budget ? ` · budget: ${budget}` : ""}`;
}

export function formatTuiFinalReportCompact(report: FinalReport): string {
  return [
    `Braincode Run Report · ${report.status}`,
    `${report.routing.source} → ${report.routing.primaryRole}`,
    `patch ${formatFinalReportPatchLabel(report)}`,
    `checks ${formatFinalReportChecksLabel(report)}`,
    `review ${report.review?.decision ?? "not run"}`,
    `session ${report.sessionId.slice(0, 8)}`,
  ].join(" · ");
}

export function formatTuiFinalReportSections(report: FinalReport): string[] {
  const lines = [
    `Task: ${report.task}`,
    `Brain: ${report.brain.name} / ${report.brain.mode}`,
    `Routing: ${report.routing.source} -> ${report.routing.primaryRole}${report.routing.confidence !== undefined ? ` (${Math.round(report.routing.confidence * 100)}%)` : ""}`,
    `Workers: ${report.routing.workers.map((worker) => `${worker.role} ${worker.status ?? worker.phase}`).join(", ") || "none"}`,
    `Patch: ${formatFinalReportPatchLabel(report)}`,
  ];
  if (report.patch?.changedFiles.length) {
    const changed = report.patch.changedFiles
      .slice(0, 6)
      .map((change) => `${change.status} ${change.path}`)
      .join(", ");
    lines.push(`Changed: ${changed}${report.patch.changedFiles.length > 6 ? `, +${report.patch.changedFiles.length - 6} more` : ""}`);
  }
  lines.push(`Checks: ${formatFinalReportChecksLabel(report)}`);
  if (report.checks?.results.length) {
    lines.push(`Check details: ${report.checks.results.map((result) => `${result.name} ${result.status}`).join(", ")}`);
  }
  lines.push(`Review: ${report.review?.decision ?? "not run"}`);
  if (report.review?.requiredChanges.length) {
    lines.push(`Required: ${report.review.requiredChanges.slice(0, 3).join("; ")}`);
  }
  if (report.todos.length) {
    lines.push(`Todos: ${report.todos.map((todo) => `${todo.status} ${todo.role}:${todo.title}`).join(" | ")}`);
  }
  if (report.warnings.length) {
    lines.push("Warnings:");
    lines.push(...report.warnings.map((warning) => `- ${warning}`));
  }
  return lines;
}

function formatFinalReportPatchLabel(report: FinalReport): string {
  if (!report.patch || report.patch.changedFiles.length === 0)
    return "no patch activity";
  return `${report.patch.changedFiles.length} file${report.patch.changedFiles.length === 1 ? "" : "s"}, +${report.patch.diffStats.insertions} -${report.patch.diffStats.deletions}`;
}

function formatFinalReportChecksLabel(report: FinalReport): string {
  if (!report.checks) return "not run";
  if (report.checks.results.length === 0) {
    return report.checks.reason ? `${report.checks.status} (${report.checks.reason})` : report.checks.status;
  }
  return `${report.checks.status} (${report.checks.results.map((result) => `${result.name} ${result.status}`).join(", ")})`;
}

function formatIntentGraphLines(plan: RuntimePlan, width: number): string[] {
  const confidence = formatRoutingConfidence(plan);
  const workerLabels = plan.workers.map((worker) =>
    worker.role === plan.role ? `${worker.role} (primary)` : worker.role,
  );
  const budgetParts = [
    typeof plan.routing.maxWorkerAgents === "number"
      ? `workers ${plan.routing.maxWorkerAgents}`
      : "",
    typeof plan.routing.maxParallelAgents === "number"
      ? `parallel ${plan.routing.maxParallelAgents}`
      : "",
    typeof plan.routing.maxTodos === "number"
      ? `todos ${plan.routing.maxTodos}`
      : "",
  ].filter(Boolean);
  const header = [
    ...wrapIntentLine(
      `Intent · ${plan.brain.name || plan.brain.id} (${plan.brain.id})`,
      width,
    ),
    ...wrapIntentLine(
      `Mode · ${plan.mode} — ${plan.modeDescription}`,
      width,
      "       ",
    ),
    ...wrapIntentLine(`Primary · ${plan.role}`, width),
    ...wrapIntentLine(
      `Routing · ${formatRoutingSourceLabel(plan.routing.source)}`,
      width,
    ),
    ...(confidence ? wrapIntentLine(`Confidence · ${confidence}`, width) : []),
    ...(plan.routing.reason
      ? wrapIntentLine(
          `Reason · ${cleanInline(plan.routing.reason)}`,
          width,
          "         ",
        )
      : []),
    ...wrapIntentLine(
      `Workers · ${workerLabels.join(", ")}`,
      width,
      "          ",
    ),
    ...(budgetParts.length > 0
      ? wrapIntentLine(`Budget · ${budgetParts.join(", ")}`, width)
      : []),
    ...wrapIntentLine(
      `Model · ${plan.piModel.provider}/${plan.piModel.id}`,
      width,
    ),
    ...wrapIntentLine(`Tools · ${plan.toolExecution}`, width),
    "",
  ];
  if (plan.todos.length === 0) {
    return [
      ...header,
      ...wrapIntentLine(
        "(no subtasks yet — plan will populate after decomposition)",
        width,
      ),
    ];
  }

  const ROOT_ID = "__brain_root__";
  const todoById = new Map(plan.todos.map((todo) => [todo.id, todo]));
  const order: string[] = [ROOT_ID, ...plan.todos.map((todo) => todo.id)];

  const adjOut = new Map<string, string[]>();
  const adjIn = new Map<string, string[]>();
  for (const id of order) {
    adjOut.set(id, []);
    adjIn.set(id, []);
  }
  const explicitDeps: { from: string; to: string; reason?: string }[] = [];
  for (const dep of plan.dependencies) {
    if (!todoById.has(dep.fromTodoId) || !todoById.has(dep.toTodoId)) continue;
    adjOut.get(dep.fromTodoId)!.push(dep.toTodoId);
    adjIn.get(dep.toTodoId)!.push(dep.fromTodoId);
    explicitDeps.push({
      from: dep.fromTodoId,
      to: dep.toTodoId,
      reason: dep.reason,
    });
  }
  for (const todo of plan.todos) {
    if (adjIn.get(todo.id)!.length === 0) {
      adjOut.get(ROOT_ID)!.push(todo.id);
      adjIn.get(todo.id)!.push(ROOT_ID);
    }
  }

  const indeg = new Map<string, number>();
  for (const id of order) indeg.set(id, adjIn.get(id)!.length);
  const level = new Map<string, number>();
  for (const id of order) level.set(id, 0);
  const queue: string[] = [];
  for (const id of order) if (indeg.get(id) === 0) queue.push(id);
  const cycleNodes = new Set<string>();
  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    processed++;
    for (const next of adjOut.get(id)!) {
      level.set(next, Math.max(level.get(next)!, level.get(id)! + 1));
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next)! === 0) queue.push(next);
    }
  }
  if (processed < order.length) {
    for (const id of order) {
      if ((indeg.get(id) ?? 0) > 0) {
        cycleNodes.add(id);
        if ((level.get(id) ?? 0) === 0) level.set(id, 1);
      }
    }
  }

  const levels: string[][] = [];
  for (const id of order) {
    const lv = level.get(id)!;
    while (levels.length <= lv) levels.push([]);
    levels[lv].push(id);
  }

  const PAD_LEFT = 1;
  const GAP = 5;
  const maxLabelWidth = Math.max(
    18,
    Math.min(
      56,
      Math.floor(
        (width - PAD_LEFT - GAP * Math.max(0, levels.length - 1)) /
          Math.max(1, levels.length),
      ) - 1,
    ),
  );
  const labels = new Map<string, string>();
  labels.set(ROOT_ID, truncate(`● brain root (${plan.role})`, maxLabelWidth));
  for (const todo of plan.todos) {
    labels.set(
      todo.id,
      truncate(
        `${todoGlyph(todo.status)} ${todo.role}: ${cleanInline(todo.title)}`,
        maxLabelWidth,
      ),
    );
  }

  const ROW_STRIDE = 2;
  const rowOf = new Map<string, number>();
  levels[0].forEach((id, idx) => rowOf.set(id, idx * ROW_STRIDE));
  for (let lv = 1; lv < levels.length; lv++) {
    const sorted = [...levels[lv]].sort((a, b) => {
      const pa = adjIn.get(a)!.map((p) => rowOf.get(p) ?? 0);
      const pb = adjIn.get(b)!.map((p) => rowOf.get(p) ?? 0);
      const ma = pa.length ? pa.reduce((s, v) => s + v, 0) / pa.length : 0;
      const mb = pb.length ? pb.reduce((s, v) => s + v, 0) / pb.length : 0;
      return ma - mb;
    });
    levels[lv] = sorted;
    let cursor = -ROW_STRIDE;
    for (const id of sorted) {
      const parents = adjIn.get(id)!.map((p) => rowOf.get(p) ?? 0);
      const target = parents.length
        ? Math.round(parents.reduce((s, v) => s + v, 0) / parents.length)
        : 0;
      const aligned = target - (target % ROW_STRIDE);
      const row = Math.max(aligned, cursor + ROW_STRIDE);
      rowOf.set(id, row);
      cursor = row;
    }
  }

  const labelWidth = levels.map((ids) =>
    ids.reduce((m, id) => Math.max(m, labels.get(id)!.length), 0),
  );
  const colOfLevel: number[] = [];
  let cx = PAD_LEFT;
  for (let i = 0; i < levels.length; i++) {
    colOfLevel.push(cx);
    cx += labelWidth[i] + GAP;
  }
  const totalCols = Math.max(1, cx);
  const totalRows = Math.max(
    1,
    ...Array.from(rowOf.values()).map((r) => r + 1),
  );

  const grid: number[][] = Array.from({ length: totalRows }, () =>
    new Array(totalCols).fill(0),
  );
  const place = (row: number, col: number, bits: number) => {
    if (row < 0 || row >= totalRows || col < 0 || col >= totalCols) return;
    grid[row][col] |= bits;
  };
  const arrowAt: { row: number; col: number }[] = [];

  for (const fromId of order) {
    const fromLv = level.get(fromId)!;
    const fromRow = rowOf.get(fromId)!;
    const fromLabelEnd = colOfLevel[fromLv] + labels.get(fromId)!.length;
    for (const toId of adjOut.get(fromId)!) {
      const toLv = level.get(toId)!;
      if (toLv <= fromLv) continue;
      const toRow = rowOf.get(toId)!;
      const toLabelStart = colOfLevel[toLv];
      const connectorCol = toLabelStart - 3;
      for (let c = fromLabelEnd; c < connectorCol; c++)
        place(fromRow, c, INTENT_BIT_LEFT | INTENT_BIT_RIGHT);
      if (toRow === fromRow) {
        place(fromRow, connectorCol, INTENT_BIT_LEFT | INTENT_BIT_RIGHT);
      } else if (toRow > fromRow) {
        place(fromRow, connectorCol, INTENT_BIT_LEFT | INTENT_BIT_DOWN);
        for (let r = fromRow + 1; r < toRow; r++)
          place(r, connectorCol, INTENT_BIT_UP | INTENT_BIT_DOWN);
        place(toRow, connectorCol, INTENT_BIT_UP | INTENT_BIT_RIGHT);
      } else {
        place(fromRow, connectorCol, INTENT_BIT_LEFT | INTENT_BIT_UP);
        for (let r = toRow + 1; r < fromRow; r++)
          place(r, connectorCol, INTENT_BIT_UP | INTENT_BIT_DOWN);
        place(toRow, connectorCol, INTENT_BIT_DOWN | INTENT_BIT_RIGHT);
      }
      for (let c = connectorCol + 1; c < toLabelStart - 1; c++)
        place(toRow, c, INTENT_BIT_LEFT | INTENT_BIT_RIGHT);
      arrowAt.push({ row: toRow, col: toLabelStart - 1 });
    }
  }

  const charGrid: string[][] = grid.map((row) =>
    row.map((b) => INTENT_BIT_CHARS[b] ?? " "),
  );
  for (const { row, col } of arrowAt) {
    if (row < totalRows && col < totalCols) charGrid[row][col] = "▶";
  }
  for (const id of order) {
    const lv = level.get(id)!;
    const row = rowOf.get(id)!;
    const startCol = colOfLevel[lv];
    const text = `${labels.get(id)!}${cycleNodes.has(id) ? " (cycle)" : ""}`;
    for (let i = 0; i < text.length; i++) {
      const col = startCol + i;
      if (row < totalRows && col < totalCols) charGrid[row][col] = text[i]!;
    }
  }

  const body = charGrid.map((row) =>
    truncate(row.join("").replace(/\s+$/, ""), width),
  );

  const withReasons = explicitDeps.filter(
    (d) => d.reason && d.reason.trim().length > 0,
  );
  const notes: string[] = [];
  if (withReasons.length > 0) {
    notes.push("");
    notes.push("Notes:");
    for (const dep of withReasons) {
      const from = todoById.get(dep.from);
      const to = todoById.get(dep.to);
      if (!from || !to) continue;
      notes.push(
        ...wrapIntentLine(
          `  ${from.role} → ${to.role}: ${dep.reason}`,
          width,
          "    ",
        ),
      );
    }
  }

  return [...header, "Todo Graph:", ...body, ...notes];
}

function wrapIntentLine(
  text: string,
  width: number,
  continuationIndent = "",
): string[] {
  const limit = Math.max(20, width);
  if (text.length <= limit) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const searchStart = Math.max(0, limit - 24);
    const breakAt = remaining.lastIndexOf(" ", limit);
    const cut = breakAt > searchStart ? breakAt : limit;
    lines.push(remaining.slice(0, cut));
    remaining = continuationIndent + remaining.slice(cut).trimStart();
  }
  lines.push(remaining);
  return lines;
}

function isIntentGraphHeaderLine(line: string): boolean {
  return /^(Intent|Mode|Primary|Routing|Confidence|Reason|Workers|Budget|Model|Tools) ·|^Todo Graph:$/.test(
    line,
  );
}

function colorFor(
  item: TranscriptItem,
): "blue" | "cyan" | "green" | "red" | "yellow" | "magenta" | "gray" {
  switch (item.kind) {
    case "user":
      return "blue";
    case "assistant":
      return "green";
    case "error":
      return "red";
    case "status":
      return "cyan";
    case "help":
      return "yellow";
    case "panel":
      return "magenta";
    case "report":
      return finalReportStatusColor(item.finalReport?.status);
    case "thinking":
      return "gray";
    case "tool": {
      if (item.toolStatus === "failed") return "red";
      if (item.toolCategory) return toolCategoryColor(item.toolCategory);
      switch (item.toolStatus) {
        case "ok":
          return "cyan";
        default:
          return "yellow";
      }
    }
    case "worker": {
      switch (item.workerStatus) {
        case "completed":
          return "magenta";
        case "blocked":
          return "yellow";
        case "failed":
          return "red";
        default:
          return "yellow";
      }
    }
    case "todo": {
      switch (item.todoStatus) {
        case "completed":
          return "green";
        case "failed":
        case "blocked":
          return "red";
        case "running":
          return "yellow";
        default:
          return "gray";
      }
    }
    case "queued":
      return "yellow";
    case "decision": {
      switch (item.decisionStatus) {
        case "approved":
          return "green";
        case "blocked":
          return "red";
        default:
          return "yellow";
      }
    }
  }
}

function todoGlyph(
  status: "pending" | "running" | "completed" | "blocked" | "failed",
): string {
  switch (status) {
    case "completed":
      return "☑";
    case "failed":
      return "✗";
    case "blocked":
      return "!";
    case "running":
      return "◐";
    case "pending":
      return "☐";
  }
}

export function formatHelp(commands: CommandDefinition[] = COMMANDS): string {
  return [
    "Commands:",
    ...commands.map(
      (command) => `  ${command.label.padEnd(10)} — ${command.hint}`,
    ),
    "",
    "Tips:",
    "  • Start typing / to open the command palette.",
    "  • Use /plan <prompt> to preview the configured routeBrain decision.",
    "  • Use /plan --heuristic <prompt> only for no-provider routing diagnostics.",
    "  • Theme follows system appearance and resolves to dark or light; terminal background stays transparent.",
    "  • Use @<path> to attach project files (Tab to accept).",
    "  • Use @@<session-id> to attach a compact session context (Tab to accept).",
    "  • Press Ctrl+O or run /intent to inspect the current task graph.",
    TUI_MOUSE_ENABLED
      ? "  • Press ↑/↓ to scroll the transcript when the input is empty; PageUp/PageDown, wheel, or Ctrl+↑/Ctrl+↓ also scroll it."
      : "  • Press ↑/↓ to scroll the transcript when the input is empty; PageUp/PageDown or Ctrl+↑/Ctrl+↓ also scroll it. Mouse capture is disabled by BRAINCODE_TUI_MOUSE=false.",
    "  • Press Ctrl+P/Ctrl+N for prompt history; ↑/↓ still moves within multi-line input.",
    "  • Press Ctrl+Y to edit the most recent queued prompt.",
    "  • Press Ctrl+T to expand or collapse foldable transcript rows.",
    "  • Ctrl+V pastes a clipboard image or text from the system clipboard.",
    "  • Models are picked by Brain routing; use `braincode config` to change providers.",
  ].join("\n");
}

function describeMcpEntry(entry: McpServerEntry): string {
  if (entry.url) return entry.url;
  if (entry.command) {
    const args = (entry.args ?? []).join(" ");
    return args ? `${entry.command} ${args}` : entry.command;
  }
  if (entry.type) return entry.type;
  return "(no command/url)";
}

function mergeHealth(result: McpHealthResult): Partial<McpPanelEntry> {
  if (result.status === "ok") {
    return {
      health: "ok",
      toolCount: result.toolCount,
      latencyMs: result.latencyMs,
      serverInfo: result.serverInfo,
      detail: result.error,
    };
  }
  if (result.status === "skipped") {
    return { health: "skipped", detail: result.error };
  }
  return { health: "error", detail: result.error };
}

function describeHealth(entry: McpPanelEntry): string {
  switch (entry.health) {
    case "pending":
      return "checking…";
    case "ok": {
      const parts: string[] = [];
      if (typeof entry.toolCount === "number")
        parts.push(`${entry.toolCount} tools`);
      if (typeof entry.latencyMs === "number")
        parts.push(`${entry.latencyMs}ms`);
      if (entry.serverInfo?.name) parts.push(entry.serverInfo.name);
      const tail = parts.length > 0 ? ` (${parts.join(" · ")})` : "";
      return `healthy${tail}${entry.detail ? ` — note: ${truncate(entry.detail, 80)}` : ""}`;
    }
    case "skipped":
      return entry.detail ?? "skipped";
    case "error":
      return entry.detail ? truncate(entry.detail, 120) : "error";
  }
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function isLikelySessionId(token: string): boolean {
  return /^[0-9a-fA-F-]{8,}$/.test(token);
}

function emptyTokenUsage(): TokenUsageSnapshot {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function extractTokenUsage(message: unknown): TokenUsageSnapshot | null {
  if (!message || typeof message !== "object") return null;
  const usage = (message as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const input = readUsageNumber(usage, [
    "input",
    "promptTokens",
    "prompt_tokens",
  ]);
  const output = readUsageNumber(usage, [
    "output",
    "completionTokens",
    "completion_tokens",
  ]);
  const cacheRead = readUsageNumber(usage, [
    "cacheRead",
    "cache_read",
    "cacheReadTokens",
    "cache_read_tokens",
  ]);
  const cacheWrite = readUsageNumber(usage, [
    "cacheWrite",
    "cache_write",
    "cacheWriteTokens",
    "cache_write_tokens",
  ]);
  const explicitTotal = readUsageNumber(usage, [
    "totalTokens",
    "total_tokens",
    "total",
  ]);
  const total = explicitTotal || input + output + cacheRead + cacheWrite;
  if (total <= 0) return null;
  return { input, output, cacheRead, cacheWrite, total };
}

function readUsageNumber(usage: object, keys: string[]): number {
  const record = usage as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
      return value;
  }
  return 0;
}

function sumTokenUsage(usages: TokenUsageSnapshot[]): TokenUsageSnapshot {
  return usages.reduce(
    (total, usage) => ({
      input: total.input + usage.input,
      output: total.output + usage.output,
      cacheRead: total.cacheRead + usage.cacheRead,
      cacheWrite: total.cacheWrite + usage.cacheWrite,
      total: total.total + usage.total,
    }),
    emptyTokenUsage(),
  );
}

function formatRunStatusTokens(tokens: TokenUsageSnapshot): string {
  if (tokens.total <= 0) return "";
  const parts = [`↓ ${formatCompactTokenCount(tokens.total)} tokens`];
  if (tokens.input > 0)
    parts.push(`in ${formatCompactTokenCount(tokens.input)}`);
  if (tokens.output > 0)
    parts.push(`out ${formatCompactTokenCount(tokens.output)}`);
  return parts.join(" · ");
}

function formatRunTokenSummary(tokens: TokenUsageSnapshot): string {
  if (tokens.total <= 0) return "";
  return `${formatCompactTokenCount(tokens.total)} tokens`;
}

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000)
    return `${trimTrailingZero((value / 1_000_000).toFixed(1))}m`;
  if (value >= 1_000) return `${trimTrailingZero((value / 1_000).toFixed(1))}k`;
  return `${Math.round(value)}`;
}

function trimTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return `${seconds}s`;
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours === 0) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function formatWorkerPhase(phase: WorkerLifecycleEvent["phase"]): string {
  if (phase === "primary") return "agent";
  if (phase === "review") return "review";
  return "worker";
}

function classifyToolCall(toolName: string, args: unknown): ToolCategory {
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

function toolCategoryTitle(category: ToolCategory): string {
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

function toolCategoryColor(
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

function requiresToolDecision(
  category: ToolCategory,
  toolName: string,
  args: unknown,
): boolean {
  if (category === "mcp" || toolName.toLowerCase() === "web_search") return false;
  if (category === "execute" || category === "write") return true;
  const text = `${toolName} ${summarizeToolArgs(args)}`.toLowerCase();
  return /\b(rm\s+-rf|sudo|chmod|chown|git\s+push|git\s+reset|drop\s+table|delete\s+from|truncate\s+table)\b/.test(
    text,
  );
}

function toolApprovalAllowedByConfig(
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

type ToolEvidenceCacheInfo = {
  reused?: boolean;
  callCount?: number;
  consecutiveCount?: number;
  cacheAgeMs?: number;
  warning?: string;
};

function formatToolStartText(toolName: string): string {
  return `${toolName} · running`;
}

function formatToolEndText(
  toolName: string,
  isError: boolean,
  elapsedMs: number,
): string {
  const status = isError ? "failed" : "completed";
  return `${toolName} · ${status} (${elapsedMs}ms)`;
}

function formatRepeatedReadToolText(
  toolName: string,
  duplicateCount: number,
): string {
  return `${toolName} · cached duplicate x${duplicateCount}`;
}

function formatRepeatedReadToolDetail(
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

function toolArgsObject(args: unknown): Record<string, unknown> | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args))
    return undefined;
  const record = args as Record<string, unknown>;
  return Object.keys(record).length > 0 ? record : undefined;
}

function toolArgsCount(args: Record<string, unknown> | undefined): number {
  return args ? Object.keys(args).length : 0;
}

function formatToolResultDetail(result: unknown): string | undefined {
  const summary = summarizeToolResult(result, TOOL_DETAIL_CHAR_LIMIT);
  return summary ? `result ${summary}` : undefined;
}

function toolCallDisplayKey(
  toolName: string,
  args: Record<string, unknown> | undefined,
): string {
  return `${toolName.toLowerCase()}:${stableToolValue(args ?? {})}`;
}

function stableToolValue(value: unknown): string {
  try {
    return JSON.stringify(toStableToolValue(value, new WeakSet())) ?? "";
  } catch {
    return String(value);
  }
}

function toStableToolValue(value: unknown, seen: WeakSet<object>): unknown {
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

function getToolEvidenceCacheInfo(
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

function formatToolArgLine(key: string, value: unknown): string {
  return `${key}=${summarizeArgValue(value)}`;
}

function summarizeToolArgs(args: unknown): string {
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

function summarizeArgValue(value: unknown, maxLen = 40): string {
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

function summarizeToolResult(result: unknown, maxLength = 120): string {
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

function formatBrainDetail(brain: BrainModel, defaultBrainId: string): string {
  const lines: string[] = [];
  const star = brain.id === defaultBrainId ? " (default)" : "";
  lines.push(`${brain.id}${star} — ${brain.name}`);
  if (brain.description) lines.push(brain.description);
  lines.push("");
  lines.push("Planner:");
  lines.push(`  ${brain.planner.modelId} (${brain.planner.thinkingLevel})`);
  lines.push("Roles:");
  const roleEntries = Object.entries(brain.roles) as Array<
    [keyof BrainModel["roles"], typeof brain.roles.frontend]
  >;
  for (const [role, policy] of roleEntries) {
    lines.push(
      `  ${role.padEnd(11)} ${policy.modelId} (${policy.thinkingLevel})${policy.fallbackModelIds && policy.fallbackModelIds.length > 0 ? ` → ${policy.fallbackModelIds.join(", ")}` : ""}`,
    );
  }
  lines.push("Routing:");
  lines.push(
    `  maxParallelAgents=${brain.routing.maxParallelAgents}  requireReviewForFileEdits=${brain.routing.requireReviewForFileEdits}`,
  );
  return lines.join("\n");
}

function sessionStatusGlyph(status: SessionSummary["status"]): string {
  switch (status) {
    case "completed":
      return "✓";
    case "failed":
      return "✗";
    case "incomplete":
      return "·";
  }
}

function formatTimestamp(ms: number): string {
  if (!ms) return "(unknown time)";
  const date = new Date(ms);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function healthGlyph(entry: McpPanelEntry): string {
  if (entry.entry.disabled) return "○";
  switch (entry.health) {
    case "ok":
      return "✓";
    case "error":
      return "✗";
    case "skipped":
      return "·";
    case "pending":
      return "?";
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    /aborted|abort|interrupted/i.test(error.message)
  );
}

function humanizeRuntimeError(error: unknown): string {
  return humanizeAgentRuntimeError(error);
}

export const __test = {
  INPUT_MAX_LINES,
  INPUT_MIN_LINES,
  clipDraftToWindow,
  draftWindowDisplayLines,
  normalizeTranscriptItemForFoldPreference,
};
