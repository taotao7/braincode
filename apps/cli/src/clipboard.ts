import { spawn } from "node:child_process"

export type ClipboardImageResult =
  | { kind: "image"; path: string }
  | { kind: "text"; text: string }
  | { kind: "empty" }
  | { kind: "error"; reason: string }

function runCommand(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveExec) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", (err) => {
      resolveExec({ code: 1, stdout, stderr: stderr || err.message })
    })
    child.on("close", (code) => {
      resolveExec({ code: code ?? 0, stdout, stderr })
    })
  })
}

async function readClipboardImageDarwin(targetPath: string): Promise<boolean> {
  const script = [
    `set targetFile to POSIX file "${targetPath.replace(/"/g, '\\"')}"`,
    `try`,
    `  set png_data to (the clipboard as «class PNGf»)`,
    `on error`,
    `  return "no-image"`,
    `end try`,
    `set fh to open for access targetFile with write permission`,
    `try`,
    `  set eof of fh to 0`,
    `  write png_data to fh`,
    `  close access fh`,
    `on error errMsg`,
    `  try`,
    `    close access fh`,
    `  end try`,
    `  return "write-failed: " & errMsg`,
    `end try`,
    `return "ok"`,
  ].join("\n")
  const result = await runCommand("osascript", ["-e", script])
  return result.code === 0 && result.stdout.trim() === "ok"
}

async function readClipboardTextDarwin(): Promise<string> {
  const result = await runCommand("pbpaste", [])
  if (result.code !== 0) return ""
  return result.stdout
}

export async function readClipboardImageOrText(targetPath: string): Promise<ClipboardImageResult> {
  if (process.platform !== "darwin") {
    return { kind: "error", reason: `clipboard image paste is only supported on darwin (got ${process.platform})` }
  }
  try {
    const wroteImage = await readClipboardImageDarwin(targetPath)
    if (wroteImage) {
      const file = Bun.file(targetPath)
      if (await file.exists()) return { kind: "image", path: targetPath }
    }
    const text = await readClipboardTextDarwin()
    if (text) return { kind: "text", text }
    return { kind: "empty" }
  } catch (error) {
    return { kind: "error", reason: error instanceof Error ? error.message : String(error) }
  }
}
