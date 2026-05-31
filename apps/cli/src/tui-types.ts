import type {
  ExecSessionManager,
  FinalReport,
  RuntimePlan,
} from "@braincode/agent-runtime";
import type {
  BraincodeTheme,
  HookEventName,
  HookHandler,
  McpServerEntry,
  SessionSummary,
} from "@braincode/config";
import type { BrainModel } from "@braincode/brain";
import type { EditPreview } from "./tool-edit-preview";
import type { ImageProtocol } from "./image-preview";

export type TranscriptItem = {
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
    | "report"
    | "image";
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
  imagePath?: string;
  imageStatus?: "loading" | "ready" | "failed";
  imageLines?: string[];
  imageCols?: number;
  imageRows?: number;
  imageProtocol?: ImageProtocol;
  imageFgColor?: string;
  imageError?: string;
};

export type ToolCategory =
  | "websearch"
  | "execute"
  | "write"
  | "read"
  | "mcp"
  | "tool";

export type TokenUsageSnapshot = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

export type RunStatusState = {
  startedAt: number;
  label: string;
  tokens: TokenUsageSnapshot;
  frame: number;
};

export type InputState = {
  draft: string;
  cursor: number;
};

export type DraftMetrics = {
  empty: boolean;
  lineCount: number;
  hiddenAbove: number;
  hiddenBelow: number;
};

export type QueuedTask = {
  id: string;
  prompt: string;
  displayText: string;
  skipCommand: boolean;
  forceRoles?: string[];
  itemId: string;
};

export type TranscriptRenderEntry = {
  item: TranscriptItem;
  index: number;
  continuation: boolean;
  showDivider: boolean;
  collapsible: boolean;
  rowStart: number;
  rowEnd: number;
};

export type StoreUpdate<T> = T | ((previous: T) => T);

export type TuiStore<T> = {
  getSnapshot: () => T;
  setSnapshot: (update: StoreUpdate<T>) => void;
  subscribe: (listener: () => void) => () => void;
};

export type CommandDefinition = {
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

export type Overlay =
  | { kind: "command"; filter: string; selected: number }
  | { kind: "file"; filter: string; selected: number; anchor: number }
  | { kind: "session"; filter: string; selected: number; anchor: number }
  | null;

export type McpPanelEntry = {
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

export type McpPanelState = {
  entries: McpPanelEntry[];
  selected: number;
  message?: string;
};

export type HookPanelEntry = {
  scope: "user" | "project";
  filePath: string;
  eventName: HookEventName;
  matcher: string | undefined;
  matcherIndex: number;
  handlerIndex: number;
  handler: HookHandler;
};

export type HookPanelState = {
  entries: HookPanelEntry[];
  selected: number;
  message?: string;
};

export type SessionPanelState = {
  entries: SessionSummary[];
  selected: number;
  message?: string;
  // Browse panel scope: "project" lists only sessions started in the current
  // project directory; "all" lists every recorded session across projects.
  scope: "project" | "all";
};

export type BrainPanelState = {
  brains: BrainModel[];
  defaultBrainId: string;
  selected: number;
  message?: string;
};

export type IntentPanelState = {
  plan: RuntimePlan;
};

export type RuntimeErrorPanelState = {
  title: string;
  message: string;
};

export type ToastTone = "info" | "error";

export type ToastState = {
  id: string;
  text: string;
  tone: ToastTone;
};

export type PlanCommandArgument = {
  prompt: string;
  useRouterBrain: boolean;
  displayText: string;
};

export type DecisionOptionId = "approve" | "approve_session" | "block";

export type DecisionOption = {
  id: DecisionOptionId;
  label: string;
  description: string;
  checked: boolean;
};

export type DecisionPanelState = {
  id: string;
  itemId: string;
  sessionId: string;
  toolName: string;
  toolCategory: ToolCategory;
  argsSummary: string;
  policySummary?: string;
  selected: number;
  options: DecisionOption[];
};

export type BraincodeTuiProps = {
  initialPrompt?: string;
  execSessions: ExecSessionManager;
};

export type UiColor =
  | "blue"
  | "cyan"
  | "green"
  | "yellow"
  | "magenta"
  | "red"
  | "gray";

export type TuiTheme = {
  name: BraincodeTheme;
  label: string;
  colors: Record<UiColor, string> & {
    text: string;
    muted: string;
    border: string;
    focusedBorder: string;
  };
};

export type DraftWindowLine = {
  text: string;
  cursorOffset: number | null;
};

export type DraftWindow = {
  lines: DraftWindowLine[];
  hiddenAbove: number;
  hiddenBelow: number;
};

export type DraftWrapResult = {
  lines: DraftWindowLine[];
  cursorRow: number;
};

export type RunStatusTextChar = {
  char: string;
  color: UiColor;
  bold?: boolean;
};

export type ToolEvidenceCacheInfo = {
  reused?: boolean;
  callCount?: number;
  consecutiveCount?: number;
  cacheAgeMs?: number;
  warning?: string;
};
