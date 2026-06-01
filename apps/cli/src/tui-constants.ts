import type { CommandDefinition } from "./tui-types";

export const INPUT_MIN_LINES = 1;
export const INPUT_MAX_LINES = 6;
export const INPUT_PROMPT_PREFIX = "› ";
export const FRAME_RESERVED_COLUMNS = 4;
export const INPUT_BOX_HORIZONTAL_CHROME = 4; // left/right border plus padding
export const INK_RENDER_SAFETY_ROWS = 1;
// The header is rendered as the top of the scrollable transcript region so it
// scrolls away as content grows. It occupies a fixed block: two content rows
// (badges + meta), a top and bottom border, and one bottom margin row.
export const HEADER_ROWS = 5;
export const OVERLAY_SUGGESTION_MIN_ROWS = 4;
export const OVERLAY_SUGGESTION_MAX_ROWS = 12;
// Max session rows shown at once in the /resume browse panel. The full history
// is loaded; the panel scrolls a fixed-height window over it so a long list
// does not push the input off-screen.
export const SESSION_PANEL_VISIBLE_ROWS = 12;
export const PET_PANEL_MIN_WIDTH = 28;
export const PET_PANEL_MAX_WIDTH = 42;
export const RUN_SPINNER_FRAMES = [
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
export const COLLAPSED_TEXT_LINE_LIMIT = 10;
export const COLLAPSIBLE_TEXT_LINE_THRESHOLD = 18;
export const COLLAPSIBLE_TEXT_CHAR_THRESHOLD = 2400;
export const RESTORED_TEXT_CHUNK_LINE_LIMIT = 12;
export const RESTORED_TEXT_CHUNK_CHAR_LIMIT = 1800;
export const TOOL_DETAIL_CHAR_LIMIT = 320;
export const TRANSCRIPT_MOUSE_WHEEL_ROWS = 4;
export const IMAGE_PREVIEW_MAX_COLS = 160;
export const IMAGE_PREVIEW_MAX_ROWS = 44;
export const IMAGE_PREVIEW_MIN_COLS = 12;
export const IMAGE_PREVIEW_MIN_ROWS = 4;
export const IMAGE_PREVIEW_VIEWPORT_CHROME_ROWS = 4;
export const RUN_STATUS_ANIMATION_MS = 140;
export const RUN_STATUS_HIGHLIGHT_COLOR = "#ffffff";
export const DEFAULT_STREAM_FLUSH_MS = 1000;
export const STREAM_FLUSH_MIN_CHARS = 600;
export const STREAM_FLUSH_MAX_WAIT_MS = 2500;
export const PET_SNAPSHOT_FLUSH_MS = 1000;
export const TUI_ANIMATIONS_ENABLED =
  process.env.BRAINCODE_TUI_ANIMATIONS === "true";

export function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

// Mouse-wheel scrolling is on by default. In the alternate screen there is no
// native terminal scrollback, so the wheel drives the in-app transcript scroll.
// Set BRAINCODE_TUI_MOUSE=false (or 0) to release the mouse if you prefer your
// terminal's drag-to-select without holding Shift. Unset keeps it enabled.
export const TUI_MOUSE_ENABLED = process.env.BRAINCODE_TUI_MOUSE
  ? isTruthyEnv(process.env.BRAINCODE_TUI_MOUSE)
  : true;

export const BRAIN_LOGO: ReadonlyArray<string> = [
  "   ██████╗ ██████╗  █████╗ ██╗███╗   ██╗",
  "   ██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║",
  "   ██████╔╝██████╔╝███████║██║██╔██╗ ██║",
  "   ██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║",
  "   ██████╔╝██║  ██║██║  ██║██║██║ ╚████║",
  "   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝",
];

export const COMMANDS: CommandDefinition[] = [
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
  {
    name: "image",
    label: "/image",
    hint: "Preview an image in the terminal (kitty/iterm2 or text fallback)",
    insert: "/image ",
  },
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
    hint: "List project skills (.agents/skills)",
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

export const ANSI_RESET = "\x1b[39m";
export const ANSI_INVERSE = "\x1b[7m";
export const ANSI_INVERSE_OFF = "\x1b[27m";

export const INTENT_BIT_UP = 1;
export const INTENT_BIT_RIGHT = 2;
export const INTENT_BIT_DOWN = 4;
export const INTENT_BIT_LEFT = 8;

export const INTENT_BIT_CHARS: Record<number, string> = {
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
