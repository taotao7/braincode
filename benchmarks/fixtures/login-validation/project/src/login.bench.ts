import { expect, test } from "bun:test"
import { login } from "./login"

test("login rejects blank email before authentication", () => {
  let called = false
  const result = login({ email: " ", password: "secret" }, () => {
    called = true
    return "user-1"
  })

  expect(result).toEqual({ ok: false, error: "Email is required." })
  expect(called).toBe(false)
})

test("login rejects blank password before authentication", () => {
  let called = false
  const result = login({ email: "person@example.com", password: "" }, () => {
    called = true
    return "user-1"
  })

  expect(result).toEqual({ ok: false, error: "Password is required." })
  expect(called).toBe(false)
})
