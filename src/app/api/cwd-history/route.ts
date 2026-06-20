import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");
const MAX_RECENT = 12;

function ensureAgentDir() {
  const dir = join(homedir(), ".pi", "agent");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readSettings(): Record<string, unknown> {
  ensureAgentDir();
  if (!existsSync(SETTINGS_PATH)) return {};
  return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
}

function writeSettings(settings: Record<string, unknown>) {
  ensureAgentDir();
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

function normalizeRecent(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

// GET /api/cwd-history
export async function GET() {
  try {
    const settings = readSettings();
    return NextResponse.json({
      recentCwds: normalizeRecent(settings.recentCwds),
      lastCwd: typeof settings.lastCwd === "string" ? settings.lastCwd : "",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/cwd-history — remember cwd usage
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    if (!cwd) {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }

    if (!existsSync(cwd)) {
      return NextResponse.json({ error: "Directory does not exist" }, { status: 400 });
    }
    if (!statSync(cwd).isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }

    const settings = readSettings();
    const prev = normalizeRecent(settings.recentCwds);
    const recentCwds = [cwd, ...prev.filter((p) => p !== cwd)].slice(0, MAX_RECENT);
    settings.recentCwds = recentCwds;
    settings.lastCwd = cwd;
    writeSettings(settings);

    return NextResponse.json({ ok: true, recentCwds, lastCwd: cwd });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
