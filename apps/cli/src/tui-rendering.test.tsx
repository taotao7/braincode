import { expect, test } from "bun:test";
import { __test } from "./tui";

test("draft input starts at one row and grows to six rows before clipping", () => {
  const empty = __test.clipDraftToWindow("", 0, 80, __test.INPUT_MAX_LINES);
  expect(__test.draftWindowDisplayLines(empty)).toHaveLength(
    __test.INPUT_MIN_LINES,
  );
  expect(empty.hiddenAbove).toBe(0);
  expect(empty.hiddenBelow).toBe(0);

  const threeLineDraft = "one\ntwo\nthree";
  const three = __test.clipDraftToWindow(
    threeLineDraft,
    threeLineDraft.length,
    80,
    __test.INPUT_MAX_LINES,
  );
  expect(__test.draftWindowDisplayLines(three)).toHaveLength(3);
  expect(three.hiddenAbove).toBe(0);
  expect(three.hiddenBelow).toBe(0);

  const sevenLineDraft = "1\n2\n3\n4\n5\n6\n7";
  const seven = __test.clipDraftToWindow(
    sevenLineDraft,
    sevenLineDraft.length,
    80,
    __test.INPUT_MAX_LINES,
  );
  expect(__test.draftWindowDisplayLines(seven)).toHaveLength(6);
  expect(seven.hiddenAbove).toBe(1);
  expect(seven.hiddenBelow).toBe(0);
});

test("transcript fold preference applies to future collapsible output", () => {
  const longText = Array.from(
    { length: 20 },
    (_, index) => `line ${index + 1}`,
  ).join("\n");
  const assistantItem = {
    id: "assistant",
    kind: "assistant" as const,
    text: longText,
  };

  expect(
    __test.normalizeTranscriptItemForFoldPreference(assistantItem, null)
      .collapsed,
  ).toBe(true);
  expect(
    __test.normalizeTranscriptItemForFoldPreference(assistantItem, false)
      .collapsed,
  ).toBe(false);
  expect(
    __test.normalizeTranscriptItemForFoldPreference(assistantItem, true)
      .collapsed,
  ).toBe(true);

  const toolItem = {
    id: "tool",
    kind: "tool" as const,
    text: "read_file finished",
    toolName: "read_file",
    collapsed: true,
  };
  expect(
    __test.normalizeTranscriptItemForFoldPreference(toolItem, false).collapsed,
  ).toBe(false);

  const streamingItem = {
    id: "streaming",
    kind: "assistant" as const,
    text: longText,
    streaming: true,
  };
  expect(
    __test.normalizeTranscriptItemForFoldPreference(streamingItem, false)
      .collapsed,
  ).toBeUndefined();
});

test("transcript wrapping keeps words intact when they fit", () => {
  expect(__test.wrapByVisualWidth("hello world from braincode", 12)).toEqual([
    "hello world",
    "from",
    "braincode",
  ]);
  expect(
    __test.wrapByVisualWidth("supercalifragilistic", 8),
  ).toEqual(["supercal", "ifragili", "stic"]);
});

test("user transcript rows are left aligned with continuation indentation", () => {
  const rows = __test.leftAlignTranscriptRows(
    "hello world from braincode",
    16,
    6,
  );

  expect(rows).toEqual([
    { indent: "", line: "hello world", first: true },
    { indent: "      ", line: "from braincode", first: false },
  ]);
});

test("image preview bounds are stable and fit inside transcript viewports", () => {
  expect(__test.imagePreviewBounds(160, 60, 30)).toEqual({
    maxCols: 72,
    maxRows: 12,
  });
  expect(__test.imagePreviewBounds(160, 60, 10)).toEqual({
    maxCols: 72,
    maxRows: 6,
  });
  expect(__test.imagePreviewBounds(160, 24, 0)).toEqual({
    maxCols: 72,
    maxRows: 6,
  });
});
