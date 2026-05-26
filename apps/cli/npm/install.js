#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const https = require("node:https")
const crypto = require("node:crypto")
const zlib = require("node:zlib")
const { spawnSync } = require("node:child_process")

const REPO = "taotao7/braincode"
const BIN_NAME = "braincode-bin"

function detectTarget() {
  const platform = os.platform()
  const arch = os.arch()

  let target
  if (platform === "darwin" && arch === "arm64") target = "darwin-arm64"
  else if (platform === "darwin" && arch === "x64") target = "darwin-x64"
  else if (platform === "linux" && arch === "x64") target = "linux-x64"
  else if (platform === "linux" && arch === "arm64") target = "linux-arm64"

  if (!target) {
    const supported = "darwin-arm64, darwin-x64, linux-x64, linux-arm64"
    throw new Error(`Unsupported platform ${platform}/${arch}. Supported: ${supported}.`)
  }

  return target
}

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "user-agent": "braincode-npm-installer" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          resolve(get(res.headers.location))
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          res.resume()
          return
        }
        resolve(res)
      })
      .on("error", reject)
  })
}

async function fetchBuffer(url) {
  const res = await get(url)
  const chunks = []
  for await (const chunk of res) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex")
}

function parseShaSums(text, name) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [hash, file] = trimmed.split(/\s+/)
    if (file === name || file === `*${name}`) return hash
  }
  return null
}

function untarGz(buffer, destDir) {
  const data = zlib.gunzipSync(buffer)
  let offset = 0
  let extracted = null

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512)
    const nameRaw = header.subarray(0, 100).toString("utf8")
    const name = nameRaw.replace(/\0.*$/, "")
    if (!name) break

    const sizeOctal = header.subarray(124, 124 + 12).toString("utf8").replace(/\0/g, "").trim()
    const size = parseInt(sizeOctal, 8) || 0
    const typeflag = header.subarray(156, 157).toString("utf8")

    offset += 512

    if (typeflag === "" || typeflag === "0") {
      const body = data.subarray(offset, offset + size)
      const target = path.join(destDir, path.basename(name))
      fs.writeFileSync(target, body)
      fs.chmodSync(target, 0o755)
      extracted = target
    }

    offset += Math.ceil(size / 512) * 512
  }

  if (!extracted) throw new Error("Tarball contained no files")
  return extracted
}

async function main() {
  if (process.env.BRAINCODE_SKIP_DOWNLOAD === "1") {
    console.log("[braincode] BRAINCODE_SKIP_DOWNLOAD=1, skipping binary download.")
    return
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"))
  const version = pkg.version
  const target = detectTarget()
  const binDir = path.join(__dirname, "bin")
  fs.mkdirSync(binDir, { recursive: true })

  const tarballName = `braincode-${target}.tar.gz`
  const releaseBase = `https://github.com/${REPO}/releases/download/v${version}`
  const tarballUrl = `${releaseBase}/${tarballName}`
  const shasumsUrl = `${releaseBase}/SHA256SUMS`

  console.log(`[braincode] downloading ${tarballName} from release v${version}…`)

  const [tarball, shasumsBuf] = await Promise.all([fetchBuffer(tarballUrl), fetchBuffer(shasumsUrl)])
  const expected = parseShaSums(shasumsBuf.toString("utf8"), tarballName)
  if (!expected) throw new Error(`SHA256SUMS missing entry for ${tarballName}`)
  const actual = sha256(tarball)
  if (actual !== expected) throw new Error(`sha256 mismatch for ${tarballName}: expected ${expected}, got ${actual}`)

  const extracted = untarGz(tarball, binDir)
  const finalPath = path.join(binDir, BIN_NAME)
  if (extracted !== finalPath) {
    fs.renameSync(extracted, finalPath)
  }
  fs.chmodSync(finalPath, 0o755)

  const result = spawnSync(finalPath, ["help"], { stdio: "ignore" })
  if (result.status !== 0) {
    console.warn("[braincode] post-install smoke test exited with non-zero status; the binary may still work.")
  }

  console.log(`[braincode] installed ${target} binary -> ${finalPath}`)
}

main().catch((err) => {
  console.error("[braincode] install failed:", err.message || err)
  console.error("[braincode] you can manually download the binary from:")
  console.error(`           https://github.com/${REPO}/releases`)
  console.error("[braincode] then place it at:", path.join(__dirname, "bin", BIN_NAME))
  process.exit(1)
})
