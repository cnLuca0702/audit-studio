import { readFileSync } from "node:fs";
import { buildSessionContext, parseEntries, getTree } from "./legacy-pi-sessions";
import { readTranscript } from "./dsh/transcript";
import type { SessionInfo } from "./types";
export function sessionDetails(info: SessionInfo) {
  if (!info.legacy) return {...info, context:readTranscript(info.id),tree:[],entries:[],leafId:null};
  const lines=readFileSync(info.path,"utf8").trim().split("\n");
  const header=JSON.parse(lines[0]);
  const entries=parseEntries(lines.slice(1));
  const leafId=entries.at(-1)?.id || null;
  return {...info,header,entries,leafId,tree:getTree(entries),context:buildSessionContext(entries,leafId)};
}
