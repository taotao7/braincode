import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { runPatchChecks, runPatchChecksWithApproval } from "./checks"

test("runPatchChecks reports configured missing scripts without executing unrelated scripts", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-checks-module-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        check: "bun -e \"console.log('check ok')\"",
      },
    }))

    const summary = await runPatchChecks(projectRoot, {
      scripts: ["check", "missing"],
      timeoutMs: 10_000,
      maxOutputBytes: 4_000,
    })

    expect(summary.status).toBe("failed")
    expect(summary.results.map((result) => [result.name, result.status])).toEqual([
      ["check", "passed"],
      ["missing", "failed"],
    ])
    expect(summary.results[0]?.stdout).toContain("check ok")
    expect(summary.results[1]?.stderr).toContain("package.json script not found: missing")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("runPatchChecksWithApproval skips non-radical checks without approval callback", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-checks-approval-module-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        check: "bun -e \"await Bun.write('ran.txt', 'ran')\"",
      },
    }))

    const summary = await runPatchChecksWithApproval(projectRoot, { timeoutMs: 10_000 }, {
      mode: "auto",
      sessionId: "checks-module-test",
      attempt: 1,
    })

    expect(summary.status).toBe("skipped")
    expect(summary.reason).toContain("approval")
    await expect(Bun.file(join(projectRoot, "ran.txt")).exists()).resolves.toBe(false)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})
