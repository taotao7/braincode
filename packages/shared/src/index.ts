export const BRAINCODE_HOME_DIR_NAME = ".braincode"
export const DEFAULT_CONFIG_HOST = "127.0.0.1"
export const DEFAULT_CONFIG_PORT = 14580

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export function isDebugEnabled(): boolean {
  if (process.env.BRAINCODE_DEBUG === "true") return true
  if (process.env.BRAINCODE_DEBUG === "false") return false
  return false
}

export function debugLog(scope: string, message: string, details?: Record<string, unknown>): void {
  if (!isDebugEnabled()) return

  const suffix = details ? ` ${JSON.stringify(redactDebugDetails(details))}` : ""
  console.error(`[braincode:debug:${scope}] ${message}${suffix}`)
}

function redactDebugDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDebugDetails)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/api[-_]?key|authorization|token|secret|password/i.test(key)) {
        return [key, entry ? "[redacted]" : entry]
      }
      return [key, redactDebugDetails(entry)]
    }),
  )
}
