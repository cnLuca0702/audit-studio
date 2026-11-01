import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { appPath } from "./app-config";
import type { SessionInfo } from "./types";
export type IndexedSession = SessionInfo & { legacy: false; model?: {provider: string; modelId: string}; thinkingLevel?: string };
export function validSessionId(id: string): boolean { return /^[A-Za-z0-9_-]{1,128}$/.test(id); }
export function assertSessionId(id: string): void { if (!validSessionId(id)) throw new Error("Invalid session ID"); }
export function readIndex(): IndexedSession[] {
  const path = appPath("session-index.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8"));
}
function writeIndex(rows: IndexedSession[]) {
  const path = appPath("session-index.json");
  writeFileSync(path + ".tmp", JSON.stringify(rows, null, 2), {mode: 0o600});
  renameSync(path + ".tmp", path);
}
export function updateIndex(row: IndexedSession) {
  assertSessionId(row.id);
  writeIndex([...readIndex().filter(s => s.id !== row.id), row]);
}
export function removeFromIndex(id: string) { assertSessionId(id); writeIndex(readIndex().filter(s => s.id !== id)); }
