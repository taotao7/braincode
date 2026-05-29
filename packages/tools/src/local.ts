import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { access, mkdir, open, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, dirname } from "node:path"
import { Type } from "typebox"
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
import type { ToolConfiguration, ToolPermission } from "./index"

export type LocalToolMode = "all" | "read-only" | "read-write"

export type LocalCodingToolOptions = {
  projectRoot: string
  tools?: ToolConfiguration[]
  mode?: LocalToolMode
  ignoreDisabled?: boolean
  maxReadBytes?: number
  maxOutputBytes?: number
  commandTimeoutMs?: number
}

type LocalToolSpec = {
  name: string
  label: string
  description: string
  permissions: ToolPermission[]
  create: (context: LocalToolContext) => AgentTool
}

type LocalToolContext = {
  projectRoot: string
  maxReadBytes: number
  maxOutputBytes: number
  commandTimeoutMs: number
  execSessions: ExecSessionManager
}

type JsonRecord = Record<string, unknown>

type PackageManager = {
  name: "bun" | "pnpm" | "yarn" | "npm"
  command: string
  runArgs: (script: string, args: string[]) => string[]
}

export const localCodingToolNames = [
  "list_files",
  "read_file",
  "search_files",
  "edit_file",
  "apply_patch",
  "exec_command",
  "write_stdin",
  "shell",
  "git_diff",
  "get_changed_files",
  "run_script",
] as const

export type LocalCodingToolName = (typeof localCodingToolNames)[number]

const DEFAULT_MAX_READ_BYTES = 128_000
const DEFAULT_MAX_OUTPUT_BYTES = 96_000
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000
const LARGE_FILE_READ_THRESHOLD_CHARS = 24_000
const MIN_LARGE_FILE_READ_CHARS = 32_000
const BINARY_FILE_PROBE_BYTES = 4096
const ALL_EXIT_CODES = Array.from({ length: 256 }, (_, code) => code)

export function createLocalCodingTools(options: LocalCodingToolOptions): AgentTool[] {
  const context: LocalToolContext = {
    projectRoot: resolve(options.projectRoot),
    maxReadBytes: options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    commandTimeoutMs: options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    execSessions: new ExecSessionManager(),
  }
  const enabled = new Map((options.tools ?? []).map((tool) => [tool.name, tool.enabled]))
  const mode = options.mode ?? "all"

  return localToolSpecs
    .filter((tool) => {
      if (mode === "all") return true
      if (mode === "read-write") return !tool.permissions.includes("execute")
      return !tool.permissions.some((permission) => permission === "write" || permission === "execute")
    })
    .filter((tool) => (options.tools && !options.ignoreDisabled ? enabled.get(tool.name) === true : true))
    .map((tool) => tool.create(context))
}

const localToolSpecs: LocalToolSpec[] = [
  {
    name: "list_files",
    label: "List Files",
    description: "List project files under the current workspace. Input: optional directory, glob, and maxFiles.",
    permissions: ["read"],
    create: createListFilesTool,
  },
  {
    name: "read_file",
    label: "Read File",
    description: "Read a UTF-8 text file inside the current project workspace.",
    permissions: ["read"],
    create: createReadFileTool,
  },
  {
    name: "search_files",
    label: "Search Files",
    description: "Search project files by content or path substring inside the current workspace.",
    permissions: ["read"],
    create: createSearchFilesTool,
  },
  {
    name: "edit_file",
    label: "Edit File",
    description: "Modify a project file by replacing text or writing complete UTF-8 content.",
    permissions: ["write"],
    create: createEditFileTool,
  },
  {
    name: "apply_patch",
    label: "Apply Patch",
    description: "Apply a unified diff to files inside the current project workspace using git apply.",
    permissions: ["write"],
    create: createApplyPatchTool,
  },
  {
    name: "exec_command",
    label: "Exec Command",
    description: "Run a shell command and return output or a session id for ongoing interaction.",
    permissions: ["execute"],
    create: createExecCommandTool,
  },
  {
    name: "write_stdin",
    label: "Write Stdin",
    description: "Write input to, or poll output from, an ongoing exec_command session.",
    permissions: ["execute"],
    create: createWriteStdinTool,
  },
  {
    name: "shell",
    label: "Shell",
    description: "Run a shell command in the current project workspace and return stdout, stderr, and exit code.",
    permissions: ["execute"],
    create: createShellTool,
  },
  {
    name: "git_diff",
    label: "Git Diff",
    description: "Return the current git diff, optionally scoped to one project path or rendered as stats.",
    permissions: ["read"],
    create: createGitDiffTool,
  },
  {
    name: "get_changed_files",
    label: "Changed Files",
    description: "Return changed files from git status --short for the current project workspace.",
    permissions: ["read"],
    create: createChangedFilesTool,
  },
  {
    name: "run_script",
    label: "Run Script",
    description: "Run a package script with the detected package manager from the current project workspace.",
    permissions: ["execute"],
    create: createRunScriptTool,
  },
]

function createListFilesTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    directory: Type.Optional(Type.String()),
    glob: Type.Optional(Type.String()),
    maxFiles: Type.Optional(Type.Number()),
  })
  return {
    name: "list_files",
    label: "List Files",
    description: "List project files under the current workspace.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      return {
        directory: pickString(record, ["directory", "dir", "path"]),
        glob: pickString(record, ["glob", "pattern"]),
        maxFiles: pickNumber(record, ["maxFiles", "limit"]),
      }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { directory?: string; glob?: string; maxFiles?: number }
      const directory = input.directory ? await resolveProjectPath(context.projectRoot, input.directory) : await resolveProjectPath(context.projectRoot, ".")
      const maxFiles = clampInteger(input.maxFiles, 1, 2000, 200)
      const files = await listProjectFiles(context, directory.absolutePath, input.glob, maxFiles)
      return textResult(files.join("\n") || "(no files)", { tool: "list_files", files, count: files.length })
    },
  }
}

function createReadFileTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    path: Type.String(),
    offset: Type.Optional(Type.Number()),
    limit: Type.Optional(Type.Number()),
  })
  return {
    name: "read_file",
    label: "Read File",
    description: "Read a UTF-8 text file inside the current project workspace. Prefer search_files for locating symbols in large files; very small limits are automatically expanded for large files to avoid excessive paging.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      return {
        path: pickRequiredString(record, ["path", "file", "filePath"]),
        offset: pickNumber(record, ["offset"]),
        limit: pickNumber(record, ["limit", "maxBytes"]),
      }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { path: string; offset?: number; limit?: number }
      const target = await resolveProjectPath(context.projectRoot, input.path)
      const window = await readUtf8TextWindow(target.absolutePath, input.offset, input.limit, context.maxReadBytes)
      const truncated = window.end < window.total
      const header = `# ${target.relativePath}${formatReadFileWindowHeader({
        offset: window.offset,
        end: window.end,
        total: window.total,
        requestedLimit: window.requestedLimit,
        limit: window.limit,
        expanded: window.expanded,
        truncated,
      })}`
      return textResult(`${header}\n${window.content}`, {
        tool: "read_file",
        path: target.relativePath,
        chars: window.content.length,
        totalChars: window.total,
        offset: window.offset,
        limit: window.limit,
        requestedLimit: window.requestedLimit,
        limitExpanded: window.expanded,
        nextOffset: truncated ? window.end : undefined,
        truncated,
      })
    },
  }
}

function createSearchFilesTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    query: Type.Optional(Type.String()),
    mode: Type.Optional(Type.Union([Type.Literal("content"), Type.Literal("path")])),
    glob: Type.Optional(Type.String()),
    maxResults: Type.Optional(Type.Number()),
  })
  return {
    name: "search_files",
    label: "Search Files",
    description: "Search project files by content, path substring, or glob-only file listing inside the current workspace.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      const query = pickString(record, ["query", "pattern", "text"])
      const mode = pickString(record, ["mode"])
      return {
        query,
        mode: mode === "path" || !query ? "path" : "content",
        glob: pickString(record, ["glob"]),
        maxResults: pickNumber(record, ["maxResults", "limit"]),
      }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { query?: string; mode?: "content" | "path"; glob?: string; maxResults?: number }
      const query = input.query?.trim() ?? ""
      const maxResults = clampInteger(input.maxResults, 1, 1000, 100)
      const mode = input.mode ?? (query ? "content" : "path")
      if (mode === "path" || !query) {
        const files = await listProjectFiles(context, context.projectRoot, input.glob, 5000)
        const lowerQuery = query.toLowerCase()
        const matches = (lowerQuery ? files.filter((file) => file.toLowerCase().includes(lowerQuery)) : files).slice(0, maxResults)
        return textResult(matches.join("\n") || "(no matches)", { tool: "search_files", mode: "path", query: query || undefined, glob: input.glob, matches, count: matches.length })
      }
      const rgArgs = ["--line-number", "--no-heading", "--color", "never", query]
      if (input.glob) rgArgs.splice(4, 0, "--glob", input.glob)
      const result = await runProcess("rg", rgArgs, { cwd: context.projectRoot, maxOutputBytes: context.maxOutputBytes, timeoutMs: context.commandTimeoutMs, allowExitCodes: [0, 1] })
      if (!result.spawned) {
        const matches = await fallbackContentSearch(context, query, input.glob, maxResults)
        return textResult(matches.join("\n") || "(no matches)", { tool: "search_files", mode: "content", matches, count: matches.length, fallback: true })
      }
      const lines = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, maxResults)
      if (lines.length === 0) {
        const matches = await fallbackContentSearch(context, query, input.glob, maxResults)
        if (matches.length > 0) return textResult(matches.join("\n"), { tool: "search_files", mode: "content", matches, count: matches.length, fallback: true })
      }
      return textResult(lines.join("\n") || "(no matches)", { tool: "search_files", mode: "content", matches: lines, count: lines.length, exitCode: result.exitCode })
    },
  }
}

function createEditFileTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    path: Type.String(),
    content: Type.Optional(Type.String()),
    oldString: Type.Optional(Type.String()),
    newString: Type.Optional(Type.String()),
    replaceAll: Type.Optional(Type.Boolean()),
  })
  return {
    name: "edit_file",
    label: "Edit File",
    description: "Modify a project file by replacing text or writing complete UTF-8 content.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      return {
        path: pickRequiredString(record, ["path", "file", "filePath"]),
        content: pickString(record, ["content", "text"]),
        oldString: pickString(record, ["oldString", "old_string", "old"]),
        newString: pickString(record, ["newString", "new_string", "new"]),
        replaceAll: pickBoolean(record, ["replaceAll", "replace_all"]),
      }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { path: string; content?: string; oldString?: string; newString?: string; replaceAll?: boolean }
      const target = await resolveProjectPath(context.projectRoot, input.path, { allowMissing: true })
      let nextContent: string
      let operation: "write" | "replace"
      let replacements = 0
      if (input.oldString !== undefined) {
        const current = await readCompleteTextFile(target.absolutePath, context.maxReadBytes)
        const newString = input.newString ?? ""
        if (!current.includes(input.oldString)) throw new Error(`oldString was not found in ${target.relativePath}`)
        operation = "replace"
        if (input.replaceAll) {
          replacements = current.split(input.oldString).length - 1
          nextContent = current.split(input.oldString).join(newString)
        } else {
          replacements = 1
          nextContent = current.replace(input.oldString, newString)
        }
      } else if (input.content !== undefined) {
        operation = "write"
        nextContent = input.content
      } else {
        throw new Error("edit_file requires either content or oldString/newString")
      }
      await mkdir(dirname(target.absolutePath), { recursive: true })
      await writeFile(target.absolutePath, nextContent, "utf8")
      return textResult(`${operation} ${target.relativePath} (${nextContent.length} chars)`, {
        tool: "edit_file",
        path: target.relativePath,
        operation,
        replacements,
        chars: nextContent.length,
      })
    },
    executionMode: "sequential",
  }
}

function createApplyPatchTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    patch: Type.String(),
  })
  return {
    name: "apply_patch",
    label: "Apply Patch",
    description: "Apply a unified diff to files inside the current project workspace using git apply.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      return { patch: pickRequiredString(record, ["patch", "diff"]) }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { patch: string }
      validatePatchPaths(input.patch)
      const result = await runProcess("git", ["apply", "--whitespace=nowarn", "-"], {
        cwd: context.projectRoot,
        input: input.patch,
        maxOutputBytes: context.maxOutputBytes,
        timeoutMs: context.commandTimeoutMs,
      })
      if (result.exitCode !== 0) throw new Error(`git apply failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`)
      return textResult("Patch applied.", { tool: "apply_patch", exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr })
    },
    executionMode: "sequential",
  }
}

function createExecCommandTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    cmd: Type.String(),
    workdir: Type.Optional(Type.String()),
    shell: Type.Optional(Type.String()),
    yieldTimeMs: Type.Optional(Type.Number()),
    yield_time_ms: Type.Optional(Type.Number()),
    timeoutMs: Type.Optional(Type.Number()),
    timeout_ms: Type.Optional(Type.Number()),
    maxOutputBytes: Type.Optional(Type.Number()),
    max_output_tokens: Type.Optional(Type.Number()),
  })
  return {
    name: "exec_command",
    label: "Exec Command",
    description: "Run a shell command in the current project workspace. Returns a session id when the command is still running.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      const maxOutputTokens = pickNumber(record, ["max_output_tokens", "maxOutputTokens"])
      return {
        cmd: pickRequiredString(record, ["cmd", "command"]),
        workdir: pickString(record, ["workdir", "cwd"]),
        shell: pickString(record, ["shell"]),
        yieldTimeMs: pickNumber(record, ["yieldTimeMs", "yield_time_ms"]),
        timeoutMs: pickNumber(record, ["timeoutMs", "timeout_ms", "timeout"]),
        maxOutputBytes: pickNumber(record, ["maxOutputBytes", "max_output_bytes"]) ?? (maxOutputTokens === undefined ? undefined : maxOutputTokens * 4),
      }
    },
    execute: async (_toolCallId, params, signal) => {
      const input = params as { cmd: string; workdir?: string; shell?: string; yieldTimeMs?: number; timeoutMs?: number; maxOutputBytes?: number }
      const cwd = await resolveCommandCwd(context.projectRoot, input.workdir)
      const result = await context.execSessions.exec({
        command: input.cmd,
        cwd,
        shell: input.shell,
        signal,
        yieldTimeMs: clampInteger(input.yieldTimeMs, 0, 30_000, 1_000),
        timeoutMs: clampInteger(input.timeoutMs, 1_000, 900_000, context.commandTimeoutMs),
        maxOutputBytes: clampInteger(input.maxOutputBytes, 1_000, 512_000, context.maxOutputBytes),
      })
      return textResult(formatExecSessionResult(result), { tool: "exec_command", ...result })
    },
    executionMode: "sequential",
  }
}

function createWriteStdinTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    sessionId: Type.Optional(Type.Number()),
    session_id: Type.Optional(Type.Number()),
    chars: Type.Optional(Type.String()),
    yieldTimeMs: Type.Optional(Type.Number()),
    yield_time_ms: Type.Optional(Type.Number()),
    maxOutputBytes: Type.Optional(Type.Number()),
    max_output_tokens: Type.Optional(Type.Number()),
  })
  return {
    name: "write_stdin",
    label: "Write Stdin",
    description: "Write characters to an existing exec_command session, or poll it with empty chars.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      const maxOutputTokens = pickNumber(record, ["max_output_tokens", "maxOutputTokens"])
      return {
        sessionId: pickNumber(record, ["sessionId", "session_id"]),
        chars: pickString(record, ["chars", "input"]) ?? "",
        yieldTimeMs: pickNumber(record, ["yieldTimeMs", "yield_time_ms"]),
        maxOutputBytes: pickNumber(record, ["maxOutputBytes", "max_output_bytes"]) ?? (maxOutputTokens === undefined ? undefined : maxOutputTokens * 4),
      }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { sessionId?: number; chars?: string; yieldTimeMs?: number; maxOutputBytes?: number }
      const sessionId = input.sessionId
      if (typeof sessionId !== "number" || !Number.isInteger(sessionId)) throw new Error("write_stdin requires a numeric sessionId")
      const result = await context.execSessions.writeStdin({
        sessionId,
        chars: input.chars ?? "",
        yieldTimeMs: clampInteger(input.yieldTimeMs, 0, 30_000, 1_000),
        maxOutputBytes: clampInteger(input.maxOutputBytes, 1_000, 512_000, context.maxOutputBytes),
      })
      return textResult(formatExecSessionResult(result), { tool: "write_stdin", ...result })
    },
    executionMode: "sequential",
  }
}

function createShellTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    command: Type.String(),
    timeoutMs: Type.Optional(Type.Number()),
  })
  return {
    name: "shell",
    label: "Shell",
    description: "Run a shell command in the current project workspace.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      return {
        command: pickRequiredString(record, ["command", "cmd"]),
        timeoutMs: pickNumber(record, ["timeoutMs", "timeout"]),
      }
    },
    execute: async (_toolCallId, params, signal) => {
      const input = params as { command: string; timeoutMs?: number }
      const result = await runProcess(input.command, [], {
        cwd: context.projectRoot,
        shell: true,
        signal,
        maxOutputBytes: context.maxOutputBytes,
        timeoutMs: clampInteger(input.timeoutMs, 1000, 600_000, context.commandTimeoutMs),
        allowExitCodes: ALL_EXIT_CODES,
      })
      return textResult(formatProcessResult(result), { tool: "shell", ...result })
    },
    executionMode: "sequential",
  }
}

function createGitDiffTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    path: Type.Optional(Type.String()),
    staged: Type.Optional(Type.Boolean()),
    stat: Type.Optional(Type.Boolean()),
  })
  return {
    name: "git_diff",
    label: "Git Diff",
    description: "Return the current git diff, optionally scoped to one project path or rendered as stats.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      return {
        path: pickString(record, ["path", "file", "filePath"]),
        staged: pickBoolean(record, ["staged", "cached"]),
        stat: pickBoolean(record, ["stat", "summary"]),
      }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { path?: string; staged?: boolean; stat?: boolean }
      const gitArgs = ["diff"]
      if (input.staged) gitArgs.push("--cached")
      if (input.stat) gitArgs.push("--stat")
      let scopedPath: string | undefined
      if (input.path) {
        const target = await resolveProjectPath(context.projectRoot, input.path, { allowMissing: true })
        scopedPath = target.relativePath
        gitArgs.push("--", target.relativePath)
      }
      const result = await runProcess("git", gitArgs, {
        cwd: context.projectRoot,
        maxOutputBytes: context.maxOutputBytes,
        timeoutMs: context.commandTimeoutMs,
        allowExitCodes: [0, 1],
      })
      return textResult(result.stdout || "(no diff)", { tool: "git_diff", path: scopedPath, staged: !!input.staged, stat: !!input.stat, exitCode: result.exitCode })
    },
  }
}

function createChangedFilesTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({})
  return {
    name: "get_changed_files",
    label: "Changed Files",
    description: "Return changed files from git status --short for the current project workspace.",
    parameters,
    prepareArguments: () => ({}),
    execute: async () => {
      const result = await runProcess("git", ["status", "--short"], {
        cwd: context.projectRoot,
        maxOutputBytes: context.maxOutputBytes,
        timeoutMs: context.commandTimeoutMs,
        allowExitCodes: [0],
      })
      const files = parseGitStatusShort(result.stdout)
      return textResult(files.length > 0 ? JSON.stringify(files, null, 2) : "[]", { tool: "get_changed_files", files })
    },
  }
}

function createRunScriptTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    script: Type.String(),
    args: Type.Optional(Type.Array(Type.String())),
    timeoutMs: Type.Optional(Type.Number()),
  })
  return {
    name: "run_script",
    label: "Run Script",
    description: "Run a package script with the detected package manager from the current project workspace.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      const scriptArgs = record.args
      return {
        script: pickRequiredString(record, ["script", "name"]),
        args: Array.isArray(scriptArgs) ? scriptArgs.filter((value): value is string => typeof value === "string") : [],
        timeoutMs: pickNumber(record, ["timeoutMs", "timeout"]),
      }
    },
    execute: async (_toolCallId, params, signal) => {
      const input = params as { script: string; args?: string[]; timeoutMs?: number }
      const packageManager = await detectPackageManager(context.projectRoot)
      const scriptArgs = input.args ?? []
      const result = await runProcess(packageManager.command, packageManager.runArgs(input.script, scriptArgs), {
        cwd: context.projectRoot,
        signal,
        maxOutputBytes: context.maxOutputBytes,
        timeoutMs: clampInteger(input.timeoutMs, 1000, 600_000, context.commandTimeoutMs),
        allowExitCodes: ALL_EXIT_CODES,
      })
      return textResult(formatProcessResult(result), { ...result, tool: "run_script", packageManager: packageManager.name, script: input.script, scriptArgs })
    },
    executionMode: "sequential",
  }
}

async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  if (await fileExists(resolve(projectRoot, "bun.lockb")) || await fileExists(resolve(projectRoot, "bun.lock"))) {
    return {
      name: "bun",
      command: "bun",
      runArgs: (script, args) => ["run", script, ...args],
    }
  }
  if (await fileExists(resolve(projectRoot, "pnpm-lock.yaml"))) {
    return {
      name: "pnpm",
      command: "pnpm",
      runArgs: (script, args) => ["run", script, ...(args.length > 0 ? ["--", ...args] : [])],
    }
  }
  if (await fileExists(resolve(projectRoot, "yarn.lock"))) {
    return {
      name: "yarn",
      command: "yarn",
      runArgs: (script, args) => ["run", script, ...(args.length > 0 ? ["--", ...args] : [])],
    }
  }
  if (await fileExists(resolve(projectRoot, "package-lock.json"))) {
    return {
      name: "npm",
      command: "npm",
      runArgs: (script, args) => ["run", script, ...(args.length > 0 ? ["--", ...args] : [])],
    }
  }
  return {
    name: "bun",
    command: "bun",
    runArgs: (script, args) => ["run", script, ...args],
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveCommandCwd(projectRoot: string, workdir: string | undefined): Promise<string> {
  const target = workdir ? await resolveProjectPath(projectRoot, workdir) : await resolveProjectPath(projectRoot, ".")
  const info = await stat(target.absolutePath)
  if (!info.isDirectory()) throw new Error(`Command workdir is not a directory: ${target.relativePath}`)
  return target.absolutePath
}

async function resolveProjectPath(projectRoot: string, inputPath: string, options: { allowMissing?: boolean } = {}) {
  if (!inputPath || inputPath.includes("\0")) throw new Error("Invalid project path")
  const rootReal = await realpath(projectRoot)
  const candidate = isAbsolute(inputPath) ? resolve(inputPath) : resolve(rootReal, inputPath)
  const absolutePath = await resolveRealOrProspectivePath(candidate, options.allowMissing === true)
  ensureInsideProject(rootReal, absolutePath)
  return {
    absolutePath,
    relativePath: normalizePath(relative(rootReal, absolutePath) || "."),
  }
}

async function resolveRealOrProspectivePath(candidate: string, allowMissing: boolean): Promise<string> {
  try {
    return await realpath(candidate)
  } catch (error) {
    if (!allowMissing) throw error
    const parent = await nearestExistingParent(dirname(candidate))
    const parentReal = await realpath(parent)
    return resolve(parentReal, relative(parent, candidate))
  }
}

async function nearestExistingParent(start: string): Promise<string> {
  let current = resolve(start)
  while (true) {
    try {
      await access(current)
      return current
    } catch {
      const next = dirname(current)
      if (next === current) throw new Error(`No existing parent directory for ${start}`)
      current = next
    }
  }
}

function ensureInsideProject(projectRoot: string, absolutePath: string) {
  const rel = relative(projectRoot, absolutePath)
  if (rel === "") return
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Path escapes project root: ${normalizePath(rel)}`)
}

async function readTextFile(path: string, maxBytes: number): Promise<string> {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`Not a file: ${path}`)
  const slice = await readFileBytes(path, 0, Math.min(info.size, maxBytes))
  if (slice.includes(0)) throw new Error(`File appears to be binary: ${path}`)
  return slice.toString("utf8")
}

async function readUtf8TextWindow(
  path: string,
  inputOffset: number | undefined,
  inputLimit: number | undefined,
  maxReadBytes: number,
): Promise<{
  content: string
  offset: number
  end: number
  total: number
  limit: number
  requestedLimit: number
  expanded: boolean
}> {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`Not a file: ${path}`)
  const total = info.size
  const offset = clampInteger(inputOffset, 0, total, 0)
  const { limit, requestedLimit, expanded } = readFileWindowLimit(inputLimit, total, maxReadBytes)
  const end = Math.min(total, offset + limit)
  const [probe, bytes] = await Promise.all([
    offset === 0 ? Promise.resolve(Buffer.alloc(0)) : readFileBytes(path, 0, Math.min(total, BINARY_FILE_PROBE_BYTES)),
    readFileBytes(path, offset, end - offset),
  ])
  if (probe.includes(0) || bytes.includes(0)) throw new Error(`File appears to be binary: ${path}`)
  return {
    content: bytes.toString("utf8"),
    offset,
    end,
    total,
    limit,
    requestedLimit,
    expanded,
  }
}

async function readFileBytes(path: string, offset: number, length: number): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0)
  const file = await open(path, "r")
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await file.read(buffer, 0, length, offset)
    return bytesRead === buffer.byteLength ? buffer : buffer.subarray(0, bytesRead)
  } finally {
    await file.close()
  }
}

async function readCompleteTextFile(path: string, maxBytes: number): Promise<string> {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`Not a file: ${path}`)
  if (info.size > maxBytes) {
    throw new Error(`File is too large for edit_file replace (${info.size} bytes > ${maxBytes} bytes); use apply_patch or write complete content`)
  }
  const bytes = await readFile(path)
  if (bytes.includes(0)) throw new Error(`File appears to be binary: ${path}`)
  return bytes.toString("utf8")
}

function readFileWindowLimit(inputLimit: number | undefined, totalChars: number, maxReadBytes: number): { limit: number; requestedLimit: number; expanded: boolean } {
  const requestedLimit = clampInteger(inputLimit, 1, maxReadBytes, maxReadBytes)
  const minimumLargeFileLimit = Math.min(maxReadBytes, MIN_LARGE_FILE_READ_CHARS)
  if (
    inputLimit !== undefined &&
    totalChars >= LARGE_FILE_READ_THRESHOLD_CHARS &&
    requestedLimit < minimumLargeFileLimit
  ) {
    return { limit: minimumLargeFileLimit, requestedLimit, expanded: minimumLargeFileLimit > requestedLimit }
  }
  return { limit: requestedLimit, requestedLimit, expanded: false }
}

function formatReadFileWindowHeader(input: {
  offset: number
  end: number
  total: number
  requestedLimit: number
  limit: number
  expanded: boolean
  truncated: boolean
}): string {
  const parts: string[] = []
  if (input.offset > 0 || input.end < input.total) {
    parts.push(`chars ${input.offset}-${input.end}/${input.total}`)
  }
  if (input.truncated) {
    parts.push(`truncated at ${input.end}/${input.total} chars`)
    parts.push(`next offset ${input.end}`)
  }
  if (input.expanded) {
    parts.push(`requested limit ${input.requestedLimit} expanded to ${input.limit}`)
  }
  return parts.length > 0 ? ` (${parts.join("; ")})` : ""
}

async function listProjectFiles(context: LocalToolContext, directory: string, glob: string | undefined, maxFiles: number): Promise<string[]> {
  const rgArgs = ["--files"]
  if (glob) rgArgs.push("--glob", glob)
  const result = await runProcess("rg", rgArgs, {
    cwd: directory,
    maxOutputBytes: context.maxOutputBytes,
    timeoutMs: context.commandTimeoutMs,
    allowExitCodes: [0, 1],
  })
  if (result.spawned) {
    return result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, maxFiles)
      .map((file) => normalizePath(relative(context.projectRoot, resolve(directory, file))))
  }
  const files = await fallbackListFiles(context.projectRoot, directory, maxFiles)
  return glob ? files.filter((file) => simpleGlobMatch(file, glob)).slice(0, maxFiles) : files.slice(0, maxFiles)
}

async function fallbackListFiles(projectRoot: string, directory: string, maxFiles: number): Promise<string[]> {
  const output: string[] = []
  const visit = async (dir: string) => {
    if (output.length >= maxFiles) return
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (output.length >= maxFiles) return
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") continue
      const absolutePath = resolve(dir, entry.name)
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile()) output.push(normalizePath(relative(projectRoot, absolutePath)))
    }
  }
  await visit(directory)
  return output
}

async function fallbackContentSearch(context: LocalToolContext, query: string, glob: string | undefined, maxResults: number): Promise<string[]> {
  const files = await listProjectFiles(context, context.projectRoot, glob, 5000)
  const matches: string[] = []
  for (const file of files) {
    if (matches.length >= maxResults) break
    try {
      const target = await resolveProjectPath(context.projectRoot, file)
      const content = await readTextFile(target.absolutePath, context.maxReadBytes)
      const lines = content.split(/\r?\n/)
      for (let index = 0; index < lines.length && matches.length < maxResults; index++) {
        if (lines[index]?.includes(query)) matches.push(`${file}:${index + 1}:${lines[index]}`)
      }
    } catch {
      // skip unreadable/binary files
    }
  }
  return matches
}

type ProcessResult = {
  spawned: boolean
  command: string
  args: string[]
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
}

type ExecCommandRequest = {
  command: string
  cwd: string
  shell?: string
  signal?: AbortSignal
  yieldTimeMs: number
  timeoutMs: number
  maxOutputBytes: number
}

type WriteStdinRequest = {
  sessionId: number
  chars: string
  yieldTimeMs: number
  maxOutputBytes: number
}

type ExecSessionResult = {
  sessionId: number | null
  running: boolean
  command: string
  cwd: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  elapsedMs: number
  output: string
  truncated: boolean
}

type ExecSession = {
  id: number
  child: ChildProcessWithoutNullStreams
  command: string
  cwd: string
  startedAt: number
  lastActivityAt: number
  maxOutputBytes: number
  outputTail: Buffer
  pendingOutput: Buffer
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  closed: boolean
  timeout: ReturnType<typeof setTimeout>
}

const MAX_EXEC_SESSIONS = 16
const EXEC_SESSION_TTL_MS = 5 * 60_000

class ExecSessionManager {
  private nextId = 1
  private sessions = new Map<number, ExecSession>()

  async exec(request: ExecCommandRequest): Promise<ExecSessionResult> {
    this.cleanup()
    if (this.runningSessionCount() >= MAX_EXEC_SESSIONS) {
      throw new Error(`Too many running exec_command sessions (${MAX_EXEC_SESSIONS}); poll or finish an existing session before starting another`)
    }

    const id = this.nextId++
    const child = spawn(request.command, [], {
      cwd: request.cwd,
      env: process.env,
      shell: request.shell ?? true,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })
    const session: ExecSession = {
      id,
      child,
      command: request.command,
      cwd: request.cwd,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      maxOutputBytes: request.maxOutputBytes,
      outputTail: Buffer.alloc(0),
      pendingOutput: Buffer.alloc(0),
      exitCode: null,
      signal: null,
      timedOut: false,
      closed: false,
      timeout: setTimeout(() => {
        session.timedOut = true
        this.terminate(session)
      }, request.timeoutMs),
    }
    this.sessions.set(id, session)

    child.stdout.on("data", (chunk: Buffer) => this.appendOutput(session, chunk))
    child.stderr.on("data", (chunk: Buffer) => this.appendOutput(session, Buffer.concat([Buffer.from("[stderr] "), chunk])))
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(session.timeout)
      this.appendOutput(session, Buffer.from(`[error] ${error.message}\n`))
      session.closed = true
      session.lastActivityAt = Date.now()
    })
    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(session.timeout)
      session.exitCode = exitCode
      session.signal = signal
      session.closed = true
      session.lastActivityAt = Date.now()
    })

    const abort = () => {
      session.timedOut = true
      this.terminate(session)
    }
    request.signal?.addEventListener("abort", abort, { once: true })
    await this.waitForSession(session, request.yieldTimeMs)
    request.signal?.removeEventListener("abort", abort)

    const result = this.snapshot(session, request.maxOutputBytes)
    if (session.closed) this.sessions.delete(session.id)
    return result
  }

  async writeStdin(request: WriteStdinRequest): Promise<ExecSessionResult> {
    this.cleanup()
    const session = this.sessions.get(request.sessionId)
    if (!session) throw new Error(`Unknown exec_command session: ${request.sessionId}`)
    session.lastActivityAt = Date.now()

    if (request.chars.length > 0) {
      if (session.closed || session.child.stdin.destroyed || !session.child.stdin.writable) {
        throw new Error(`exec_command session ${request.sessionId} is not writable`)
      }
      await new Promise<void>((resolvePromise, reject) => {
        session.child.stdin.write(request.chars, (error) => {
          if (error) reject(error)
          else resolvePromise()
        })
      })
    }

    await this.waitForSession(session, request.yieldTimeMs)
    const result = this.snapshot(session, request.maxOutputBytes)
    if (session.closed) this.sessions.delete(session.id)
    return result
  }

  private runningSessionCount(): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (!session.closed) count++
    }
    return count
  }

  private cleanup() {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (session.closed && now - session.lastActivityAt > EXEC_SESSION_TTL_MS) {
        this.sessions.delete(id)
      }
    }
  }

  private appendOutput(session: ExecSession, chunk: Buffer) {
    session.outputTail = appendBoundedBuffer(session.outputTail, chunk, session.maxOutputBytes)
    session.pendingOutput = appendBoundedBuffer(session.pendingOutput, chunk, session.maxOutputBytes)
    session.lastActivityAt = Date.now()
  }

  private async waitForSession(session: ExecSession, yieldTimeMs: number): Promise<void> {
    if (session.closed) return
    await new Promise<void>((resolvePromise) => {
      const onDone = () => {
        clearTimeout(timer)
        session.child.off("close", onDone)
        session.child.off("error", onDone)
        resolvePromise()
      }
      const timer = setTimeout(onDone, yieldTimeMs)
      session.child.once("close", onDone)
      session.child.once("error", onDone)
    })
  }

  private snapshot(session: ExecSession, maxOutputBytes: number): ExecSessionResult {
    const output = tailBuffer(session.pendingOutput, maxOutputBytes)
    const truncated = session.pendingOutput.byteLength > output.byteLength
    session.pendingOutput = Buffer.alloc(0)
    return {
      sessionId: session.closed ? null : session.id,
      running: !session.closed,
      command: session.command,
      cwd: session.cwd,
      exitCode: session.exitCode,
      signal: session.signal,
      timedOut: session.timedOut,
      elapsedMs: Date.now() - session.startedAt,
      output: output.toString("utf8"),
      truncated,
    }
  }

  private terminate(session: ExecSession) {
    terminateProcessTree(session.child, "SIGTERM")
    setTimeout(() => {
      if (!session.closed) {
        terminateProcessTree(session.child, "SIGKILL")
      }
    }, 1_000)
  }
}

async function runProcess(
  command: string,
  args: string[],
  options: {
    cwd: string
    input?: string
    shell?: boolean
    signal?: AbortSignal
    maxOutputBytes: number
    timeoutMs: number
    allowExitCodes?: number[]
  },
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolvePromise, reject) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: process.env,
        shell: options.shell ?? false,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      })
    } catch {
      resolvePromise({ spawned: false, command, args, exitCode: null, signal: null, stdout: "", stderr: "", timedOut: false })
      return
    }

    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    const append = (current: Buffer, chunk: Buffer) => {
      const next = Buffer.concat([current, chunk])
      return next.byteLength > options.maxOutputBytes ? next.subarray(next.byteLength - options.maxOutputBytes) : next
    }
    const abort = () => {
      terminateProcessTree(child, "SIGTERM")
    }
    const timer = setTimeout(() => {
      timedOut = true
      abort()
    }, options.timeoutMs)
    options.signal?.addEventListener("abort", abort, { once: true })
    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk) })
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk) })
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", abort)
      if (error.code === "ENOENT") {
        resolvePromise({ spawned: false, command, args, exitCode: null, signal: null, stdout: "", stderr: error.message, timedOut })
      } else {
        reject(error)
      }
    })
    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", abort)
      const result = {
        spawned: true,
        command,
        args,
        exitCode,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
      }
      const allowed = options.allowExitCodes ?? [0]
      if (exitCode !== null && !allowed.includes(exitCode)) {
        reject(new Error(formatProcessResult(result)))
      } else {
        resolvePromise(result)
      }
    })
    if (options.input !== undefined) child.stdin?.end(options.input)
    else child.stdin?.end()
  })
}

function terminateProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  const pid = child.pid
  if (pid && process.platform !== "win32") {
    try {
      process.kill(-pid, signal)
      return
    } catch {
      // Fall through to direct child termination.
    }
  }
  if (pid && process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" }).on("error", () => {})
      return
    } catch {
      // Fall through to direct child termination.
    }
  }
  try { child.kill(signal) } catch { /* ignore */ }
}

function appendBoundedBuffer(current: Buffer, chunk: Buffer, maxBytes: number): Buffer {
  const next = Buffer.concat([current, chunk])
  return tailBuffer(next, maxBytes)
}

function tailBuffer(buffer: Buffer, maxBytes: number): Buffer {
  return buffer.byteLength > maxBytes ? buffer.subarray(buffer.byteLength - maxBytes) : buffer
}

function formatProcessResult(result: ProcessResult): string {
  const commandLine = result.args.length > 0 ? `${result.command} ${result.args.join(" ")}` : result.command
  const parts = [`$ ${commandLine}`, `exit: ${result.exitCode}${result.signal ? ` signal=${result.signal}` : ""}${result.timedOut ? " timed out" : ""}`]
  if (result.stdout.trim()) parts.push(`stdout:\n${result.stdout.trimEnd()}`)
  if (result.stderr.trim()) parts.push(`stderr:\n${result.stderr.trimEnd()}`)
  return parts.join("\n")
}

function formatExecSessionResult(result: ExecSessionResult): string {
  const status = result.running
    ? `running session=${result.sessionId}`
    : `completed exit=${result.exitCode}${result.signal ? ` signal=${result.signal}` : ""}`
  const parts = [
    `$ ${result.command}`,
    `status: ${status}${result.timedOut ? " timed out" : ""}`,
    `elapsed: ${result.elapsedMs}ms`,
  ]
  if (result.output.trim()) {
    parts.push(`${result.truncated ? "output (truncated):" : "output:"}\n${result.output.trimEnd()}`)
  } else {
    parts.push("(no new output)")
  }
  return parts.join("\n")
}

function validatePatchPaths(patch: string) {
  const paths = new Set<string>()
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      const path = line.slice(4).trim()
      if (path !== "/dev/null") paths.add(stripDiffPrefix(path))
    } else if (line.startsWith("diff --git ")) {
      const parts = line.split(/\s+/)
      if (parts[2]) paths.add(stripDiffPrefix(parts[2]))
      if (parts[3]) paths.add(stripDiffPrefix(parts[3]))
    }
  }
  for (const path of paths) {
    if (!path || path === "/dev/null") continue
    if (isAbsolute(path) || path.split(/[\\/]+/).includes("..")) {
      throw new Error(`Patch path escapes project root: ${path}`)
    }
  }
}

function stripDiffPrefix(path: string): string {
  const unquoted = path.replace(/^"|"$/g, "")
  return unquoted.startsWith("a/") || unquoted.startsWith("b/") ? unquoted.slice(2) : unquoted
}

function parseGitStatusShort(stdout: string): Array<{ path: string; status: string }> {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const statusText = line.slice(0, 2).trim() || "?"
      const rawPath = line.slice(3).trim()
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath
      return { path, status: statusText }
    })
}

function textResult<TDetails>(text: string, details: TDetails): AgentToolResult<TDetails> {
  return { content: [{ type: "text", text }], details }
}

function asRecord(args: unknown): JsonRecord {
  return args && typeof args === "object" && !Array.isArray(args) ? args as JsonRecord : {}
}

function pickRequiredString(record: JsonRecord, keys: string[]): string {
  const value = pickString(record, keys)
  if (value === undefined || value.length === 0) throw new Error(`Missing required string argument: ${keys[0]}`)
  return value
}

function pickString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") return value
  }
  return undefined
}

function pickNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function pickBoolean(record: JsonRecord, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "boolean") return value
    if (value === "true") return true
    if (value === "false") return false
  }
  return undefined
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value as number)))
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/")
}

function simpleGlobMatch(path: string, glob: string): boolean {
  if (!glob.includes("*")) return path.includes(glob)
  const pattern = glob
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp(`^${pattern}$`).test(path)
}
