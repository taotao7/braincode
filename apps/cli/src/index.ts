#!/usr/bin/env bun

import { demoBenchmarkTasks, executePromptFromConfig, humanizeAgentRuntimeError, planRuntimeFromConfig, runDemoBenchmarkSuite, type DemoBenchmarkSuiteResult, type FinalReport, type ToolApprovalDecision, type ToolApprovalRequest } from "@braincode/agent-runtime"
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
  braincode run [--dry-run] [--heuristic] [--read-only|--allow-edits|--yes] [--json|--summary-only] <prompt>
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
  --read-only   Expose read-only local tools only.
  --allow-edits Expose read/write local tools and auto-approve file edits, but block command execution.
  --yes         Expose all local tools and auto-approve tool calls for non-interactive execution.
  --json        Print the structured FinalReport as JSON.
  --summary-only
                Print only the primary model summary.

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
  const yes = args.includes("--yes") || args.includes("-y")
  const allowEdits = args.includes("--allow-edits")
  const readOnly = args.includes("--read-only")
  const json = args.includes("--json")
  const summaryOnly = args.includes("--summary-only")
  const prompt = args.filter((arg) => !["--dry-run", "--heuristic", "--no-router", "--yes", "-y", "--allow-edits", "--read-only", "--json", "--summary-only"].includes(arg)).join(" ").trim()

  if (!prompt) {
    throw new Error("Missing prompt. Usage: braincode run [--dry-run] [--heuristic] [--read-only|--allow-edits|--yes] <prompt>")
  }
  if ([readOnly, allowEdits, yes].filter(Boolean).length > 1) {
    throw new Error("Choose only one run permission mode: --read-only, --allow-edits, or --yes.")
  }
  if (json && summaryOnly) {
    throw new Error("Choose only one output mode: --json or --summary-only.")
  }

  if (dryRun) {
    const plan = await planRuntimeFromConfig(prompt, undefined, { useRouterBrain: !heuristic })
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  const runPermissions = yes ? "yes" : allowEdits ? "allow-edits" : "read-only"
  if (!yes && !allowEdits) {
    console.error("Running in read-only mode because no approval handler is available. Use --yes, --allow-edits, or the TUI for edits.")
  } else if (yes) {
    console.error("Running with --yes: tool calls are auto-approved for this non-interactive run.")
  } else {
    console.error("Running with --allow-edits: local file edits are auto-approved; command execution, MCP tools, and unknown tools remain blocked. Use --yes or the TUI for broader access.")
  }

  const result = await executePromptFromConfig({
    prompt,
    localToolMode: runPermissions === "yes" ? "all" : runPermissions === "allow-edits" ? "read-write" : "read-only",
    onToolApproval: runPermissions === "read-only" ? undefined : createRunApprovalHandler(runPermissions),
  })
  if (json) {
    console.log(JSON.stringify(result.finalReport, null, 2))
  } else if (summaryOnly) {
    console.log(result.summary)
  } else {
    console.log(formatRunReport(result.finalReport))
  }
}

export function formatRunReport(report: FinalReport): string {
  const workers = report.routing.workers.length > 0
    ? report.routing.workers.map((worker) => `${worker.role} ${worker.status ?? worker.phase}`).join(", ")
    : "none"
  const patch = report.patch && report.patch.changedFiles.length > 0
    ? `${report.patch.changedFiles.length} file${report.patch.changedFiles.length === 1 ? "" : "s"}, +${report.patch.diffStats.insertions} -${report.patch.diffStats.deletions}`
    : "no patch activity"
  const checks = report.checks
    ? report.checks.results.length > 0
      ? `${report.checks.status} (${report.checks.results.map((result) => `${result.name} ${result.status}`).join(", ")})`
      : report.checks.reason ? `${report.checks.status} (${report.checks.reason})` : report.checks.status
    : "not run"
  const review = report.review ? report.review.decision : "not run"
  const warnings = report.warnings.length > 0
    ? ["", "Warnings:", ...report.warnings.map((warning) => `- ${warning}`)]
    : []
  const summary = report.modelSummary.trim()
    ? ["", "Summary:", report.modelSummary.trim()]
    : []

  return [
    "Braincode Run Report",
    `Status: ${report.status}`,
    `Task: ${report.task}`,
    `Brain: ${report.brain.name} / ${report.brain.mode}`,
    `Routing: ${report.routing.source} -> ${report.routing.primaryRole}${report.routing.confidence !== undefined ? ` (${Math.round(report.routing.confidence * 100)}%)` : ""}`,
    `Workers: ${workers}`,
    `Patch: ${patch}`,
    `Checks: ${checks}`,
    `Review: ${review}`,
    `Session: ${report.sessionId}`,
    ...warnings,
    ...summary,
  ].join("\n")
}

function createRunApprovalHandler(mode: "yes" | "allow-edits") {
  return (request: ToolApprovalRequest): ToolApprovalDecision => {
    if (mode === "yes") return { approved: true, reason: "auto-approved by --yes" }
    if (isExecuteToolName(request.toolName)) {
      return { approved: false, reason: "Command execution is blocked by --allow-edits; use --yes or the TUI to allow commands." }
    }
    if (localWriteToolNames.has(request.toolName)) return { approved: true, reason: "auto-approved local file edit by --allow-edits" }
    if (localReadOnlyToolNames.has(request.toolName)) return { approved: true, reason: "auto-approved local read-only tool call by --allow-edits" }
    return { approved: false, reason: `Tool ${request.toolName} is not auto-approved by --allow-edits; use --yes or the TUI to allow it.` }
  }
}

const localReadOnlyToolNames = new Set([
  "list_files",
  "read_file",
  "search_files",
  "git_diff",
  "get_changed_files",
])

const localWriteToolNames = new Set([
  "edit_file",
  "apply_patch",
])

function isExecuteToolName(toolName: string): boolean {
  return /(shell|exec|execute|run_command|run-command|terminal|bash|zsh|cmd|powershell|spawn|subprocess|run_script|write_stdin)/i.test(toolName)
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

if (import.meta.main) {
  main().catch((error) => {
    console.error(humanizeAgentRuntimeError(error))
    process.exitCode = 1
  })
}
