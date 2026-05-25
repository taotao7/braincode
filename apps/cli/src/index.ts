#!/usr/bin/env bun

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
  braincode help

Commands:
  config   Start the local browser configuration service.
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

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] ?? "help"

  switch (command) {
    case "config":
      await runConfig(args.slice(1))
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
