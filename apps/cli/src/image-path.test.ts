import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { isExistingImageFile, resolveImagePromptPath } from "./image-path"

describe("resolveImagePromptPath", () => {
  test("resolves common local image path forms", () => {
    const projectRoot = "/project"
    const home = "/Users/tester"

    expect(resolveImagePromptPath("~/a.png", projectRoot, home)).toBe(
      "/Users/tester/a.png",
    )
    expect(resolveImagePromptPath("/tmp/a.webp", projectRoot, home)).toBe(
      "/tmp/a.webp",
    )
    expect(resolveImagePromptPath("./a.jpg", projectRoot, home)).toBe(
      "/project/a.jpg",
    )
    expect(resolveImagePromptPath("a.gif", projectRoot, home)).toBe(
      "/project/a.gif",
    )
  })

  test("accepts quoted paths and file URLs", () => {
    const projectRoot = "/project"
    const home = "/Users/tester"

    expect(
      resolveImagePromptPath("\"My Render.png\"", projectRoot, home),
    ).toBe("/project/My Render.png")
    expect(
      resolveImagePromptPath(
        pathToFileURL("/tmp/My Render.png").toString(),
        projectRoot,
        home,
      ),
    ).toBe("/tmp/My Render.png")
  })

  test("resolves simple image preview requests around one path", () => {
    const projectRoot = "/project"
    const home = "/Users/tester"

    expect(
      resolveImagePromptPath("查看下 ~/a.png 图片", projectRoot, home),
    ).toBe("/Users/tester/a.png")
    expect(resolveImagePromptPath("~/a.png 图片", projectRoot, home)).toBe(
      "/Users/tester/a.png",
    )
    expect(resolveImagePromptPath("please show a.png", projectRoot, home)).toBe(
      "/project/a.png",
    )
    expect(
      resolveImagePromptPath("预览 `My Render.png`", projectRoot, home),
    ).toBe("/project/My Render.png")
  })

  test("does not treat unrelated natural language as a preview request", () => {
    expect(resolveImagePromptPath("create a.png", "/project", "/home")).toBe(
      null,
    )
    expect(resolveImagePromptPath("分析 a.png", "/project", "/home")).toBe(null)
    expect(resolveImagePromptPath("notes.txt", "/project", "/home")).toBe(null)
  })
})

describe("isExistingImageFile", () => {
  test("checks that the resolved path exists as a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "braincode-image-path-test-"))
    const imagePath = join(dir, "image.png")
    await writeFile(imagePath, Buffer.from([0]))

    await expect(isExistingImageFile(imagePath)).resolves.toBe(true)
    await expect(isExistingImageFile(join(dir, "missing.png"))).resolves.toBe(
      false,
    )
  })
})
