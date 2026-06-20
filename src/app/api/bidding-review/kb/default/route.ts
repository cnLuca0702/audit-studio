import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const DEFAULT_NAME = "默认知识库（招标投标法律法规参考）";

function candidatePaths(): string[] {
  return [
    join(process.cwd(), ".qoder", "skills", "bidding-review", "reference.md"),
    join(homedir(), ".pi", "agent", "skills", "bidding-review", "reference.md"),
  ];
}

function resolvePath(): string | null {
  for (const p of candidatePaths()) {
    if (existsSync(p)) return p;
  }
  return null;
}

function readDefaultText(): string {
  for (const p of candidatePaths()) {
    try {
      if (existsSync(p)) return readFileSync(p, "utf-8");
    } catch {
      /* try next */
    }
  }
  return "";
}

// GET /api/bidding-review/kb/default — return default KB meta
// (?full=1 to include text body)
export async function GET(req: NextRequest) {
  const text = readDefaultText();
  const full = req.nextUrl.searchParams.get("full") === "1";
  const found = text.length > 0;
  return NextResponse.json({
    name: DEFAULT_NAME,
    missing: !found,
    length: text.length,
    ...(full ? { text } : {}),
  });
}

// PUT /api/bidding-review/kb/default — replace default KB content (creates file
// under ~/.pi/agent/skills/bidding-review/reference.md if not present)
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const name = typeof body.name === "string" ? body.name.trim() || DEFAULT_NAME : DEFAULT_NAME;

  if (!text.trim()) {
    return NextResponse.json({ error: "默认知识库内容不能为空" }, { status: 400 });
  }
  if (text.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "内容超过 5MB 限制" }, { status: 400 });
  }

  // Prefer the existing path if any; otherwise write to the user-level skill path.
  const target = resolvePath() ?? join(homedir(), ".pi", "agent", "skills", "bidding-review", "reference.md");
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf-8");
    return NextResponse.json({ ok: true, name, length: text.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}