import { NextResponse } from "next/server";
import { getSession } from "@/lib/rpc-manager";
import { resolveModel } from "@/lib/model-resolver";

// GET /api/agent/[id] — query agent status
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getSession(id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const model = session.model;
    return NextResponse.json({
      isStreaming: session.isStreaming,
      model: model?.id ?? null,
      provider: model?.provider ?? null,
      modelName: model?.name ?? model?.id ?? null,
      thinkingLevel: session.thinkingLevel,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST /api/agent/[id] — send message or run session command
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getSession(id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await request.json();

    if (body.command === "set_model") {
      const { provider, modelId } = body as { provider?: string; modelId?: string };
      if (!provider || !modelId) {
        return NextResponse.json({ error: "provider and modelId are required" }, { status: 400 });
      }
      const model = resolveModel(provider, modelId);
      if (!model) {
        return NextResponse.json({ error: "Model not configured" }, { status: 400 });
      }
      await session.setModel(model);
      return NextResponse.json({
        ok: true,
        provider,
        modelId,
        modelName: model.name,
      });
    }

    const { message, type } = body as {
      message: string;
      type: "prompt" | "steer" | "followUp";
    };

    if (!message) {
      return NextResponse.json(
        { error: "Missing required field: message" },
        { status: 400 }
      );
    }

    switch (type ?? "prompt") {
      case "prompt":
        await session.prompt(message);
        break;
      case "steer":
        await session.steer(message);
        break;
      case "followUp":
        await session.followUp(message);
        break;
      default:
        return NextResponse.json(
          { error: `Invalid type: ${type}. Must be "prompt", "steer", or "followUp"` },
          { status: 400 }
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
