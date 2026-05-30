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
