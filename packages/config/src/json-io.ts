// Atomic JSON file IO and defensive JSON field helpers shared by the config stores and the session journal.

import { randomUUID } from "node:crypto";
import { chmod, rename, rm, writeFile } from "node:fs/promises";

export async function writeJsonFile(path: string, value: unknown, mode?: number) {
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    // Create the temp file with the restrictive mode up front (instead of
    // chmod after write) so secret files like auth.json are never readable by
    // other users, even briefly.
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      ...(mode !== undefined ? { mode } : {}),
    });
    await rename(tempPath, path);
    if (mode !== undefined) {
      await chmod(path, mode);
    }
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) return fallback;

  const text = await file.text();
  if (!text.trim()) return fallback;

  return JSON.parse(text) as T;
}

export async function readOptionalTextFile(path: string): Promise<string | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;

  const text = await file.text();
  return text.trim() ? text : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

// Parse a support-file JSON document (mcp.json / .mcp.json) without letting a
// syntax error abort the whole run; a malformed file degrades to "no config"
// and surfaces through doctor rather than crashing every prompt.
export function parseJsonRecordSafe(path: string, text: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(text));
  } catch (error) {
    console.error(
      `[braincode] Ignoring malformed JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function positiveNumberField(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

export function objectField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

export async function ensureJsonFile(path: string, value: unknown, mode?: number) {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    await writeJsonFile(path, value, mode);
  }
  if (mode !== undefined) {
    await chmod(path, mode);
  }
}
