import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { NextResponse } from "next/server";
import {
  cloneAppGroups,
  DEFAULT_APP_GROUPS,
  prepareStoredAppGroups,
  sanitizeAppGroups,
  type AppGroupConfig,
} from "@/lib/app-groups";
import { ALL_APP_IDS } from "@/lib/app-groups";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const SETTINGS_PATH = join(AGENT_DIR, "settings.json");

function readSettings(): Record<string, unknown> {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>) {
  if (!existsSync(AGENT_DIR)) mkdirSync(AGENT_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

function readAppGroups(): AppGroupConfig[] {
  const settings = readSettings();
  if (!settings.appGroups) {
    return cloneAppGroups(DEFAULT_APP_GROUPS);
  }

  const raw = sanitizeAppGroups(settings.appGroups);
  const cleaned = prepareStoredAppGroups(settings.appGroups);

  // 迁移旧版自动写入的「其他」分组
  if (JSON.stringify(raw) !== JSON.stringify(cleaned)) {
    settings.appGroups = cleaned;
    writeSettings(settings);
  }

  return cleaned;
}

/** Read custom app names override ({ appId: name }); only valid ids kept. */
function readAppNames(): Record<string, string> {
  const settings = readSettings();
  const raw = settings.appNames;
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, string> = {};
  for (const id of ALL_APP_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "string" && v.trim()) {
      result[id] = v.trim();
    }
  }
  return result;
}

/** Validate the incoming appNames object; drop unknown ids / empty values. */
function sanitizeAppNames(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const result: Record<string, string> = {};
  const raw = input as Record<string, unknown>;
  for (const id of ALL_APP_IDS) {
    const v = raw[id];
    if (typeof v === "string" && v.trim()) {
      result[id] = v.trim().slice(0, 30);
    }
  }
  return result;
}

export async function GET() {
  return NextResponse.json({ groups: readAppGroups(), appNames: readAppNames() });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const groups = prepareStoredAppGroups(body.groups);
    if (groups.length === 0) {
      return NextResponse.json({ error: "至少保留一个分组" }, { status: 400 });
    }
    const settings = readSettings();
    settings.appGroups = groups;
    if (body.appNames !== undefined) {
      settings.appNames = sanitizeAppNames(body.appNames);
    }
    writeSettings(settings);
    return NextResponse.json({ groups, appNames: settings.appNames ? sanitizeAppNames(settings.appNames) : {} });
  } catch {
    return NextResponse.json({ error: "Invalid app groups payload" }, { status: 400 });
  }
}
