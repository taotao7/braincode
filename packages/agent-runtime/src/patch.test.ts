import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { collectPatchDiffSnapshot, collectPatchSummary, hasPatchActivity } from "./patch"

test("collectPatchDiffSnapshot includes staged and unstaged diffs with truncation metadata", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-patch-snapshot-test-"))
  try {
    expect(spawnSync("git", ["init"], { cwd: projectRoot }).status).toBe(0)
    await Bun.write(join(projectRoot, "tracked.txt"), "before\n")
    await Bun.write(join(projectRoot, "staged.txt"), "initial\n")
    expect(spawnSync("git", ["add", "."], { cwd: projectRoot }).status).toBe(0)
    expect(spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"], { cwd: projectRoot }).status).toBe(0)

    await Bun.write(join(projectRoot, "tracked.txt"), `after\n${"x".repeat(300)}\n`)
    await Bun.write(join(projectRoot, "staged.txt"), "staged change\n")
    expect(spawnSync("git", ["add", "staged.txt"], { cwd: projectRoot }).status).toBe(0)

    const snapshot = await collectPatchDiffSnapshot(projectRoot, 120)

    expect(snapshot?.stat).toContain("tracked.txt")
    expect(snapshot?.stat).toContain("staged:")
    expect(snapshot?.stat).toContain("staged.txt")
    expect(snapshot?.diff).toContain("diff --git")
    expect(snapshot?.truncated).toBe(true)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("hasPatchActivity ignores pre-existing-only baselines", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-patch-activity-test-"))
  try {
    expect(spawnSync("git", ["init"], { cwd: projectRoot }).status).toBe(0)
    await Bun.write(join(projectRoot, "tracked.txt"), "before\n")
    expect(spawnSync("git", ["add", "."], { cwd: projectRoot }).status).toBe(0)
    expect(spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"], { cwd: projectRoot }).status).toBe(0)

    await Bun.write(join(projectRoot, "tracked.txt"), "dirty before run\n")
    const baselineSummary = await collectPatchSummary(projectRoot, { changedFiles: [{ path: "tracked.txt", status: "M" }] })

    expect(hasPatchActivity(baselineSummary)).toBe(false)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})
