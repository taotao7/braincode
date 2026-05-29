import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDefaultToolConfiguration, createLocalCodingTools, normalizeToolConfiguration } from "./index"

function getTool(name: string, projectRoot: string) {
  const tool = createLocalCodingTools({ projectRoot }).find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return tool
}

function textContent(result: Awaited<ReturnType<ReturnType<typeof getTool>["execute"]>>): string {
  const first = result.content[0]
  return first && first.type === "text" ? first.text : ""
}

test("default tool configuration enables the first-party local coding toolset", () => {
  const config = createDefaultToolConfiguration()
  const byName = new Map(config.tools.map((tool) => [tool.name, tool]))

  expect(byName.get("list_files")?.enabled).toBe(true)
  expect(byName.get("read_file")?.approvalPolicy).toBe("allow")
  expect(byName.get("edit_file")?.enabled).toBe(true)
  expect(byName.get("edit_file")?.approvalPolicy).toBe("confirm-dangerous")
  expect(byName.get("apply_patch")?.enabled).toBe(true)
  expect(byName.get("exec_command")?.approvalPolicy).toBe("confirm-dangerous")
  expect(byName.get("write_stdin")?.approvalPolicy).toBe("confirm-dangerous")
  expect(byName.get("shell")?.approvalPolicy).toBe("confirm-dangerous")
  expect(byName.get("git_diff")?.enabled).toBe(true)
  expect(byName.get("get_changed_files")?.enabled).toBe(true)
  expect(byName.get("run_script")?.enabled).toBe(true)
  expect(config.checks).toEqual({
    enabled: true,
    scripts: [],
    timeoutMs: 180_000,
    maxOutputBytes: 24_000,
  })
})

test("normalizeToolConfiguration preserves and clamps check runner configuration", () => {
  const config = normalizeToolConfiguration({
    tools: [
      {
        name: "custom_tool",
        description: "Project-specific helper.",
        permissions: ["read"],
        risk: "low",
        defaultEnabled: true,
        enabled: true,
        requiresApproval: false,
      },
    ],
    checks: {
      enabled: false,
      scripts: ["test", " test ", "", "lint"],
      timeoutMs: "2500",
      maxOutputBytes: 999_999,
    },
  } as never)

  expect(config.checks).toEqual({
    enabled: false,
    scripts: ["test", "lint"],
    timeoutMs: 2_500,
    maxOutputBytes: 512_000,
  })
  expect(config.tools.find((tool) => tool.name === "custom_tool")?.approvalPolicy).toBe("allow")
})

test("createLocalCodingTools respects disabled tools from tools.json", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-filter-test-"))
  try {
    const config = createDefaultToolConfiguration()
    const tools = createLocalCodingTools({
      projectRoot,
      tools: config.tools.map((tool) => tool.name === "edit_file" ? { ...tool, enabled: false } : tool),
    })

    expect(tools.some((tool) => tool.name === "read_file")).toBe(true)
    expect(tools.some((tool) => tool.name === "edit_file")).toBe(false)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("createLocalCodingTools can ignore disabled config for explicit override modes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-ignore-disabled-test-"))
  try {
    const disabled = createDefaultToolConfiguration().tools.map((tool) => ({ ...tool, enabled: false }))
    const tools = createLocalCodingTools({
      projectRoot,
      tools: disabled,
      mode: "all",
      ignoreDisabled: true,
    })

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "apply_patch",
      "edit_file",
      "exec_command",
      "get_changed_files",
      "git_diff",
      "list_files",
      "read_file",
      "run_script",
      "search_files",
      "shell",
      "write_stdin",
    ])
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("createLocalCodingTools read-only mode excludes write and execute tools", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-readonly-test-"))
  try {
    const tools = createLocalCodingTools({
      projectRoot,
      tools: createDefaultToolConfiguration().tools,
      mode: "read-only",
    })

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_changed_files",
      "git_diff",
      "list_files",
      "read_file",
      "search_files",
    ])
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("createLocalCodingTools read-write mode excludes execute tools only", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-readwrite-test-"))
  try {
    const tools = createLocalCodingTools({
      projectRoot,
      tools: createDefaultToolConfiguration().tools,
      mode: "read-write",
    })

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "apply_patch",
      "edit_file",
      "get_changed_files",
      "git_diff",
      "list_files",
      "read_file",
      "search_files",
    ])
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("local tool prepareArguments normalizes aliases and primitive coercions", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-prepare-test-"))
  try {
    expect(getTool("list_files", projectRoot).prepareArguments?.({ dir: ".", pattern: "*.ts", limit: "2" })).toEqual({ directory: ".", glob: "*.ts", maxFiles: 2 })
    expect(getTool("read_file", projectRoot).prepareArguments?.({ filePath: "a.txt", offset: "1", maxBytes: "3" })).toEqual({ path: "a.txt", offset: 1, limit: 3 })
    expect(getTool("search_files", projectRoot).prepareArguments?.({ text: "needle", mode: "path", limit: "5" })).toEqual({ query: "needle", mode: "path", glob: undefined, maxResults: 5 })
    expect(getTool("search_files", projectRoot).prepareArguments?.({ glob: "*.ts", limit: "5" })).toEqual({ query: undefined, mode: "path", glob: "*.ts", maxResults: 5 })
    expect(getTool("edit_file", projectRoot).prepareArguments?.({ file: "a.txt", old: "x", new: "y", replace_all: "true" })).toEqual({ path: "a.txt", content: undefined, oldString: "x", newString: "y", replaceAll: true })
    expect(getTool("apply_patch", projectRoot).prepareArguments?.({ diff: "patch" })).toEqual({ patch: "patch" })
    expect(getTool("exec_command", projectRoot).prepareArguments?.({ command: "echo hi", yield_time_ms: "25", max_output_tokens: "10" })).toEqual({ cmd: "echo hi", workdir: undefined, shell: undefined, yieldTimeMs: 25, timeoutMs: undefined, maxOutputBytes: 40 })
    expect(getTool("write_stdin", projectRoot).prepareArguments?.({ session_id: "2", input: "x", yield_time_ms: "25" })).toEqual({ sessionId: 2, chars: "x", yieldTimeMs: 25, maxOutputBytes: undefined })
    expect(getTool("shell", projectRoot).prepareArguments?.({ cmd: "echo hi", timeout: "1000" })).toEqual({ command: "echo hi", timeoutMs: 1000 })
    expect(getTool("git_diff", projectRoot).prepareArguments?.({ file: "a.txt", cached: "false", summary: true })).toEqual({ path: "a.txt", staged: false, stat: true })
    expect(getTool("get_changed_files", projectRoot).prepareArguments?.({ ignored: true })).toEqual({})
    expect(getTool("run_script", projectRoot).prepareArguments?.({ name: "test", args: ["--watch", 1], timeout: "2000" })).toEqual({ script: "test", args: ["--watch"], timeoutMs: 2000 })
    expect(() => getTool("read_file", projectRoot).prepareArguments?.({})).toThrow("Missing required string argument")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("local read/search/edit tools operate inside the project root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-local-test-"))
  try {
    await Bun.write(join(projectRoot, "README.md"), "hello braincode\n")

    const readFile = getTool("read_file", projectRoot)
    const readResult = await readFile.execute("read-1", { path: "README.md" } as never)
    expect(textContent(readResult)).toContain("hello braincode")

    const searchFiles = getTool("search_files", projectRoot)
    const searchResult = await searchFiles.execute("search-1", { query: "braincode", mode: "content" } as never)
    expect(textContent(searchResult)).toContain("README.md:1:hello braincode")

    const editFile = getTool("edit_file", projectRoot)
    const editResult = await editFile.execute("edit-1", {
      path: "README.md",
      oldString: "hello braincode",
      newString: "hello local tools",
    } as never)
    expect(textContent(editResult)).toContain("replace README.md")

    const updated = await readFile.execute("read-2", { path: "README.md" } as never)
    expect(textContent(updated)).toContain("hello local tools")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("search_files path mode and fallback search work without rg", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-search-fallback-test-"))
  const originalPath = process.env.PATH
  try {
    await Bun.write(join(projectRoot, "alpha.ts"), "needle\n")
    await Bun.write(join(projectRoot, "beta.md"), "needle\n")

    const searchFiles = getTool("search_files", projectRoot)
    const pathResult = await searchFiles.execute("search-path", { query: "alpha", mode: "path", maxResults: 1 } as never)
    expect(textContent(pathResult)).toBe("alpha.ts")
    const globOnlyResult = await searchFiles.execute("search-glob-only", { glob: "*.ts", maxResults: 1 } as never)
    expect(textContent(globOnlyResult)).toBe("alpha.ts")

    process.env.PATH = ""
    const listFiles = getTool("list_files", projectRoot)
    const listResult = await listFiles.execute("list-fallback", { glob: "*.md" } as never)
    const contentResult = await searchFiles.execute("search-fallback", { query: "needle", glob: "*.ts" } as never)

    expect(textContent(listResult)).toContain("beta.md")
    expect(textContent(contentResult)).toContain("alpha.ts:1:needle")
  } finally {
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("local write tools reject paths outside the project root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-boundary-test-"))
  try {
    const editFile = getTool("edit_file", projectRoot)
    await expect(editFile.execute("edit-outside", { path: "../escape.txt", content: "nope" } as never)).rejects.toThrow("escapes project root")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("edit_file replace rejects oversized files instead of truncating", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-large-edit-test-"))
  try {
    await Bun.write(join(projectRoot, "large.txt"), `needle\n${"x".repeat(32)}`)
    const editFile = createLocalCodingTools({ projectRoot, maxReadBytes: 8 }).find((tool) => tool.name === "edit_file")
    if (!editFile) throw new Error("Missing edit_file")

    await expect(editFile.execute("edit-large", {
      path: "large.txt",
      oldString: "needle",
      newString: "changed",
    } as never)).rejects.toThrow("too large for edit_file replace")

    const content = await Bun.file(join(projectRoot, "large.txt")).text()
    expect(content).toContain("needle")
    expect(content.length).toBeGreaterThan(8)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("list_files supports globs and maxFiles", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-list-test-"))
  try {
    await Bun.write(join(projectRoot, "a.ts"), "export {}\n")
    await Bun.write(join(projectRoot, "b.md"), "# b\n")
    await Bun.write(join(projectRoot, "c.ts"), "export const c = 1\n")

    const listFiles = getTool("list_files", projectRoot)
    const result = await listFiles.execute("list-1", { glob: "*.ts", maxFiles: 1 } as never)

    expect(textContent(result).split("\n")).toHaveLength(1)
    expect(textContent(result)).toEndWith(".ts")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("read_file truncates large text and rejects binary content", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-read-test-"))
  try {
    await Bun.write(join(projectRoot, "long.txt"), "abcdef")
    await Bun.write(join(projectRoot, "binary.bin"), new Uint8Array([1, 0, 2]))
    const readFile = createLocalCodingTools({ projectRoot, maxReadBytes: 4 }).find((tool) => tool.name === "read_file")
    if (!readFile) throw new Error("Missing read_file")

    const result = await readFile.execute("read-long", { path: "long.txt", limit: 3 } as never)

    expect(textContent(result)).toContain("truncated")
    expect(textContent(result)).toContain("abc")
    await expect(readFile.execute("read-binary", { path: "binary.bin" } as never)).rejects.toThrow("binary")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("read_file expands tiny windows for large files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-read-window-test-"))
  try {
    await Bun.write(join(projectRoot, "large.txt"), "0123456789".repeat(5000))
    const readFile = createLocalCodingTools({ projectRoot, maxReadBytes: 40_000 }).find((tool) => tool.name === "read_file")
    if (!readFile) throw new Error("Missing read_file")

    const result = await readFile.execute("read-large-window", { path: "large.txt", offset: 1000, limit: 1200 } as never)
    const details = result.details as { chars: number; limit: number; nextOffset: number; limitExpanded: boolean }

    expect(textContent(result)).toContain("requested limit 1200 expanded to 32000")
    expect(textContent(result)).toContain("next offset 33000")
    expect(details.chars).toBe(32_000)
    expect(details.limit).toBe(32_000)
    expect(details.nextOffset).toBe(33_000)
    expect(details.limitExpanded).toBe(true)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("edit_file writes new files and replaces all matches", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-write-test-"))
  try {
    const editFile = getTool("edit_file", projectRoot)
    await editFile.execute("write-1", { path: "nested/file.txt", content: "one one two" } as never)
    const replaceResult = await editFile.execute("write-2", {
      path: "nested/file.txt",
      oldString: "one",
      newString: "1",
      replaceAll: true,
    } as never)

    expect(textContent(replaceResult)).toContain("replace nested/file.txt")
    expect(await Bun.file(join(projectRoot, "nested/file.txt")).text()).toBe("1 1 two")
    await expect(editFile.execute("write-missing-input", { path: "nested/file.txt" } as never)).rejects.toThrow("requires either content")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("apply_patch applies project-local diffs and rejects escaping paths", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-patch-test-"))
  try {
    await Bun.write(join(projectRoot, "file.txt"), "before\n")
    const applyPatch = getTool("apply_patch", projectRoot)

    await applyPatch.execute("patch-1", {
      patch: [
        "diff --git a/file.txt b/file.txt",
        "--- a/file.txt",
        "+++ b/file.txt",
        "@@ -1 +1 @@",
        "-before",
        "+after",
        "",
      ].join("\n"),
    } as never)

    expect(await Bun.file(join(projectRoot, "file.txt")).text()).toBe("after\n")
    await expect(applyPatch.execute("patch-escape", {
      patch: "diff --git a/../escape.txt b/../escape.txt\n--- a/../escape.txt\n+++ b/../escape.txt\n",
    } as never)).rejects.toThrow("escapes project root")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("shell and run_script return process results without throwing on nonzero exits", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-process-test-"))
  try {
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        echoargs: "bun -e \"console.log(process.argv.slice(2).join(','))\"",
      },
    }))
    const shell = getTool("shell", projectRoot)
    const runScript = getTool("run_script", projectRoot)

    const shellResult = await shell.execute("shell-1", { command: "exit 7" } as never)
    const scriptResult = await runScript.execute("script-1", { script: "echoargs", args: ["a", "b"] } as never)

    expect(textContent(shellResult)).toContain("exit: 7")
    expect(textContent(scriptResult)).toContain("bun run echoargs a b")
    expect(textContent(scriptResult)).toContain("stdout:\nb")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("exec_command returns a session id for long commands and write_stdin polls completion", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-exec-session-test-"))
  try {
    const tools = createLocalCodingTools({ projectRoot })
    const execCommand = tools.find((tool) => tool.name === "exec_command")
    const writeStdin = tools.find((tool) => tool.name === "write_stdin")
    if (!execCommand || !writeStdin) throw new Error("Missing exec session tools")

    const startResult = await execCommand.execute("exec-1", {
      cmd: "bun -e \"console.log('start'); setTimeout(() => console.log('done'), 120)\"",
      yieldTimeMs: 20,
      timeoutMs: 2000,
    } as never)
    const sessionId = (startResult.details as { sessionId?: number | null }).sessionId

    expect(typeof sessionId).toBe("number")
    expect(textContent(startResult)).toContain("running session=")

    const pollResult = await writeStdin.execute("stdin-1", {
      sessionId,
      chars: "",
      yieldTimeMs: 1000,
    } as never)

    expect(textContent(pollResult)).toContain("completed exit=0")
    expect(textContent(pollResult)).toContain("done")
    expect((pollResult.details as { running?: boolean }).running).toBe(false)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("run_script uses npm when package-lock.json is present", async () => {
  const npmCheck = spawnSync("npm", ["--version"])
  if (npmCheck.status !== 0) return
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-npm-script-test-"))
  try {
    await Bun.write(join(projectRoot, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }))
    await Bun.write(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        echoargs: "node -e \"console.log(process.argv.slice(1).join(','))\"",
      },
    }))
    const runScript = getTool("run_script", projectRoot)
    const scriptResult = await runScript.execute("script-npm", { script: "echoargs", args: ["a", "b"] } as never)

    expect(textContent(scriptResult)).toContain("npm run echoargs -- a b")
    expect(textContent(scriptResult)).toContain("a,b")
    expect((scriptResult.details as { packageManager?: string }).packageManager).toBe("npm")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test("git_diff and get_changed_files report git working tree state", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-tools-git-test-"))
  try {
    expect(spawnSync("git", ["init"], { cwd: projectRoot }).status).toBe(0)
    await Bun.write(join(projectRoot, "tracked.txt"), "before\n")
    expect(spawnSync("git", ["add", "tracked.txt"], { cwd: projectRoot }).status).toBe(0)
    expect(spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"], { cwd: projectRoot }).status).toBe(0)
    await Bun.write(join(projectRoot, "tracked.txt"), "after\n")
    await Bun.write(join(projectRoot, "new.txt"), "new\n")

    const gitDiff = getTool("git_diff", projectRoot)
    const changedFiles = getTool("get_changed_files", projectRoot)
    const diffResult = await gitDiff.execute("diff-1", { path: "tracked.txt", stat: true } as never)
    const changedResult = await changedFiles.execute("changed-1", {} as never)

    expect(textContent(diffResult)).toContain("tracked.txt")
    expect(textContent(changedResult)).toContain("tracked.txt")
    expect(textContent(changedResult)).toContain("new.txt")
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})
