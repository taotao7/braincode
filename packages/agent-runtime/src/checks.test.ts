import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { classifyPatchKind, runPatchChecks, runPatchChecksWithApproval } from "./checks"

function patchFor(paths: string[]) {
  return {
    changedFiles: paths.map((path) => ({ path, status: "M" })),
    preExistingChangedFiles: [],
    diffStats: {
      filesChanged: paths.length,
      insertions: 1,
      deletions: 0,
      untrackedFiles: 0,
      raw: `${paths.length} file changed`,
      unstagedRaw: `${paths.length} file changed`,
      stagedRaw: "",
    },
  }
}

test("classifyPatchKind categorizes representative patch paths", () => {
  expect(classifyPatchKind(patchFor(["README.md"]))).toBe("docs-only")
  expect(classifyPatchKind(patchFor(["src/App.tsx"]))).toBe("frontend")
  expect(classifyPatchKind(patchFor(["src/auth/login.ts"]))).toBe("auth-risk")
  expect(classifyPatchKind(patchFor(["db/migrations/001.sql"]))).toBe("db-risk")
  expect(classifyPatchKind(patchFor(["package.json"]))).toBe("package-change")
  expect(classifyPatchKind(patchFor([".github/workflows/ci.yml"]))).toBe("ci-risk")
  expect(classifyPatchKind(patchFor(["src/user.test.ts"]))).toBe("test-only")
})

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

test("runPatchChecks skips docs-only patches by default", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-checks-docs-module-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        test: "bun -e \"await Bun.write('ran.txt', 'ran')\"",
      },
    }))

    const summary = await runPatchChecks(projectRoot, {
      patch: patchFor(["README.md"]),
      timeoutMs: 10_000,
      maxOutputBytes: 4_000,
    })

    expect(summary.status).toBe("skipped")
    expect(summary.patchKind).toBe("docs-only")
    expect(summary.reason).toContain("docs-only")
    await expect(Bun.file(join(projectRoot, "ran.txt")).exists()).resolves.toBe(false)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("runPatchChecks selects strict scripts and review for auth-risk patches", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-checks-auth-module-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        check: "bun -e \"console.log('check ok')\"",
        typecheck: "bun -e \"console.log('typecheck ok')\"",
        lint: "bun -e \"console.log('lint ok')\"",
        test: "bun -e \"console.log('test ok')\"",
      },
    }))

    const summary = await runPatchChecks(projectRoot, {
      patch: patchFor(["src/auth/login.ts"]),
      timeoutMs: 10_000,
      maxOutputBytes: 4_000,
    })

    expect(summary.status).toBe("passed")
    expect(summary.patchKind).toBe("auth-risk")
    expect(summary.reviewRequired).toBe(true)
    expect(summary.results.map((result) => result.name)).toEqual(["check", "typecheck", "lint", "test"])
    expect(summary.reason).toContain("auth-risk")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("runPatchChecks honors per-kind policy scripts", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-checks-policy-module-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        "docs:check": "bun -e \"console.log('docs ok')\"",
        test: "bun -e \"console.log('test ok')\"",
      },
    }))

    const summary = await runPatchChecks(projectRoot, {
      patch: patchFor(["docs/usage.md"]),
      policies: {
        "docs-only": { enabled: true, scripts: ["docs:check"], reason: "project docs check" },
      },
      timeoutMs: 10_000,
      maxOutputBytes: 4_000,
    })

    expect(summary.status).toBe("passed")
    expect(summary.patchKind).toBe("docs-only")
    expect(summary.results.map((result) => result.name)).toEqual(["docs:check"])
    expect(summary.reason).toBe("project docs check")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("runPatchChecks lets per-kind policies override configured scripts", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-checks-policy-override-module-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        test: "bun -e \"await Bun.write('ran.txt', 'ran')\"",
      },
    }))

    const summary = await runPatchChecks(projectRoot, {
      patch: patchFor(["README.md"]),
      scripts: ["test"],
      policies: {
        "docs-only": { enabled: false, reason: "docs are externally verified" },
      },
      timeoutMs: 10_000,
    })

    expect(summary.status).toBe("skipped")
    expect(summary.reason).toBe("docs are externally verified")
    await expect(Bun.file(join(projectRoot, "ran.txt")).exists()).resolves.toBe(false)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("runPatchChecksWithApproval does not auto-run ci-risk checks without approval", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-checks-ci-module-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        test: "bun -e \"await Bun.write('ran.txt', 'ran')\"",
      },
    }))

    const summary = await runPatchChecksWithApproval(projectRoot, {
      patch: patchFor([".github/workflows/ci.yml"]),
      timeoutMs: 10_000,
    }, {
      mode: "radical",
      sessionId: "ci-module-test",
      attempt: 1,
    })

    expect(summary.status).toBe("skipped")
    expect(summary.patchKind).toBe("ci-risk")
    expect(summary.reviewRequired).toBe(true)
    expect(summary.reason).toContain("approval")
    await expect(Bun.file(join(projectRoot, "ran.txt")).exists()).resolves.toBe(false)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})
