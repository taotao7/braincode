import {
  getBraincodeHome,
  getBraincodePaths,
  getProjectSupportPaths,
  readAuth,
  readAuthStatus,
  readBrains,
  readModels,
  readProjectChecks,
  readProjectSupport,
  readSettings,
  readTools,
  readUserMcpConfig,
  type BraincodeAuth,
  type BraincodeBrains,
  type BraincodeModels,
  type BraincodeSettings,
  type BraincodeTools,
  type ProjectMcpConfig,
} from "@braincode/config"
import { extractMcpServerEntries, type McpServerEntry } from "@braincode/config"
import { normalizePermissionPolicy } from "@braincode/tools"

type DoctorCheckStatus = "ok" | "warning" | "error" | "skipped"

export type DoctorCheck = {
  id: string
  status: DoctorCheckStatus
  message: string
  fix?: string
}

export type DoctorReport = {
  status: "ok" | "warning" | "error"
  config: DoctorCheck[]
  models: DoctorCheck[]
  tools: DoctorCheck[]
  permissions: DoctorCheck[]
  checks: DoctorCheck[]
  mcp: DoctorCheck[]
}

export type DoctorOptions = {
  projectRoot?: string
  home?: string
  json?: boolean
  mcpOnly?: boolean
  checksOnly?: boolean
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const home = options.home ?? getBraincodeHome()
  const projectRoot = options.projectRoot ?? process.cwd()
  const paths = getBraincodePaths(home)

  const configChecks: DoctorCheck[] = []
  const modelChecks: DoctorCheck[] = []
  const toolChecks: DoctorCheck[] = []
  const permissionChecks: DoctorCheck[] = []
  const checkChecks: DoctorCheck[] = []
  const mcpChecks: DoctorCheck[] = []

  // ── Config ──
  const homeExists = await fileExists(paths.home)
  configChecks.push(
    homeExists
      ? ok("home", `home: ${paths.home}`)
      : errorCheck("home", `home directory not found: ${paths.home}`, "Run any braincode command to initialize the home directory."),
  )

  let settings: BraincodeSettings | undefined
  try {
    settings = await readSettings(home)
    configChecks.push(ok("settings", "settings.json"))
  } catch (error) {
    configChecks.push(errorCheck("settings", "settings.json unreadable", String(error)))
  }

  let brains: BraincodeBrains | undefined
  try {
    brains = await readBrains(home)
    configChecks.push(ok("brains", "brains.json"))
  } catch (error) {
    configChecks.push(errorCheck("brains", "brains.json unreadable", String(error)))
  }

  let models: BraincodeModels | undefined
  try {
    models = await readModels(home)
    configChecks.push(ok("models", "models.json"))
  } catch (error) {
    configChecks.push(errorCheck("models", "models.json unreadable", String(error)))
  }

  let toolsConfig: BraincodeTools | undefined
  try {
    toolsConfig = await readTools(home)
    configChecks.push(ok("tools", "tools.json"))
  } catch (error) {
    configChecks.push(errorCheck("tools", "tools.json unreadable", String(error)))
  }

  let auth: BraincodeAuth | undefined
  try {
    auth = await readAuth(home)
    configChecks.push(ok("auth", "auth.json"))
  } catch (error) {
    configChecks.push(errorCheck("auth", "auth.json unreadable", String(error)))
  }

  const defaultBrain = brains?.brains.find((brain) => (brain as Record<string, unknown>)?.id === settings?.defaultBrainId)
  configChecks.push(
    defaultBrain
      ? ok("default-brain", `default brain: ${settings?.defaultBrainId}`)
      : warning("default-brain", `default brain "${settings?.defaultBrainId}" not found in brains.json`),
  )

  // ── Models ──
  if (defaultBrain) {
    const brainRecord = defaultBrain as Record<string, unknown>
    const roles = brainRecord.roles as Record<string, Record<string, unknown>> | undefined
    const planner = brainRecord.planner as Record<string, unknown> | undefined

    const routeBrainModel = planner?.modelId ?? roles?.routeBrain?.modelId
    modelChecks.push(
      routeBrainModel
        ? ok("routeBrain-model", `routeBrain: ${routeBrainModel}`)
        : errorCheck("routeBrain-model", "routeBrain model not configured"),
    )

    const primaryRole = roles?.backend ?? roles?.frontend ?? roles?.rush
    const primaryModel = primaryRole?.modelId
    modelChecks.push(
      primaryModel
        ? ok("primary-model", `primary: ${primaryModel}`)
        : errorCheck("primary-model", "primary role model not configured"),
    )

    const routeBrainProvider = String(routeBrainModel ?? "").split("/")[0]
    const authStatus = auth ? await readAuthStatus(home) : undefined
    const hasRouteBrainKey = authStatus?.providerAuth.some(
      (p) => routeBrainProvider && p.provider === routeBrainProvider && p.kind === "api-key",
    )
    modelChecks.push(
      hasRouteBrainKey
        ? ok("routeBrain-key", `API key for ${routeBrainProvider}`)
        : warning("routeBrain-key", `No API key for ${routeBrainProvider}`, "Run braincode config to add an API key."),
    )

    const fallbackModels = roles?.routeBrain?.fallbackModelIds as string[] | undefined
    modelChecks.push(
      fallbackModels && fallbackModels.length > 0
        ? ok("fallback-models", `fallbacks: ${fallbackModels.join(", ")}`)
        : warning("fallback-models", "No fallback models configured for routeBrain"),
    )

    const imageMaker = roles?.imageMaker?.modelId
    modelChecks.push(
      imageMaker
        ? ok("imageMaker-model", `imageMaker: ${imageMaker}`)
        : warning("imageMaker-model", "imageMaker not configured"),
    )
  } else {
    modelChecks.push(skipped("models", "Skipped because default brain is missing"))
  }

  // ── Tools ──
  const gitOk = await commandExists("git")
  const rgOk = await commandExists("rg")
  const bunOk = await commandExists("bun")
  const npmOk = await commandExists("npm")
  const pnpmOk = await commandExists("pnpm")
  const yarnOk = await commandExists("yarn")

  toolChecks.push(gitOk ? ok("git", "git available") : warning("git", "git not found in PATH"))
  toolChecks.push(rgOk ? ok("rg", "rg (ripgrep) available") : warning("rg", "rg not found in PATH", "Install ripgrep for faster file search."))
  toolChecks.push(bunOk ? ok("bun", "bun available") : errorCheck("bun", "bun not found in PATH", "Braincode requires Bun."))
  toolChecks.push(npmOk ? ok("npm", "npm available") : warning("npm", "npm not found in PATH"))
  toolChecks.push(pnpmOk ? ok("pnpm", "pnpm available") : warning("pnpm", "pnpm not found in PATH"))
  toolChecks.push(yarnOk ? ok("yarn", "yarn available") : warning("yarn", "yarn not found in PATH"))

  const isGitRepo = await directoryExists(`${projectRoot}/.git`)
  toolChecks.push(
    isGitRepo
      ? ok("git-repo", "Project is a git repository")
      : warning("git-repo", "Project is not a git repository", "Braincode works best inside a git repo."),
  )

  const localToolsEnabled = toolsConfig?.tools.some((t) => t.enabled && (t.name === "list_files" || t.name === "read_file"))
  toolChecks.push(
    localToolsEnabled
      ? ok("local-tools", "Local tools enabled")
      : warning("local-tools", "Local read tools are disabled in tools.json"),
  )

  // ── Permissions ──
  const policy = normalizePermissionPolicy(toolsConfig?.permissions)
  permissionChecks.push(
    policy.paths.length > 0
      ? ok("path-rules", `${policy.paths.length} path rule(s)`)
      : warning("path-rules", "No path permission rules configured"),
  )
  permissionChecks.push(
    policy.commands.length > 0
      ? ok("command-rules", `${policy.commands.length} command rule(s)`)
      : warning("command-rules", "No command permission rules configured"),
  )

  const hasDeny = policy.commands.some((r) => r.policy === "deny")
  permissionChecks.push(
    hasDeny
      ? ok("deny-rules", "Deny rules present")
      : warning("deny-rules", "No deny rules in command permissions"),
  )

  const hasSensitiveReview = policy.paths.some((r) => r.review === "required")
  permissionChecks.push(
    hasSensitiveReview
      ? ok("review-paths", "Sensitive paths require review")
      : warning("review-paths", "No paths configured with review required"),
  )

  // ── Checks ──
  const pkgJsonPath = `${projectRoot}/package.json`
  const hasPackageJson = await fileExists(pkgJsonPath)
  checkChecks.push(
    hasPackageJson
      ? ok("package.json", "package.json found")
      : warning("package.json", "No package.json in project root"),
  )

  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(await Bun.file(pkgJsonPath).text()) as Record<string, unknown>
      const scripts = pkg.scripts as Record<string, string> | undefined
      const hasTypecheck = scripts && (scripts["check"] || scripts["typecheck"] || scripts["tsc"])
      const hasTest = scripts && (scripts["test"] || scripts["test:unit"])
      checkChecks.push(hasTypecheck ? ok("typecheck-script", `typecheck script: ${scripts["check"] ?? scripts["typecheck"] ?? scripts["tsc"]}`) : warning("typecheck-script", "No typecheck script in package.json"))
      checkChecks.push(hasTest ? ok("test-script", `test script: ${scripts["test"] ?? scripts["test:unit"]}`) : warning("test-script", "No test script in package.json"))
    } catch {
      checkChecks.push(errorCheck("package.json", "package.json is not valid JSON"))
    }
  }

  const projectChecks = await readProjectChecks(projectRoot)
  checkChecks.push(
    projectChecks
      ? ok("project-checks", `.braincode/checks.json found`)
      : warning("project-checks", "No .braincode/checks.json found"),
  )

  if (toolsConfig?.checks) {
    checkChecks.push(
      toolsConfig.checks.enabled
        ? ok("checks-enabled", "Checks enabled in tools.json")
        : warning("checks-enabled", "Checks disabled in tools.json"),
    )
  }

  // ── MCP ──
  let userMcp: ProjectMcpConfig | undefined
  try {
    userMcp = await readUserMcpConfig(home)
    mcpChecks.push(
      userMcp.serverNames.length > 0
        ? ok("user-mcp", `${userMcp.serverNames.length} user MCP server(s)`)
        : ok("user-mcp", "No user MCP servers configured"),
    )
  } catch (error) {
    mcpChecks.push(errorCheck("user-mcp", `Failed to read user MCP config`, String(error)))
  }

  const projectSupport = await readProjectSupport(projectRoot)
  if (projectSupport.mcp) {
    const projectMcpServers = extractMcpServerEntries(projectSupport.mcp.config)
    mcpChecks.push(
      projectMcpServers.length > 0
        ? ok("project-mcp", `${projectMcpServers.length} project MCP server(s)`)
        : ok("project-mcp", "No project MCP servers configured"),
    )

    for (const { name, entry } of projectMcpServers) {
      if (entry.trusted !== true) {
        mcpChecks.push(
          warning(
            `project-mcp-${name}-trusted`,
            `Project MCP server "${name}" is not trusted`,
            "Mark it trusted in .mcp.json if you intend to use it.",
          ),
        )
      }
    }
  } else {
    mcpChecks.push(ok("project-mcp", "No project .mcp.json found"))
  }

  const overallStatus = computeOverallStatus([...configChecks, ...modelChecks, ...toolChecks, ...permissionChecks, ...checkChecks, ...mcpChecks])

  return {
    status: overallStatus,
    config: configChecks,
    models: modelChecks,
    tools: toolChecks,
    permissions: permissionChecks,
    checks: checkChecks,
    mcp: mcpChecks,
  }
}

function computeOverallStatus(checks: DoctorCheck[]): DoctorReport["status"] {
  if (checks.some((c) => c.status === "error")) return "error"
  if (checks.some((c) => c.status === "warning")) return "warning"
  return "ok"
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = ["Braincode Doctor", ""]

  const sections: Array<{ title: string; checks: DoctorCheck[] }> = [
    { title: "Config", checks: report.config },
    { title: "Models", checks: report.models },
    { title: "Tools", checks: report.tools },
    { title: "Permissions", checks: report.permissions },
    { title: "Checks", checks: report.checks },
    { title: "MCP", checks: report.mcp },
  ]

  for (const section of sections) {
    const active = section.checks.filter((c) => c.status !== "skipped")
    if (active.length === 0) continue
    lines.push(`${section.title}:`)
    for (const check of active) {
      const symbol = check.status === "ok" ? "✓" : check.status === "warning" ? "!" : check.status === "error" ? "✗" : "-"
      lines.push(`  ${symbol} ${check.message}`)
      if (check.fix) {
        lines.push(`    → ${check.fix}`)
      }
    }
    lines.push("")
  }

  const resultText =
    report.status === "ok"
      ? "Ready for read-only and edit runs."
      : report.status === "warning"
        ? "Ready with warnings; review the items above."
        : "Configuration errors found; fix them before running."
  lines.push(`Result: ${resultText}`)

  return lines.join("\n")
}

// ── Helpers ──

function ok(id: string, message: string): DoctorCheck {
  return { id, status: "ok", message }
}

function warning(id: string, message: string, fix?: string): DoctorCheck {
  return { id, status: "warning", message, fix }
}

function errorCheck(id: string, message: string, fix?: string): DoctorCheck {
  return { id, status: "error", message, fix }
}

function skipped(id: string, message: string): DoctorCheck {
  return { id, status: "skipped", message }
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists()
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stat = await Bun.file(path).stat()
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], { stdout: "ignore", stderr: "ignore" })
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}
