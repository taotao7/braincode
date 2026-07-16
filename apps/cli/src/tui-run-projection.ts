import type {
  AgentEvent,
  TodoLifecycleEvent,
  WorkerLifecycleEvent,
} from "@braincode/agent-runtime";
import {
  buildEditPreview,
  displayEditPath,
  extractEditArgs,
  resolveEditPath,
  snapshotFileContent,
  type EditArgs,
} from "./tool-edit-preview";
import {
  DEFAULT_STREAM_FLUSH_MS,
  STREAM_FLUSH_MAX_WAIT_MS,
  STREAM_FLUSH_MIN_CHARS,
} from "./tui-constants";
import { formatWorkerPhase } from "./tui-format";
import { truncate } from "./tui-text";
import {
  classifyToolCall,
  deriveToolIntent,
  formatBlockedToolDetail,
  formatBlockedToolText,
  formatRepeatedReadToolDetail,
  formatRepeatedReadToolText,
  formatToolEndText,
  formatToolResultDetail,
  formatToolStartText,
  getToolEvidenceCacheInfo,
  intentIsWholeMessage,
  toolArgsCount,
  toolArgsObject,
  toolCallDisplayKey,
  toolCategoryTitle,
} from "./tui-tools";
import { extractGeneratedImagePath, normalizeTranscriptItem } from "./tui-transcript";
import type { ToolCategory, TranscriptItem } from "./tui-types";

// One transcript mutation produced by the projection. The TUI applies these to
// React state; tests apply them to a plain array. `remove` and `update` target
// items previously emitted through `append`.
export type TranscriptOp =
  | { op: "append"; item: TranscriptItem }
  | { op: "update"; id: string; patch: Partial<TranscriptItem>; normalize?: boolean }
  | { op: "remove"; id: string };

export type RunProjectionDeps = {
  /** Apply transcript mutations. Called synchronously from event handlers and timers. */
  apply: (ops: TranscriptOp[]) => void;
  /** Update the pinned status line (status transcript item + run status store). */
  updateStatus: (text: string) => void;
  /** Register token usage extracted from a provider message. */
  registerTokenUsage: (message: unknown) => void;
  /** Start a new usage accounting turn. */
  beginUsageTurn: () => void;
  /** Whether a usage turn is currently active. */
  hasActiveUsageTurn: () => boolean;
  /** Show an inline preview for a generated image artifact. */
  appendImagePreview: (path: string) => void;
  projectRoot: string;
  /** Override the stream coalescing interval (tests use a small value). */
  streamFlushMs?: number;
};

export type RunProjection = {
  onEvent: (event: AgentEvent) => void;
  onWorkerEvent: (event: WorkerLifecycleEvent) => void;
  upsertTodoItem: (event: TodoLifecycleEvent) => void;
  /** Flush and close all streaming buffers (assistant text + thinking). */
  finalizeStreamingBuffers: () => void;
  /** The phase currently allowed to stream prose into the transcript. */
  activeStreamPhase: () => "primary" | "support" | "review" | null;
};

/**
 * Projection of runtime events onto transcript items for one run.
 *
 * Owns all run-scoped translation state — streaming text/thinking buffers,
 * in-flight tool rows, worker rows, todo rows — and expresses every UI change
 * as TranscriptOps through `deps.apply`, so the mapping is testable by feeding
 * event sequences and asserting the resulting item sequence. Only two side
 * channels escape the op stream: token-usage accounting and image previews,
 * both injected via deps.
 */
export function createRunProjection(deps: RunProjectionDeps): RunProjection {
  const apply = deps.apply;
  const append = (item: TranscriptItem) => apply([{ op: "append", item }]);
  const update = (id: string, patch: Partial<TranscriptItem>) =>
    apply([{ op: "update", id, patch }]);
  const remove = (id: string) => apply([{ op: "remove", id }]);

  const STREAM_FLUSH_MS = deps.streamFlushMs ?? defaultStreamFlushMs();

  const currentAssistant = { id: null as string | null, text: "" };
  const currentThinking = { id: null as string | null, text: "" };
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
  const workerItems = new Map<string, { itemId: string; startedAt: number }>();
  const todoItems = new Map<string, string>();

  // Coalesce high-frequency text_delta updates so Ink is not asked to repaint
  // the full frame for every token.
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
    update(id, { text, streaming: true });
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

  // Reasoning streams less densely than text, so a single timer-coalesced
  // flush (mirroring the assistant stream) keeps Ink repaints bounded.
  let thinkingFlushHandle: ReturnType<typeof setTimeout> | null = null;
  let thinkingPendingId: string | null = null;
  let thinkingRenderedLength = 0;
  const flushThinking = (): boolean => {
    if (thinkingFlushHandle) {
      clearTimeout(thinkingFlushHandle);
      thinkingFlushHandle = null;
    }
    if (!thinkingPendingId) return false;
    if (currentThinking.text.length === thinkingRenderedLength) return false;
    const id = thinkingPendingId;
    const text = currentThinking.text;
    thinkingPendingId = null;
    thinkingRenderedLength = text.length;
    update(id, { text, streaming: true });
    return true;
  };
  const scheduleThinkingFlush = (id: string) => {
    thinkingPendingId = id;
    if (thinkingFlushHandle) return;
    thinkingFlushHandle = setTimeout(() => {
      thinkingFlushHandle = null;
      flushThinking();
    }, STREAM_FLUSH_MS);
  };

  const finalizeStreamingBuffers = () => {
    flushStream();
    flushThinking();
    if (currentAssistant.id && currentAssistant.text.length === 0) {
      remove(currentAssistant.id);
    }
    if (currentAssistant.id && currentAssistant.text.length > 0) {
      apply([{ op: "update", id: currentAssistant.id, patch: { streaming: false }, normalize: true }]);
    }
    // Finalize the reasoning block: drop it if empty, otherwise mark it
    // non-streaming so it auto-collapses through the normal transcript path.
    if (currentThinking.id && currentThinking.text.trim().length === 0) {
      remove(currentThinking.id);
    } else if (currentThinking.id) {
      apply([{ op: "update", id: currentThinking.id, patch: { streaming: false }, normalize: true }]);
    }
    currentAssistant.id = null;
    currentAssistant.text = "";
    currentThinking.id = null;
    currentThinking.text = "";
    thinkingRenderedLength = 0;
    streamRenderedLength = 0;
    streamLastFlushAt = Date.now();
    thinkingShown = false;
  };

  const ensureAssistantItem = () => {
    if (currentAssistant.id) return currentAssistant.id;
    const id = crypto.randomUUID();
    currentAssistant.id = id;
    currentAssistant.text = "";
    append({ id, kind: "assistant", text: "", streaming: true });
    return id;
  };
  const ensureThinkingItem = () => {
    if (currentThinking.id) return currentThinking.id;
    const id = crypto.randomUUID();
    currentThinking.id = id;
    currentThinking.text = "";
    append({ id, kind: "thinking", text: "", streaming: true });
    return id;
  };
  const showThinkingStatus = () => {
    if (thinkingShown) return;
    thinkingShown = true;
    deps.updateStatus("Thinking…");
  };

  const onEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "agent_start":
        deps.updateStatus("Agent starting…");
        return;
      case "turn_start":
        deps.beginUsageTurn();
        finalizeStreamingBuffers();
        deps.updateStatus("Turn in progress…");
        return;
      case "message_start":
        if (!deps.hasActiveUsageTurn()) deps.beginUsageTurn();
        deps.registerTokenUsage(event.message);
        return;
      case "message_update": {
        const updateEvent = event.assistantMessageEvent;
        deps.registerTokenUsage("partial" in updateEvent ? updateEvent.partial : undefined);
        if (updateEvent.type === "done") deps.registerTokenUsage(updateEvent.message);
        if (updateEvent.type === "error") deps.registerTokenUsage(updateEvent.error);
        if (updateEvent.type === "text_delta") {
          if (activeStreamPhase !== "primary") return;
          const id = ensureAssistantItem();
          currentAssistant.text += updateEvent.delta;
          scheduleStreamFlush(id);
        } else if (updateEvent.type === "thinking_delta") {
          showThinkingStatus();
          // Surface the model's reasoning inline as a collapsible block, but
          // only for the primary stream (workers return JSON, not prose).
          if (activeStreamPhase === "primary") {
            const id = ensureThinkingItem();
            currentThinking.text += updateEvent.delta;
            scheduleThinkingFlush(id);
          }
        } else if (updateEvent.type === "toolcall_start") {
          deps.updateStatus("Tool Call · preparing arguments…");
        } else if (updateEvent.type === "toolcall_end") {
          const callName = updateEvent.toolCall?.name ?? "";
          if (callName) {
            const category = classifyToolCall(callName, updateEvent.toolCall?.arguments);
            deps.updateStatus(`Tool Call · ${toolCategoryTitle(category)} · ${callName}`);
          }
        }
        return;
      }
      case "message_end":
        deps.registerTokenUsage(event.message);
        return;
      case "tool_execution_start": {
        // Capture the model's lead-in prose (its stated intent) before the
        // streaming buffers are finalized, so the tool row carries the reason
        // it was called instead of appearing context-free.
        const intent = deriveToolIntent(currentAssistant.text);
        const intentAssistantId =
          intent !== undefined &&
          currentAssistant.id !== null &&
          intentIsWholeMessage(currentAssistant.text, intent)
            ? currentAssistant.id
            : null;
        finalizeStreamingBuffers();
        // When the entire assistant message was just that short lead-in, fold
        // it into the tool row rather than leaving a duplicate prose block.
        if (intentAssistantId) {
          remove(intentAssistantId);
        }
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
          ? snapshotFileContent(resolveEditPath(editArgs.filePath, deps.projectRoot))
          : undefined;
        toolItems.set(event.toolCallId, {
          itemId,
          toolName: event.toolName,
          toolCategory,
          startedAt: Date.now(),
          argsObject,
          argsCount,
          argsKey,
          editArgs,
          editBeforePromise,
        });
        append({
          id: itemId,
          kind: "tool",
          toolStatus: "running",
          toolName: event.toolName,
          toolCategory,
          startedAt: Date.now(),
          text: formatToolStartText(event.toolName),
          toolArgs: argsObject,
          toolDetail: intent ? `intent: ${intent}` : undefined,
          collapsed: true,
        });
        deps.updateStatus(
          `Tool Call · ${toolCategoryTitle(toolCategory)} · running ${event.toolName}`,
        );
        return;
      }
      case "tool_execution_update": {
        const tracked = toolItems.get(event.toolCallId);
        if (!tracked) return;
        deps.updateStatus(
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
        // A hard-blocked repeat call: the runtime intercepted the loop and
        // returned cached evidence flagged as an error. Surface it as a
        // distinct state so the user sees the agent was redirected.
        if (evidence?.blocked) {
          const consecutiveCount = evidence.consecutiveCount ?? 2;
          update(tracked.itemId, {
            toolStatus: "failed",
            toolCategory: tracked.toolCategory,
            finishedAt: Date.now(),
            text: formatBlockedToolText(event.toolName, consecutiveCount),
            toolDetail: formatBlockedToolDetail(consecutiveCount, evidence),
            collapsed: true,
          });
          deps.updateStatus(
            `Tool Call · ${toolCategoryTitle(tracked.toolCategory)} · blocked repeated ${event.toolName} (${consecutiveCount}x) · forcing new direction`,
          );
          return;
        }
        if (
          tracked.toolCategory === "read" &&
          evidence?.reused &&
          (evidence.callCount ?? 0) > 1
        ) {
          const existing = repeatedReadToolItems.get(tracked.argsKey);
          const duplicateCount = Math.max(1, (evidence.callCount ?? 2) - 1);
          const text = formatRepeatedReadToolText(event.toolName, duplicateCount);
          const toolDetail = formatRepeatedReadToolDetail(duplicateCount, evidence);
          if (existing && existing.itemId !== tracked.itemId) {
            remove(tracked.itemId);
            update(existing.itemId, {
              toolStatus: event.isError ? "failed" : "ok",
              toolCategory: tracked.toolCategory,
              finishedAt: Date.now(),
              text,
              toolDetail,
              collapsed: true,
            });
          } else {
            repeatedReadToolItems.set(tracked.argsKey, { itemId: tracked.itemId });
            update(tracked.itemId, {
              toolStatus: event.isError ? "failed" : "ok",
              toolCategory: tracked.toolCategory,
              finishedAt: Date.now(),
              text,
              toolDetail,
              collapsed: true,
            });
          }
          deps.updateStatus(
            `Tool Call · Read · reused cached ${event.toolName} (${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"})`,
          );
          return;
        }
        update(tracked.itemId, {
          toolStatus: event.isError ? "failed" : "ok",
          toolCategory: tracked.toolCategory,
          finishedAt: Date.now(),
          text: formatToolEndText(event.toolName, event.isError, elapsed),
          toolDetail: formatToolResultDetail(event.result),
          collapsed: true,
        });
        if (tracked.editArgs) {
          const editArgs = tracked.editArgs;
          const beforePromise = tracked.editBeforePromise ?? Promise.resolve(null);
          const itemId = tracked.itemId;
          const isError = event.isError;
          void (async () => {
            const [before, after] = await Promise.all([
              beforePromise,
              snapshotFileContent(resolveEditPath(editArgs.filePath, deps.projectRoot)),
            ]);
            const editPreview = buildEditPreview({
              filePath: displayEditPath(editArgs.filePath, deps.projectRoot),
              before,
              after,
              success: !isError,
            });
            update(itemId, { editPreview });
          })();
        }
        deps.updateStatus(
          `Tool Call · ${toolCategoryTitle(tracked.toolCategory)} · ${event.isError ? "failed" : "done"} ${event.toolName}`,
        );
        return;
      }
      case "turn_end":
        deps.registerTokenUsage(event.message);
        finalizeStreamingBuffers();
        deps.updateStatus("Turn complete · waiting for next step…");
        return;
      case "agent_end":
        finalizeStreamingBuffers();
        deps.updateStatus("Agent finished.");
        return;
    }
  };

  const upsertTodoItem = (event: TodoLifecycleEvent) => {
    const itemId = todoItems.get(event.todo.id);
    const summary = event.summary || event.error;
    const text = `${event.todo.role} · ${event.todo.title}${summary ? ` · ${truncate(summary.replace(/\s+/g, " ").trim(), 120)}` : ""}`;
    const finished =
      event.status === "completed" ||
      event.status === "failed" ||
      event.status === "blocked";
    if (itemId) {
      update(itemId, {
        todoStatus: event.status,
        finishedAt: finished ? Date.now() : undefined,
        text,
      });
      return;
    }
    const nextItemId = crypto.randomUUID();
    todoItems.set(event.todo.id, nextItemId);
    append({
      id: nextItemId,
      kind: "todo",
      todoId: event.todo.id,
      todoStatus: event.status,
      startedAt: event.status === "running" ? Date.now() : undefined,
      finishedAt: finished ? Date.now() : undefined,
      text,
    });
  };

  const workerKey = (event: WorkerLifecycleEvent) => `${event.phase}:${event.role}`;
  const onWorkerEvent = (event: WorkerLifecycleEvent) => {
    finalizeStreamingBuffers();
    const key = workerKey(event);
    const phaseLabel = formatWorkerPhase(event.phase);
    if (event.type === "worker_start") {
      activeStreamPhase = event.phase;
      const itemId = crypto.randomUUID();
      workerItems.set(key, { itemId, startedAt: Date.now() });
      append({
        id: itemId,
        kind: "worker",
        workerStatus: "running",
        startedAt: Date.now(),
        text: `${phaseLabel} · ${event.role}  →  ${event.modelId}  ${event.goal ? `· goal: ${truncate(event.goal, 80)}` : ""}`,
      });
      deps.updateStatus(`${phaseLabel} ${event.role} running…`);
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
      update(itemId, {
        workerStatus: event.status,
        finishedAt: Date.now(),
        text,
      });
    } else {
      append({
        id: crypto.randomUUID(),
        kind: "worker",
        workerStatus: event.status,
        finishedAt: Date.now(),
        text,
      });
    }
    deps.updateStatus(`${phaseLabel} ${event.role} ${event.status}.`);
    // When an image was generated, surface a scaled preview inline so the
    // user sees the result without opening the file. The artifact path is
    // embedded in the worker summary as "Generated image artifact: <path>".
    if (event.status === "completed" && event.summary) {
      const artifactPath = extractGeneratedImagePath(event.summary);
      if (artifactPath) deps.appendImagePreview(artifactPath);
    }
  };

  return {
    onEvent,
    onWorkerEvent,
    upsertTodoItem,
    finalizeStreamingBuffers,
    activeStreamPhase: () => activeStreamPhase,
  };
}

function defaultStreamFlushMs(): number {
  const parsed = Number.parseInt(process.env.BRAINCODE_STREAM_FLUSH_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STREAM_FLUSH_MS;
}

/**
 * Apply one projection op to a transcript item array. Shared by the TUI's
 * React reducer and projection tests so both interpret ops identically.
 */
export function applyTranscriptOp(items: TranscriptItem[], op: TranscriptOp): TranscriptItem[] {
  switch (op.op) {
    case "append":
      return [...items, op.item];
    case "remove":
      return items.filter((item) => item.id !== op.id);
    case "update":
      return items.map((item) => {
        if (item.id !== op.id) return item;
        const next = { ...item, ...op.patch };
        return op.normalize ? normalizeTranscriptItem(next) : next;
      });
  }
}
