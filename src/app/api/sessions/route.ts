import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-dir";

/**
 * GET /api/sessions
 * List all sessions in the custom sessions directory.
 */
export async function GET() {
  try {
    const sessions = await listAllSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list sessions",
      },
      { status: 500 }
    );
  }
}
