import { isWideChar } from "./input-cursor";
import type {
  DraftMetrics,
  DraftWindow,
  DraftWindowLine,
  DraftWrapResult,
  Overlay,
  PlanCommandArgument,
} from "./tui-types";
import {
  INPUT_MAX_LINES,
  INPUT_MIN_LINES,
  INPUT_PROMPT_PREFIX,
} from "./tui-constants";
import { clamp, composeDraftLine, fitVisualWidth, visualWidth } from "./tui-text";

export function draftWindowDisplayLines(
  draftWindow: DraftWindow,
): DraftWindowLine[] {
  const lines = draftWindow.lines.slice(0, INPUT_MAX_LINES);
  while (lines.length < INPUT_MIN_LINES)
    lines.push({ text: "", cursorOffset: null });
  return lines;
}

export function fitDraftWindowLine(
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

export function draftWindowLineWidth(line: DraftWindowLine): number {
  if (line.cursorOffset === null) return visualWidth(line.text || " ");
  const chars = Array.from(line.text);
  const cursorOffset = clamp(line.cursorOffset, 0, chars.length);
  return visualWidth(line.text) + (cursorOffset >= chars.length ? 1 : 0);
}

export function wrapDraftWindowLines(
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

export function clipDraftToWindow(
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

export function draftMetricsFromWindow(
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

export function sameDraftMetrics(
  left: DraftMetrics,
  right: DraftMetrics,
): boolean {
  return (
    left.empty === right.empty &&
    left.lineCount === right.lineCount &&
    left.hiddenAbove === right.hiddenAbove &&
    left.hiddenBelow === right.hiddenBelow
  );
}

export function computeOverlay(
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

export function sameOverlay(left: Overlay, right: Overlay): boolean {
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

export function lastReferenceTrigger(
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

export function parsePlanCommandArgument(
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

export function consumeMouseInput(input: string): {
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

export function isMouseInput(input: string): boolean {
  // Ink strips the leading ESC (treating it as an Escape key press) before
  // dispatching to useInput, leaving orphaned SGR sequences like `[<0;96;22M`.
  // Match both the raw (`\x1b[<...`) and stripped (`[<...`) forms.
  return /\x1b?\[<\d+;\d+;\d+[Mm]/.test(input);
}
