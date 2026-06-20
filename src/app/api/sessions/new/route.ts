import { NextResponse } from "next/server";
import { getPiSdk } from "@/lib/pi-sdk";
import { getSessionDir } from "@/lib/session-dir";

/**
 * POST /api/sessions/new
 * Create a new session.
 * Body: { cwd?: string, name?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const cwd = body.cwd || require("os").homedir();
    const sessionDir = getSessionDir(cwd);

    const { SessionManager } = await getPiSdk();
    const session = SessionManager.create(cwd, sessionDir);
    const sessionFile = session.getSessionFile();
    const sessionId = session.getSessionId();

    // Manually write the session header to ensure file creation.
    // The SDK writes lazily on first append, but node:fs issues in Next.js
    // dev mode can cause silent failures.
    if (sessionFile) {
      const fs = require("fs");
      const header = {
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: new Date().toISOString(),
        cwd: cwd,
      };
      const name = body.name || `会话 ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
      const sessionInfo = {
        type: "session_info",
        id: Math.random().toString(36).slice(2, 10),
        parentId: null,
        timestamp: new Date().toISOString(),
        name: name,
      };
      fs.writeFileSync(sessionFile, JSON.stringify(header) + "\n" + JSON.stringify(sessionInfo) + "\n");
    }

    return NextResponse.json({
      sessionId,
      path: sessionFile,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create session",
      },
      { status: 500 }
    );
  }
}
