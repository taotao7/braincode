import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import { extname, isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"

const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
])
const IMAGE_EXTENSION_PATTERN =
  "avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp"
const UNQUOTED_IMAGE_PATH_PATTERN =
  "(^|[\\s([{<])((?:file://[^\\s\"'`()\\[\\]{}<>]*?|~/[^\\s\"'`()\\[\\]{}<>]*?|\\.\\.?/[^\\s\"'`()\\[\\]{}<>]*?|/[^\\s\"'`()\\[\\]{}<>]*?|[A-Za-z0-9._-][^\\s\"'`()\\[\\]{}<>]*?)\\.(?:" +
  IMAGE_EXTENSION_PATTERN +
  "))(?=$|[\\s)\\]}>，。！？、：；,.!?])"
const QUOTED_IMAGE_PATH_PATTERN =
  "([\"'`])([^\"'`\\n]+\\.(?:" + IMAGE_EXTENSION_PATTERN + "))\\1"

export function resolveImagePromptPath(
  prompt: string,
  projectRoot: string,
  home: string = homedir(),
): string | null {
  const parsed = parseImagePathPrompt(prompt)
  if (parsed && isPathLikeImageInput(parsed.path, parsed.quoted)) {
    const resolved = resolvePromptPath(parsed.path, projectRoot, home)
    if (resolved && isSupportedImagePath(resolved)) return resolved
  }

  const embedded = parseSimpleImageViewRequest(prompt)
  if (!embedded) return null
  const resolved = resolvePromptPath(embedded.path, projectRoot, home)
  if (!resolved || !isSupportedImagePath(resolved)) return null
  return resolved
}

export async function isExistingImageFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function parseImagePathPrompt(
  prompt: string,
): { path: string; quoted: boolean } | null {
  let path = prompt.trim()
  if (!path || path.includes("\n")) return null

  const first = path[0]
  const last = path[path.length - 1]
  const quoted =
    (first === "\"" && last === "\"") ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`")
  if (quoted) path = path.slice(1, -1).trim()

  return path ? { path, quoted } : null
}

function parseSimpleImageViewRequest(
  prompt: string,
): { path: string } | null {
  const trimmed = prompt.trim()
  if (!trimmed || trimmed.includes("\n")) return null

  const candidates = imagePathCandidates(trimmed)
  if (candidates.length !== 1) return null
  const [candidate] = candidates
  if (!candidate) return null

  const rest = trimmed.replace(candidate.raw, " ")
  if (!isSimpleViewText(rest)) return null
  return { path: candidate.path }
}

function imagePathCandidates(
  prompt: string,
): Array<{ raw: string; path: string }> {
  const candidates: Array<{ raw: string; path: string }> = []

  for (const match of prompt.matchAll(new RegExp(QUOTED_IMAGE_PATH_PATTERN, "gi"))) {
    const raw = match[0]
    const path = match[2]
    if (raw && path && isPathLikeImageInput(path, true)) {
      candidates.push({ raw, path: path.trim() })
    }
  }

  for (const match of prompt.matchAll(new RegExp(UNQUOTED_IMAGE_PATH_PATTERN, "gi"))) {
    const raw = match[2]
    if (raw && isPathLikeImageInput(raw, false)) {
      candidates.push({ raw, path: raw.trim() })
    }
  }

  return candidates
}

function isSimpleViewText(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(
      /(帮我|麻烦|请|可以|能不能|查看一下|查看下|看一下|看下|看看|查看|打开|显示|展示|预览|渲染|呈现|这张|这个|该|本地|一下|下|图片|图像|照片|文件|图)/g,
      " ",
    )
    .replace(/[，。！？、：；,.!?()[\]{}<>:"'`]/g, " ")
    .trim()

  if (!normalized) return true

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((word) =>
      [
        "please",
        "show",
        "display",
        "preview",
        "open",
        "view",
        "render",
        "image",
        "picture",
        "photo",
        "file",
        "local",
        "this",
        "the",
        "a",
        "an",
        "me",
        "can",
        "you",
      ].includes(word),
    )
}

function isPathLikeImageInput(path: string, quoted: boolean): boolean {
  const hasWhitespace = /\s/.test(path)
  const hasPathPrefix =
    path.startsWith("~/") ||
    path.startsWith("./") ||
    path.startsWith("../") ||
    path.startsWith("/") ||
    /^file:\/\//i.test(path)

  if (hasPathPrefix) return true
  if (quoted) return true
  return !hasWhitespace
}

function resolvePromptPath(
  path: string,
  projectRoot: string,
  home: string,
): string | null {
  if (/^file:\/\//i.test(path)) {
    try {
      const url = new URL(path)
      return url.protocol === "file:" ? fileURLToPath(url) : null
    } catch {
      return null
    }
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return null

  if (path.startsWith("~/")) return join(home, path.slice(2))
  if (isAbsolute(path)) return path
  return join(projectRoot, path)
}

function isSupportedImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path).toLowerCase())
}
