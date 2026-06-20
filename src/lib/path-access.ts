import { existsSync, readdirSync, realpathSync, statSync } from "fs";
import { homedir, platform } from "os";
import { resolve } from "path";

const DENIED_BROWSE_PREFIXES = ["/dev", "/proc"];

function normalizeRoot(root: string): string {
  try {
    if (existsSync(root)) return realpathSync.native(root);
  } catch {
    // fall through
  }
  return resolve(root);
}

function allowedRoots(): string[] {
  const roots = [homedir(), "/tmp"];
  if (platform() === "darwin") {
    roots.push("/Users", "/Volumes", "/private/tmp", "/private/var/folders", "/System/Volumes/Data");
  }
  return roots.map(normalizeRoot);
}

function isUnderAllowedRoot(resolved: string): boolean {
  return allowedRoots().some(
    (root) => resolved === root || resolved.startsWith(root + "/")
  );
}

/** Whether the server may read/list the given absolute path (file explorer). */
export function isPathAllowed(filePath: string): boolean {
  if (!filePath || !filePath.startsWith("/")) return false;

  let resolved: string;
  try {
    resolved = existsSync(filePath) ? realpathSync.native(filePath) : resolve(filePath);
  } catch {
    resolved = resolve(filePath);
  }

  return isUnderAllowedRoot(resolved);
}

/** Permissive check for cwd directory picker — any readable directory except system paths. */
export function isPathAllowedForBrowse(filePath: string): boolean {
  if (!filePath || !filePath.startsWith("/")) return false;

  const normalized = resolve(filePath);
  if (DENIED_BROWSE_PREFIXES.some((p) => normalized === p || normalized.startsWith(p + "/"))) {
    return false;
  }

  if (!existsSync(normalized)) return false;

  try {
    if (!statSync(normalized).isDirectory()) return false;
    // Prefer allowed roots when resolvable; otherwise allow if readable.
    try {
      const resolved = realpathSync.native(normalized);
      if (isUnderAllowedRoot(resolved)) return true;
    } catch {
      // fall through
    }
    readdirSync(normalized);
    return true;
  } catch {
    return false;
  }
}
