import { spawn } from "node:child_process"
import { open, stat } from "node:fs/promises"
import { resolve, sep } from "node:path"

const MAX_REVIEW_DIFF_CHARS = 60_000
const MAX_UNTRACKED_PREVIEW_BYTES = 12_000

export type PatchFileChange = {
  path: string
  status: string
}

export type PatchBaseline = {
  changedFiles: PatchFileChange[]
}

export type PatchSummary = {
  changedFiles: PatchFileChange[]
  preExistingChangedFiles: PatchFileChange[]
  diffStats: {
    filesChanged: number
    insertions: number
    deletions: number
    untrackedFiles: number
    raw: string
    unstagedRaw: string
    stagedRaw: string
  }
}

export type PatchDiffSnapshot = {
  stat: string
  diff: string
  truncated: boolean
}

export type UntrackedFilePreview = {
  path: string
  text?: string
  truncated: boolean
  binary: boolean
  size: number
}

export async function collectPatchBaseline(projectRoot: string): Promise<PatchBaseline | undefined> {
  const status = await runGitCommand(projectRoot, ["status", "--short", "--untracked-files=all"])
  if (status.exitCode !== 0) return undefined
  return { changedFiles: parsePatchStatus(status.stdout) }
}

export async function collectPatchSummary(projectRoot: string, baseline?: PatchBaseline): Promise<PatchSummary | undefined> {
  const status = await runGitCommand(projectRoot, ["status", "--short", "--untracked-files=all"])
  if (status.exitCode !== 0) return undefined
  const currentChangedFiles = parsePatchStatus(status.stdout)
  const shortstat = await runGitCommand(projectRoot, ["diff", "--shortstat"])
  const stagedShortstat = await runGitCommand(projectRoot, ["diff", "--cached", "--shortstat"])
  const baselineKeys = new Set((baseline?.changedFiles ?? []).map(patchStatusKey))
  const changedFiles = baseline
    ? currentChangedFiles.filter((change) => !baselineKeys.has(patchStatusKey(change)))
    : currentChangedFiles
  const preExistingChangedFiles = baseline
    ? currentChangedFiles.filter((change) => baselineKeys.has(patchStatusKey(change)))
    : []
  const unstagedRaw = shortstat.exitCode === 0 ? shortstat.stdout.trim() : ""
  const stagedRaw = stagedShortstat.exitCode === 0 ? stagedShortstat.stdout.trim() : ""
  const untrackedFiles = currentChangedFiles.filter((change) => change.status === "??").length
  const diffStats = combineGitShortstats(unstagedRaw, stagedRaw, untrackedFiles)
  return {
    changedFiles,
    preExistingChangedFiles,
    diffStats,
  }
}

export function hasPatchActivity(summary: PatchSummary | undefined): summary is PatchSummary {
  if (!summary) return false
  if (summary.changedFiles.length > 0) return true
  if (summary.preExistingChangedFiles.length > 0) return false
  return summary.diffStats.filesChanged > 0 || summary.diffStats.insertions > 0 || summary.diffStats.deletions > 0 || summary.diffStats.untrackedFiles > 0
}

export async function collectPatchDiffSnapshot(projectRoot: string, maxChars = MAX_REVIEW_DIFF_CHARS): Promise<PatchDiffSnapshot | undefined> {
  const unstagedStat = await runGitCommand(projectRoot, ["diff", "--stat"])
  const stagedStat = await runGitCommand(projectRoot, ["diff", "--cached", "--stat"])
  const unstagedDiff = await runGitCommand(projectRoot, ["diff", "--no-ext-diff"])
  const stagedDiff = await runGitCommand(projectRoot, ["diff", "--cached", "--no-ext-diff"])
  if ([unstagedStat, stagedStat, unstagedDiff, stagedDiff].some((result) => result.exitCode !== 0)) return undefined

  const stat = [
    unstagedStat.stdout.trim(),
    stagedStat.stdout.trim() ? `staged:\n${stagedStat.stdout.trim()}` : "",
  ].filter(Boolean).join("\n")
  const rawDiff = [
    unstagedDiff.stdout.trim(),
    stagedDiff.stdout.trim() ? `# Staged diff\n${stagedDiff.stdout.trim()}` : "",
  ].filter(Boolean).join("\n\n")
  const clipped = clipText(rawDiff, maxChars)
  return { stat, diff: clipped.text, truncated: clipped.truncated }
}

export async function collectUntrackedFilePreviews(projectRoot: string, patch?: PatchSummary, maxBytes = MAX_UNTRACKED_PREVIEW_BYTES): Promise<UntrackedFilePreview[]> {
  const changes = patch
    ? patch.changedFiles
    : parsePatchStatus((await runGitCommand(projectRoot, ["status", "--short", "--untracked-files=all"])).stdout)
  const paths = [...new Set(changes.filter((change) => change.status === "??").map((change) => change.path))]
  const previews: UntrackedFilePreview[] = []

  for (const path of paths) {
    const absolutePath = resolveProjectPath(projectRoot, path)
    if (!absolutePath) continue
    const preview = await readUntrackedPreview(path, absolutePath, maxBytes)
    if (preview) previews.push(preview)
  }

  return previews
}

async function runGitCommand(cwd: string, args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => { stdout += String(chunk) })
    child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
    child.on("error", (error) => resolve({ exitCode: 127, stdout, stderr: error.message }))
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }))
  })
}

function parsePatchStatus(stdout: string): PatchFileChange[] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || "?"
      const rawPath = line.slice(3).trim()
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath
      return { path, status }
    })
}

function patchStatusKey(change: PatchFileChange): string {
  return `${change.status}\0${change.path}`
}

function combineGitShortstats(unstagedRaw: string, stagedRaw: string, untrackedFiles: number): PatchSummary["diffStats"] {
  const unstaged = parseGitShortstat(unstagedRaw)
  const staged = parseGitShortstat(stagedRaw)
  const raw = [
    unstagedRaw,
    stagedRaw ? `staged: ${stagedRaw}` : "",
    untrackedFiles > 0 ? `${untrackedFiles} untracked file${untrackedFiles === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" | ")
  return {
    filesChanged: unstaged.filesChanged + staged.filesChanged + untrackedFiles,
    insertions: unstaged.insertions + staged.insertions,
    deletions: unstaged.deletions + staged.deletions,
    untrackedFiles,
    raw,
    unstagedRaw,
    stagedRaw,
  }
}

function resolveProjectPath(projectRoot: string, path: string): string | undefined {
  const root = resolve(projectRoot)
  const absolutePath = resolve(root, path)
  if (absolutePath !== root && absolutePath.startsWith(`${root}${sep}`)) return absolutePath
  return undefined
}

async function readUntrackedPreview(path: string, absolutePath: string, maxBytes: number): Promise<UntrackedFilePreview | undefined> {
  const info = await stat(absolutePath).catch(() => undefined)
  if (!info) return undefined
  if (!info.isFile()) {
    return { path, truncated: false, binary: true, size: info.size }
  }

  const safeMaxBytes = Math.max(0, maxBytes)
  const readBytes = Math.min(info.size, safeMaxBytes + 4)
  const handle = await open(absolutePath, "r")
  try {
    const buffer = Buffer.alloc(readBytes)
    const { bytesRead } = await handle.read(buffer, 0, readBytes, 0)
    const sample = buffer.subarray(0, bytesRead)
    const binary = isLikelyBinary(sample)
    const truncated = info.size > safeMaxBytes
    if (binary) return { path, truncated, binary: true, size: info.size }

    const textBuffer = trimIncompleteUtf8(sample.subarray(0, Math.min(sample.length, safeMaxBytes)))
    return {
      path,
      text: new TextDecoder("utf-8").decode(textBuffer),
      truncated,
      binary: false,
      size: info.size,
    }
  } finally {
    await handle.close()
  }
}

function isLikelyBinary(buffer: Buffer): boolean {
  return buffer.includes(0)
}

function trimIncompleteUtf8(buffer: Buffer): Buffer {
  let leadIndex = buffer.length - 1
  while (leadIndex >= 0 && (buffer[leadIndex] & 0b1100_0000) === 0b1000_0000) leadIndex -= 1
  if (leadIndex < 0) return buffer.subarray(0, 0)
  const lead = buffer[leadIndex]
  const expectedLength =
    (lead & 0b1111_1000) === 0b1111_0000 ? 4
    : (lead & 0b1111_0000) === 0b1110_0000 ? 3
    : (lead & 0b1110_0000) === 0b1100_0000 ? 2
    : 1
  const availableLength = buffer.length - leadIndex
  return availableLength < expectedLength ? buffer.subarray(0, leadIndex) : buffer
}

function parseGitShortstat(raw: string): Pick<PatchSummary["diffStats"], "filesChanged" | "insertions" | "deletions"> {
  const filesChanged = Number(raw.match(/(\d+)\s+files?\s+changed/)?.[1] ?? 0)
  const insertions = Number(raw.match(/(\d+)\s+insertions?\(\+\)/)?.[1] ?? 0)
  const deletions = Number(raw.match(/(\d+)\s+deletions?\(-\)/)?.[1] ?? 0)
  return { filesChanged, insertions, deletions }
}

function clipText(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false }
  return { text: `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]`, truncated: true }
}
