import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { extractText } from "@/lib/file-parser";

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
    // ignore
  }
  return [];
}

function writeKB(items: KBItem[]) {
  ensureDataDir();
  writeFileSync(KB_FILE, JSON.stringify(items, null, 2), "utf-8");
}

// GET /api/bidding-review/kb — list user-built knowledge bases (with text)
export async function GET() {
  const items = readKB();
  return NextResponse.json({ items });
}

// POST /api/bidding-review/kb — upload a new knowledge base (multipart: file + name)
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const name = (form.get("name") as string | null)?.trim() || file?.name || "未命名知识库";

    if (!file) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "文件超过 20MB 限制" }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "docx", "txt", "md"].includes(ext)) {
      return NextResponse.json({ error: "仅支持 pdf/docx/txt/md 格式" }, { status: 400 });
    }

    const text = (await extractText(file)).trim();
    if (!text) {
      return NextResponse.json({ error: "无法从文件中提取文本" }, { status: 400 });
    }

    const items = readKB();
    const item: KBItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      text,
      created: Date.now(),
    };
    items.unshift(item);
    writeKB(items);

    return NextResponse.json({ ok: true, item });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
