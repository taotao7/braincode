import { expect, test } from "bun:test"
import { formatEnvironmentSection, gatherEnvironmentContext, type EnvironmentContext } from "./environment"

test("formatEnvironmentSection renders facts one per line with a clean git repo", () => {
  const env: EnvironmentContext = {
    cwd: "/repo/project",
    platform: "darwin",
    shell: "zsh",
    date: "2026-05-31",
    git: { isRepo: true, branch: "main", changedFiles: 0, clean: true },
    modelId: "claude-opus-4-8",
  }
  const section = formatEnvironmentSection(env)
  expect(section).toContain("Environment:")
  expect(section).toContain("- Working directory: /repo/project")
  expect(section).toContain("- Platform: darwin / zsh")
  expect(section).toContain("- Today's date: 2026-05-31")
  expect(section).toContain("- Git: branch main (clean)")
  expect(section).toContain("- Model: claude-opus-4-8")
})

test("formatEnvironmentSection reports dirty tree and non-repo state", () => {
  const dirty = formatEnvironmentSection({
    cwd: "/repo", platform: "linux", date: "2026-05-31",
    git: { isRepo: true, branch: "feat/x", changedFiles: 3, clean: false },
  })
  expect(dirty).toContain("- Git: branch feat/x (3 changed file(s))")

  const noRepo = formatEnvironmentSection({ cwd: "/tmp", platform: "linux", date: "2026-05-31" })
  expect(noRepo).toContain("- Git: not a git repository")
})

test("formatEnvironmentSection returns empty string when context is absent", () => {
  expect(formatEnvironmentSection(undefined)).toBe("")
})

test("gatherEnvironmentContext formats today's date and includes the model id", async () => {
  const env = await gatherEnvironmentContext({ cwd: process.cwd(), modelId: "test-model", now: new Date(2026, 4, 31, 12, 0, 0) })
  expect(env.date).toBe("2026-05-31")
  expect(env.modelId).toBe("test-model")
  expect(env.cwd).toBe(process.cwd())
  // This repo is a git checkout, so detection should succeed without throwing.
  expect(env.git?.isRepo).toBe(true)
})
