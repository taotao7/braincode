#!/usr/bin/env bun

import { executePromptFromConfig, planRuntimeFromConfig } from "@braincode/agent-runtime"
import { startConfigServer } from "@braincode/server"

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

function printHelp() {
  console.log(`Braincode

Usage:
  braincode config [--port <port>] [--host <host>]
  braincode run [--dry-run] <prompt>
  braincode help

Commands:
  config   Start the local browser configuration service.
  run      Plan or execute a task using the configured brain and model.
  help     Show this help message.
`)
}

async function runConfig(args: string[]) {
  const portText = readFlag(args, "--port")
  const host = readFlag(args, "--host") ?? "127.0.0.1"
  const parsedPort = portText ? Number(portText) : undefined

  if (parsedPort !== undefined && (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535)) {
    throw new Error(`Invalid --port value: ${portText}`)
  }

  const server = await startConfigServer({ host, port: parsedPort })

  console.log(`Braincode config server is running at ${server.url}`)
  console.log("Configuration is stored under ~/.braincode/")
  console.log("Press Ctrl+C to stop.")

  await new Promise<void>(() => {})
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
  const command = args[0] ?? "help"

  switch (command) {
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
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
