// Terminal image preview for the Braincode TUI.
//
// Mirrors yazi's multi-adapter strategy: detect the terminal's graphics
// capability and pick a backend. For Kitty / Ghostty we use the Kitty
// Graphics Protocol with Unicode placeholders (the only KGP mode that
// composes with a TUI that owns its own text layout — the placeholder glyphs
// are width-1 text the layout engine wraps/scrolls, and the terminal
// composites the scaled image over them). Everything else falls back to
// truecolor half-block rendering, which is pure text + SGR and therefore
// survives tmux and any VT100-ish terminal.

import { spawn } from "node:child_process"
import { unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export type ImageProtocol = "kitty" | "halfblock"

export type ImagePreview = {
  protocol: ImageProtocol
  cols: number
  rows: number
  // For "kitty": the APC upload sequence to write to stdout exactly once.
  transmit?: string
  // The text lines to place in the transcript. For "kitty" these are
  // SGR-colored placeholder glyphs that encode the image id in foreground color;
  // for "halfblock" they are SGR-colored half blocks rendered as-is.
  lines: string[]
  imageId?: number
}

// Row/column diacritics used by the Kitty Unicode placeholder protocol.
// Derived from kitty's gen/rowcolumn-diacritics.txt (Unicode Mn;230 marks).
const ROWCOLUMN_DIACRITIC_HEX =
  "0305,030D,030E,0310,0312,033D,033E,033F,0346,034A,034B,034C,0350,0351,0352,0357,035B,0363,0364,0365,0366,0367,0368,0369,036A,036B,036C,036D,036E,036F,0483,0484,0485,0486,0487,0592,0593,0594,0595,0597,0598,0599,059C,059D,059E,059F,05A0,05A1,05A8,05A9,05AB,05AC,05AF,05C4,0610,0611,0612,0613,0614,0615,0616,0617,0657,0658,0659,065A,065B,065D,065E,06D6,06D7,06D8,06D9,06DA,06DB,06DC,06DF,06E0,06E1,06E2,06E4,06E7,06E8,06EB,06EC,0730,0732,0733,0735,0736,073A,073D,073F,0740,0741,0743,0745,0747,0749,074A,07EB,07EC,07ED,07EE,07EF,07F0,07F1,07F3,0816,0817,0818,0819,081B,081C,081D,081E,081F,0820,0821,0822,0823,0825,0826,0827,0829,082A,082B,082C,082D,0951,0953,0954,0F82,0F83,0F86,0F87,135D,135E,135F,17DD,193A,1A17,1A75,1A76,1A77,1A78,1A79,1A7A,1A7B,1A7C,1B6B,1B6D,1B6E,1B6F,1B70,1B71,1B72,1B73,1CD0,1CD1,1CD2,1CDA,1CDB,1CE0,1DC0,1DC1,1DC3,1DC4,1DC5,1DC6,1DC7,1DC8,1DC9,1DCB,1DCC,1DD1,1DD2,1DD3,1DD4,1DD5,1DD6,1DD7,1DD8,1DD9,1DDA,1DDB,1DDC,1DDD,1DDE,1DDF,1DE0,1DE1,1DE2,1DE3,1DE4,1DE5,1DE6,1DFE,20D0,20D1,20D4,20D5,20D6,20D7,20DB,20DC,20E1,20E7,20E9,20F0,2CEF,2CF0,2CF1,2DE0,2DE1,2DE2,2DE3,2DE4,2DE5,2DE6,2DE7,2DE8,2DE9,2DEA,2DEB,2DEC,2DED,2DEE,2DEF,2DF0,2DF1,2DF2,2DF3,2DF4,2DF5,2DF6,2DF7,2DF8,2DF9,2DFA,2DFB,2DFC,2DFD,2DFE,2DFF,A66F,A67C,A67D,A6F0,A6F1,A8E0,A8E1,A8E2,A8E3,A8E4,A8E5,A8E6,A8E7,A8E8,A8E9,A8EA,A8EB,A8EC,A8ED,A8EE,A8EF,A8F0,A8F1,AAB0,AAB2,AAB3,AAB7,AAB8,AABE,AABF,AAC1,FE20,FE21,FE22,FE23,FE24,FE25,FE26,10A0F,10A38,1D185,1D186,1D187,1D188,1D189,1D1AA,1D1AB,1D1AC,1D1AD,1D242,1D243,1D244"

const DIACRITICS = ROWCOLUMN_DIACRITIC_HEX.split(",").map((hex) =>
  String.fromCodePoint(Number.parseInt(hex, 16)),
)

// U+10EEEE: the Kitty placeholder character.
const PLACEHOLDER = String.fromCodePoint(0x10eeee)
const ESC = "\x1b"

export type TerminalCapability = {
  protocol: ImageProtocol
  // True when running under tmux/screen, so KGP escapes must be wrapped in
  // passthrough and tmux must have `allow-passthrough on`.
  multiplexed: boolean
}

// Decide which image backend the current terminal supports. Mirrors yazi's
// env-driven adapter selection ($TERM / $TERM_PROGRAM). Kitty and Ghostty
// implement the Kitty Graphics Protocol including Unicode placeholders;
// everything else gets the half-block text fallback.
export function detectTerminalCapability(
  env: NodeJS.ProcessEnv = process.env,
): TerminalCapability {
  const term = (env.TERM ?? "").toLowerCase()
  const termProgram = (env.TERM_PROGRAM ?? "").toLowerCase()
  const multiplexed =
    Boolean(env.TMUX) || term.startsWith("tmux") || term.startsWith("screen")
  const supportsKitty =
    Boolean(env.KITTY_WINDOW_ID) ||
    Boolean(env.GHOSTTY_RESOURCES_DIR) ||
    Boolean(env.GHOSTTY_BIN_DIR) ||
    term.includes("kitty") ||
    term.includes("ghostty") ||
    termProgram.includes("ghostty") ||
    termProgram.includes("kitty")
  return {
    protocol: supportsKitty ? "kitty" : "halfblock",
    multiplexed,
  }
}

// Fit an image of pixelW×pixelH into at most maxCols×maxRows terminal cells,
// preserving aspect ratio. A terminal cell is roughly twice as tall as it is
// wide, so one image pixel maps to ~0.5 cell rows per cell column.
const CELL_ASPECT = 2.0

export function fitCells(
  pixelW: number,
  pixelH: number,
  maxCols: number,
  maxRows: number,
): { cols: number; rows: number } {
  if (pixelW <= 0 || pixelH <= 0) {
    return { cols: Math.max(1, maxCols), rows: Math.max(1, maxRows) }
  }
  // Aspect in cell units: height in rows / width in cols.
  const cellRatio = pixelH / pixelW / CELL_ASPECT
  let cols = Math.max(1, maxCols)
  let rows = Math.max(1, Math.round(cols * cellRatio))
  if (rows > maxRows) {
    rows = Math.max(1, maxRows)
    cols = Math.max(1, Math.round(rows / cellRatio))
  }
  return { cols: Math.min(cols, maxCols), rows: Math.min(rows, maxRows) }
}

async function runCapture(
  cmd: string,
  cmdArgs: string[],
): Promise<Buffer | null> {
  return await new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: ["ignore", "pipe", "ignore"],
    })
    const chunks: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.on("error", () => resolve(null))
    child.on("close", (code) => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
      else resolve(null)
    })
  })
}

export type DecodedImage = {
  pixelW: number
  pixelH: number
  png: Buffer
}

// Read pixel dimensions via `sips`, which ships on macOS. Returns null on any
// platform where it is unavailable so callers can fall back gracefully.
async function readPixelSize(
  path: string,
): Promise<{ width: number; height: number } | null> {
  const out = await runCapture("sips", [
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    path,
  ])
  if (!out) return null
  const text = out.toString("utf8")
  const width = /pixelWidth:\s*(\d+)/.exec(text)?.[1]
  const height = /pixelHeight:\s*(\d+)/.exec(text)?.[1]
  if (!width || !height) return null
  return { width: Number(width), height: Number(height) }
}

// Resize to a target pixel box and re-encode as PNG. Prefers ImageMagick
// (`magick`), falling back to `convert`. Keeps the payload small so the
// terminal upload stays snappy even for multi-megabyte source images.
async function resizePng(
  path: string,
  targetW: number,
  targetH: number,
): Promise<Buffer | null> {
  const geometry = `${targetW}x${targetH}`
  const buildArgs = (input: string) => [
    input,
    "-resize",
    `${geometry}>`,
    "-strip",
    "png:-",
  ]
  return (
    (await runCapture("magick", buildArgs(path))) ??
    (await runCapture("convert", buildArgs(path)))
  )
}

// Decode raw RGBA pixels at an exact cell-derived resolution for half-block
// rendering. Each terminal row encodes two vertical pixels (top/bottom).
async function readRawRgb(
  path: string,
  width: number,
  height: number,
): Promise<Buffer | null> {
  const geometry = `${width}x${height}!`
  const buildArgs = (input: string) => [
    input,
    "-resize",
    geometry,
    "-depth",
    "8",
    "RGB:-",
  ]
  return (
    (await runCapture("magick", buildArgs(path))) ??
    (await runCapture("convert", buildArgs(path)))
  )
}

// Wrap an escape sequence for tmux/screen passthrough. tmux requires every
// ESC inside the payload to be doubled and the whole thing fenced by its DCS
// passthrough wrapper. Requires `set -g allow-passthrough on` in tmux.
function wrapForMultiplexer(sequence: string): string {
  const escaped = sequence.replaceAll(ESC, ESC + ESC)
  return `${ESC}Ptmux;${escaped}${ESC}\\`
}

// Build the Kitty Graphics Protocol upload. Rather than streaming the PNG
// inline as dozens of base64 chunks — which, under tmux, must each be wrapped
// in DCS passthrough and is prone to partial delivery (the image then decodes
// only its top scanlines) — we write the PNG to a temporary file and transmit
// just its path. This is a single short escape regardless of image size, the
// approach yazi uses for robustness under multiplexers.
//
// t=t = temporary file: the terminal reads the pixel data then deletes the
// file itself. Kitty/Ghostty only honor this when the path lives in a known
// temp dir AND contains the literal string `tty-graphics-protocol`, so the
// filename is constructed accordingly. U=1 anchors a virtual placement to the
// Unicode placeholders; q=2 suppresses responses; c/r size it in cells.
//
// We still keep the file around briefly as a fallback target and best-effort
// delete it after a short delay in case the terminal could not (e.g. an older
// build, or the path safety check failing).
async function buildKittyTransmit(
  png: Buffer,
  imageId: number,
  cols: number,
  rows: number,
  multiplexed: boolean,
): Promise<string> {
  const filePath = await writeGraphicsTempFile(png, imageId)
  if (!filePath) {
    // Could not stage a temp file; fall back to inline chunked transfer.
    return buildKittyTransmitInline(png, imageId, cols, rows, multiplexed)
  }
  const encodedPath = Buffer.from(filePath, "utf8").toString("base64")
  const control = `a=T,U=1,q=2,f=100,t=t,i=${imageId},c=${cols},r=${rows}`
  const apc = `${ESC}_G${control};${encodedPath}${ESC}\\`
  return multiplexed ? wrapForMultiplexer(apc) : apc
}

// Stage the PNG in a temp file whose path satisfies the Kitty `t=t` safety
// rules (lives under the system temp dir and contains the magic substring).
// Returns null if the write fails so the caller can fall back to inline data.
async function writeGraphicsTempFile(
  png: Buffer,
  imageId: number,
): Promise<string | null> {
  const name = `tty-graphics-protocol-braincode-${process.pid}-${imageId}-${Date.now()}.png`
  const filePath = join(tmpdir(), name)
  try {
    await writeFile(filePath, png)
  } catch {
    return null
  }
  // The terminal deletes the file once it has read the pixels (t=t). Schedule
  // a best-effort cleanup in case it does not, without blocking rendering.
  setTimeout(() => {
    void unlink(filePath).catch(() => {})
  }, 10_000).unref?.()
  return filePath
}

// Inline fallback: transmit the PNG (base64, chunked) with a virtual placement
// (U=1). Used only when a temp file cannot be staged.
function buildKittyTransmitInline(
  png: Buffer,
  imageId: number,
  cols: number,
  rows: number,
  multiplexed: boolean,
): string {
  const payload = png.toString("base64")
  const chunkSize = 4096
  const parts: string[] = []
  for (let offset = 0; offset < payload.length; offset += chunkSize) {
    const chunk = payload.slice(offset, offset + chunkSize)
    const more = offset + chunkSize < payload.length ? 1 : 0
    let control: string
    if (offset === 0) {
      // f=100 PNG, t=d direct, a=T transmit+display, U=1 virtual placement,
      // q=2 suppress responses, c/r = placement size in cells.
      control = `a=T,U=1,q=2,f=100,t=d,i=${imageId},c=${cols},r=${rows},m=${more}`
    } else {
      control = `m=${more}`
    }
    const apc = `${ESC}_G${control};${chunk}${ESC}\\`
    // Under tmux/screen each escape sequence is wrapped individually in
    // passthrough; wrapping the whole concatenated blob can exceed the
    // multiplexer's per-sequence handling.
    parts.push(multiplexed ? wrapForMultiplexer(apc) : apc)
  }
  return parts.join("")
}

function diacritic(index: number): string {
  return DIACRITICS[index] ?? DIACRITICS[DIACRITICS.length - 1] ?? ""
}

// Encode the image id into an explicit truecolor SGR foreground. Kitty reads
// the cell's 24-bit fg color as the image id for Unicode placeholders. This
// must not go through Ink/Chalk color props: NO_COLOR or color-level detection
// can strip or quantize the color, leaving invisible placeholders with no image.
function placeholderColorSgr(imageId: number): string {
  const r = (imageId >> 16) & 0xff
  const g = (imageId >> 8) & 0xff
  const b = imageId & 0xff
  return `${ESC}[38;2;${r};${g};${b}m`
}

// Generate the glyph-only placeholder grid. Cell (row, col) carries U+10EEEE
// plus a row diacritic and a column diacritic, telling the terminal which
// slice of the virtual image to composite there.
function buildPlaceholderLines(
  cols: number,
  rows: number,
  imageId: number,
): string[] {
  const lines: string[] = []
  const color = placeholderColorSgr(imageId)
  const resetForeground = `${ESC}[39m`
  for (let r = 0; r < rows; r++) {
    const rowMark = diacritic(r)
    let line = color
    for (let c = 0; c < cols; c++) {
      line += PLACEHOLDER + rowMark + diacritic(c)
    }
    line += resetForeground
    lines.push(line)
  }
  return lines
}

// Render the image as truecolor half-block text. Each cell uses the upper
// half block (▀) with the top pixel as the foreground color and the bottom
// pixel as the background color, doubling vertical resolution. This is the
// universal fallback: pure SGR text, no graphics protocol, tmux-safe.
function buildHalfBlockLines(
  rgb: Buffer,
  cols: number,
  rows: number,
): string[] {
  const pixelRows = rows * 2
  const stride = cols * 3
  const lines: string[] = []
  const at = (x: number, y: number): [number, number, number] => {
    const base = y * stride + x * 3
    return [rgb[base] ?? 0, rgb[base + 1] ?? 0, rgb[base + 2] ?? 0]
  }
  for (let row = 0; row < rows; row++) {
    const topY = row * 2
    const bottomY = Math.min(pixelRows - 1, topY + 1)
    let line = ""
    let lastFg = ""
    let lastBg = ""
    for (let col = 0; col < cols; col++) {
      const [tr, tg, tb] = at(col, topY)
      const [br, bg, bb] = at(col, bottomY)
      const fg = `${ESC}[38;2;${tr};${tg};${tb}m`
      const bgSeq = `${ESC}[48;2;${br};${bg};${bb}m`
      if (fg !== lastFg) {
        line += fg
        lastFg = fg
      }
      if (bgSeq !== lastBg) {
        line += bgSeq
        lastBg = bgSeq
      }
      line += "▀"
    }
    line += `${ESC}[0m`
    lines.push(line)
  }
  return lines
}

let nextImageId = 1

// Build a renderable preview for an image file, sized to fit within
// maxCols×maxRows terminal cells. Returns null only when the file cannot be
// read at all; otherwise always yields something paintable (KGP on capable
// terminals, half blocks elsewhere).
export async function buildImagePreview(
  path: string,
  options: {
    maxCols: number
    maxRows: number
    capability?: TerminalCapability
  },
): Promise<ImagePreview | null> {
  const capability = options.capability ?? detectTerminalCapability()
  const maxCols = Math.max(1, Math.floor(options.maxCols))
  const maxRows = Math.max(1, Math.floor(options.maxRows))

  const size = await readPixelSize(path)
  const pixelW = size?.width ?? maxCols * 8
  const pixelH = size?.height ?? maxRows * 16
  const { cols, rows } = fitCells(pixelW, pixelH, maxCols, maxRows)

  if (capability.protocol === "kitty") {
    // Upload at roughly one source pixel per drawn pixel: cell ~10x20 px.
    const png = await resizePng(path, cols * 10, rows * 20)
    if (png) {
      const imageId = nextImageId++
      return {
        protocol: "kitty",
        cols,
        rows,
        imageId,
        transmit: await buildKittyTransmit(
          png,
          imageId,
          cols,
          rows,
          capability.multiplexed,
        ),
        lines: buildPlaceholderLines(cols, rows, imageId),
      }
    }
  }

  // Half-block fallback (also used if PNG re-encoding failed above).
  const rgb = await readRawRgb(path, cols, rows * 2)
  if (rgb && rgb.length >= cols * rows * 2 * 3) {
    return {
      protocol: "halfblock",
      cols,
      rows,
      lines: buildHalfBlockLines(rgb, cols, rows),
    }
  }

  return null
}
