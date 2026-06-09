import { expect, test } from "bun:test";
import {
  deriveToolIntent,
  formatBlockedToolDetail,
  formatBlockedToolText,
  intentIsWholeMessage,
} from "./tui-tools";
import {
  estimateTranscriptItemRows,
  isTranscriptItemAutoCollapsed,
  isTranscriptItemCollapsible,
  normalizeTranscriptItem,
} from "./tui-transcript";
import type { TranscriptItem } from "./tui-types";

test("deriveToolIntent extracts the trailing rationale sentence", () => {
  expect(
    deriveToolIntent(
      "I'll look at the auth flow first.\nLet me read the login handler to confirm the validation path.",
    ),
  ).toBe("Let me read the login handler to confirm the validation path.");
});

test("deriveToolIntent ignores empty, code-fence, and overlong lead-ins", () => {
  expect(deriveToolIntent("")).toBeUndefined();
  // Unbalanced fence means we're mid code block.
  expect(deriveToolIntent("Here:\n```ts\nconst x = 1;")).toBeUndefined();
  const long = `${"a".repeat(200)}.`;
  expect(deriveToolIntent(long)).toBeUndefined();
});

test("deriveToolIntent strips markdown markers and collapses whitespace", () => {
  expect(deriveToolIntent("- Now I will `read_file` the config.")).toBe(
    "Now I will read_file the config.",
  );
});

test("intentIsWholeMessage dedups a single-sentence lead-in that only differed by formatting", () => {
  // The whole message is one sentence with backticks; after cleaning it equals
  // the derived intent, so the standalone block should be folded away.
  const text = "`read the config`";
  const intent = deriveToolIntent(text);
  expect(intent).toBe("read the config");
  expect(intentIsWholeMessage(text, intent!)).toBe(true);
});

test("intentIsWholeMessage keeps a genuine multi-sentence lead-in as its own block", () => {
  const text = "I'll check the config first. Let me read it.";
  const intent = deriveToolIntent(text);
  expect(intent).toBe("Let me read it.");
  // Not the whole message — the first sentence carries content we must not drop.
  expect(intentIsWholeMessage(text, intent!)).toBe(false);
});

test("formatBlockedTool text and detail describe the interception", () => {
  expect(formatBlockedToolText("read_file", 4)).toBe(
    "read_file · blocked repeat x4",
  );
  const detail = formatBlockedToolDetail(4, {
    blocked: true,
    consecutiveCount: 4,
    cacheAgeMs: 1200,
  });
  expect(detail).toContain("intercepted after 4 identical calls");
  expect(detail).toContain("change direction");
});

test("finalized thinking blocks are collapsible and auto-collapsed; streaming ones are not", () => {
  const finalized: TranscriptItem = {
    id: "t1",
    kind: "thinking",
    text: "Considering the failure modes of the cache eviction path.",
  };
  expect(isTranscriptItemCollapsible(finalized)).toBe(true);
  expect(isTranscriptItemAutoCollapsed(finalized)).toBe(true);
  expect(normalizeTranscriptItem(finalized).collapsed).toBe(true);

  const streaming: TranscriptItem = { ...finalized, streaming: true };
  expect(isTranscriptItemCollapsible(streaming)).toBe(false);
  expect(isTranscriptItemAutoCollapsed(streaming)).toBe(false);
});

test("empty streaming thinking block estimates a single working line", () => {
  const empty: TranscriptItem = {
    id: "t2",
    kind: "thinking",
    text: "",
    streaming: true,
  };
  expect(estimateTranscriptItemRows(empty, 80, false, false)).toBe(1);
});
