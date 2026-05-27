#!/usr/bin/env bun

import { executePromptFromConfig, planRuntimeFromConfig } from "@braincode/agent-runtime"
import { startConfigServer } from "@braincode/server"
import { runTui } from "./tui"

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

function printHelp() {
  console.log(`Braincode

Usage:
  braincode [tui]
  braincode config [--port <port>] [--host <host>] [--no-open]
  braincode run [--dry-run] <prompt>
  braincode help

Commands:
  tui      Start the interactive TUI (default when no command is given).
  config   Start the local browser configuration service.
  run      Plan or execute a task using the configured brain and model.
  help     Show this help message.
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
  const prompt = args.filter((arg) => arg !== "--dry-run").join(" ").trim()

  if (!prompt) {
    throw new Error("Missing prompt. Usage: braincode run [--dry-run] <prompt>")
  }

  if (dryRun) {
    const plan = await planRuntimeFromConfig(prompt)
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  const result = await executePromptFromConfig({ prompt })
  console.log(result.summary)
  console.error(`\nSession: ${result.sessionId}`)
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
