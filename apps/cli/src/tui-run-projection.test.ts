import { expect, test } from "bun:test";
import type { AgentEvent, WorkerLifecycleEvent } from "@braincode/agent-runtime";
import { applyTranscriptOp, createRunProjection, type RunProjection, type RunProjectionDeps } from "./tui-run-projection";
import type { TranscriptItem } from "./tui-types";

type Harness = {
  projection: RunProjection;
  items: () => TranscriptItem[];
  statuses: string[];
  usageTurns: number;
  imagePreviews: string[];
};

function createHarness(overrides: Partial<RunProjectionDeps> = {}): Harness {
  let items: TranscriptItem[] = [];
  const harness = {
    statuses: [] as string[],
    usageTurns: 0,
    imagePreviews: [] as string[],
  };
  let usageActive = false;
  const projection = createRunProjection({
    apply: (ops) => {
      items = ops.reduce(applyTranscriptOp, items);
    },
    updateStatus: (text) => harness.statuses.push(text),
    registerTokenUsage: () => {},
    beginUsageTurn: () => {
      usageActive = true;
      harness.usageTurns += 1;
    },
    hasActiveUsageTurn: () => usageActive,
    appendImagePreview: (path) => harness.imagePreviews.push(path),
    projectRoot: "/tmp/projection-test",
    // Immediate flushing keeps assertions synchronous.
    streamFlushMs: 1,
    ...overrides,
  });
  return { projection, items: () => items, ...harness };
}

function textDelta(delta: string): AgentEvent {
  return {
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta },
  } as never;
}

function workerStart(phase: "primary" | "support" | "review", role = "backend"): WorkerLifecycleEvent {
  return {
    type: "worker_start",
    role: role as never,
    goal: "do the thing",
    phase,
    modelId: "model-x",
    handoffId: "h1",
    taskId: "t1",
    parentId: "p1",
    progress: { status: "running", summary: "" },
  };
}

function workerEnd(phase: "primary" | "support" | "review", status: "completed" | "failed" | "blocked", extra: { summary?: string; error?: string } = {}, role = "backend"): WorkerLifecycleEvent {
  return {
    type: "worker_end",
    role: role as never,
    phase,
    status,
    handoffId: "h1",
    taskId: "t1",
    parentId: "p1",
    progress: { status, summary: extra.summary ?? "" },
    ...extra,
  };
}

test("primary text deltas stream into one assistant item and finalize non-streaming", () => {
  const h = createHarness();
  h.projection.onWorkerEvent(workerStart("primary"));
  h.projection.onEvent(textDelta("Hello "));
  h.projection.onEvent(textDelta("world"));
  h.projection.finalizeStreamingBuffers();

  const assistants = h.items().filter((item) => item.kind === "assistant");
  expect(assistants).toHaveLength(1);
  expect(assistants[0]?.text).toBe("Hello world");
  expect(assistants[0]?.streaming).toBe(false);
});

test("support-phase text deltas never create assistant items (workers return JSON)", () => {
  const h = createHarness();
  h.projection.onWorkerEvent(workerStart("support", "librarian"));
  h.projection.onEvent(textDelta('{"summary":"json"}'));
  h.projection.finalizeStreamingBuffers();

  expect(h.items().filter((item) => item.kind === "assistant")).toHaveLength(0);
});

test("empty streaming buffers are dropped, not left as blank transcript rows", () => {
  const h = createHarness();
  h.projection.onWorkerEvent(workerStart("primary"));
  h.projection.onEvent(textDelta(""));
  h.projection.finalizeStreamingBuffers();

  expect(h.items().filter((item) => item.kind === "assistant")).toHaveLength(0);
});

test("tool execution start/end updates one tool row through its lifecycle", () => {
  const h = createHarness();
  h.projection.onEvent({
    type: "tool_execution_start",
    toolCallId: "call-1",
    toolName: "read_file",
    args: { path: "src/index.ts" },
  } as never);

  let tools = h.items().filter((item) => item.kind === "tool");
  expect(tools).toHaveLength(1);
  expect(tools[0]?.toolStatus).toBe("running");

  h.projection.onEvent({
    type: "tool_execution_end",
    toolCallId: "call-1",
    toolName: "read_file",
    isError: false,
    result: { content: [{ type: "text", text: "ok" }] },
  } as never);

  tools = h.items().filter((item) => item.kind === "tool");
  expect(tools).toHaveLength(1);
  expect(tools[0]?.toolStatus).toBe("ok");
  expect(tools[0]?.finishedAt).toBeDefined();
});

test("a failed tool call marks the row failed", () => {
  const h = createHarness();
  h.projection.onEvent({
    type: "tool_execution_start",
    toolCallId: "call-2",
    toolName: "shell",
    args: { command: "false" },
  } as never);
  h.projection.onEvent({
    type: "tool_execution_end",
    toolCallId: "call-2",
    toolName: "shell",
    isError: true,
    result: {},
  } as never);

  expect(h.items().find((item) => item.kind === "tool")?.toolStatus).toBe("failed");
});

test("worker lifecycle renders a running row then rewrites it with the outcome", () => {
  const h = createHarness();
  h.projection.onWorkerEvent(workerStart("support", "librarian"));
  let workers = h.items().filter((item) => item.kind === "worker");
  expect(workers).toHaveLength(1);
  expect(workers[0]?.workerStatus).toBe("running");

  h.projection.onWorkerEvent(workerEnd("support", "completed", { summary: "found evidence" }, "librarian"));
  workers = h.items().filter((item) => item.kind === "worker");
  expect(workers).toHaveLength(1);
  expect(workers[0]?.workerStatus).toBe("completed");
  expect(workers[0]?.text).toContain("found evidence");
});

test("worker completion carrying a generated image path triggers a preview", () => {
  const h = createHarness();
  h.projection.onWorkerEvent(workerStart("primary", "imageMaker"));
  h.projection.onWorkerEvent(
    workerEnd("primary", "completed", { summary: "Generated image artifact: /tmp/x/image-1.png" }, "imageMaker"),
  );
  expect(h.imagePreviews).toEqual(["/tmp/x/image-1.png"]);
});

test("worker_end resets the active stream phase so later deltas are ignored", () => {
  const h = createHarness();
  h.projection.onWorkerEvent(workerStart("primary"));
  expect(h.projection.activeStreamPhase()).toBe("primary");
  h.projection.onWorkerEvent(workerEnd("primary", "completed", { summary: "done" }));
  expect(h.projection.activeStreamPhase()).toBeNull();

  h.projection.onEvent(textDelta("stray output"));
  h.projection.finalizeStreamingBuffers();
  expect(h.items().filter((item) => item.kind === "assistant")).toHaveLength(0);
});

test("todo updates upsert by todo id instead of appending duplicates", () => {
  const h = createHarness();
  const todo = { id: "todo-1", title: "Implement", role: "backend", status: "pending" } as never;
  h.projection.upsertTodoItem({ type: "todo_update", todo, status: "pending", phase: "planning", role: "backend" as never });
  h.projection.upsertTodoItem({ type: "todo_update", todo, status: "running", phase: "primary", role: "backend" as never });
  h.projection.upsertTodoItem({ type: "todo_update", todo, status: "completed", phase: "primary", role: "backend" as never, summary: "shipped" });

  const todos = h.items().filter((item) => item.kind === "todo");
  expect(todos).toHaveLength(1);
  expect(todos[0]?.todoStatus).toBe("completed");
  expect(todos[0]?.text).toContain("shipped");
});

test("a short assistant lead-in is folded into the tool row as intent", () => {
  const h = createHarness();
  h.projection.onWorkerEvent(workerStart("primary"));
  h.projection.onEvent(textDelta("Let me read the config file to check the defaults."));
  h.projection.onEvent({
    type: "tool_execution_start",
    toolCallId: "call-3",
    toolName: "read_file",
    args: { path: "config.json" },
  } as never);

  const tool = h.items().find((item) => item.kind === "tool");
  expect(tool?.toolDetail).toContain("intent:");
  // The lead-in was the whole message, so no duplicate assistant row remains.
  expect(h.items().filter((item) => item.kind === "assistant")).toHaveLength(0);
});
