import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  detectTerminalCapability,
  fitCells,
  buildImagePreview,
} from "./image-preview"

describe("detectTerminalCapability", () => {
  test("selects kitty for Ghostty", () => {
    const cap = detectTerminalCapability({
      GHOSTTY_RESOURCES_DIR: "/x",
      TERM: "xterm-256color",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("kitty")
    expect(cap.multiplexed).toBe(false)
  })

  test("detects tmux multiplexing", () => {
    const cap = detectTerminalCapability({
      TERM: "tmux-256color",
      TMUX: "/tmp/tmux-501/default,1186,0",
      GHOSTTY_BIN_DIR: "/x",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("kitty")
    expect(cap.multiplexed).toBe(true)
  })

  test("selects kitty for kitty terminal", () => {
    const cap = detectTerminalCapability({
      KITTY_WINDOW_ID: "1",
      TERM: "xterm-kitty",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("kitty")
  })

  test("falls back to half blocks for plain terminals", () => {
    const cap = detectTerminalCapability({
      TERM: "xterm-256color",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("halfblock")
  })
})

describe("fitCells", () => {
  test("preserves aspect ratio within bounds", () => {
    const fit = fitCells(1536, 1024, 60, 20)
    expect(fit.cols).toBeLessThanOrEqual(60)
    expect(fit.rows).toBeLessThanOrEqual(20)
    expect(fit.cols).toBeGreaterThan(0)
    expect(fit.rows).toBeGreaterThan(0)
  })

  test("clamps a tall image to max rows", () => {
    const fit = fitCells(100, 4000, 80, 10)
    expect(fit.rows).toBe(10)
    expect(fit.cols).toBeLessThanOrEqual(80)
  })

  test("handles degenerate sizes", () => {
    const fit = fitCells(0, 0, 40, 20)
    expect(fit.cols).toBeGreaterThan(0)
    expect(fit.rows).toBeGreaterThan(0)
  })
})

describe("buildImagePreview", () => {
  test("returns null for a missing file", async () => {
    const preview = await buildImagePreview("/nonexistent/path/x.png", {
      maxCols: 20,
      maxRows: 10,
      capability: { protocol: "halfblock", multiplexed: false },
    })
    expect(preview).toBeNull()
  })

  test("kitty transmit uses a temp-file path, not inline chunks", async () => {
    // 1x1 red PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    )
    const srcPath = join(tmpdir(), `image-preview-test-${process.pid}.png`)
    await writeFile(srcPath, png)

    const preview = await buildImagePreview(srcPath, {
      maxCols: 20,
      maxRows: 10,
      capability: { protocol: "kitty", multiplexed: true },
    })

    // Skip when image tooling (sips/ImageMagick) is unavailable on the host.
    if (!preview || preview.protocol !== "kitty") return

    const transmit = preview.transmit ?? ""
    // Single passthrough-wrapped escape, not dozens of chunks.
    expect((transmit.match(/\x1bPtmux;/g) ?? []).length).toBe(1)
    expect(transmit).toContain("t=t")
    expect(transmit).not.toContain("t=d")

    const unescaped = transmit.replaceAll("\x1b\x1b", "\x1b")
    const match = /t=t,i=\d+,c=\d+,r=\d+;([A-Za-z0-9+/=]+)/.exec(unescaped)
    expect(match).not.toBeNull()
    const filePath = Buffer.from(match![1]!, "base64").toString("utf8")
    expect(filePath).toContain("tty-graphics-protocol")
    expect(existsSync(filePath)).toBe(true)
  })
})
