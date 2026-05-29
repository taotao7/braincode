import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { appendSessionRecord } from "@braincode/config"
import { expandPromptReferences } from "./prompt-references"

test("expandPromptReferences inlines files and uses injected session handoff provider", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-prompt-ref-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-prompt-ref-project-test-"))
  try {
    await Bun.write(join(projectRoot, "note.ts"), "export const answer = 42\n")
    await appendSessionRecord("prompt-ref-session", {
      type: "run_start",
      prompt: "earlier task",
      plan: { brain: { id: "brain" }, role: "rush" },
      attempt: 1,
    }, home)
    await appendSessionRecord("prompt-ref-session", {
      type: "run_end",
      summary: "earlier summary",
      attempt: 1,
    }, home)

    const calls: Array<{ sessionId: string; home?: string }> = []
    const result = await expandPromptReferences(
      "continue @@prompt-ref-session with @note.ts",
      projectRoot,
      home,
      {
        ensureSessionHandoff: async (sessionId, callbackHome) => {
          calls.push({ sessionId, home: callbackHome })
          return { summary: "GENERATED_HANDOFF" }
        },
      },
    )

    expect(calls).toEqual([{ sessionId: "prompt-ref-session", home }])
    expect(result.references.map((ref) => ref.kind)).toEqual(["session", "text"])
    expect(result.prompt).toContain("handoff brief")
    expect(result.prompt).toContain("GENERATED_HANDOFF")
    expect(result.prompt).toContain("File @note.ts (note.ts)")
    expect(result.prompt).toContain("export const answer = 42")
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("expandPromptReferences attaches supported images as ImageContent", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-prompt-ref-image-test-"))
  try {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await Bun.write(join(projectRoot, "snap.png"), pngBytes)

    const result = await expandPromptReferences("inspect @snap.png", projectRoot)

    expect(result.references[0]?.kind).toBe("image")
    expect(result.images).toEqual([{ type: "image", data: pngBytes.toString("base64"), mimeType: "image/png" }])
    expect(result.prompt).toContain("attached to this message")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})
