import { NextResponse } from "next/server";
import { getPiSdk } from "@/lib/pi-sdk";
import { readFile, writeFile, unlink } from "fs/promises";
import { findSessionById, listSessions } from "@/lib/session-dir";

/**
 * GET /api/sessions/[id]
 * Get session details including tree, leafId, and context.
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
    const tree = session.getTree();
    const leafId = session.getLeafId();
    const context = session.buildSessionContext();
    const header = session.getHeader();
    const name = session.getSessionName();
    const entries = session.getEntries();

    return NextResponse.json({
      id: session.getSessionId(),
      path: session.getSessionFile(),
      cwd: session.getCwd(),
      name,
      header,
      tree,
      leafId,
      context,
      entries,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get session details",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sessions/[id]
 * Update session name.
 * Body: { name: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name } = await request.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required and must be a string" },
        { status: 400 }
      );
    }

    const sessionInfo = await findSessionById(id);
    if (!sessionInfo) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const { SessionManager } = await getPiSdk();
    const session = SessionManager.open(sessionInfo.path);
    session.appendSessionInfo(name);

    return NextResponse.json({
      success: true,
      name: session.getSessionName(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update session",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sessions/[id]
 * Delete a session file and update child sessions' parentSession references.
 */
export async function DELETE(
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

    const sessionPath = sessionInfo.path;

    // Find all sessions and identify children that reference this session as parent
    const allSessions = await listSessions();
    const childSessions = allSessions.filter(
      (s) => s.parentSessionPath === sessionPath
    );

    // Update child sessions to remove the parentSession reference from their header
    for (const child of childSessions) {
      try {
        const content = await readFile(child.path, "utf-8");
        const lines = content.split("\n");
        if (lines.length > 0 && lines[0].trim()) {
          const header = JSON.parse(lines[0]);
          if (header.parentSession === sessionPath) {
            delete header.parentSession;
            lines[0] = JSON.stringify(header);
            await writeFile(child.path, lines.join("\n"), "utf-8");
          }
        }
      } catch {
        // Skip files that cannot be read or updated
      }
    }

    // Delete the session file
    await unlink(sessionPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete session",
      },
      { status: 500 }
    );
  }
}
