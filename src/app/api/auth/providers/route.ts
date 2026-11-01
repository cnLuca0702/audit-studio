import { appPath } from "@/lib/app-config";
import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";

// GET /api/auth/providers — return configured OAuth/API-key providers
export async function GET() {
  try {
    const authPath = appPath("auth.json");
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
