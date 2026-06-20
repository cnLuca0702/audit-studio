import { isSessionAlive, subscribeToSession } from "@/lib/rpc-manager";

// GET /api/agent/[id]/events — SSE event stream
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isSessionAlive(id)) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send heartbeat immediately so the client knows the connection is open
      try {
        controller.enqueue(encoder.encode("data: {\"type\":\"connected\"}\n\n"));
      } catch { /* ignore */ }

      try {
        const unsub = subscribeToSession(id, (event) => {
          try {
            const payload = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch {
            // Stream may already be closed
          }
        });
        (controller as any)._unsub = unsub;
      } catch (err) {
        console.error("[SSE] subscribe error:", err);
        // Keep stream alive — don't close it, so the client stays connected
      }
    },
    cancel(controller) {
      const unsub = (controller as any)._unsub;
      if (typeof unsub === "function") {
        try { unsub(); } catch { /* ignore */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
