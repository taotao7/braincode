import { isAbsolute, relative as relativePath, resolve as resolvePath } from "node:path"
import type { ImageContent } from "@earendil-works/pi-ai"
import { readSessionContext, type SessionContext } from "@braincode/config"
import { debugLog } from "@braincode/shared"

export type PromptReference = {
  token: string
  path: string
  kind: "text" | "image" | "session" | "missing"
  sessionId?: string
  size?: number
  reason?: string
}

export type ExpandedPromptResult = {
  prompt: string
  references: PromptReference[]
  images: ImageContent[]
}

export type PromptReferenceHandoffProvider = (
  sessionId: string,
  home?: string,
) => Promise<{ summary: string }>

export type ExpandPromptReferencesOptions = {
  generateSessionHandoffs?: boolean
  ensureSessionHandoff?: PromptReferenceHandoffProvider
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"])
const SUPPORTED_IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}
const MAX_INLINE_FILE_BYTES = 64 * 1024
const MAX_INLINE_SESSION_CHARS = 24 * 1024
const MAX_SESSION_FIELD_CHARS = 6 * 1024

export async function expandPromptReferences(
  prompt: string,
  projectRoot: string,
  home?: string,
  options: ExpandPromptReferencesOptions = {},
): Promise<ExpandedPromptResult> {
  const references: PromptReference[] = []
  const images: ImageContent[] = []
  const tokens = new Map<string, PromptReference>()
  const sessionContexts = new Map<string, SessionContext>()
  const sessionBriefs = new Map<string, string>()
  const generateSessionHandoffs = options.generateSessionHandoffs ?? true
  const pattern = /(^|\s)(@@?)([^\s@]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(prompt)) !== null) {
    const marker = match[2]
    const rawTarget = match[3]
    if (!marker || !rawTarget) continue
    const token = `${marker}${rawTarget}`
    if (tokens.has(token)) continue
    if (marker === "@@") {
      const context = await readSessionContext(rawTarget, home)
      if (!context) {
        const ref: PromptReference = { token, path: rawTarget, kind: "missing", reason: "session not found" }
        tokens.set(token, ref)
        references.push(ref)
        continue
      }
      const ref: PromptReference = { token, path: context.path, kind: "session", sessionId: context.sessionId }
      tokens.set(token, ref)
      sessionContexts.set(token, context)
      references.push(ref)
      if (generateSessionHandoffs) {
        if (context.latestHandoff?.fresh) {
          sessionBriefs.set(token, context.latestHandoff.summary)
        } else if (options.ensureSessionHandoff) {
          try {
            const handoff = await options.ensureSessionHandoff(context.sessionId, home)
            sessionBriefs.set(token, handoff.summary)
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            debugLog("expandPromptReferences", `handoff for @@${context.sessionId} failed, falling back to mechanical context`, { error: detail })
          }
        }
      }
      continue
    }

    const rawPath = rawTarget
    if (rawPath === "image" || rawPath.startsWith("image:")) continue
    const absolute = isAbsolute(rawPath) ? rawPath : resolvePath(projectRoot, rawPath)
    const file = Bun.file(absolute)
    if (!(await file.exists())) {
      const ref: PromptReference = { token, path: absolute, kind: "missing", reason: "file not found" }
      tokens.set(token, ref)
      references.push(ref)
      continue
    }
    const dot = absolute.lastIndexOf(".")
    const ext = dot === -1 ? "" : absolute.slice(dot).toLowerCase()
    if (IMAGE_EXTENSIONS.has(ext)) {
      const ref: PromptReference = { token, path: absolute, kind: "image" }
      tokens.set(token, ref)
      references.push(ref)
      continue
    }
    const size = file.size
    if (size > MAX_INLINE_FILE_BYTES) {
      const ref: PromptReference = { token, path: absolute, kind: "missing", reason: `file is ${size} bytes (limit ${MAX_INLINE_FILE_BYTES})`, size }
      tokens.set(token, ref)
      references.push(ref)
      continue
    }
    const ref: PromptReference = { token, path: absolute, kind: "text", size }
    tokens.set(token, ref)
    references.push(ref)
  }

  if (references.length === 0) return { prompt, references, images }

  const sections: string[] = []
  for (const ref of references) {
    if (ref.kind === "text") {
      const content = await Bun.file(ref.path).text()
      const rel = relativePath(projectRoot, ref.path) || ref.path
      const fence = inlineCodeFence(ref.path)
      sections.push(`File ${ref.token} (${rel}):\n\`\`\`${fence}\n${content}\n\`\`\``)
    } else if (ref.kind === "image") {
      const rel = relativePath(projectRoot, ref.path) || ref.path
      const dot = ref.path.lastIndexOf(".")
      const ext = dot === -1 ? "" : ref.path.slice(dot).toLowerCase()
      const mimeType = SUPPORTED_IMAGE_MIME_TYPES[ext]
      if (mimeType) {
        try {
          const bytes = await Bun.file(ref.path).bytes()
          const data = Buffer.from(bytes).toString("base64")
          images.push({ type: "image", data, mimeType })
          sections.push(`Image ${ref.token} (${rel}) - attached to this message.`)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          debugLog("expandPromptReferences", `failed to read image ${ref.path}`, { error: detail })
          sections.push(`Image ${ref.token} (${rel}) could not be read: ${detail}.`)
        }
      } else {
        sections.push(`Image ${ref.token} attached at ${rel} (format not inlineable as image; treat as filesystem reference).`)
      }
    } else if (ref.kind === "session") {
      const brief = sessionBriefs.get(ref.token)
      const context = sessionContexts.get(ref.token)
      if (brief) {
        const header = context ? `Session ${context.sessionId} (status: ${context.status})` : `Session ${ref.token.slice(2)}`
        sections.push(`Session reference ${ref.token} - handoff brief:\n${header}\n\n${brief}`)
      } else if (context) {
        sections.push(`Session reference ${ref.token}:\n${formatSessionContext(context)}`)
      } else {
        sections.push(`Session reference ${ref.token} could not be inlined.`)
      }
    } else {
      sections.push(`Reference ${ref.token} could not be inlined: ${ref.reason ?? "unknown"}.`)
    }
  }
  return {
    prompt: `${prompt}\n\nReferenced attachments:\n${sections.join("\n\n")}`,
    references,
    images,
  }
}

export function formatSessionContext(context: SessionContext): string {
  const lines: string[] = [
    `Session ${context.sessionId}`,
    `Status: ${context.status}`,
    `Updated: ${new Date(context.updatedAt).toISOString()}`,
    "Scope: compact session context only; full transcripts and private worker internals are not included.",
  ]
  if (context.prompt) lines.push(`Initial prompt:\n${clipContextText(context.prompt, MAX_SESSION_FIELD_CHARS)}`)
  if (context.summary) lines.push(`Latest summary:\n${clipContextText(context.summary, MAX_SESSION_FIELD_CHARS)}`)
  if (context.entries.length > 0) {
    lines.push("Relevant records:")
    for (const entry of context.entries) {
      if (entry.type === "run") {
        const label = `- run${entry.attempt ? ` attempt ${entry.attempt}` : ""} (${entry.status}${entry.role ? `, ${entry.role}` : ""})`
        const prompt = entry.prompt ? `\n  prompt: ${clipContextText(entry.prompt.replace(/\s+/g, " ").trim(), 600)}` : ""
        const summary = entry.summary ? `\n  summary: ${clipContextText(entry.summary, MAX_SESSION_FIELD_CHARS)}` : ""
        lines.push(`${label}${prompt}${summary}`)
      } else if (entry.type === "worker") {
        const label = `- worker${entry.phase ? `/${entry.phase}` : ""}${entry.role ? ` ${entry.role}` : ""} (${entry.status})`
        const summary = entry.summary ? `\n  summary: ${clipContextText(entry.summary, 2000)}` : ""
        const error = entry.error ? `\n  error: ${clipContextText(entry.error, 1200)}` : ""
        lines.push(`${label}${summary}${error}`)
      } else if (entry.type === "todo") {
        const label = `- todo${entry.phase ? `/${entry.phase}` : ""}${entry.role ? ` ${entry.role}` : ""} (${entry.status})`
        const title = entry.title ? `\n  task: ${clipContextText(entry.title, 600)}` : ""
        const summary = entry.summary ? `\n  summary: ${clipContextText(entry.summary, 1200)}` : ""
        const error = entry.error ? `\n  error: ${clipContextText(entry.error, 1200)}` : ""
        lines.push(`${label}${title}${summary}${error}`)
      } else if (entry.type === "check") {
        const label = `- checks${entry.attempt ? ` attempt ${entry.attempt}` : ""} (${entry.status})`
        const reason = entry.reason ? `\n  reason: ${clipContextText(entry.reason, 800)}` : ""
        const checks = entry.checks.length > 0
          ? `\n  scripts: ${entry.checks.map((check) => `${check.name}:${check.status}${check.exitCode === undefined ? "" : `:${check.exitCode ?? "n/a"}`}`).join(", ")}`
          : ""
        lines.push(`${label}${reason}${checks}`)
      } else if (entry.type === "review") {
        const label = `- review${entry.attempt ? ` attempt ${entry.attempt}` : ""} (${entry.decision})`
        const rationale = entry.rationale ? `\n  rationale: ${clipContextText(entry.rationale, 1200)}` : ""
        const required = entry.requiredChanges.length > 0 ? `\n  required: ${clipContextText(entry.requiredChanges.join("; "), 1200)}` : ""
        const blocked = entry.blockingIssues.length > 0 ? `\n  blocked: ${clipContextText(entry.blockingIssues.join("; "), 1200)}` : ""
        lines.push(`${label}${rationale}${required}${blocked}`)
      } else if (entry.type === "handoff") {
        const label = `- handoff${entry.trigger ? ` (${entry.trigger})` : ""}`
        const focus = entry.focus ? `\n  focus: ${clipContextText(entry.focus, 400)}` : ""
        lines.push(`${label}${focus}\n  summary: ${clipContextText(entry.summary, MAX_SESSION_FIELD_CHARS)}`)
      } else {
        lines.push(`- error${entry.attempt ? ` attempt ${entry.attempt}` : ""}: ${clipContextText(entry.error, 1200)}`)
      }
    }
    if (context.truncated) lines.push("- earlier records omitted")
  }
  return clipContextText(lines.join("\n"), MAX_INLINE_SESSION_CHARS)
}

function inlineCodeFence(path: string): string {
  const dot = path.lastIndexOf(".")
  const ext = dot === -1 ? "" : path.slice(dot + 1).toLowerCase()
  if (!ext) return ""
  return ext.replace(/[^a-z0-9]/g, "")
}

function clipContextText(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 3))}...`
}
