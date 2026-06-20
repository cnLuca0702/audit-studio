import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DATA_DIR = join(homedir(), ".pi", "agent", "data");
const HISTORY_FILE = join(DATA_DIR, "app-history.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readHistory(): any[] {
  ensureDataDir();
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
    }
  } catch {
    // ignore
  }
  return [];
}

function writeHistory(items: any[]) {
  ensureDataDir();
  writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2), "utf-8");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const items = readHistory();
  const item = items.find((i: any) => i.id === id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}

// Rename a history item (updates appName).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const appName = typeof body.appName === "string" ? body.appName.trim() : "";
  if (!appName) {
    return NextResponse.json({ error: "appName is required" }, { status: 400 });
  }
  const items = readHistory();
  const idx = items.findIndex((i: any) => i.id === id);
  if (idx < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  items[idx] = { ...items[idx], appName };
  writeHistory(items);
  return NextResponse.json({ ok: true, item: items[idx] });
}

// Delete a history item.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const items = readHistory();
  writeHistory(items.filter((i: any) => i.id !== id));
  return NextResponse.json({ ok: true });
}
