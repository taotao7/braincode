import { render as renderMarkdown, strip as stripMarkdown } from "markdansi";
import type { SessionContext, SessionSummary } from "@braincode/config";
import type { PetWatcherSnapshotItem } from "./pet-watcher";
import type { EditRow } from "./tool-edit-preview";
import type { ImageProtocol } from "./image-preview";
import type {
  BrainPanelState,
  DecisionPanelState,
  DraftMetrics,
  HookPanelState,
  IntentPanelState,
  McpPanelState,
  Overlay,
  RuntimeErrorPanelState,
  SessionPanelState,
  ToastState,
  TranscriptItem,
  TranscriptRenderEntry,
} from "./tui-types";
import {
  COLLAPSED_TEXT_LINE_LIMIT,
  COLLAPSIBLE_TEXT_CHAR_THRESHOLD,
  COLLAPSIBLE_TEXT_LINE_THRESHOLD,
  HEADER_ROWS,
  RESTORED_TEXT_CHUNK_CHAR_LIMIT,
  RESTORED_TEXT_CHUNK_LINE_LIMIT,
} from "./tui-constants";
import {
  clamp,
  cleanInline,
  countWrappedRows,
  leftAlignTranscriptRows,
  truncate,
  wrapByVisualWidth,
} from "./tui-text";
import { formatToolArgLine, toolCategoryTitle } from "./tui-tools";
import {
  formatPlanMetadataLine,
  formatPlanWorkersBudgetLine,
  formatTuiFinalReportSections,
  todoGlyph,
  transcriptBadge,
} from "./tui-format";

export function displayImagePath(path: string): string {
  const home = process.env.HOME;
  const shown =
    home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
  return shown.length > 60 ? `…${shown.slice(-59)}` : shown;
}

export function imageCaption(
  path: string,
  cols: number,
  rows: number,
  protocol: ImageProtocol,
): string {
  const tag = protocol === "kitty" ? "kitty" : "text";
  return `${displayImagePath(path)} · ${cols}×${rows} cells · ${tag}`;
}

// Pull the artifact path out of an imageMaker worker summary, which begins
// with a "Generated image artifact: <path>" line.
export function extractGeneratedImagePath(summary: string): string | null {
  const match = /Generated image artifact:\s*(.+)/.exec(summary);
  if (!match) return null;
  const path = match[1]?.split(/\r?\n/)[0]?.trim();
  return path && path.length > 0 ? path : null;
}

export function restoreSessionTranscriptItems(
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

export function appendRestoredTextItems(
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

export function chunkRestoredText(text: string): string[] {
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

export function splitLongRestoredLine(line: string): string[] {
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

export function normalizeTranscriptItem(item: TranscriptItem): TranscriptItem {
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

export function normalizeTranscriptItemForFoldPreference(
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

export function normalizeTranscriptItemsForFoldPreference(
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

export function transcriptPatchChangesItem(
  item: TranscriptItem,
  patch: Partial<TranscriptItem>,
): boolean {
  return Object.entries(patch).some(
    ([key, value]) => !Object.is(item[key as keyof TranscriptItem], value),
  );
}

export function samePetSnapshot(
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

export function isTranscriptItemCollapsible(item: TranscriptItem): boolean {
  if (item.streaming) return false;
  if (item.kind === "tool") return true;
  if (item.kind === "report") return false;
  return isTranscriptItemAutoCollapsed({
    ...item,
    text:
      item.kind === "assistant"
        ? normalizeAssistantText(item.text)
        : item.text,
  });
}

export function isTranscriptItemAutoCollapsed(item: TranscriptItem): boolean {
  if (item.streaming) return false;
  if (item.kind === "tool") return true;
  if (item.kind === "report") return false;
  if (!["assistant", "panel", "help", "error"].includes(item.kind))
    return false;
  const lines = item.text.split(/\r?\n/);
  return (
    lines.length >= COLLAPSIBLE_TEXT_LINE_THRESHOLD ||
    item.text.length >= COLLAPSIBLE_TEXT_CHAR_THRESHOLD
  );
}

export function layoutTranscriptItems(
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

export function viewportTranscriptLayout(
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

export function transcriptScrollAnchors(
  layout: { entries: TranscriptRenderEntry[]; totalRows: number },
  maxScrollTop: number,
): number[] {
  const anchors = new Set<number>([0, maxScrollTop]);
  for (const entry of layout.entries) {
    anchors.add(clamp(entry.rowStart, 0, maxScrollTop));
  }
  return Array.from(anchors).sort((left, right) => left - right);
}

export function nextTranscriptScrollTop(
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

export function estimateFixedFrameRows({
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
  let rows = HEADER_ROWS;

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
      3 +
        decisionPanel.options.length +
        (decisionPanel.argsSummary ? 1 : 0) +
        (decisionPanel.policySummary ? 1 : 0),
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

export function estimateFooterRows(
  queueLength: number,
  toast: ToastState | null,
): number {
  const footerLeftRows = 1 + (queueLength > 0 ? 1 : 0) + (toast ? 3 : 0);
  return Math.max(3, footerLeftRows);
}

export function borderedPanelRows(contentRows: number): number {
  return contentRows + 3;
}

export function isTranscriptContinuation(
  previous: TranscriptItem,
  item: TranscriptItem,
): boolean {
  if (previous.kind === "tool" && item.kind === "tool") {
    return previous.toolCategory === item.toolCategory;
  }
  return false;
}

export function estimateTranscriptItemRows(
  item: TranscriptItem,
  width: number,
  continuation: boolean,
  collapsible: boolean,
): number {
  if (item.kind === "user") {
    return leftAlignTranscriptRows(item.text, width, 6).length;
  }
  if (item.kind === "tool") return 1;
  if (item.kind === "image") {
    // The badge/caption is the main line; image cells are counted as a
    // supplement (see estimateTranscriptSupplementRows).
    return countWrappedRows(item.text || " ", Math.max(10, width));
  }
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

export function estimateTranscriptSupplementRows(
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
  if (item.kind === "image") {
    if (item.imageStatus === "ready" && item.imageRows) {
      rows += item.imageRows;
    } else if (item.imageStatus === "failed") {
      rows += countWrappedRows(
        `↳ ${item.imageError ?? "Failed to render image."}`,
        Math.max(10, width - 2),
      );
    } else {
      rows += 1; // loading spinner line
    }
  }
  return rows;
}

export function transcriptPlainLine(
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

export function isMarkdownTranscriptItem(item: TranscriptItem): boolean {
  return (
    (item.kind === "assistant" && !item.streaming) || item.kind === "help"
  );
}

export function renderTranscriptMarkdown(text: string, width: number): string {
  return renderMarkdown(text, {
    width: Math.max(20, width),
    hyperlinks: false,
    codeGutter: false,
    codeWrap: true,
    tableBorder: "unicode",
  }).trimEnd();
}

export function renderTranscriptMarkdownPlain(
  text: string,
  width: number,
): string {
  return stripMarkdown(text, {
    width: Math.max(20, width),
    hyperlinks: false,
    codeGutter: false,
    codeWrap: true,
    tableBorder: "unicode",
  }).trimEnd();
}

export function collapseTranscriptText(text: string): {
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

export function normalizeAssistantText(text: string): string {
  const result = parseWorkerResultEnvelope(text);
  return result ? formatWorkerResultEnvelope(result) : text;
}

export function parseWorkerResultEnvelope(
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

export function formatWorkerResultEnvelope(
  record: Record<string, unknown>,
): string {
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

export function sliceJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function editPreviewRowEstimateText(row: EditRow): string {
  const marker =
    row.kind === "removed" ? "-" : row.kind === "added" ? "+" : " ";
  return `000 000 ${marker} ${row.text}`;
}

export function sessionSearchText(entry: SessionSummary): string {
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

export function filterSessions(
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
