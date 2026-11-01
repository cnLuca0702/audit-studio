import { NextResponse } from "next/server";
import { stopSession } from "@/lib/dsh/sessions";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!await stopSession(id)) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "停止失败" }, { status: 500 });
  }
}
