import { NextResponse } from "next/server";
import { getPiSdk } from "@/lib/pi-sdk";
import { findSessionById } from "@/lib/session-dir";

/**
 * GET /api/sessions/[id]/context
 * Build and return the session context (resolved messages for the LLM).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const sessionInfo = await findSessionById(id);
    if (!sessionInfo) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const { SessionManager } = await getPiSdk();
    const session = SessionManager.open(sessionInfo.path);
    const context = session.buildSessionContext();

    return NextResponse.json(context);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build session context",
      },
      { status: 500 }
    );
  }
}
