import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  ".cache",
  ".aider.tags.cache.v4",
  "dist",
  "build",
  "out",
  ".bun",
  ".braincode",
])

const MAX_FILES = 4000
const MAX_DEPTH = 8

export async function listProjectFiles(projectRoot: string): Promise<string[]> {
  const result: string[] = []
  await walk(projectRoot, projectRoot, 0, result)
  return result.sort()
}

async function walk(root: string, current: string, depth: number, into: string[]): Promise<void> {
  if (into.length >= MAX_FILES) return
  if (depth > MAX_DEPTH) return
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (into.length >= MAX_FILES) return
    if (entry.name.startsWith(".") && entry.name !== ".agents" && entry.name !== ".mcp.json") continue
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      await walk(root, join(current, entry.name), depth + 1, into)
      continue
    }
    if (entry.isFile()) {
      into.push(relative(root, join(current, entry.name)))
    }
  }
}

export function fuzzyFilter(items: string[], query: string, limit = 12): string[] {
  if (!query) return items.slice(0, limit)
  const lower = query.toLowerCase()
  const scored: Array<{ item: string; score: number }> = []
  for (const item of items) {
    const lowerItem = item.toLowerCase()
    let score = 0
    if (lowerItem.includes(lower)) {
      score = 100 - Math.min(50, lowerItem.indexOf(lower))
      const baseName = item.split("/").pop()?.toLowerCase() ?? ""
      if (baseName.startsWith(lower)) score += 30
      else if (baseName.includes(lower)) score += 10
    } else {
      // subsequence match
      let cursor = 0
      for (const ch of lowerItem) {
        if (ch === lower[cursor]) cursor++
        if (cursor === lower.length) break
      }
      if (cursor === lower.length) score = 40 - Math.min(35, lowerItem.length - lower.length)
    }
    if (score > 0) scored.push({ item, score })
  }
  scored.sort((a, b) => b.score - a.score || a.item.localeCompare(b.item))
  return scored.slice(0, limit).map(({ item }) => item)
}
