import { expect, test } from "bun:test"
import { READ_TOOL_DISCIPLINE, formatReadOnlyToolAccess } from "./tool-discipline"

test("READ_TOOL_DISCIPLINE covers the four read-behaviour rules", () => {
  expect(READ_TOOL_DISCIPLINE).toContain("in parallel")
  expect(READ_TOOL_DISCIPLINE).toContain("Read whole files")
  expect(READ_TOOL_DISCIPLINE).toContain("search before reading")
  expect(READ_TOOL_DISCIPLINE).toContain("do not re-read")
})

test("formatReadOnlyToolAccess pairs the read-only constraint with read discipline", () => {
  const block = formatReadOnlyToolAccess()
  expect(block).toContain("Tool access:")
  expect(block).toContain("do not attempt edits, shell execution")
  expect(block).toContain(READ_TOOL_DISCIPLINE)
})
