import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runConfiguredHooks } from "./hooks"

test("runConfiguredHooks parses command hook block decisions and event-scoped context", async () => {
  const home = await mkdtemp(join(tmpdir(), "braincode-hooks-home-test-"))
  const projectRoot = await mkdtemp(join(tmpdir(), "braincode-hooks-project-test-"))
  try {
    await mkdir(join(projectRoot, ".agents"), { recursive: true })
    const hookScript = join(projectRoot, "block-hook.js")
    await Bun.write(
      hookScript,
      [
        "let input = '';",
        "process.stdin.on('data', (chunk) => input += chunk);",
        "process.stdin.on('end', () => {",
        "  const event = JSON.parse(input);",
        "  process.stdout.write(JSON.stringify({",
        "    decision: 'block',",
        "    reason: `blocked ${event.prompt}`,",
        "    hookSpecificOutput: { hookEventName: event.hook_event_name, additionalContext: `context ${event.model}` }",
        "  }));",
        "});",
      ].join("\n"),
    )
    await Bun.write(
      join(projectRoot, ".agents", "hooks.json"),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: "command",
                  command: `bun ${JSON.stringify(hookScript)}`,
                  trusted: true,
                  timeout: 5,
                },
              ],
            },
          ],
        },
      }),
    )

    const result = await runConfiguredHooks(
      "UserPromptSubmit",
      { prompt: "danger" },
      { sessionId: "hook-test", cwd: projectRoot, home, model: "test-model" },
    )

    expect(result.blockedReason).toBe("blocked danger")
    expect(result.additionalContext).toEqual(["context test-model"])
    expect(result.records[0]).toMatchObject({
      status: "blocked",
      reason: "blocked danger",
    })
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
  }
})
