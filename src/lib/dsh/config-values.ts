import { createHash } from "node:crypto";

/** Pi's null means unsupported; dsh permits null only for the off level. */
export function normalizeReasoningEfforts(map: Record<string, string | null>): false | Record<string, string | null> {
  const efforts: Record<string, string | null> = {};
  for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"]) {
    const wire = map[level];
    if (level === "off" && wire === null) efforts[level] = null;
    else if (typeof wire === "string" && wire.trim()) efforts[level] = wire;
  }
  return Object.keys(efforts).some(level => level !== "off") ? efforts : false;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])
  );
  return value;
}
/** Secrets participate in the in-memory digest, never in the patch or logs. */
export function configurationHash(patch: unknown, env: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(canonical({patch, env}))).digest("hex");
}
