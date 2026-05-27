export type DraftCursorVisualPosition = {
  cursor: number
  row: number
  col: number
}

export type DraftVerticalCursorMove = {
  cursor: number
  desiredColumn: number
  moved: boolean
}

export function isWideChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  )
}

export function locateDraftCursor(
  draft: string,
  cursor: number,
  width: number,
  promptPrefix = "> ",
): Omit<DraftCursorVisualPosition, "cursor"> {
  const position = clamp(Math.trunc(cursor), 0, draft.length)
  const positions = draftCursorPositions(draft, width, promptPrefix)
  const match = positions[position] ?? { row: 0, col: 0 }
  return { row: match.row, col: match.col }
}

export function moveDraftCursorVertically(input: {
  draft: string
  cursor: number
  width: number
  delta: -1 | 1
  desiredColumn?: number | null
  promptPrefix?: string
}): DraftVerticalCursorMove {
  const cursor = clamp(Math.trunc(input.cursor), 0, input.draft.length)
  const positions = draftCursorPositions(input.draft, input.width, input.promptPrefix)
  const current = positions[cursor] ?? positions.find((position) => position.cursor === cursor) ?? { cursor, row: 0, col: 0 }
  const desiredColumn = input.desiredColumn ?? current.col
  const targetRow = current.row + input.delta
  const target = nearestCursorOnRow(positions, targetRow, desiredColumn)

  if (!target || target.cursor === cursor) {
    return { cursor, desiredColumn, moved: false }
  }

  return { cursor: target.cursor, desiredColumn, moved: true }
}

function draftCursorPositions(draft: string, width: number, promptPrefix = "> "): DraftCursorVisualPosition[] {
  const wrapWidth = normalizedWidth(width)
  const positions: DraftCursorVisualPosition[] = []
  let row = 0
  let col = 0
  let cursor = 0

  for (const char of promptPrefix) {
    const next = advanceCell(row, col, char, wrapWidth)
    row = next.row
    col = next.col
  }

  positions[0] = { cursor: 0, ...caretCell(row, col, wrapWidth) }
  for (const char of draft) {
    const next = advanceCell(row, col, char, wrapWidth)
    row = next.row
    col = next.col
    const nextCursor = cursor + char.length
    for (let index = cursor + 1; index <= nextCursor; index++) {
      positions[index] = { cursor: index, ...caretCell(row, col, wrapWidth) }
    }
    cursor = nextCursor
  }

  return positions
}

function nearestCursorOnRow(
  positions: DraftCursorVisualPosition[],
  row: number,
  desiredColumn: number,
): DraftCursorVisualPosition | null {
  let best: DraftCursorVisualPosition | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const position of positions) {
    if (position.row !== row) continue
    const distance = Math.abs(position.col - desiredColumn)
    if (!best || distance < bestDistance || (distance === bestDistance && position.cursor < best.cursor)) {
      best = position
      bestDistance = distance
    }
  }
  return best
}

function advanceCell(row: number, col: number, char: string, wrapWidth: number): { row: number; col: number } {
  if (char === "\n") {
    return { row: row + 1, col: 0 }
  }

  const width = visualWidth(char)
  if (col + width > wrapWidth) {
    return { row: row + 1, col: width }
  }
  return { row, col: col + width }
}

function caretCell(row: number, col: number, wrapWidth: number): { row: number; col: number } {
  if (col + 1 > wrapWidth) return { row: row + 1, col: 0 }
  return { row, col }
}

function visualWidth(char: string): number {
  return isWideChar(char) ? 2 : 1
}

function normalizedWidth(width: number): number {
  return width > 0 ? Math.floor(width) : Number.MAX_SAFE_INTEGER
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
