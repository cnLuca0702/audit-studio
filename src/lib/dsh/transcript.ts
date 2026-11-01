import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { appPath } from "../app-config";
import { assertSessionId, readIndex } from "../session-index";
export function transcriptPath(id: string) { assertSessionId(id); return appPath("transcripts", id + ".jsonl"); }
export function appendMessages(id: string, messages: unknown[]) {
  mkdirSync(appPath("transcripts"), {recursive:true, mode:0o700});
  appendFileSync(transcriptPath(id), messages.map(m => JSON.stringify(m) + "\n").join(""), {mode:0o600});
}
export function readTranscript(id: string) {
  const path = transcriptPath(id);
  const messages = existsSync(path) ? readFileSync(path,"utf8").split("\n").filter(Boolean).flatMap(line => {try {return [JSON.parse(line)];} catch {return [];}}) : [];
  const row = readIndex().find(s=>s.id===id);
  return {messages, entryIds: [], model: row?.model, thinkingLevel: row?.thinkingLevel || "off"};
}
