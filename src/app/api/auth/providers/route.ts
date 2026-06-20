import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// GET /api/auth/providers — return configured OAuth/API-key providers
export async function GET() {
  try {
    const authPath = join(homedir(), ".pi", "agent", "auth.json");
    if (!existsSync(authPath)) {
      return NextResponse.json({ providers: [] });
    }

    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    const providers = Object.entries(auth).map(([id, config]: [string, any]) => ({
      id,
      type: config.type ?? "api_key",
      configured: !!config.key || !!config.accessToken,
    }));

    return NextResponse.json({ providers });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
