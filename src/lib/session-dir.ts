/**
 * Session directory helper
 *
 * Sessions are stored in `<cwd>/sessions/` instead of the SDK
 * default `~/.pi/agent/sessions/<encoded-cwd>/`.
 *
 * This keeps session data co-located with the project and makes it
 * easy to find, backup, and share.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { getPiSdk } from "./pi-sdk";

/**
 * Get the resolved working directory.
 * Uses homedir() as the default to stay consistent between session
 * creation (rpc-manager) and session listing (sessions API).
 */
function resolveCwd(cwd?: string): string {
  return cwd || require("os").homedir();
}

/**
 * Get the custom session directory for the given working directory.
 * Returns `<cwd>/sessions`. Creates the directory if it doesn't exist.
 */
export function getSessionDir(cwd?: string): string {
  const resolvedCwd = resolveCwd(cwd);
  const path = require("path");
  const fs = require("fs");
  const dir = path.join(resolvedCwd, "sessions");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * List all sessions in the custom session directory.
 */
export async function listSessions(cwd?: string) {
  const resolvedCwd = resolveCwd(cwd);
  const sessionDir = join(resolvedCwd, "sessions");
  if (!existsSync(sessionDir)) return [];
  try {
    const { SessionManager } = await getPiSdk();
    return await SessionManager.list(resolvedCwd, sessionDir);
  } catch {
    return [];
  }
}

/**
 * Find a session by its ID in the custom session directory.
 * Returns the SessionInfo object or undefined if not found.
 */
export async function findSessionById(id: string, cwd?: string) {
  const sessions = cwd ? await listSessions(cwd) : await listAllSessions();
  return sessions.find((s) => s.id === id);
}

/** 聚合默认目录和最近使用的工作目录，单个失效目录不影响其他会话。 */
export async function listAllSessions() {
  let recentCwds: string[] = [];
  const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (Array.isArray(settings.recentCwds)) {
      recentCwds = settings.recentCwds.filter((cwd: unknown): cwd is string => typeof cwd === "string" && !!cwd.trim());
    }
  } catch { /* 未配置或配置不可读时仍扫描主目录 */ }
  const cwds = [...new Set([homedir(), ...recentCwds].map((cwd) => resolve(cwd)))];
  const results = await Promise.allSettled(cwds.map((cwd) => listSessions(cwd)));
  const sessions = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return [...new Map(sessions.map((session) => [session.id, session])).values()]
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
}
