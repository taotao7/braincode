import { expect, test } from "bun:test"
import { validateToken } from "./token"

test("expired tokens are rejected before loading the user", () => {
  let loadCount = 0
  const user = validateToken({ subject: "user-1", expiresAt: 10 }, () => {
    loadCount += 1
    return { id: "user-1" }
  }, 20)

  expect(user).toBeUndefined()
  expect(loadCount).toBe(0)
})
