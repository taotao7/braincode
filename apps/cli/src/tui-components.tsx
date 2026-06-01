import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useStdout } from "ink";
import type { BraincodeMode, BraincodeTheme } from "@braincode/config";
import { BrainPet } from "./brain-pet";
import { usePetWatcher, type PetWatcherSnapshotItem } from "./pet-watcher";
import type { EditPreview, EditRow } from "./tool-edit-preview";
import type {
  BrainPanelState,
  DecisionPanelState,
  DraftMetrics,
  DraftWindowLine,
  HookPanelState,
  InputState,
  IntentPanelState,
  McpPanelState,
  Overlay,
  RunStatusState,
  RuntimeErrorPanelState,
  SessionPanelState,
  ToastState,
  TranscriptItem,
  TranscriptRenderEntry,
  TuiStore,
  UiColor,
} from "./tui-types";
import {
  BRAIN_LOGO,
  INK_RENDER_SAFETY_ROWS,
  INPUT_MAX_LINES,
  RUN_STATUS_ANIMATION_MS,
  TUI_ANIMATIONS_ENABLED,
} from "./tui-constants";
import { tone, useTuiTheme } from "./tui-theme";
import { useTuiStoreSnapshot } from "./tui-store";
import { clamp, cleanInline, leftAlignTranscriptRows, truncate } from "./tui-text";
import { formatToolArgLine, toolCategoryColor, toolCategoryTitle } from "./tui-tools";
import {
  colorFor,
  emptyTokenUsage,
  formatPlanMetadataLine,
  formatPlanWorkersBudgetLine,
  formatTuiFinalReportSections,
  todoGlyph,
  transcriptBadge,
} from "./tui-format";
import {
  estimateFixedFrameRows,
  estimateFooterRows,
  isMarkdownTranscriptItem,
  layoutTranscriptItems,
  renderTranscriptMarkdown,
  transcriptScrollAnchors,
  viewportTranscriptLayout,
} from "./tui-transcript";
import {
  clipDraftToWindow,
  draftMetricsFromWindow,
  draftWindowDisplayLines,
  fitDraftWindowLine,
  sameDraftMetrics,
} from "./tui-input";
import {
  buildRunStatusChars,
  paintInputSurface,
  paintRunStatusLine,
  runStatusActiveIndex,
  runStatusCharColor,
} from "./tui-paint";

export function Badge({
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

export function HeaderSeparator() {
  const theme = useTuiTheme();
  return (
    <Box flexDirection="column" marginRight={1}>
      <Text color={theme.colors.gray}>│</Text>
      <Text color={theme.colors.gray}>│</Text>
    </Box>
  );
}

export function HeaderMetaLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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

export function HeaderInfoLine({
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

// The header block. Rendered at the top of the scrollable transcript region so
// it scrolls out of view as the conversation grows (it occupies HEADER_ROWS).
export function HeaderBlock({
  mode,
  themeName,
  sessionId,
  headerRoot,
  projectSummary,
  userSummary,
}: {
  mode: BraincodeMode;
  themeName: BraincodeTheme;
  sessionId: string;
  headerRoot: string;
  projectSummary: string;
  userSummary: string;
}) {
  const theme = useTuiTheme();
  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.focusedBorder}
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
  );
}

export function DraftInputLine({
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

export function SectionDivider({
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

export function ThinDivider({ width }: { width: number }) {
  const theme = useTuiTheme();
  return (
    <Text color={theme.colors.gray}>
      {"·".repeat(Math.max(8, Math.min(width, 120)))}
    </Text>
  );
}

export function TranscriptLine({
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
    const rows = leftAlignTranscriptRows(item.text, width, 6);
    return (
      <Box flexDirection="column">
        {rows.map((row, index) => (
          <Text key={index}>
            {row.first ? (
              <>
                <Badge label="YOU" backgroundColor="blue" />
                <Text> </Text>
              </>
            ) : (
              <Text>{row.indent}</Text>
            )}
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

export function ThinkingTranscriptLine() {
  const theme = useTuiTheme();
  return (
    <Text>
      <Badge label="THINKING" backgroundColor="yellow" />
      <Text color={theme.colors.gray}> working</Text>
      <Text color={theme.colors.yellow}> ...</Text>
    </Text>
  );
}

export function padLineNum(value: number | null, width: number): string {
  if (value === null) return " ".repeat(width);
  const str = String(value);
  return str.length >= width ? str : " ".repeat(width - str.length) + str;
}

export function EditPreviewView({ preview }: { preview: EditPreview }) {
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

export function ImagePreviewView({ item }: { item: TranscriptItem }) {
  const theme = useTuiTheme();
  if (item.imageStatus === "failed") {
    return (
      <Box flexDirection="column" marginLeft={2}>
        <Text color={tone(theme, "red")}>
          ↳ {item.imageError ?? "Failed to render image."}
        </Text>
      </Box>
    );
  }
  if (item.imageStatus !== "ready" || !item.imageLines) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        <Text color={theme.colors.gray}>↳ rendering…</Text>
      </Box>
    );
  }
  // Image lines embed their own SGR. For Kitty this is required because the
  // placeholder foreground color encodes the image id and must not be stripped
  // by NO_COLOR or quantized by Ink/Chalk color handling.
  return (
    <Box flexDirection="column">
      {item.imageLines.map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}
    </Box>
  );
}

export function EditRowLine({
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

export function ToastView({ toast }: { toast: ToastState }) {
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

export function RuntimeStatusLine({
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

export const TranscriptSurface = React.memo(function TranscriptSurface({
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
  // Keep the logo on screen while the transcript is empty, even as the user
  // types a draft. It only disappears once a prompt is submitted (which appends
  // the first transcript item).
  const showEmptyIntro = items.length === 0;
  const transcriptChromeRows = items.length > 0 ? 1 : BRAIN_LOGO.length + 4;
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
    // Fill the same middle region the transcript would occupy so the input box
    // and footer settle at the bottom of the terminal instead of bunching up
    // under the header. The logo is centered vertically within that region.
    const introHeight = Math.max(
      BRAIN_LOGO.length + 2,
      availableTranscriptRows + transcriptChromeRows,
    );
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height={introHeight}
      >
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

export const TranscriptEntryView = React.memo(function TranscriptEntryView({
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
      {item.kind === "image" ? <ImagePreviewView item={item} /> : null}
    </Box>
  );
});

export const InputSurface = React.memo(function InputSurface({
  inputStore,
  draftMetricsStore,
  footerRowsStore,
  runStatusStore,
  running,
  overlayOpen,
  inputWidth,
  contentWidth,
}: {
  inputStore: TuiStore<InputState>;
  draftMetricsStore: TuiStore<DraftMetrics>;
  footerRowsStore: TuiStore<number>;
  runStatusStore: TuiStore<RunStatusState | null>;
  running: boolean;
  overlayOpen: boolean;
  inputWidth: number;
  contentWidth: number;
}) {
  const { stdout } = useStdout();
  const theme = useTuiTheme();
  const colors = theme.colors;
  // Bumped to force a declarative ink re-render while a panel/overlay is open,
  // where imperative ANSI painting would mis-position the status line.
  const [, setRenderTick] = useState(0);
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
      if (mode === "paint" && stdout && !overlayOpen) {
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
        // While a panel/overlay sits between the transcript and the input box,
        // ink owns the frame layout. Imperative ANSI repaint can't see the
        // panel's height, so it would smear a second status line at the wrong
        // row. Re-render declaratively instead and let ink place it once.
        if (overlayOpen) {
          setRenderTick((tick) => tick + 1);
        } else {
          paintRunStatusLine({
            stdout,
            theme,
            contentWidth,
            footerRows: footerRowsStore.getSnapshot(),
            runStatus: runStatusStore.getSnapshot(),
            draftWindow: currentWindow,
          });
        }
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
    overlayOpen,
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

export const FooterSurface = React.memo(function FooterSurface({
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
