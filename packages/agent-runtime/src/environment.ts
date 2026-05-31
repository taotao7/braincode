import { execFile } from "node:child_process"
import { basename } from "node:path"

// Run-global environment facts injected into every executing agent's prompt
// (primary, support workers, review). The model otherwise has no idea what
// directory it is in, what OS/shell generated commands must target, what
// today's date is for "latest"/"recent" judgements, or what git branch a
// devops/commit task is operating on. Gathered once per run.
export type EnvironmentContext = {
  cwd: string
  platform: NodeJS.Platform
  shell?: string
  date: string
  git?: GitEnvironment
  modelId?: string
}

export type GitEnvironment = {
  isRepo: boolean
  branch?: string
  changedFiles: number
  clean: boolean
}

function runGit(args: string[], cwd: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      resolve(stdout.trim())
    })
  })
}

function formatLocalDate(now: Date): string {
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, "0")
  const day = `${now.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

async function gatherGitEnvironment(cwd: string, timeoutMs: number): Promise<GitEnvironment | undefined> {
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], cwd, timeoutMs)
  if (inside !== "true") return undefined
  const [branch, status] = await Promise.all([
    runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd, timeoutMs),
    runGit(["status", "--porcelain"], cwd, timeoutMs),
  ])
  const changedFiles = status ? status.split("\n").filter((line) => line.trim().length > 0).length : 0
  return {
    isRepo: true,
    branch: branch && branch !== "HEAD" ? branch : undefined,
    changedFiles,
    clean: changedFiles === 0,
  }
}

export async function gatherEnvironmentContext(options: {
  cwd: string
  modelId?: string
  now?: Date
  gitTimeoutMs?: number
}): Promise<EnvironmentContext> {
  const now = options.now ?? new Date()
  const gitTimeoutMs = options.gitTimeoutMs ?? 1_000
  let git: GitEnvironment | undefined
  try {
    git = await gatherGitEnvironment(options.cwd, gitTimeoutMs)
  } catch {
    git = undefined
  }
  const shell = process.env.SHELL ? basename(process.env.SHELL) : undefined
  return {
    cwd: options.cwd,
    platform: process.platform,
    shell,
    date: formatLocalDate(now),
    git,
    modelId: options.modelId,
  }
}

// Compact, deterministic block prepended to executing agents' prompts. Kept to
// one fact per line so it survives context compaction cheaply and never crowds
// out the user request. Returns "" defensively if no context was gathered.
export function formatEnvironmentSection(env?: EnvironmentContext): string {
  if (!env) return ""
  const lines = [
    "Environment:",
    `- Working directory: ${env.cwd}`,
    `- Platform: ${env.platform}${env.shell ? ` / ${env.shell}` : ""}`,
    `- Today's date: ${env.date}`,
  ]
  if (env.git?.isRepo) {
    const branch = env.git.branch ? `branch ${env.git.branch}` : "detached HEAD"
    const state = env.git.clean ? "clean" : `${env.git.changedFiles} changed file(s)`
    lines.push(`- Git: ${branch} (${state})`)
  } else {
    lines.push("- Git: not a git repository")
  }
  if (env.modelId) lines.push(`- Model: ${env.modelId}`)
  return `${lines.join("\n")}\n`
}
