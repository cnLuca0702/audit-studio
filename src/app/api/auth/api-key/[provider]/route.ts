import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// POST /api/auth/api-key/[provider] — set API key for a provider
export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  try {
    const body = await req.json();
    const { key } = body as { key?: string };

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    const authDir = join(homedir(), ".pi", "agent");
    const authPath = join(authDir, "auth.json");

    if (!existsSync(authDir)) {
      mkdirSync(authDir, { recursive: true });
    }

    let auth: Record<string, any> = {};
    if (existsSync(authPath)) {
      auth = JSON.parse(readFileSync(authPath, "utf8"));
    }

    auth[provider] = {
      type: "api_key",
      key,
    };

    writeFileSync(authPath, JSON.stringify(auth, null, 2), "utf8");

    return NextResponse.json({ ok: true, provider });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
