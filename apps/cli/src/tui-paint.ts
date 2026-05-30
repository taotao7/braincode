import { isWideChar } from "./input-cursor";
import type {
  DraftWindow,
  DraftWindowLine,
  RunStatusState,
  RunStatusTextChar,
  TuiTheme,
} from "./tui-types";
import {
  ANSI_INVERSE,
  ANSI_INVERSE_OFF,
  ANSI_RESET,
  INPUT_BOX_HORIZONTAL_CHROME,
  RUN_SPINNER_FRAMES,
  RUN_STATUS_ANIMATION_MS,
  RUN_STATUS_HIGHLIGHT_COLOR,
} from "./tui-constants";
import {
  clamp,
  fitVisualWidth,
  formatElapsed,
  padVisual,
  truncate,
  visualWidth,
} from "./tui-text";
import { emptyTokenUsage, formatRunStatusTokens } from "./tui-format";
import { tone } from "./tui-theme";
import { draftWindowDisplayLines, fitDraftWindowLine } from "./tui-input";

export function paintInputSurface({
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

export function paintRunStatusLine({
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

export function renderInputSurfaceRows({
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

export function renderInputBoxRow(
  text: string,
  width: number,
  color: string,
): string {
  const fitted = fitVisualWidth(text, width);
  return ` ${ansiColor(color)}│${ANSI_RESET} ${ansiColor(color)}${fitted}${padVisual(fitted, width)}${ANSI_RESET} ${ansiColor(color)}│${ANSI_RESET}`;
}

export function renderInputBoxDraftRow(
  line: DraftWindowLine,
  width: number,
  color: string,
): string {
  const rendered = renderDraftLineAnsi(line, width, color);
  return ` ${ansiColor(color)}│${ANSI_RESET} ${rendered.text}${padVisual(rendered.plain, width)} ${ansiColor(color)}│${ANSI_RESET}`;
}

export function renderDraftLineAnsi(
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

export function renderRunStatusAnsiLine(
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

export function buildRunStatusChars(
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

export function appendRunStatusChars(
  target: RunStatusTextChar[],
  text: string,
  color: RunStatusTextChar["color"],
  bold = false,
) {
  for (const char of text) target.push({ char, color, bold });
}

export function fitRunStatusChars(
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

export function runStatusActiveIndex(
  chars: RunStatusTextChar[],
  now: number,
): number {
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

export function runStatusCharColor(
  theme: TuiTheme,
  cell: RunStatusTextChar,
  index: number,
  activeIndex: number,
): string {
  return index === activeIndex
    ? RUN_STATUS_HIGHLIGHT_COLOR
    : tone(theme, cell.color);
}

export function runStatusCharsText(chars: RunStatusTextChar[]): string {
  return chars.map((cell) => cell.char).join("");
}

export function ansiColor(hex: string): string {
  const match = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return "";
  const value = match[1]!;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}
