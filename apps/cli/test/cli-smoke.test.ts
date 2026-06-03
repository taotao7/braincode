import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "../../..")

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "apps/cli/src/index.ts", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

describe("braincode CLI smoke", () => {
  test("help command prints usage without starting the TUI", async () => {
    const result = await runCli(["help"])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Usage:")
    expect(result.stdout).toContain("braincode run [--dry-run]")
    expect(result.stdout).toContain("braincode doctor [--json]")
  })

  test("benchmark --list --json exposes benchmark task ids", async () => {
    const result = await runCli(["benchmark", "--list", "--json"])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout) as { tasks?: Array<{ id?: string }> }
    expect(parsed.tasks?.some((task) => task.id === "readme-edit")).toBe(true)
  })
})
