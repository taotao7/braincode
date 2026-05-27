#!/usr/bin/env bun

import { demoBenchmarkTasks, executePromptFromConfig, planRuntimeFromConfig, runDemoBenchmarkSuite, type DemoBenchmarkSuiteResult } from "@braincode/agent-runtime"
import { startConfigServer } from "@braincode/server"
import { runTui } from "./tui"

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

function readRepeatedFlag(args: string[], name: string): string[] {
  const values: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue
    const value = args[index + 1]
    if (value && !value.startsWith("--")) values.push(value)
  }
  return values
}

function printHelp() {
  console.log(`Braincode

Usage:
  braincode [tui]
  braincode config [--port <port>] [--host <host>] [--no-open]
  braincode run [--dry-run] [--heuristic] <prompt>
  braincode benchmark [--heuristic] [--task <id>] [--json]
  braincode help

Commands:
  tui      Start the interactive TUI (default when no command is given).
  config   Start the local browser configuration service.
  run      Plan or execute a task using the configured brain and model.
  benchmark
           Run representative coding-task plan benchmarks.
  help     Show this help message.

Run flags:
  --dry-run     Print the routeBrain runtime plan instead of executing.
  --heuristic   With --dry-run, skip routeBrain and print the deterministic fallback plan.

Benchmark flags:
  --heuristic   Skip routeBrain and benchmark the deterministic fallback plan.
  --task <id>   Run one task id; repeat or comma-separate for multiple tasks.
  --list        Print available benchmark tasks.
  --json        Print machine-readable JSON.
`)
}

async function runConfig(args: string[]) {
  const portText = readFlag(args, "--port")
  const host = readFlag(args, "--host") ?? "127.0.0.1"
  const parsedPort = portText ? Number(portText) : undefined
  const shouldOpen = !args.includes("--no-open")

  if (parsedPort !== undefined && (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535)) {
    throw new Error(`Invalid --port value: ${portText}`)
  }

  const server = await startConfigServer({ host, port: parsedPort })

  console.log(`Braincode config server is running at ${server.url}`)
  console.log("Configuration is stored under ~/.braincode/")
  console.log("Press Ctrl+C to stop.")

  if (shouldOpen) {
    await openInBrowser(server.url)
  }

  await new Promise<void>(() => {})
}

async function openInBrowser(url: string): Promise<void> {
  const platform = process.platform
  const command =
    platform === "darwin" ? ["open", url]
    : platform === "win32" ? ["cmd", "/c", "start", "", url]
    : ["xdg-open", url]

  try {
    const proc = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      console.log(`Could not open browser automatically (exit ${exitCode}). Open ${url} manually.`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`Could not open browser automatically: ${message}. Open ${url} manually.`)
  }
}

async function runTask(args: string[]) {
  const dryRun = args.includes("--dry-run")
  const heuristic = args.includes("--heuristic") || args.includes("--no-router")
  const prompt = args.filter((arg) => arg !== "--dry-run" && arg !== "--heuristic" && arg !== "--no-router").join(" ").trim()

  if (!prompt) {
    throw new Error("Missing prompt. Usage: braincode run [--dry-run] [--heuristic] <prompt>")
  }

  if (dryRun) {
    const plan = await planRuntimeFromConfig(prompt, undefined, { useRouterBrain: !heuristic })
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  const result = await executePromptFromConfig({ prompt })
  console.log(result.summary)
  console.error(`\nSession: ${result.sessionId}`)
}

async function runBenchmark(args: string[]) {
  const json = args.includes("--json")
  const list = args.includes("--list")
  const useRouterBrain = !(args.includes("--heuristic") || args.includes("--no-router"))
  const home = readFlag(args, "--home")
  const taskIds = readRepeatedFlag(args, "--task")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)

  if (list) {
    if (json) {
      console.log(JSON.stringify({ tasks: demoBenchmarkTasks }, null, 2))
      return
    }
    console.log(formatBenchmarkTaskList())
    return
  }

  const result = await runDemoBenchmarkSuite(planRuntimeFromConfig, {
    home,
    useRouterBrain,
    taskIds,
  })

  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(formatBenchmarkReport(result))
  }

  if (result.summary.failedTasks > 0) {
    process.exitCode = 1
  }
}

function formatBenchmarkTaskList(): string {
  return [
    "Braincode benchmark tasks:",
    ...demoBenchmarkTasks.map((task) => `  ${task.id.padEnd(22)} ${task.title} (${task.tags.join(", ")})`),
  ].join("\n")
}

function formatBenchmarkReport(result: DemoBenchmarkSuiteResult): string {
  const lines = [
    "Braincode demo benchmark",
    `Mode: ${result.useRouterBrain ? "routeBrain preview (falls back to heuristic if unavailable)" : "heuristic diagnostic"}`,
    `Started: ${result.startedAt}`,
    "",
  ]

  for (const taskResult of result.results) {
    const source = taskResult.plan?.routing.source ?? "error"
    const role = taskResult.plan?.role ?? "-"
    const review = taskResult.plan ? String(taskResult.plan.agentPlan.requiresReview) : "-"
    const workers = taskResult.plan?.workers.map((worker) => worker.role).join(",") || "-"
    lines.push(`${taskResult.task.id.padEnd(22)} ${taskResult.status.toUpperCase().padEnd(6)} ${source.padEnd(12)} role=${role.padEnd(8)} review=${review.padEnd(5)} workers=${workers} (${taskResult.durationMs}ms)`)

    const notableChecks = taskResult.checks.filter((check) => check.status !== "passed")
    for (const check of notableChecks) {
      const reason = check.reason ? `; ${check.reason}` : ""
      lines.push(`  ${check.status.toUpperCase().padEnd(7)} ${check.name}: expected ${check.expected}, got ${check.actual}${reason}`)
    }
  }

  lines.push(
    "",
    `Summary: ${result.summary.passedTasks}/${result.summary.totalTasks} tasks passed; ${result.summary.failedTasks} failed; ${result.summary.skippedChecks} checks skipped; ${result.summary.durationMs}ms total.`,
  )

  return lines.join("\n")
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case undefined:
      await runTui()
      break
    case "tui":
      await runTui()
      break
    case "config":
      await runConfig(args.slice(1))
      break
    case "run":
      await runTask(args.slice(1))
      break
    case "benchmark":
      await runBenchmark(args.slice(1))
      break
    case "help":
    case "--help":
    case "-h":
      printHelp()
      break
    default:
      await runTui(command ? [command, ...args.slice(1)].join(" ") : undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
