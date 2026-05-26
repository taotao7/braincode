#!/usr/bin/env node
"use strict"

const path = require("node:path")
const fs = require("node:fs")
const { spawnSync } = require("node:child_process")

const bin = path.join(__dirname, "braincode-bin")

if (!fs.existsSync(bin)) {
  console.error("[braincode] binary not found at", bin)
  console.error("[braincode] try reinstalling: npm i -g @taotao7/braincode")
  process.exit(1)
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" })
if (result.error) {
  console.error("[braincode] failed to launch binary:", result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
