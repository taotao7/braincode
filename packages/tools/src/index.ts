export type ToolPermission = "read" | "write" | "execute"

export type ToolDefinition = {
  name: string
  description: string
  permissions: ToolPermission[]
}
