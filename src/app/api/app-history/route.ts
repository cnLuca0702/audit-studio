import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { normalizeReviewResult } from "@/lib/bidding-report";

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

export async function GET() {
  const items = readHistory();
  const list = items.map(({ content, ...rest }) => rest);
  return NextResponse.json({ items: list });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appType, appId, appName, summary, content } = body;

    if (!appName) {
      return NextResponse.json({ error: "appName is required" }, { status: 400 });
    }

    const items = readHistory();
    let storedSummary = summary || "";
    if (appId === "bidding" && typeof content === "string") {
      try {
        const result = normalizeReviewResult(JSON.parse(content));
        const name = result.sections[0]?.infoTable?.find((kv) => kv.label.includes("项目名称"))?.value || result.cover.subtitle || "招标文件";
        storedSummary = `${name} · 高风险 ${result.summary.high} 项 / 中风险 ${result.summary.medium} 项 / 低风险 ${result.summary.low} 项`;
      } catch { /* 非结构化历史保留调用方摘要 */ }
    }
    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      appType: appType || "app",
      appId: appId || undefined,
      appName,
      timestamp: Date.now(),
      summary: storedSummary,
      content: content || "",
    };

    items.unshift(newItem);

    // Keep max 200 items
    if (items.length > 200) {
      items.length = 200;
    }

    writeHistory(items);
    return NextResponse.json({ ok: true, item: newItem });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
