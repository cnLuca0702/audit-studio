import { NextResponse } from "next/server";
import { appendFileSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { findSessionById, listAllSessions } from "@/lib/session-dir";
import { sessionDetails } from "@/lib/session-context";
import { readIndex, updateIndex, removeFromIndex, validSessionId } from "@/lib/session-index";
import { transcriptPath } from "@/lib/dsh/transcript";
import { removeSession } from "@/lib/dsh/sessions";
import { deleteDshFiles } from "@/lib/dsh/delete-session";
type Params={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Params) {
  const {id}=await params;
  const info=await findSessionById(id);
  return info ? NextResponse.json(sessionDetails(info)) : NextResponse.json({error:"Session not found"},{status:404});
}
export async function PATCH(request:Request,{params}:Params) {
  const {id}=await params;
  if(!validSessionId(id))return NextResponse.json({error:"Invalid session ID"},{status:400});
  const {name}=await request.json();
  if(typeof name!=="string" || !name.trim())return NextResponse.json({error:"Name is required"},{status:400});
  const info=await findSessionById(id);
  if(!info)return NextResponse.json({error:"Session not found"},{status:404});
  if(info.legacy) {
    // Read-only refers to conversation/model context; display metadata may change.
    const details=sessionDetails(info);
    appendFileSync(info.path,JSON.stringify({id:randomUUID(),parentId:details.leafId,type:"session_info",name,timestamp:new Date().toISOString()})+"\n");
  } else {
    const row=readIndex().find(s=>s.id===id)!;
    updateIndex({...row,name,modified:new Date().toISOString()});
  }
  return NextResponse.json({success:true,name});
}
export async function DELETE(_request:Request,{params}:Params) {
  const {id}=await params;
  // Validate before constructing paths; never accept a client-supplied file path.
  if(!validSessionId(id))return NextResponse.json({error:"Invalid session ID"},{status:400});
  const info=await findSessionById(id);
  if(!info)return NextResponse.json({error:"Session not found"},{status:404});
  if(info.legacy) {
    for(const child of await listAllSessions()) {
      if(!child.legacy || child.parentSessionId!==info.path)continue;
      const lines=readFileSync(child.path,"utf8").split("\n");
      const header=JSON.parse(lines[0]);
      if(header.parentSession===info.path) {
        delete header.parentSession;
        lines[0]=JSON.stringify(header);
        writeFileSync(child.path,lines.join("\n"));
      }
    }
    rmSync(info.path);
  }
  else {
    await removeSession(id);
    deleteDshFiles(id);
    rmSync(transcriptPath(id),{force:true});
    removeFromIndex(id);
  }
  return NextResponse.json({success:true});
}
