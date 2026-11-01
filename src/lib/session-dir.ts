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
  let settings: {recentCwds?: string[]} = {};
  try { settings = JSON.parse(readFileSync(appPath("settings.json"), "utf8")); } catch {}
  const cwds = [...new Set([homedir(), ...(settings.recentCwds || [])].map(cwd => resolve(cwd)))];
  const legacy = (await Promise.all(cwds.map(cwd => listSessions(cwd)))).flat();
  return [...readIndex(), ...legacy].sort((a,b) => Date.parse(b.modified) - Date.parse(a.modified));
}
export async function findSessionById(id: string, cwd?: string) {
  return (cwd ? await listSessions(cwd) : await listAllSessions()).find(s => s.id === id);
}
