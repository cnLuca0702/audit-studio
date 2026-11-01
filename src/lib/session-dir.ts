import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { appPath } from "./app-config";
import { getSessionInfo } from "./legacy-pi-sessions";
import { readIndex } from "./session-index";
import type { SessionInfo } from "./types";
export async function listSessions(cwd = homedir()): Promise<SessionInfo[]> {
  const dir = join(cwd, "sessions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, {withFileTypes:true}).flatMap(file => {
    if (!file.isFile() || !file.name.endsWith(".jsonl")) return [];
    const path = join(dir, file.name);
    try {
      const header = JSON.parse(readFileSync(path, "utf8").split("\n")[0]);
      const info = getSessionInfo(path, header.id);
      return info ? [{ ...info, legacy: true }] : [];
    } catch { return []; }
  });
}
export async function listAllSessions() {
  let recentCwds: unknown;
  try { recentCwds = JSON.parse(readFileSync(appPath("settings.json"), "utf8"))?.recentCwds; } catch {}
  const cwds = [...new Set([homedir(), ...(Array.isArray(recentCwds) ? recentCwds.filter((cwd): cwd is string => typeof cwd === "string" && cwd.trim().length > 0) : [])].map(cwd => resolve(cwd)))];
  const results = await Promise.allSettled(cwds.map(cwd => listSessions(cwd)));
  const legacy = results.flatMap(result=>result.status === "fulfilled" ? result.value : []);
  const unique = new Map<string,SessionInfo>();
  for (const row of [...readIndex(), ...legacy]) if (!unique.has(row.id)) unique.set(row.id,row);
  return [...unique.values()].sort((a,b) => Date.parse(b.modified) - Date.parse(a.modified));
}
export async function findSessionById(id: string, cwd?: string) {
  return (cwd ? await listSessions(cwd) : await listAllSessions()).find(s => s.id === id);
}
