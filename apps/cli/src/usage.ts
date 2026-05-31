import { getBraincodeHome, readUsageStats, type TokenUsageSnapshot, type TokenUsageTotals, type UsageStats, type UsageStatsBucket, type UsageStatsDetail } from "@braincode/config"
import { formatCompactTokenCount } from "./tui-format"

export type UsageReportOptions = {
  home?: string
  json?: boolean
  sessionLimit?: number
  detailLimit?: number
  recent?: number
}

export function parseUsageOptions(args: string[]): UsageReportOptions {
  const sessionLimit = readNumberFlag(args, "--sessions")
  const recent = readNumberFlag(args, "--recent")
  return {
    json: args.includes("--json"),
    sessionLimit,
    recent,
  }
}

export async function runUsageCommand(args: string[]): Promise<void> {
  const options = parseUsageOptions(args)
  const home = options.home ?? getBraincodeHome()
  const recent = options.recent ?? 5
  const stats = await readUsageStats(home, {
    sessionLimit: options.sessionLimit,
    detailLimit: Math.max(recent, 20),
  })

  if (options.json) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }

  for (const line of formatUsageReport(stats, { recent })) {
    console.log(line)
  }
}

// The cache-read ratio is the single most useful number for diagnosing token
// spend: it tells you how much of the prompt-side input was served from the
// provider prompt cache instead of being charged at full input rate.
export function cacheReadRatio(tokens: TokenUsageSnapshot): number {
  const cacheable = tokens.input + tokens.cacheRead
  if (cacheable <= 0) return 0
  return tokens.cacheRead / cacheable
}

export function formatUsageReport(stats: UsageStats, options: { recent: number } = { recent: 5 }): string[] {
  const lines: string[] = []
  lines.push("Braincode token usage")
  lines.push(`Sessions with usage: ${stats.sessions}`)
  lines.push("")
  lines.push(`Total: ${formatTotalsLine(stats.totals)}`)
  lines.push(`Cache hit: ${formatRatio(cacheReadRatio(stats.totals))} of cacheable input served from cache`)

  if (stats.byPhase.length > 0) {
    lines.push("")
    lines.push("By phase:")
    for (const bucket of stats.byPhase) {
      lines.push(`  ${formatBucketLine(bucket)}`)
    }
  }

  if (stats.byModel.length > 0) {
    lines.push("")
    lines.push("By model:")
    for (const bucket of stats.byModel) {
      lines.push(`  ${formatBucketLine(bucket)}`)
    }
  }

  if (stats.byRole.length > 0) {
    lines.push("")
    lines.push("By role:")
    for (const bucket of stats.byRole) {
      lines.push(`  ${formatBucketLine(bucket)}`)
    }
  }

  if (options.recent > 0 && stats.recent.length > 0) {
    lines.push("")
    lines.push(`Recent calls (latest ${Math.min(options.recent, stats.recent.length)}):`)
    for (const detail of stats.recent.slice(0, options.recent)) {
      lines.push(`  ${formatRecentLine(detail)}`)
    }
  }

  if (stats.sessions === 0) {
    lines.push("")
    lines.push("No recorded token usage yet. Run a task with `braincode run <prompt>` and try again.")
  }

  return lines
}

function formatTotalsLine(totals: TokenUsageTotals): string {
  return `${formatCompactTokenCount(totals.total)} tokens · ${formatBreakdown(totals)} · ${totals.calls} call${totals.calls === 1 ? "" : "s"}`
}

function formatBucketLine(bucket: UsageStatsBucket): string {
  const label = bucket.label.padEnd(16)
  return `${label} ${formatCompactTokenCount(bucket.total).padStart(7)}  ${formatBreakdown(bucket)}  cache ${formatRatio(cacheReadRatio(bucket))}  (${bucket.calls} call${bucket.calls === 1 ? "" : "s"})`
}

function formatRecentLine(detail: UsageStatsDetail): string {
  const phase = (detail.phase ?? "unknown").padEnd(8)
  const model = (detail.modelId ?? "?").padEnd(22)
  return `${phase} ${model} ${formatBreakdown(detail.usage)}`
}

// Mirrors tui-format's formatTokenBreakdown but always prints input/output so
// the report stays aligned even when one component is zero.
function formatBreakdown(tokens: TokenUsageSnapshot): string {
  const parts = [`in ${formatCompactTokenCount(tokens.input)}`, `out ${formatCompactTokenCount(tokens.output)}`]
  if (tokens.cacheRead > 0) parts.push(`cache read ${formatCompactTokenCount(tokens.cacheRead)}`)
  if (tokens.cacheWrite > 0) parts.push(`cache write ${formatCompactTokenCount(tokens.cacheWrite)}`)
  return parts.join(" · ")
}

function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

function readNumberFlag(args: string[], name: string): number | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = Number(args[index + 1])
  return Number.isFinite(value) && value >= 0 ? value : undefined
}
