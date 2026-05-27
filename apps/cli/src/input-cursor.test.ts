import { expect, test } from "bun:test"
import { moveDraftCursorVertically } from "./input-cursor"

const promptPrefix = "> "

test("moves the draft cursor between explicit input rows", () => {
  const draft = "abc\ndef"
  const down = moveDraftCursorVertically({ draft, cursor: 1, width: 80, delta: 1, promptPrefix })

  expect(down).toEqual({ cursor: 7, desiredColumn: 3, moved: true })
  expect(moveDraftCursorVertically({
    draft,
    cursor: down.cursor,
    width: 80,
    delta: -1,
    desiredColumn: down.desiredColumn,
    promptPrefix,
  })).toEqual({ cursor: 1, desiredColumn: 3, moved: true })
})

test("moves the draft cursor between wrapped input rows", () => {
  const down = moveDraftCursorVertically({
    draft: "abcdef",
    cursor: 0,
    width: 4,
    delta: 1,
    promptPrefix,
  })

  expect(down).toEqual({ cursor: 4, desiredColumn: 2, moved: true })
})

test("keeps the desired column across shorter rows", () => {
  const draft = "abcdef\nx\nabcdef"
  const first = moveDraftCursorVertically({ draft, cursor: 6, width: 80, delta: 1, promptPrefix })
  const second = moveDraftCursorVertically({
    draft,
    cursor: first.cursor,
    width: 80,
    delta: 1,
    desiredColumn: first.desiredColumn,
    promptPrefix,
  })

  expect(first).toEqual({ cursor: 8, desiredColumn: 8, moved: true })
  expect(second).toEqual({ cursor: 15, desiredColumn: 8, moved: true })
})

test("does not move beyond the first or last input row", () => {
  const draft = "abc"

  expect(moveDraftCursorVertically({ draft, cursor: 0, width: 80, delta: -1, promptPrefix })).toEqual({
    cursor: 0,
    desiredColumn: 2,
    moved: false,
  })
  expect(moveDraftCursorVertically({ draft, cursor: draft.length, width: 80, delta: 1, promptPrefix })).toEqual({
    cursor: draft.length,
    desiredColumn: 5,
    moved: false,
  })
})
