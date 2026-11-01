import { NextResponse } from "next/server";
import { findSessionById } from "@/lib/session-dir";
import { sessionDetails } from "@/lib/session-context";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const info=await findSessionById(id);
  if(!info)return NextResponse.json({error:"Session not found"},{status:404});
  return NextResponse.json(sessionDetails(info).context);
}
