import { NextResponse } from "next/server";
import { getOrCreateSession } from "@/lib/dsh/sessions";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.sessionFile) return NextResponse.json({error:"Pi 历史会话只读"},{status:400});
    const session = await getOrCreateSession(body.sessionId,body);
    return NextResponse.json({sessionId:session.id});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error ? error.message : "无法创建会话"},{status:400});
  }
}
