import {
  humanizeAgentRuntimeError,
  type FinalReport,
  type RuntimePlan,
  type WorkerLifecycleEvent,
} from "@braincode/agent-runtime";
import type { McpServerEntry, SessionSummary } from "@braincode/config";
import type { BrainModel } from "@braincode/brain";
import type { McpHealthResult } from "./mcp-health";
import type {
  CommandDefinition,
  McpPanelEntry,
  TokenUsageSnapshot,
  TranscriptItem,
  UiColor,
} from "./tui-types";
import {
  COMMANDS,
  INTENT_BIT_CHARS,
  INTENT_BIT_DOWN,
  INTENT_BIT_LEFT,
  INTENT_BIT_RIGHT,
  INTENT_BIT_UP,
  TUI_MOUSE_ENABLED,
} from "./tui-constants";
import { cleanInline, truncate } from "./tui-text";
import { toolCategoryColor } from "./tui-tools";

export function formatRoutingSourceLabel(
  source: RuntimePlan["routing"]["source"],
): string {
  switch (source) {
    case "router-brain":
      return "routeBrain";
    case "heuristic":
      return "heuristic";
  }
}

export function formatRoutingConfidence(plan: RuntimePlan): string | undefined {
  return typeof plan.routing.confidence === "number"
    ? `${Math.round(plan.routing.confidence * 100)}%`
    : undefined;
}

export function formatRoutingDescriptor(plan: RuntimePlan): string {
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
    report.planReview ? `plan ${formatFinalReportPlanReviewLabel(report)}` : "",
    `review ${formatFinalReportReviewLabel(report)}`,
    report.metrics ? `usage ${formatFinalReportUsageLabel(report)}` : "",
    `session ${report.sessionId.slice(0, 8)}`,
  ].filter(Boolean).join(" · ");
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
  if (report.planReview) {
    lines.push(`Plan review: ${formatFinalReportPlanReviewLabel(report)}`);
    if (report.planReview.proposedSideEffects.length) {
      lines.push(`Planned side effects: ${report.planReview.proposedSideEffects.map((effect) => `${effect.kind}:${effect.target}`).slice(0, 4).join(", ")}${report.planReview.proposedSideEffects.length > 4 ? `, +${report.planReview.proposedSideEffects.length - 4} more` : ""}`);
    }
  }
  lines.push(`Review: ${formatFinalReportReviewLabel(report)}`);
  if (report.metrics) {
    lines.push(`Usage: ${formatFinalReportUsageLabel(report)}`);
    const breakdown = formatTokenBreakdown(report.metrics.tokens.total);
    if (breakdown) {
      lines.push(`Token breakdown: ${breakdown}`);
    }
    if (report.metrics.tokens.byPhase.length) {
      lines.push(`Token phases: ${report.metrics.tokens.byPhase.map((phase) => `${phase.phase ?? "unknown"} ${formatCompactTokenCount(phase.total)}`).join(", ")}`);
    }
  }
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

export function formatFinalReportReviewLabel(report: FinalReport): string {
  if (!report.review) return "not run";
  return `${report.review.decision}${report.review.confidence !== undefined ? ` (${Math.round(report.review.confidence * 100)}%)` : ""}`;
}

export function formatFinalReportPlanReviewLabel(report: FinalReport): string {
  if (!report.planReview) return "not recorded";
  const sideEffects = report.planReview.proposedSideEffects.length;
  return `${report.planReview.status} by ${report.planReview.approver} · ${sideEffects} side effect${sideEffects === 1 ? "" : "s"}${report.planReview.requiredReview ? " · review required" : ""}`;
}

export function formatFinalReportPatchLabel(report: FinalReport): string {
  if (!report.patch || report.patch.changedFiles.length === 0)
    return "no patch activity";
  return `${report.patch.changedFiles.length} file${report.patch.changedFiles.length === 1 ? "" : "s"}, +${report.patch.diffStats.insertions} -${report.patch.diffStats.deletions}`;
}

export function formatFinalReportChecksLabel(report: FinalReport): string {
  if (!report.checks) return "not run";
  if (report.checks.results.length === 0) {
    return report.checks.reason ? `${report.checks.status} (${report.checks.reason})` : report.checks.status;
  }
  return `${report.checks.status} (${[
    report.checks.results.map((result) => `${result.name} ${result.status}`).join(", "),
    report.checks.reason,
  ].filter(Boolean).join("; ")})`;
}

export function formatFinalReportUsageLabel(report: FinalReport): string {
  const metrics = report.metrics;
  if (!metrics) return "not recorded";
  const tokens = `${formatCompactTokenCount(metrics.tokens.total.total)} tokens`;
  const toolCalls = `${metrics.toolCalls.total} tool call${metrics.toolCalls.total === 1 ? "" : "s"}`;
  return `${tokens}; ${toolCalls}${metrics.toolCalls.failed > 0 ? `, ${metrics.toolCalls.failed} failed` : ""}`;
}

// Full token breakdown for the final report. Unlike the live status line (which
// shows only the all-inclusive total), this reconciles the total into its
// components so the numbers add up: input + output + cacheRead + cacheWrite.
export function formatTokenBreakdown(tokens: TokenUsageSnapshot): string {
  const parts: string[] = [];
  if (tokens.input > 0)
    parts.push(`in ${formatCompactTokenCount(tokens.input)}`);
  if (tokens.output > 0)
    parts.push(`out ${formatCompactTokenCount(tokens.output)}`);
  if (tokens.cacheRead > 0)
    parts.push(`cache read ${formatCompactTokenCount(tokens.cacheRead)}`);
  if (tokens.cacheWrite > 0)
    parts.push(`cache write ${formatCompactTokenCount(tokens.cacheWrite)}`);
  return parts.join(" · ");
}

export function formatIntentGraphLines(
  plan: RuntimePlan,
  width: number,
): string[] {
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

export function wrapIntentLine(
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

export function isIntentGraphHeaderLine(line: string): boolean {
  return /^(Intent|Mode|Primary|Routing|Confidence|Reason|Workers|Budget|Model|Tools) ·|^Todo Graph:$/.test(
    line,
  );
}

export function colorFor(
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
    case "image": {
      switch (item.imageStatus) {
        case "ready":
          return "cyan";
        case "failed":
          return "red";
        default:
          return "yellow";
      }
    }
  }
}

export function transcriptBadge(item: TranscriptItem): {
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
    case "image":
      return {
        label: "IMAGE",
        color:
          item.imageStatus === "failed"
            ? "red"
            : item.imageStatus === "ready"
              ? "cyan"
              : "yellow",
      };
  }
}

export function finalReportStatusColor(
  status: FinalReport["status"] | undefined,
): UiColor {
  if (status === "approved") return "green";
  if (status === "changes_requested") return "yellow";
  if (status === "needs_clarification") return "yellow";
  if (status === "blocked") return "red";
  return "cyan";
}

export function todoGlyph(
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

export function formatWorkerPhase(
  phase: WorkerLifecycleEvent["phase"],
): string {
  if (phase === "primary") return "agent";
  if (phase === "review") return "review";
  return "worker";
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
      : "  • Press ↑/↓ to scroll the transcript when the input is empty; PageUp/PageDown or Ctrl+↑/Ctrl+↓ also scroll it. Mouse capture is off by default; set BRAINCODE_TUI_MOUSE=true to enable wheel scrolling.",
    "  • Press Ctrl+P/Ctrl+N for prompt history; ↑/↓ still moves within multi-line input.",
    "  • Press Ctrl+Y to edit the most recent queued prompt.",
    "  • Press Ctrl+T to expand or collapse foldable transcript rows.",
    "  • Ctrl+V pastes a clipboard image or text from the system clipboard.",
    "  • Models are picked by Brain routing; use `braincode config` to change providers.",
  ].join("\n");
}

export function describeMcpEntry(entry: McpServerEntry): string {
  if (entry.url) return entry.url;
  if (entry.command) {
    const args = (entry.args ?? []).join(" ");
    return args ? `${entry.command} ${args}` : entry.command;
  }
  if (entry.type) return entry.type;
  return "(no command/url)";
}

export function mergeHealth(result: McpHealthResult): Partial<McpPanelEntry> {
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

export function describeHealth(entry: McpPanelEntry): string {
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

export function formatBrainDetail(
  brain: BrainModel,
  defaultBrainId: string,
): string {
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

export function sessionStatusGlyph(status: SessionSummary["status"]): string {
  switch (status) {
    case "completed":
      return "✓";
    case "failed":
      return "✗";
    case "incomplete":
      return "·";
  }
}

export function formatTimestamp(ms: number): string {
  if (!ms) return "(unknown time)";
  const date = new Date(ms);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function healthGlyph(entry: McpPanelEntry): string {
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

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    /aborted|abort|interrupted/i.test(error.message)
  );
}

export function humanizeRuntimeError(error: unknown): string {
  return humanizeAgentRuntimeError(error);
}

export function isLikelySessionId(token: string): boolean {
  return /^[0-9a-fA-F-]{8,}$/.test(token);
}

export function emptyTokenUsage(): TokenUsageSnapshot {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

export function extractTokenUsage(message: unknown): TokenUsageSnapshot | null {
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

export function readUsageNumber(usage: object, keys: string[]): number {
  const record = usage as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
      return value;
  }
  return 0;
}

export function sumTokenUsage(
  usages: TokenUsageSnapshot[],
): TokenUsageSnapshot {
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

export function sameTokenUsage(
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

export function formatRunStatusTokens(tokens: TokenUsageSnapshot): string {
  if (tokens.total <= 0) return "";
  // The live status line shows only the all-inclusive total so it always reads
  // cleanly at a glance. The full input/output/cache breakdown lives in the
  // final report (see formatTokenBreakdown), where the numbers reconcile.
  return `↓ ${formatCompactTokenCount(tokens.total)} tokens`;
}

export function formatRunTokenSummary(tokens: TokenUsageSnapshot): string {
  if (tokens.total <= 0) return "";
  return `${formatCompactTokenCount(tokens.total)} tokens`;
}

export function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000)
    return `${trimTrailingZero((value / 1_000_000).toFixed(1))}m`;
  if (value >= 1_000) return `${trimTrailingZero((value / 1_000).toFixed(1))}k`;
  return `${Math.round(value)}`;
}

export function trimTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}
