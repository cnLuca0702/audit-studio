import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DATA_DIR = join(homedir(), ".pi", "agent", "data");
const KB_FILE = join(DATA_DIR, "bidding-kb.json");

interface KBItem {
  id: string;
  name: string;
  text: string;
  created: number;
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readKB(): KBItem[] {
  ensureDataDir();
  try {
    if (existsSync(KB_FILE)) return JSON.parse(readFileSync(KB_FILE, "utf-8"));
  } catch {
    /* ignore */
  }
  return [];
}

function writeKB(items: KBItem[]) {
  ensureDataDir();
  writeFileSync(KB_FILE, JSON.stringify(items, null, 2), "utf-8");
}

// GET /api/bidding-review/kb/[id] — fetch a single knowledge base (with text)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const items = readKB();
  const item = items.find((k) => k.id === id);
  if (!item) {
    return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

// PUT /api/bidding-review/kb/[id] — update a knowledge base's name and/or text
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const text = typeof body.text === "string" ? body.text : null;

  if (!name && text === null) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  if (text !== null && !text.trim()) {
    return NextResponse.json({ error: "知识库内容不能为空" }, { status: 400 });
  }

  const items = readKB();
  const idx = items.findIndex((k) => k.id === id);
  if (idx < 0) {
    return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
  }
  if (name) items[idx].name = name;
  if (text !== null) items[idx].text = text;
  writeKB(items);

  return NextResponse.json({ ok: true, item: items[idx] });
}

// DELETE /api/bidding-review/kb/[id] — delete a knowledge base
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const items = readKB();
  const idx = items.findIndex((k) => k.id === id);
  if (idx < 0) {
    return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
  }
  const removed = items.splice(idx, 1)[0];
  writeKB(items);
  return NextResponse.json({ ok: true, item: removed });
}