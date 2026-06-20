import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getOrCreateSession, isSessionAlive } from "@/lib/rpc-manager";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cwd, tools, thinkingLevel, sessionFile } = body as {
      cwd?: string;
      tools?: string[];
      thinkingLevel?: string;
      sessionFile?: string;
    };

    const requestId = randomUUID();
    const resolvedCwd = cwd || require("os").homedir();
    console.log(`[agent/new] request ${requestId} cwd: ${resolvedCwd}${sessionFile ? " resume=" + sessionFile : ""}`);

    let session: any;
    try {
      session = await getOrCreateSession(requestId, {
        cwd: resolvedCwd,
        tools,
        thinkingLevel,
        sessionFile,
      });
    } catch (createErr) {
      console.error("[agent/new] createAgentSession failed:", createErr);
      return NextResponse.json(
        { error: createErr instanceof Error ? createErr.message : String(createErr) },
        { status: 500 }
      );
    }

    // Log selected model for debugging
    const modelInfo = session.model
      ? `${session.model.provider}/${session.model.id} (api: ${session.model.api})`
      : "NONE";
    console.log(`[agent/new] Session ${requestId} model: ${modelInfo}, thinking: ${session.thinkingLevel}`);

    const alive = isSessionAlive(requestId);
    if (!alive) {
      console.error("[agent/new] Session created but not alive:", requestId);
      return NextResponse.json(
        { error: "Session was created but is not alive" },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessionId: requestId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
