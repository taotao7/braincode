import { describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  detectTerminalCapability,
  fitCells,
  buildImagePreview,
} from "./image-preview"

describe("detectTerminalCapability", () => {
  test("selects kitty for Ghostty by default", () => {
    const cap = detectTerminalCapability({
      GHOSTTY_RESOURCES_DIR: "/x",
      TERM: "xterm-256color",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("kitty")
    expect(cap.multiplexed).toBe(false)
  })

  test("falls back in tmux when passthrough is unavailable", () => {
    const cap = detectTerminalCapability({
      TERM: "tmux-256color",
      TMUX: "/tmp/tmux-501/default,1186,0",
      GHOSTTY_BIN_DIR: "/x",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("halfblock")
    expect(cap.multiplexed).toBe(true)
  })

  test("selects kitty in tmux when passthrough is enabled", () => {
    const cap = detectTerminalCapability({
      TERM: "tmux-256color",
      TMUX: "/tmp/tmux-501/default,1186,0",
      GHOSTTY_BIN_DIR: "/x",
      BRAINCODE_TUI_TMUX_PASSTHROUGH: "on",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("kitty")
    expect(cap.multiplexed).toBe(true)
  })

  test("selects iterm2 for Warp by default", () => {
    const cap = detectTerminalCapability({
      TERM_PROGRAM: "WarpTerminal",
      WARP_SESSION_ID: "abc",
      TERM: "xterm-256color",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("iterm2")
    expect(cap.multiplexed).toBe(false)
  })

  test("selects iterm2 when explicitly forced", () => {
    const cap = detectTerminalCapability({
      TERM: "xterm-256color",
      BRAINCODE_TUI_IMAGE_PROTOCOL: "iterm2",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("iterm2")
  })

  test("allows forcing text rendering on Ghostty", () => {
    const cap = detectTerminalCapability({
      GHOSTTY_RESOURCES_DIR: "/x",
      TERM: "xterm-256color",
      BRAINCODE_TUI_IMAGE_PROTOCOL: "text",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("halfblock")
  })

  test("selects kitty when explicitly forced", () => {
    const cap = detectTerminalCapability({
      KITTY_WINDOW_ID: "1",
      TERM: "xterm-kitty",
      BRAINCODE_TUI_IMAGE_PROTOCOL: "kitty",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("kitty")
  })

  test("selects kitty in auto mode when supported", () => {
    const cap = detectTerminalCapability({
      GHOSTTY_RESOURCES_DIR: "/x",
      TERM: "xterm-256color",
      BRAINCODE_TUI_IMAGE_PROTOCOL: "auto",
    } as NodeJS.ProcessEnv)
    expect(cap.protocol).toBe("kitty")
    expect(cap.multiplexed).toBe(false)
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

  test("kitty transmit uses direct chunks with virtual placement", async () => {
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
    expect(transmit).toContain("a=T,U=1")
    expect(transmit).toContain("t=d")
    expect(transmit).not.toContain("a=p,U=1")
    expect(transmit).not.toContain("a=t")
    expect(transmit).not.toContain("t=t")
    const imageId = preview.imageId ?? 0
    expect(imageId).toBeGreaterThanOrEqual(1)
    expect(imageId).toBeLessThanOrEqual(255)
    expect(preview.lines[0]).toStartWith(`\x1b[38;5;${imageId}m`)
    expect(preview.lines[0]).toEndWith("\x1b[39m")

    const chunks = transmit.match(/\x1bPtmux;/g) ?? []
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  })

  test("iterm2 preview embeds inline image escape in reserved rows", async () => {
    // 1x1 red PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    )
    const srcPath = join(tmpdir(), `image-preview-iterm2-test-${process.pid}.png`)
    await writeFile(srcPath, png)

    const preview = await buildImagePreview(srcPath, {
      maxCols: 20,
      maxRows: 10,
      capability: { protocol: "iterm2", multiplexed: false },
    })

    // Skip when image tooling (sips/ImageMagick) is unavailable on the host.
    if (!preview || preview.protocol !== "iterm2") return

    expect(preview.transmit).toBeUndefined()
    expect(preview.lines).toHaveLength(preview.rows)
    expect(preview.lines[0]).toContain("\x1b]1337;File=inline=1")
    expect(preview.lines[0]).toContain(`width=${preview.cols}`)
    expect(preview.lines[0]).toContain(`height=${preview.rows}`)
  })
})
