import { isWideChar } from "./input-cursor";
import {
  FRAME_RESERVED_COLUMNS,
  IMAGE_PREVIEW_MAX_COLS,
  IMAGE_PREVIEW_MAX_ROWS,
  IMAGE_PREVIEW_MIN_COLS,
  IMAGE_PREVIEW_MIN_ROWS,
  IMAGE_PREVIEW_VIEWPORT_CHROME_ROWS,
  INPUT_BOX_HORIZONTAL_CHROME,
  INPUT_PROMPT_PREFIX,
} from "./tui-constants";

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

export function cleanInline(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function visualWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += isWideChar(char) ? 2 : 1;
  }
  return width;
}

export function fitVisualWidth(text: string, width: number): string {
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

export function padVisual(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - visualWidth(text)));
}

export function wrapByVisualWidth(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  for (const sourceLine of text.split(/\r?\n/)) {
    lines.push(...wrapSingleVisualLineByWords(sourceLine, width));
  }
  return lines.length > 0 ? lines : [""];
}

export function wrapSingleVisualLineByWords(
  text: string,
  width: number,
): string[] {
  if (text.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  const pushCurrent = () => {
    lines.push(current.trimEnd());
    current = "";
    currentWidth = 0;
  };

  for (const token of text.match(/\s+|\S+/gu) ?? []) {
    const tokenWidth = visualWidth(token);
    if (/^\s+$/u.test(token)) {
      if (currentWidth > 0 && currentWidth + tokenWidth <= width) {
        current += token;
        currentWidth += tokenWidth;
      }
      continue;
    }

    if (tokenWidth > width) {
      if (currentWidth > 0) pushCurrent();
      const hardWrapped = hardWrapVisualToken(token, width);
      lines.push(...hardWrapped.slice(0, -1));
      current = hardWrapped.at(-1) ?? "";
      currentWidth = visualWidth(current);
      continue;
    }

    if (currentWidth > 0 && currentWidth + tokenWidth > width) {
      pushCurrent();
    }

    current += token;
    currentWidth += tokenWidth;
  }
  if (currentWidth > 0 || lines.length === 0) lines.push(current.trimEnd());
  return lines;
}

export function hardWrapVisualToken(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  for (const char of text) {
    const charWidth = isWideChar(char) ? 2 : 1;
    if (current.length > 0 && currentWidth + charWidth > width) {
      lines.push(current);
      current = "";
      currentWidth = 0;
    }
    current += char;
    currentWidth += charWidth;
  }
  if (current.length > 0 || lines.length === 0) lines.push(current);
  return lines;
}

export function countWrappedRows(text: string, width: number): number {
  return wrapByVisualWidth(text, Math.max(1, width)).length;
}

export function leftAlignTranscriptRows(
  text: string,
  width: number,
  firstLinePrefixWidth: number,
): Array<{ indent: string; line: string; first: boolean }> {
  const lineWidth = Math.max(20, width);
  const bodyWidth = Math.max(8, lineWidth - firstLinePrefixWidth);
  return wrapByVisualWidth(text, bodyWidth).map((line, index) => ({
    indent: index === 0 ? "" : " ".repeat(firstLinePrefixWidth),
    line,
    first: index === 0,
  }));
}

export function locateCursorRow(
  text: string,
  cursor: number,
  width: number,
): number {
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

export function frameContentWidth(terminalCols: number): number {
  return Math.max(20, terminalCols - FRAME_RESERVED_COLUMNS);
}

export function inputTextWidth(terminalCols: number): number {
  return Math.max(
    20,
    frameContentWidth(terminalCols) - INPUT_BOX_HORIZONTAL_CHROME,
  );
}

export function composeDraftLine(draft: string): string {
  return `${INPUT_PROMPT_PREFIX}${draft}`;
}

export function imagePreviewBounds(
  terminalCols: number,
  terminalRows: number,
  transcriptViewportRows: number,
): { maxCols: number; maxRows: number } {
  const maxCols = Math.max(
    IMAGE_PREVIEW_MIN_COLS,
    Math.min(IMAGE_PREVIEW_MAX_COLS, frameContentWidth(terminalCols)),
  );
  const availableRows =
    transcriptViewportRows > 0
      ? transcriptViewportRows - IMAGE_PREVIEW_VIEWPORT_CHROME_ROWS
      : terminalRows - 18;
  const maxRows = Math.max(
    IMAGE_PREVIEW_MIN_ROWS,
    Math.min(IMAGE_PREVIEW_MAX_ROWS, availableRows),
  );
  return { maxCols, maxRows };
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return `${seconds}s`;
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours === 0) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes}m ${seconds}s`;
}
