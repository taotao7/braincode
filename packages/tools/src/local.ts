import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { access, mkdir, open, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, dirname } from "node:path"
import { Type } from "typebox"
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
import type { ToolConfiguration, ToolPermission } from "./index"
import {
  createDefaultPermissionPolicy,
  evaluateToolPermissionPolicy,
  formatPermissionPolicyDenial,
  summarizePermissionPolicyEvaluation,
  type PermissionPolicyDocument,
  type PermissionPolicyEvaluation,
} from "./permission-policy"

export type LocalToolMode = "all" | "read-only" | "read-write"

export type LocalCodingToolOptions = {
  projectRoot: string
  tools?: ToolConfiguration[]
  mode?: LocalToolMode
  ignoreDisabled?: boolean
  maxReadBytes?: number
  maxOutputBytes?: number
  commandTimeoutMs?: number
  fallbackSearchConcurrency?: number
  maxSearchableFileBytes?: number
  permissionPolicy?: PermissionPolicyDocument
  /** Reuse an existing session manager so background processes survive across prompts and are shared between tool sets. */
  execSessions?: ExecSessionManager
  /** Notified when a background session's process exits. Registered once on the shared manager. */
  onBackgroundExit?: BackgroundExitListener
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
  fallbackSearchConcurrency: number
  maxSearchableFileBytes: number
  permissionPolicy: PermissionPolicyDocument
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
  "list_background",
  "kill_background",
  "shell",
  "git_diff",
  "get_changed_files",
  "run_script",
] as const

export type LocalCodingToolName = (typeof localCodingToolNames)[number]

const DEFAULT_MAX_READ_BYTES = 128_000
const DEFAULT_MAX_OUTPUT_BYTES = 96_000
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000
const DEFAULT_FALLBACK_SEARCH_CONCURRENCY = 16
const DEFAULT_MAX_SEARCHABLE_FILE_BYTES = 512_000
const LARGE_FILE_READ_THRESHOLD_CHARS = 24_000
const MIN_LARGE_FILE_READ_CHARS = 32_000
const BINARY_FILE_PROBE_BYTES = 4096
const UTF8_BOUNDARY_OVERLAP_BYTES = 3
const ALL_EXIT_CODES = Array.from({ length: 256 }, (_, code) => code)
const FALLBACK_IGNORE_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "vendor",
])

export function createLocalCodingTools(options: LocalCodingToolOptions): AgentTool[] {
  const execSessions = options.execSessions ?? new ExecSessionManager()
  if (options.onBackgroundExit) execSessions.setBackgroundExitListener(options.onBackgroundExit)
  const context: LocalToolContext = {
    projectRoot: resolve(options.projectRoot),
    maxReadBytes: options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    commandTimeoutMs: options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    fallbackSearchConcurrency: clampInteger(options.fallbackSearchConcurrency, 1, 64, DEFAULT_FALLBACK_SEARCH_CONCURRENCY),
    maxSearchableFileBytes: clampInteger(options.maxSearchableFileBytes, 1, 50_000_000, DEFAULT_MAX_SEARCHABLE_FILE_BYTES),
    permissionPolicy: options.permissionPolicy ?? createDefaultPermissionPolicy(),
    execSessions,
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
    name: "list_background",
    label: "List Background",
    description: "List active and recently-exited exec_command sessions, including background processes.",
    permissions: ["execute"],
    create: createListBackgroundTool,
  },
  {
    name: "kill_background",
    label: "Kill Background",
    description: "Terminate an exec_command session (background or foreground) by its session id.",
    permissions: ["execute"],
    create: createKillBackgroundTool,
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
    description: "List project files under the current workspace. Use a glob to scope results in one call instead of listing directories one by one. This is read-only and safe to run in parallel with other read_file/search_files calls in the same turn.",
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
    encoding: Type.Optional(Type.Literal("utf8")),
  })
  return {
    name: "read_file",
    label: "Read File",
    description: "Read a UTF-8 text file inside the current project workspace. Read the whole file in one call by omitting offset/limit; do not page through a file with many small windowed reads (very small limits are auto-expanded for large files). When you need several files, issue the read_file calls together in one turn so they run in parallel rather than one at a time. Use search_files first to locate symbols in large or unfamiliar files, and do not re-read a file you have already read this run unless it changed.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      return {
        path: pickRequiredString(record, ["path", "file", "filePath"]),
        offset: pickNumber(record, ["offset"]),
        limit: pickNumber(record, ["limit", "maxBytes"]),
        encoding: pickString(record, ["encoding"]),
      }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { path: string; offset?: number; limit?: number; encoding?: string }
      if (input.encoding !== undefined && input.encoding !== "utf8") throw new Error("read_file only supports utf8 encoding")
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
        encoding: "utf8",
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
    description: "Search project files by content, path substring, or glob-only file listing inside the current workspace. Prefer one broad search over many narrow ones, and raise maxResults instead of re-running the same query. This is read-only and can run in parallel with read_file/list_files in the same turn. Use it to locate the right files before reading them.",
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
        const fallback = await fallbackContentSearch(context, query, input.glob, maxResults)
        return textResult(fallback.matches.join("\n") || "(no matches)", {
          tool: "search_files",
          mode: "content",
          matches: fallback.matches,
          count: fallback.matches.length,
          fallback: true,
          fallbackDetails: fallback.details,
        })
      }
      const lines = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, maxResults)
      if (lines.length === 0) {
        const fallback = await fallbackContentSearch(context, query, input.glob, maxResults)
        if (fallback.matches.length > 0) {
          return textResult(fallback.matches.join("\n"), {
            tool: "search_files",
            mode: "content",
            matches: fallback.matches,
            count: fallback.matches.length,
            fallback: true,
            fallbackDetails: fallback.details,
          })
        }
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
      const policy = enforceLocalPermissionPolicy(context, "edit_file", { path: target.relativePath })
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
      return textResult(`${operation} ${target.relativePath} (${nextContent.length} chars)`, withPermissionPolicyDetails({
        tool: "edit_file",
        path: target.relativePath,
        operation,
        replacements,
        chars: nextContent.length,
      }, policy))
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
      const policy = enforceLocalPermissionPolicy(context, "apply_patch", { patch: input.patch })
      const result = await runProcess("git", ["apply", "--whitespace=nowarn", "-"], {
        cwd: context.projectRoot,
        input: input.patch,
        maxOutputBytes: context.maxOutputBytes,
        timeoutMs: context.commandTimeoutMs,
      })
      if (result.exitCode !== 0) throw new Error(`git apply failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`)
      return textResult("Patch applied.", withPermissionPolicyDetails({ tool: "apply_patch", exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }, policy))
    },
    executionMode: "sequential",
  }
}

function createExecCommandTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    cmd: Type.String(),
    workdir: Type.Optional(Type.String()),
    shell: Type.Optional(Type.String()),
    background: Type.Optional(Type.Boolean()),
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
    description:
      "Run a shell command in the current project workspace. Returns a session id when the command is still running.\n" +
      "Set background:true for long-running processes you want to keep working alongside (dev servers, watchers, `npm run dev`, log tails). " +
      "A background command returns a session id immediately and is NOT killed by the timeout, so you can continue with other work across turns. " +
      "Poll its new output with write_stdin (empty chars), inspect all sessions with list_background, and stop it with kill_background. " +
      "When a background process exits, a reminder is delivered automatically. Leave background unset for ordinary commands you want to wait on.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      const maxOutputTokens = pickNumber(record, ["max_output_tokens", "maxOutputTokens"])
      return {
        cmd: pickRequiredString(record, ["cmd", "command"]),
        workdir: pickString(record, ["workdir", "cwd"]),
        shell: pickString(record, ["shell"]),
        background: pickBoolean(record, ["background", "run_in_background", "detach"]),
        yieldTimeMs: pickNumber(record, ["yieldTimeMs", "yield_time_ms"]),
        timeoutMs: pickNumber(record, ["timeoutMs", "timeout_ms", "timeout"]),
        maxOutputBytes: pickNumber(record, ["maxOutputBytes", "max_output_bytes"]) ?? (maxOutputTokens === undefined ? undefined : maxOutputTokens * 4),
      }
    },
    execute: async (_toolCallId, params, signal) => {
      const input = params as { cmd: string; workdir?: string; shell?: string; background?: boolean; yieldTimeMs?: number; timeoutMs?: number; maxOutputBytes?: number }
      const cwd = await resolveCommandCwd(context.projectRoot, input.workdir)
      const policy = enforceLocalPermissionPolicy(context, "exec_command", { cmd: input.cmd })
      const result = await context.execSessions.exec({
        command: input.cmd,
        cwd,
        shell: input.shell,
        signal,
        background: input.background === true,
        explicitTimeout: input.timeoutMs !== undefined,
        yieldTimeMs: clampInteger(input.yieldTimeMs, 0, 30_000, 1_000),
        timeoutMs: clampInteger(input.timeoutMs, 1_000, 900_000, context.commandTimeoutMs),
        maxOutputBytes: clampInteger(input.maxOutputBytes, 1_000, 512_000, context.maxOutputBytes),
      })
      return textResult(formatExecSessionResult(result), withPermissionPolicyDetails({ tool: "exec_command", ...result }, policy))
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

function createListBackgroundTool(context: LocalToolContext): AgentTool {
  return {
    name: "list_background",
    label: "List Background",
    description: "List all active and recently-exited exec_command sessions (background and foreground), with their session id, state, and command.",
    parameters: Type.Object({}),
    prepareArguments: () => ({}),
    execute: async () => {
      const summaries = context.execSessions.listSessions()
      return textResult(formatBackgroundList(summaries), { tool: "list_background", sessions: summaries })
    },
    executionMode: "sequential",
  }
}

function createKillBackgroundTool(context: LocalToolContext): AgentTool {
  const parameters = Type.Object({
    sessionId: Type.Optional(Type.Number()),
    session_id: Type.Optional(Type.Number()),
  })
  return {
    name: "kill_background",
    label: "Kill Background",
    description: "Terminate an exec_command session (background or foreground) by its session id. Kills the whole process tree.",
    parameters,
    prepareArguments: (args) => {
      const record = asRecord(args)
      return { sessionId: pickNumber(record, ["sessionId", "session_id"]) }
    },
    execute: async (_toolCallId, params) => {
      const input = params as { sessionId?: number }
      const sessionId = input.sessionId
      if (typeof sessionId !== "number" || !Number.isInteger(sessionId)) throw new Error("kill_background requires a numeric sessionId")
      const policy = enforceLocalPermissionPolicy(context, "kill_background", { sessionId })
      const result = context.execSessions.kill(sessionId)
      return textResult(formatExecSessionResult(result), withPermissionPolicyDetails({ tool: "kill_background", ...result }, policy))
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
      const policy = enforceLocalPermissionPolicy(context, "shell", { command: input.command })
      const result = await runProcess(input.command, [], {
        cwd: context.projectRoot,
        shell: true,
        signal,
        maxOutputBytes: context.maxOutputBytes,
        timeoutMs: clampInteger(input.timeoutMs, 1000, 600_000, context.commandTimeoutMs),
        allowExitCodes: ALL_EXIT_CODES,
      })
      return textResult(formatProcessResult(result), withPermissionPolicyDetails({ tool: "shell", ...result }, policy))
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
      const args = packageManager.runArgs(input.script, scriptArgs)
      const policy = enforceLocalPermissionPolicy(context, "exec_command", { cmd: `${packageManager.command} ${args.join(" ")}` })
      const result = await runProcess(packageManager.command, args, {
        cwd: context.projectRoot,
        signal,
        maxOutputBytes: context.maxOutputBytes,
        timeoutMs: clampInteger(input.timeoutMs, 1000, 600_000, context.commandTimeoutMs),
        allowExitCodes: ALL_EXIT_CODES,
      })
      return textResult(formatProcessResult(result), withPermissionPolicyDetails({ ...result, tool: "run_script", packageManager: packageManager.name, script: input.script, scriptArgs }, policy))
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
  const requestedOffset = clampInteger(inputOffset, 0, total, 0)
  const { limit, requestedLimit, expanded } = readFileWindowLimit(inputLimit, total, maxReadBytes)
  const requestedEnd = Math.min(total, requestedOffset + limit)
  const readStart = Math.max(0, requestedOffset - UTF8_BOUNDARY_OVERLAP_BYTES)
  const readEnd = Math.min(total, requestedEnd + UTF8_BOUNDARY_OVERLAP_BYTES)
  const [probe, bytes] = await Promise.all([
    requestedOffset === 0 ? Promise.resolve(Buffer.alloc(0)) : readFileBytes(path, 0, Math.min(total, BINARY_FILE_PROBE_BYTES)),
    readStart === 0 && readEnd === total && total <= maxReadBytes
      ? readFile(path)
      : readFileBytes(path, readStart, readEnd - readStart),
  ])
  if (probe.includes(0) || bytes.includes(0)) throw new Error(`File appears to be binary: ${path}`)
  const decoded = decodeUtf8Window(bytes, readStart, requestedOffset, requestedEnd)
  return {
    content: decoded.content,
    offset: decoded.offset,
    end: decoded.end,
    total,
    limit,
    requestedLimit,
    expanded,
  }
}

function decodeUtf8Window(bytes: Buffer, readStart: number, requestedOffset: number, requestedEnd: number): { content: string; offset: number; end: number } {
  let start = Math.max(0, Math.min(bytes.length, requestedOffset - readStart))
  while (start < bytes.length && isUtf8ContinuationByte(bytes[start])) start += 1
  const requestedRelativeEnd = Math.max(start, Math.min(bytes.length, requestedEnd - readStart))
  const end = alignUtf8End(bytes, start, requestedRelativeEnd)
  return {
    content: bytes.subarray(start, end).toString("utf8"),
    offset: readStart + start,
    end: readStart + end,
  }
}

function alignUtf8End(bytes: Buffer, start: number, requestedEnd: number): number {
  let end = Math.max(start, Math.min(bytes.length, requestedEnd))
  if (end <= start) return end
  let sequenceStart = end - 1
  while (sequenceStart >= start && isUtf8ContinuationByte(bytes[sequenceStart])) sequenceStart -= 1
  if (sequenceStart < start) return start
  const sequenceLength = utf8SequenceLength(bytes[sequenceStart])
  if (sequenceLength === 0) return end
  const sequenceEnd = sequenceStart + sequenceLength
  if (sequenceEnd <= end) return end
  return sequenceEnd <= bytes.length ? sequenceEnd : sequenceStart
}

function isUtf8ContinuationByte(byte: number | undefined): boolean {
  return byte !== undefined && (byte & 0b1100_0000) === 0b1000_0000
}

function utf8SequenceLength(byte: number | undefined): number {
  if (byte === undefined) return 0
  if ((byte & 0b1000_0000) === 0) return 1
  if ((byte & 0b1110_0000) === 0b1100_0000) return 2
  if ((byte & 0b1111_0000) === 0b1110_0000) return 3
  if ((byte & 0b1111_1000) === 0b1111_0000) return 4
  return 0
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
    const entries = (await readdir(dir, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (output.length >= maxFiles) return
      if (entry.isDirectory() && FALLBACK_IGNORE_DIRECTORIES.has(entry.name)) continue
      const absolutePath = resolve(dir, entry.name)
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile()) output.push(normalizePath(relative(projectRoot, absolutePath)))
    }
  }
  await visit(directory)
  return output
}

type FallbackSkippedFile = {
  path: string
  reason: "binary" | "too_large" | "unreadable" | "not_file"
  size?: number
  message?: string
}

type FallbackContentSearchResult = {
  matches: string[]
  details: {
    candidateFiles: number
    searchedFiles: number
    skippedFileCount: number
    skippedFiles: FallbackSkippedFile[]
    maxSearchableFileBytes: number
    concurrency: number
    stoppedAfterMaxResults: boolean
  }
}

function enforceLocalPermissionPolicy(context: LocalToolContext, toolName: string, args: unknown): PermissionPolicyEvaluation {
  const evaluation = evaluateToolPermissionPolicy(toolName, args, context.permissionPolicy)
  if (evaluation.action === "deny") throw new Error(formatPermissionPolicyDenial(evaluation))
  return evaluation
}

function withPermissionPolicyDetails<TDetails extends Record<string, unknown>>(details: TDetails, evaluation: PermissionPolicyEvaluation): TDetails & { permissionPolicy?: ReturnType<typeof summarizePermissionPolicyEvaluation> } {
  if (evaluation.matches.length === 0) return details
  return {
    ...details,
    permissionPolicy: summarizePermissionPolicyEvaluation(evaluation),
  }
}

async function fallbackContentSearch(context: LocalToolContext, query: string, glob: string | undefined, maxResults: number): Promise<FallbackContentSearchResult> {
  const files = await listProjectFiles(context, context.projectRoot, glob, 5000)
  const matches: string[] = []
  const skippedFiles: FallbackSkippedFile[] = []
  let skippedFileCount = 0
  let searchedFiles = 0
  let nextIndex = 0
  const concurrency = Math.min(files.length, context.fallbackSearchConcurrency)

  const pushSkippedFile = (skipped: FallbackSkippedFile) => {
    skippedFileCount += 1
    if (skippedFiles.length < 200) skippedFiles.push(skipped)
  }
  const searchWorker = async () => {
    while (matches.length < maxResults) {
      const file = files[nextIndex]
      nextIndex += 1
      if (!file) return
      if (matches.length >= maxResults) return
      try {
        const target = await resolveProjectPath(context.projectRoot, file)
        const info = await stat(target.absolutePath)
        if (!info.isFile()) {
          pushSkippedFile({ path: file, reason: "not_file", size: info.size })
          continue
        }
        if (info.size > context.maxSearchableFileBytes) {
          pushSkippedFile({ path: file, reason: "too_large", size: info.size })
          continue
        }
        const content = await readTextFile(target.absolutePath, context.maxSearchableFileBytes)
        searchedFiles += 1
        const lines = content.split(/\r?\n/)
        for (let index = 0; index < lines.length && matches.length < maxResults; index++) {
          if (lines[index]?.includes(query)) matches.push(`${file}:${index + 1}:${lines[index]}`)
        }
      } catch (error) {
        pushSkippedFile({
          path: file,
          reason: error instanceof Error && /binary/i.test(error.message) ? "binary" : "unreadable",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => searchWorker()))
  return {
    matches: matches.slice(0, maxResults),
    details: {
      candidateFiles: files.length,
      searchedFiles,
      skippedFileCount,
      skippedFiles,
      maxSearchableFileBytes: context.maxSearchableFileBytes,
      concurrency,
      stoppedAfterMaxResults: matches.length >= maxResults && nextIndex < files.length,
    },
  }
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
  background?: boolean
  /** Set when the caller explicitly provided a timeout. Background sessions only arm the hard-kill timer when this is true. */
  explicitTimeout?: boolean
}

export type BackgroundExitInfo = {
  sessionId: number
  command: string
  cwd: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  elapsedMs: number
  output: string
}

export type ExecSessionSummary = {
  sessionId: number
  command: string
  cwd: string
  background: boolean
  running: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
  elapsedMs: number
  idleMs: number
}

export type BackgroundExitListener = (info: BackgroundExitInfo) => void

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
  background: boolean
  exitReported: boolean
  timeout: ReturnType<typeof setTimeout>
}

const MAX_EXEC_SESSIONS = 16
const MAX_BACKGROUND_SESSIONS = 8
const EXEC_SESSION_TTL_MS = 5 * 60_000

export class ExecSessionManager {
  private nextId = 1
  private sessions = new Map<number, ExecSession>()
  private onBackgroundExit?: BackgroundExitListener

  /** Idempotent: a manager fires at most one listener; later calls replace it. */
  setBackgroundExitListener(listener: BackgroundExitListener): void {
    this.onBackgroundExit = listener
  }

  async exec(request: ExecCommandRequest): Promise<ExecSessionResult> {
    this.cleanup()
    const background = request.background === true
    if (background) {
      if (this.backgroundSessionCount() >= MAX_BACKGROUND_SESSIONS) {
        throw new Error(`Too many background sessions (${MAX_BACKGROUND_SESSIONS}); kill one with kill_background before starting another`)
      }
    } else if (this.foregroundSessionCount() >= MAX_EXEC_SESSIONS) {
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
    // Background sessions are not killed on a timer unless the caller asked for
    // one explicitly; the noop keeps the field type without arming a kill.
    const armHardKill = !background || request.explicitTimeout === true
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
      background,
      exitReported: false,
      timeout: armHardKill
        ? setTimeout(() => {
            session.timedOut = true
            this.terminate(session)
          }, request.timeoutMs)
        : setTimeout(() => {}, 0),
    }
    if (!armHardKill) clearTimeout(session.timeout)
    this.sessions.set(id, session)

    child.stdout.on("data", (chunk: Buffer) => this.appendOutput(session, chunk))
    child.stderr.on("data", (chunk: Buffer) => this.appendOutput(session, Buffer.concat([Buffer.from("[stderr] "), chunk])))
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(session.timeout)
      this.appendOutput(session, Buffer.from(`[error] ${error.message}\n`))
      session.closed = true
      session.lastActivityAt = Date.now()
      this.reportBackgroundExit(session)
    })
    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(session.timeout)
      session.exitCode = exitCode
      session.signal = signal
      session.closed = true
      session.lastActivityAt = Date.now()
      this.reportBackgroundExit(session)
    })

    const abort = () => {
      session.timedOut = true
      this.terminate(session)
    }
    request.signal?.addEventListener("abort", abort, { once: true })
    await this.waitForSession(session, request.yieldTimeMs)
    request.signal?.removeEventListener("abort", abort)

    const result = this.snapshot(session, request.maxOutputBytes)
    // Background sessions are kept after close so list_background can surface
    // them and the exit listener/cleanup own their removal.
    if (session.closed && !session.background) this.sessions.delete(session.id)
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
    if (session.closed && !session.background) this.sessions.delete(session.id)
    return result
  }

  private reportBackgroundExit(session: ExecSession) {
    if (!session.background || session.exitReported) return
    session.exitReported = true
    const listener = this.onBackgroundExit
    if (!listener) return
    const output = tailBuffer(session.outputTail, session.maxOutputBytes).toString("utf8")
    listener({
      sessionId: session.id,
      command: session.command,
      cwd: session.cwd,
      exitCode: session.exitCode,
      signal: session.signal,
      timedOut: session.timedOut,
      elapsedMs: Date.now() - session.startedAt,
      output,
    })
  }

  listSessions(): ExecSessionSummary[] {
    this.cleanup()
    const now = Date.now()
    const summaries: ExecSessionSummary[] = []
    for (const session of this.sessions.values()) {
      summaries.push({
        sessionId: session.id,
        command: session.command,
        cwd: session.cwd,
        background: session.background,
        running: !session.closed,
        exitCode: session.exitCode,
        signal: session.signal,
        elapsedMs: now - session.startedAt,
        idleMs: now - session.lastActivityAt,
      })
    }
    return summaries.sort((a, b) => a.sessionId - b.sessionId)
  }

  kill(sessionId: number): ExecSessionResult {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Unknown exec_command session: ${sessionId}`)
    if (!session.closed) this.terminate(session)
    return this.snapshot(session, session.maxOutputBytes)
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      if (!session.closed) this.terminate(session)
    }
  }

  /**
   * Synchronously SIGKILL every running process tree. Use from process signal
   * handlers (SIGTERM/SIGHUP/exit) where the graceful SIGTERM-then-SIGKILL
   * timer in terminate() would never fire before the process dies, which would
   * orphan detached children (e.g. a backgrounded `npm run dev`).
   */
  killAllSync(): void {
    for (const session of this.sessions.values()) {
      if (!session.closed) terminateProcessTree(session.child, "SIGKILL")
    }
  }

  private foregroundSessionCount(): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (!session.closed && !session.background) count++
    }
    return count
  }

  private backgroundSessionCount(): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (!session.closed && session.background) count++
    }
    return count
  }

  private cleanup() {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (!session.closed) continue
      // Background sessions linger after exit (for list_background) until both
      // the exit has been reported and they have been idle past the TTL.
      if (session.background && !session.exitReported) continue
      if (now - session.lastActivityAt > EXEC_SESSION_TTL_MS) {
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

function formatBackgroundList(summaries: ExecSessionSummary[]): string {
  if (summaries.length === 0) return "No background or exec sessions."
  const lines = summaries.map((session) => {
    const kind = session.background ? "background" : "foreground"
    const status = session.running
      ? "running"
      : `exited code=${session.exitCode}${session.signal ? ` signal=${session.signal}` : ""}`
    const elapsed = `${Math.round(session.elapsedMs / 1000)}s`
    return `session=${session.sessionId} [${kind}] ${status} elapsed=${elapsed} $ ${session.command}`
  })
  return lines.join("\n")
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
