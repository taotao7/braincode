import { spawn } from "node:child_process"
import { access, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, dirname } from "node:path"
import { Type } from "typebox"
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
import type { ToolConfiguration, ToolPermission } from "./index"

export type LocalToolMode = "all" | "read-only" | "read-write"

export type LocalCodingToolOptions = {
  projectRoot: string
  tools?: ToolConfiguration[]
  mode?: LocalToolMode
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
  "shell",
  "git_diff",
  "get_changed_files",
  "run_script",
] as const

export type LocalCodingToolName = (typeof localCodingToolNames)[number]

const DEFAULT_MAX_READ_BYTES = 128_000
const DEFAULT_MAX_OUTPUT_BYTES = 96_000
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000
const ALL_EXIT_CODES = Array.from({ length: 256 }, (_, code) => code)

export function createLocalCodingTools(options: LocalCodingToolOptions): AgentTool[] {
  const context: LocalToolContext = {
    projectRoot: resolve(options.projectRoot),
    maxReadBytes: options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    commandTimeoutMs: options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
  }
  const enabled = new Map((options.tools ?? []).map((tool) => [tool.name, tool.enabled]))
  const mode = options.mode ?? "all"

  return localToolSpecs
    .filter((tool) => {
      if (mode === "all") return true
      if (mode === "read-write") return !tool.permissions.includes("execute")
      return !tool.permissions.some((permission) => permission === "write" || permission === "execute")
    })
    .filter((tool) => (options.tools ? enabled.get(tool.name) === true : true))
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
    description: "Read a UTF-8 text file inside the current project workspace.",
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
      const content = await readTextFile(target.absolutePath, context.maxReadBytes)
      const offset = clampInteger(input.offset, 0, content.length, 0)
      const limit = clampInteger(input.limit, 1, context.maxReadBytes, context.maxReadBytes)
      const slice = content.slice(offset, offset + limit)
      const truncated = offset + limit < content.length
      const header = `# ${target.relativePath}${truncated ? ` (truncated at ${offset + limit}/${content.length} chars)` : ""}`
      return textResult(`${header}\n${slice}`, { tool: "read_file", path: target.relativePath, chars: slice.length, truncated })
    },
  }
}

function createSearchFilesTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    query: Type.String(),
    mode: Type.Optional(Type.Union([Type.Literal("content"), Type.Literal("path")])),
    glob: Type.Optional(Type.String()),
    maxResults: Type.Optional(Type.Number()),
  })
  return {
    name: "search_files",
    label: "Search Files",
    description: "Search project files by content or path substring inside the current workspace.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      const mode = pickString(record, ["mode"])
      return {
        query: pickRequiredString(record, ["query", "pattern", "text"]),
        mode: mode === "path" ? "path" : "content",
        glob: pickString(record, ["glob"]),
        maxResults: pickNumber(record, ["maxResults", "limit"]),
      }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { query: string; mode?: "content" | "path"; glob?: string; maxResults?: number }
      const maxResults = clampInteger(input.maxResults, 1, 1000, 100)
      if (input.mode === "path") {
        const files = await listProjectFiles(context, context.projectRoot, input.glob, 5000)
        const matches = files.filter((file) => file.toLowerCase().includes(input.query.toLowerCase())).slice(0, maxResults)
        return textResult(matches.join("\n") || "(no matches)", { tool: "search_files", mode: "path", matches, count: matches.length })
      }
      const rgArgs = ["--line-number", "--no-heading", "--color", "never", input.query]
      if (input.glob) rgArgs.splice(4, 0, "--glob", input.glob)
      const result = await runProcess("rg", rgArgs, { cwd: context.projectRoot, maxOutputBytes: context.maxOutputBytes, timeoutMs: context.commandTimeoutMs, allowExitCodes: [0, 1] })
      if (!result.spawned) {
        const matches = await fallbackContentSearch(context, input.query, input.glob, maxResults)
        return textResult(matches.join("\n") || "(no matches)", { tool: "search_files", mode: "content", matches, count: matches.length, fallback: true })
      }
      const lines = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, maxResults)
      if (lines.length === 0) {
        const matches = await fallbackContentSearch(context, input.query, input.glob, maxResults)
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
  const bytes = await readFile(path)
  const slice = bytes.byteLength > maxBytes ? bytes.subarray(0, maxBytes) : bytes
  if (slice.includes(0)) throw new Error(`File appears to be binary: ${path}`)
  return slice.toString("utf8")
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
    let child
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: process.env,
        shell: options.shell ?? false,
        stdio: ["pipe", "pipe", "pipe"],
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
      try { child.kill("SIGTERM") } catch { /* ignore */ }
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

function formatProcessResult(result: ProcessResult): string {
  const commandLine = result.args.length > 0 ? `${result.command} ${result.args.join(" ")}` : result.command
  const parts = [`$ ${commandLine}`, `exit: ${result.exitCode}${result.signal ? ` signal=${result.signal}` : ""}${result.timedOut ? " timed out" : ""}`]
  if (result.stdout.trim()) parts.push(`stdout:\n${result.stdout.trimEnd()}`)
  if (result.stderr.trim()) parts.push(`stderr:\n${result.stderr.trimEnd()}`)
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
