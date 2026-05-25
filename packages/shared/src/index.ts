export const BRAINCODE_HOME_DIR_NAME = ".braincode"
export const DEFAULT_CONFIG_HOST = "127.0.0.1"
export const DEFAULT_CONFIG_PORT = 14580

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
