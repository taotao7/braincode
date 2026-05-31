import { useEffect, useMemo, useRef, useState } from "react";
import { Box, render, Text, useApp, useInput, useStdout } from "ink";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import {
  ensureSessionHandoff,
  executePromptFromConfig,
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
  type HookEventName,
  type HookSource,
  type ProjectSupport,
  type SessionSummary,
  type UserSupport,
} from "@braincode/config";
import type { BrainModel } from "@braincode/brain";
import { readClipboardImageOrText } from "./clipboard";
import { checkMcpHealth } from "./mcp-health";
import { fuzzyFilter, listProjectFiles } from "./project-files";
import type { PetWatcherSnapshotItem } from "./pet-watcher";
import {
  buildEditPreview,
  displayEditPath,
  extractEditArgs,
  resolveEditPath,
  snapshotFileContent,
  type EditArgs,
} from "./tool-edit-preview";
import { moveDraftCursorVertically } from "./input-cursor";
import { buildImagePreview } from "./image-preview";
import type {
  BrainPanelState,
  BraincodeTuiProps,
  CommandDefinition,
  DecisionOptionId,
  DecisionPanelState,
  DraftMetrics,
  HookPanelEntry,
  HookPanelState,
  InputState,
  IntentPanelState,
  McpPanelEntry,
  McpPanelState,
  Overlay,
  QueuedTask,
  RunStatusState,
  RuntimeErrorPanelState,
  SessionPanelState,
  StoreUpdate,
  ToastState,
  ToastTone,
  TokenUsageSnapshot,
  ToolCategory,
  TranscriptItem,
} from "./tui-types";
import {
  COMMANDS,
  DEFAULT_STREAM_FLUSH_MS,
  INPUT_MAX_LINES,
  INPUT_MIN_LINES,
  INPUT_PROMPT_PREFIX,
  OVERLAY_SUGGESTION_MAX_ROWS,
  OVERLAY_SUGGESTION_MIN_ROWS,
  PET_PANEL_MAX_WIDTH,
  PET_PANEL_MIN_WIDTH,
  PET_SNAPSHOT_FLUSH_MS,
  SESSION_PANEL_VISIBLE_ROWS,
  STREAM_FLUSH_MAX_WAIT_MS,
  STREAM_FLUSH_MIN_CHARS,
  TRANSCRIPT_MOUSE_WHEEL_ROWS,
  TUI_MOUSE_ENABLED,
} from "./tui-constants";
import {
  TUI_THEMES,
  TuiThemeContext,
  detectSystemAppearanceTheme,
  detectSystemTheme,
  readThemeOverride,
  tone,
} from "./tui-theme";
import { useStableTuiStore } from "./tui-store";
import {
  clamp,
  frameContentWidth,
  imagePreviewBounds,
  inputTextWidth,
  leftAlignTranscriptRows,
  truncate,
  wrapByVisualWidth,
} from "./tui-text";
import {
  classifyToolCall,
  formatPermissionPolicySummary,
  formatRepeatedReadToolDetail,
  formatRepeatedReadToolText,
  formatToolEndText,
  formatToolResultDetail,
  formatToolStartText,
  getToolEvidenceCacheInfo,
  requiresToolDecision,
  summarizeToolArgs,
  toolApprovalAllowedByConfig,
  toolArgsCount,
  toolArgsObject,
  toolCallDisplayKey,
  toolCategoryColor,
  toolCategoryTitle,
} from "./tui-tools";
import {
  describeHealth,
  describeMcpEntry,
  emptyTokenUsage,
  extractTokenUsage,
  formatBrainDetail,
  formatError,
  formatHelp,
  formatIntentGraphLines,
  formatPlanPreviewSummary,
  formatRunTokenSummary,
  formatTimestamp,
  formatTuiFinalReportCompact,
  formatWorkerPhase,
  healthGlyph,
  humanizeRuntimeError,
  isAbortLikeError,
  isIntentGraphHeaderLine,
  isLikelySessionId,
  mergeHealth,
  sameTokenUsage,
  sessionStatusGlyph,
  sumTokenUsage,
} from "./tui-format";
import {
  displayImagePath,
  extractGeneratedImagePath,
  filterSessions,
  imageCaption,
  isTranscriptItemCollapsible,
  layoutTranscriptItems,
  nextTranscriptScrollTop,
  normalizeAssistantText,
  normalizeTranscriptItem,
  normalizeTranscriptItemForFoldPreference,
  normalizeTranscriptItemsForFoldPreference,
  restoreSessionTranscriptItems,
  samePetSnapshot,
  transcriptPatchChangesItem,
  viewportTranscriptLayout,
} from "./tui-transcript";
import {
  clipDraftToWindow,
  computeOverlay,
  consumeMouseInput,
  draftMetricsFromWindow,
  draftWindowDisplayLines,
  isMouseInput,
  parsePlanCommandArgument,
  sameOverlay,
} from "./tui-input";
import {
  FooterSurface,
  HeaderBlock,
  InputSurface,
  TranscriptSurface,
} from "./tui-components";

export {
  formatHelp,
  formatPlanMetadataLine,
  formatPlanPreviewSummary,
  formatPlanWorkersBudgetLine,
  formatTuiFinalReportCompact,
  formatTuiFinalReportSections,
} from "./tui-format";

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

export async function runTui(initialPrompt?: string): Promise<void> {
  const restoreDebugSink = await configureTuiDebugSink();
  // Render into the terminal's alternate screen buffer so the TUI owns the
  // whole terminal (like vim/htop/less) and the original screen is restored on
  // exit. The alt-screen has no native scrollback, so the transcript provides
  // its own in-app scrolling (PageUp/PageDown/Ctrl+↑↓/Home/End + mouse wheel).
  const instance = render(<BraincodeTui initialPrompt={initialPrompt} />, {
    alternateScreen: true,
  });
  try {
    await instance.waitUntilExit();
  } finally {
    restoreDebugSink();
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

  // Load an image preview asynchronously and patch the transcript item in
  // place. For the Kitty protocol the upload sequence is written to stdout
  // exactly once (the image lives in the terminal's memory keyed by id);
  // afterwards the placeholder glyph lines can be re-rendered freely by Ink
  // as the viewport scrolls.
  function loadImagePreviewInto(itemId: string, path: string) {
    const { maxCols, maxRows } = imagePreviewBounds(
      terminalCols,
      terminalRows,
      transcriptViewportState.current.viewportRows,
    );
    void (async () => {
      const shouldStickToBottom = transcriptScrollStore.getSnapshot() === null;
      try {
        const preview = await buildImagePreview(path, { maxCols, maxRows });
        if (!preview) {
          patchTranscriptItem(itemId, {
            imageStatus: "failed",
            imageError: "Could not decode image (need ImageMagick or sips).",
          });
          if (shouldStickToBottom) scrollTranscriptTo("bottom");
          return;
        }
        if (preview.transmit && stdout) stdout.write(preview.transmit);
        patchTranscriptItem(itemId, {
          imageStatus: "ready",
          imageLines: preview.lines,
          imageCols: preview.cols,
          imageRows: preview.rows,
          imageProtocol: preview.protocol,
          imageFgColor: preview.fgColor,
          text: imageCaption(path, preview.cols, preview.rows, preview.protocol),
        });
        if (shouldStickToBottom) scrollTranscriptTo("bottom");
      } catch (error) {
        patchTranscriptItem(itemId, {
          imageStatus: "failed",
          imageError: error instanceof Error ? error.message : String(error),
        });
        if (shouldStickToBottom) scrollTranscriptTo("bottom");
      }
    })();
  }

  function patchTranscriptItem(itemId: string, patch: Partial<TranscriptItem>) {
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
  }

  // Append a loading image item and kick off async decode/upload.
  function appendImagePreview(path: string, caption?: string) {
    const itemId = crypto.randomUUID();
    setItems((previous) => [
      ...previous,
      {
        id: itemId,
        kind: "image",
        imagePath: path,
        imageStatus: "loading",
        text: caption ?? `Loading image · ${displayImagePath(path)}`,
      },
    ]);
    scrollTranscriptTo("bottom");
    loadImagePreviewInto(itemId, path);
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
      case "image":
        showImagePreview(argument);
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

  async function showSessionPanel(scope: "project" | "all" = "project") {
    let sessions: SessionSummary[];
    try {
      // Load every recorded session so the browse panel never hides history;
      // the panel renders a fixed-height scroll window so a long list does not
      // overflow the terminal. By default the list is scoped to the current
      // project directory; press "a" in the panel to see all projects.
      sessions = await listSessions(
        undefined,
        Number.POSITIVE_INFINITY,
        scope === "project" ? { projectRoot } : {},
      );
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
        text:
          scope === "project"
            ? `No sessions recorded for this project yet (${projectRoot}). Press "a" after /resume to browse all projects, or run a task here first.`
            : "No sessions recorded yet. Sessions land under ~/.braincode/sessions/.",
      });
      return;
    }
    setMcpPanel(null);
    setHookPanel(null);
    setIntentPanel(null);
    setOverlay(null);
    setSessionPanel({ entries: sessions, selected: 0, scope });
  }

  async function resumeSession(argument: string) {
    const trimmed = argument.trim();
    if (!trimmed) {
      void showSessionPanel();
      return;
    }
    try {
      const sessions = await listSessions(undefined, Number.POSITIVE_INFINITY);
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

  function showImagePreview(argument: string) {
    const path = argument.trim().replace(/^["']|["']$/g, "");
    if (!path) {
      appendItem({
        kind: "error",
        text: "Usage: /image <path-to-image>",
      });
      return;
    }
    const resolved = path.startsWith("~")
      ? join(homedir(), path.slice(1))
      : isAbsolute(path)
        ? path
        : join(projectRoot, path);
    appendImagePreview(resolved);
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
        text: "No skills available.\n• User-global: ~/.braincode/skills/<id>/SKILL.md\n• Project-local: .agents/skills/<id>/SKILL.md",
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
      // When an image was generated, surface a scaled preview inline so the
      // user sees the result without opening the file. The artifact path is
      // embedded in the worker summary as "Generated image artifact: <path>".
      if (event.status === "completed" && event.summary) {
        const artifactPath = extractGeneratedImagePath(event.summary);
        if (artifactPath) appendImagePreview(artifactPath);
      }
    };

    const onMcpReport = (
      report: import("@braincode/agent-runtime").McpHubConnectReport,
    ) => {
      const pending = report.pending ?? [];
      if (
        report.toolCount === 0 &&
        report.connected.length === 0 &&
        report.failed.length === 0 &&
        report.skipped.length === 0 &&
        pending.length === 0
      )
        return;
      const parts: string[] = [];
      if (report.toolCount > 0)
        parts.push(
          `${report.toolCount} MCP tools from ${report.connected.length} server${report.connected.length === 1 ? "" : "s"}`,
        );
      else if (report.connected.length > 0)
        parts.push(
          `connected: ${report.connected.map((entry) => `${entry.name}(${entry.toolCount})`).join(", ")}`,
        );
      if (pending.length > 0)
        parts.push(
          `loading: ${pending.map((entry) => `${entry.name}(${entry.reason})`).join(", ")}`,
        );
      if (report.failed.length > 0)
        parts.push(
          `failed: ${report.failed.map((entry) => `${entry.name}(${truncate(entry.error, 40)})`).join(", ")}`,
        );
      if (report.skipped.length > 0)
        parts.push(
          `skipped: ${report.skipped.map((entry) => `${entry.name}(${entry.reason})`).join(", ")}`,
        );
      const text = `${report.loading ? "MCP loading" : "MCP"} · ${parts.join(" · ")}`;
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
      const policyRequiresDecision = request.permissionPolicy?.action === "ask";
      if (
        !policyRequiresDecision &&
        !requiresToolDecision(toolCategory, request.toolName, request.args)
      )
        return { approved: true };
      const policySummary = formatPermissionPolicySummary(
        request.permissionPolicy,
      );
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
          !policyRequiresDecision &&
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
          policySummary,
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
        // Eager so MCP tools (e.g. web_search via Tavily) are connected and
        // present in the primary agent's tool set before its prompt is built.
        // initialize() returns as soon as connect settles, so warm runs stay
        // fast; the raised budget/timeout only cost extra on first-run bunx
        // downloads. If the budget is exceeded the run still proceeds and the
        // agent can finish loading via the mcp__connect tool.
        mcpLoadingStrategy: "eager",
        mcpStartupBudgetMs: 30_000,
        mcpPerServerConnectTimeoutMs: 30_000,
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
          collapsed: false,
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
      if (input === "a") {
        // Toggle between project-scoped and all-projects listing.
        const nextScope =
          sessionPanel.scope === "project" ? "all" : "project";
        void showSessionPanel(nextScope).catch((error) =>
          appendItem({
            kind: "error",
            text: `Sessions failed: ${formatError(error)}`,
          }),
        );
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
  const copyHelp = TUI_MOUSE_ENABLED
    ? "Shift+drag to select/copy"
    : "drag to select/copy";
  const helpText = `Enter submits · / commands · ↑↓ scroll content when input is empty · Ctrl+P/N prompt history · Ctrl+T folds · ${scrollHelp} · ${copyHelp} · End bottom · Ctrl+O intent · @ files · @@ sessions · Ctrl+V paste · Esc dismisses · Ctrl+C exits`;
  const sessionMatchRows =
    sessionMatches.length === 0
      ? 1
      : sessionMatches.reduce((sum, entry) => sum + (entry.prompt ? 2 : 1), 0);

  return (
    <TuiThemeContext.Provider value={tuiTheme}>
      <Box flexDirection="column" paddingX={1}>
        <HeaderBlock
          mode={mode}
          themeName={themeName}
          sessionId={sessionId}
          headerRoot={headerRoot}
          projectSummary={projectSummary}
          userSummary={userSummary}
        />
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
              Sessions{" "}
              <Text color={colors.gray}>
                ·{" "}
                {sessionPanel.scope === "project"
                  ? "this project"
                  : "all projects"}
              </Text>
            </Text>
            {(() => {
              const total = sessionPanel.entries.length;
              const visible = Math.min(SESSION_PANEL_VISIBLE_ROWS, total);
              // Keep the selection inside the window: center it where possible,
              // then clamp so we never scroll past either end of the list.
              let start = Math.max(
                0,
                sessionPanel.selected - Math.floor(visible / 2),
              );
              start = Math.min(start, Math.max(0, total - visible));
              const windowEntries = sessionPanel.entries.slice(
                start,
                start + visible,
              );
              return (
                <Box flexDirection="column">
                  {start > 0 ? (
                    <Text color={colors.gray}>↑ {start} more</Text>
                  ) : null}
                  {windowEntries.map((entry, offset) => {
                    const index = start + offset;
                    return (
                      <Box key={entry.sessionId} flexDirection="column">
                        <Text
                          color={
                            index === sessionPanel.selected
                              ? colors.green
                              : undefined
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
                            {truncate(
                              entry.prompt.replace(/\s+/g, " ").trim(),
                              120,
                            )}
                          </Text>
                        ) : null}
                      </Box>
                    );
                  })}
                  {start + visible < total ? (
                    <Text color={colors.gray}>
                      ↓ {total - (start + visible)} more
                    </Text>
                  ) : null}
                  <Text color={colors.gray}>
                    {total > 0
                      ? `${sessionPanel.selected + 1}/${total} sessions`
                      : "no sessions"}
                  </Text>
                </Box>
              );
            })()}
            {sessionPanel.message ? (
              <Text color={colors.cyan}>{sessionPanel.message}</Text>
            ) : null}
            <Text color={colors.gray}>
              ↑↓ / Ctrl+P/N navigate · Enter resume · v details ·{" "}
              {sessionPanel.scope === "project" ? "a all projects" : "a this project"}{" "}
              · Esc close
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
            {decisionPanel.policySummary ? (
              <Text color={colors.gray}>
                policy: {decisionPanel.policySummary}
              </Text>
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
          overlayOpen={Boolean(
            brainPanel ||
              intentPanel ||
              sessionPanel ||
              hookPanel ||
              mcpPanel ||
              decisionPanel ||
              runtimeErrorPanel ||
              overlay,
          )}
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

export const __test = {
  INPUT_MAX_LINES,
  INPUT_MIN_LINES,
  clipDraftToWindow,
  draftWindowDisplayLines,
  imagePreviewBounds,
  layoutTranscriptItems,
  leftAlignTranscriptRows,
  normalizeTranscriptItemForFoldPreference,
  viewportTranscriptLayout,
  wrapByVisualWidth,
};
