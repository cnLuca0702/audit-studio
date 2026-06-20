/**
 * Session directory helper
 *
 * All sessions are stored in `<homedir>/sessions/` instead of the SDK
 * default `~/.pi/agent/sessions/<encoded-cwd>/`.
 *
 * This keeps session data co-located with the project and makes it
 * easy to find, backup, and share.
 */

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
  const sessionDir = getSessionDir(resolvedCwd);
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
  const sessions = await listSessions(cwd);
  return sessions.find((s) => s.id === id);
}
