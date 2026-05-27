import { readFile, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

const MAX_PREVIEW_ROWS = 20
const CONTEXT_LINES = 2
const COLLAPSE_GAP_THRESHOLD = 4
const MAX_OCCURRENCES_RENDERED = 5
const MAX_FILE_BYTES = 1_000_000

export type EditArgs = {
  filePath: string
  /** Absent for Write (full content). */
  oldText?: string
  /** Full new content for Write, replacement text for Edit. */
  newText: string
  replaceAll: boolean
  /** True when args came from a Write-style call (no oldText). */
  isWrite: boolean
}

export type EditRow =
  | { kind: "context"; oldLine: number; newLine: number; text: string }
  | { kind: "removed"; oldLine: number; text: string }
  | { kind: "added"; newLine: number; text: string }

export type EditHunk = {
  unchangedAbove: number
  rows: EditRow[]
}

export type EditPreview = {
  filePath: string
  success: boolean
  created: boolean
  deleted: boolean
  binary: boolean
  added: number
  removed: number
  hunks: EditHunk[]
  truncated: boolean
  hiddenLines: number
}

export type BuildEditPreviewInput = {
  filePath: string
  before: string | null
  after: string | null
  success: boolean
}

export function extractEditArgs(toolName: string, args: unknown): EditArgs | null {
  if (!args || typeof args !== "object") return null
  const record = args as Record<string, unknown>
  const filePath = pickPath(record)
  if (!filePath) return null
  const replaceAll = record.replace_all === true || record.replaceAll === true

  const oldText = pickString(record, ["old_string", "oldString", "oldText", "old_text"])
  const newText = pickString(record, ["new_string", "newString", "newText", "new_text"])
  if (oldText !== null && newText !== null) {
    return { filePath, oldText, newText, replaceAll, isWrite: false }
  }

  if (Array.isArray(record.edits) && record.edits.length > 0) {
    const first = record.edits[0]
    if (first && typeof first === "object") {
      const e = first as Record<string, unknown>
      const o = pickString(e, ["oldText", "old_text", "old_string", "oldString"])
      const n = pickString(e, ["newText", "new_text", "new_string", "newString"])
      if (o !== null && n !== null) {
        return { filePath, oldText: o, newText: n, replaceAll, isWrite: false }
      }
    }
  }

  const content = pickString(record, ["content", "text", "data", "body"])
  if (content !== null) {
    return { filePath, newText: content, replaceAll, isWrite: true }
  }

  if (toolName.toLowerCase().includes("write")) {
    return { filePath, newText: "", replaceAll, isWrite: true }
  }

  return null
}

function pickPath(record: Record<string, unknown>): string | null {
  for (const key of ["file_path", "filePath", "path", "filename", "target", "filepath"]) {
    const v = record[key]
    if (typeof v === "string" && v.length > 0) return v
  }
  return null
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === "string") return v
  }
  return null
}

export function resolveEditPath(filePath: string, projectRoot: string): string {
  return isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath)
}

export function displayEditPath(filePath: string, projectRoot: string): string {
  const abs = resolveEditPath(filePath, projectRoot)
  const rel = relative(projectRoot, abs)
  if (!rel || rel.startsWith("..")) return abs
  return rel
}

export async function snapshotFileContent(absPath: string): Promise<string | null> {
  try {
    const info = await stat(absPath)
    if (!info.isFile()) return null
    if (info.size > MAX_FILE_BYTES) return null
    return await readFile(absPath, "utf8")
  } catch {
    return null
  }
}

export function buildEditPreview(input: BuildEditPreviewInput): EditPreview {
  const { filePath, before, after, success } = input
  const created = before === null && after !== null
  const deleted = before !== null && after === null
  const binary = isBinary(before) || isBinary(after)

  if (binary) {
    return {
      filePath, success, created, deleted, binary: true,
      added: 0, removed: 0, hunks: [], truncated: false, hiddenLines: 0,
    }
  }

  const beforeLines = before === null ? [] : splitLines(before)
  const afterLines = after === null ? [] : splitLines(after)

  if (created) {
    return makeAllAddedPreview({ filePath, lines: afterLines, success, created: true, deleted: false })
  }
  if (deleted) {
    return makeAllRemovedPreview({ filePath, lines: beforeLines, success })
  }
  if (before === after) {
    return {
      filePath, success, created: false, deleted: false, binary: false,
      added: 0, removed: 0, hunks: [], truncated: false, hiddenLines: 0,
    }
  }

  const hunks = diffContiguous(beforeLines, afterLines)
  return assembleHunks({ filePath, hunks, beforeLines, afterLines, success, created: false, deleted: false })
}

function makeAllAddedPreview(opts: {
  filePath: string; lines: string[]; success: boolean; created: boolean; deleted: boolean
}): EditPreview {
  const rows: EditRow[] = opts.lines.map((text, i) => ({ kind: "added", newLine: i + 1, text }))
  const { rows: capped, hidden } = capRows(rows)
  return {
    filePath: opts.filePath,
    success: opts.success,
    created: opts.created,
    deleted: opts.deleted,
    binary: false,
    added: opts.lines.length,
    removed: 0,
    hunks: capped.length > 0 ? [{ unchangedAbove: 0, rows: capped }] : [],
    truncated: hidden > 0,
    hiddenLines: hidden,
  }
}

function makeAllRemovedPreview(opts: { filePath: string; lines: string[]; success: boolean }): EditPreview {
  const rows: EditRow[] = opts.lines.map((text, i) => ({ kind: "removed", oldLine: i + 1, text }))
  const { rows: capped, hidden } = capRows(rows)
  return {
    filePath: opts.filePath,
    success: opts.success,
    created: false,
    deleted: true,
    binary: false,
    added: 0,
    removed: opts.lines.length,
    hunks: capped.length > 0 ? [{ unchangedAbove: 0, rows: capped }] : [],
    truncated: hidden > 0,
    hiddenLines: hidden,
  }
}

type RawHunk = {
  oldStart: number   // 1-based
  newStart: number   // 1-based
  removed: string[]  // before-side lines, in order
  added: string[]    // after-side lines, in order
}

function diffContiguous(beforeLines: string[], afterLines: string[]): RawHunk[] {
  let topShared = 0
  const maxTop = Math.min(beforeLines.length, afterLines.length)
  while (topShared < maxTop && beforeLines[topShared] === afterLines[topShared]) topShared++

  let bottomShared = 0
  const maxBottom = Math.min(beforeLines.length - topShared, afterLines.length - topShared)
  while (
    bottomShared < maxBottom &&
    beforeLines[beforeLines.length - 1 - bottomShared] === afterLines[afterLines.length - 1 - bottomShared]
  ) bottomShared++

  const removed = beforeLines.slice(topShared, beforeLines.length - bottomShared)
  const added = afterLines.slice(topShared, afterLines.length - bottomShared)
  if (removed.length === 0 && added.length === 0) return []
  return [{ oldStart: topShared + 1, newStart: topShared + 1, removed, added }]
}

function assembleHunks(opts: {
  filePath: string
  hunks: RawHunk[]
  beforeLines: string[]
  afterLines: string[]
  success: boolean
  created: boolean
  deleted: boolean
}): EditPreview {
  const allRows: EditRow[] = []
  const hunkBoundaries: number[] = [] // index in allRows where each hunk starts
  let totalAdded = 0
  let totalRemoved = 0

  let prevAfterEnd = 0 // exclusive boundary in afterLines we've covered (for unchanged-gap accounting)

  opts.hunks.forEach((hunk) => {
    const contextStart = Math.max(0, hunk.oldStart - 1 - CONTEXT_LINES)
    const contextLeft = opts.beforeLines.slice(contextStart, hunk.oldStart - 1)
    const contextAfterStart = hunk.newStart - 1 - contextLeft.length

    const gapBefore = Math.max(0, contextStart - prevAfterEnd)
    hunkBoundaries.push(allRows.length)
    if (gapBefore >= COLLAPSE_GAP_THRESHOLD) {
      allRows.push({ kind: "context", oldLine: -1, newLine: -1, text: `__GAP__${gapBefore}` })
    }

    contextLeft.forEach((text, i) => {
      allRows.push({
        kind: "context",
        oldLine: contextStart + i + 1,
        newLine: contextAfterStart + i + 1,
        text,
      })
    })
    hunk.removed.forEach((text, i) => {
      allRows.push({ kind: "removed", oldLine: hunk.oldStart + i, text })
    })
    hunk.added.forEach((text, i) => {
      allRows.push({ kind: "added", newLine: hunk.newStart + i, text })
    })
    totalAdded += hunk.added.length
    totalRemoved += hunk.removed.length

    const oldEnd = hunk.oldStart - 1 + hunk.removed.length
    const newEnd = hunk.newStart - 1 + hunk.added.length
    const contextRight = opts.beforeLines.slice(oldEnd, oldEnd + CONTEXT_LINES)
    contextRight.forEach((text, i) => {
      allRows.push({
        kind: "context",
        oldLine: oldEnd + i + 1,
        newLine: newEnd + i + 1,
        text,
      })
    })
    prevAfterEnd = oldEnd + contextRight.length
  })

  const { rows: capped, hidden } = capRows(allRows)
  const groupedHunks = regroupHunks(capped)

  return {
    filePath: opts.filePath,
    success: opts.success,
    created: opts.created,
    deleted: opts.deleted,
    binary: false,
    added: totalAdded,
    removed: totalRemoved,
    hunks: groupedHunks,
    truncated: hidden > 0,
    hiddenLines: hidden,
  }
}

function regroupHunks(rows: EditRow[]): EditHunk[] {
  const hunks: EditHunk[] = []
  let current: EditHunk | null = null
  for (const row of rows) {
    if (row.kind === "context" && row.oldLine === -1 && row.text.startsWith("__GAP__")) {
      const gap = Number(row.text.slice("__GAP__".length))
      if (current) hunks.push(current)
      current = { unchangedAbove: gap, rows: [] }
      continue
    }
    if (!current) current = { unchangedAbove: 0, rows: [] }
    current.rows.push(row)
  }
  if (current && current.rows.length > 0) hunks.push(current)
  return hunks
}

function capRows(rows: EditRow[]): { rows: EditRow[]; hidden: number } {
  if (rows.length <= MAX_PREVIEW_ROWS) return { rows, hidden: 0 }
  return { rows: rows.slice(0, MAX_PREVIEW_ROWS), hidden: rows.length - MAX_PREVIEW_ROWS }
}

function splitLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split("\n")
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  return lines
}

function isBinary(text: string | null): boolean {
  if (text === null) return false
  const sampleLen = Math.min(text.length, 4096)
  for (let i = 0; i < sampleLen; i++) {
    if (text.charCodeAt(i) === 0) return true
  }
  return false
}
