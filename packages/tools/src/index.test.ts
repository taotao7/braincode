import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDefaultToolConfiguration, createLocalCodingTools } from "./index"

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
  expect(byName.get("shell")?.approvalPolicy).toBe("confirm-dangerous")
  expect(byName.get("git_diff")?.enabled).toBe(true)
  expect(byName.get("get_changed_files")?.enabled).toBe(true)
  expect(byName.get("run_script")?.enabled).toBe(true)
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
