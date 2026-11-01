import { restartRuntime } from "@/lib/dsh/process";
import { appPath } from "@/lib/app-config";
import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";

// GET /api/auth/logout/[provider] — logout / remove provider credentials
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  try {
    const authPath = appPath("auth.json");
    if (!existsSync(authPath)) {
      return NextResponse.json({ ok: true, message: "No auth file exists" });
    }

    const auth = JSON.parse(readFileSync(authPath, "utf8"));

    if (!(provider in auth)) {
      return NextResponse.json(
        { error: `Provider "${provider}" not found` },
        { status: 404 }
      );
    }

    delete auth[provider];
    writeFileSync(authPath, JSON.stringify(auth, null, 2), "utf8");
    await restartRuntime();

    return NextResponse.json({ ok: true, provider });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
