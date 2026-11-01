import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { getRuntime, onRuntimeUpdate } from "./process";
import { readConfigFile } from "./config";
import { initialEventState, translateUpdate, finishTurn, type EventState, type LegacyEvent } from "./events";
import { appendMessages, transcriptPath, readTranscript } from "./transcript";
import { readIndex, updateIndex, assertSessionId, type IndexedSession } from "../session-index";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { resolveModel, type ResolvedAgentModel } from "../model-resolver";

export function auditMcpServer(cwd: string) {
  return {name:"audit-tools",command:process.execPath,args:[join(process.cwd(),"dist-mcp/audit-tools.mjs")],env:[{name:"AUDIT_STUDIO_CWD",value:cwd}, ...(process.env.CHROMIUM_PATH ? [{name:"CHROMIUM_PATH",value:process.env.CHROMIUM_PATH}] : [])]};
}
class DshSession {
  id: string;
  row: IndexedSession;
  model: ResolvedAgentModel | null;
  thinkingLevel: string;
  isStreaming = false;
  lastActivity = Date.now();
  generation: number;
  eventState: EventState = initialEventState();
  buffer: LegacyEvent[] = [];
  listeners = new Set<(event:LegacyEvent)=>void>();
  queue: string[] = [];
  disposed = false;
  cancelRequested = false;
  activation?: Promise<void>;
  constructor(row: IndexedSession, generation: number) {
    this.id = row.id; this.row = row; this.generation = generation;
    this.thinkingLevel = row.thinkingLevel || "off";
    this.model = row.model ? resolveModel(row.model.provider,row.model.modelId) : null;
  }
  emit(event: LegacyEvent) {
    this.lastActivity = Date.now();
    if (!this.listeners.size) { this.buffer.push(event); if(this.buffer.length>500) this.buffer.shift(); }
    for (const listener of this.listeners) { try {listener(event);} catch {} }
  }
  update(update: SessionUpdate) {
    // Resume restores model context inside dsh; transcript is the browser's
    // authority. Ignore replayed message chunks when no prompt is active.
    if (!this.isStreaming && update.sessionUpdate !== "config_option_update") return;
    const result = translateUpdate(this.eventState, update);
    this.eventState = result.state;
    for (const e of result.events) this.emit(e);
  }
  async activate() {
    if (this.disposed) throw new Error("会话已关闭");
    if (this.activation) return this.activation;
    this.activation = (async()=>{
      const runtime = await getRuntime();
      if (runtime.generation === this.generation) return;
      await runtime.connection.resumeSession({sessionId:this.id,cwd:this.row.cwd,mcpServers:[auditMcpServer(this.row.cwd)]});
      this.generation = runtime.generation;
      if (this.row.model) await runtime.connection.setSessionConfigOption({sessionId:this.id,configId:"model",value:JSON.stringify([this.row.model.provider,this.row.model.modelId])});
      if (this.thinkingLevel !== "off") await runtime.connection.setSessionConfigOption({sessionId:this.id,configId:"reasoning_effort",value:this.thinkingLevel});
    })();
    try {await this.activation;} finally {this.activation = undefined;}
  }
  prompt(message: string) {
    if (this.disposed) throw new Error("会话已关闭");
    if (this.isStreaming) {this.queue.push(message); return;}
    this.cancelRequested = false;
    this.isStreaming = true;
    this.eventState = initialEventState();
    this.emit({type:"agent_start"});
    void this.run(message);
  }
  async run(message: string) {
    const user = {role:"user",content:[{type:"text",text:message}],timestamp:Date.now()};
    let reason = "end_turn"; let error: string | undefined;
    try {
      appendMessages(this.id,[user]);
      await this.activate();
      const runtime = await getRuntime();
      if(this.cancelRequested) {reason = "cancelled"; return;}
      const result = await runtime.connection.prompt({sessionId:this.id,prompt:[{type:"text",text:message}]});
      reason = result.stopReason;
    } catch {
      // Do not return upstream errors verbatim: they may contain credentials.
      if(this.cancelRequested) reason="cancelled";
      else error = "生成失败，模型服务或 dsh 连接不可用，请检查配置后重试。";
    } finally {
      let final = finishTurn(this.eventState,reason,error);
      this.eventState = final.state;
      try {
        if (!this.disposed) {
          if (final.state.message) appendMessages(this.id,[final.state.message]);
          const messages = readTranscript(this.id).messages;
          const latest=readIndex().find(s=>s.id===this.id);
          this.row = {...this.row, name:latest?.name ?? this.row.name, modified:new Date().toISOString(), messageCount:messages.length,firstMessage:this.row.firstMessage || message.slice(0,200)};
          updateIndex(this.row);
        }
      } catch {
        final = finishTurn(this.eventState,"error","历史保存失败，请检查配置目录的写入权限。");
      }
      for (const e of final.events) this.emit(e);
      this.isStreaming = false;
      const next = this.queue.shift();
      if (next && !this.disposed) this.prompt(next);
    }
  }
  async abort() {
    this.queue = [];
    this.cancelRequested = true;
    if (this.isStreaming) {
      if(this.activation) await this.activation.catch(()=>{});
      const runtime = await getRuntime();
      if (runtime.generation === this.generation) await runtime.connection.cancel({sessionId:this.id});
    }
  }
  steer(message: string) {this.prompt(message);}
  followUp(message: string) {this.prompt(message);}
  async setModel(model: ResolvedAgentModel) {
    if (this.isStreaming) throw new Error("请在本轮结束后切换模型");
    await this.activate();
    const runtime = await getRuntime();
    await runtime.connection.setSessionConfigOption({sessionId:this.id,configId:"model",value:JSON.stringify([model.provider,model.id])});
    this.model = model;
    this.row = {...this.row,model:{provider:model.provider,modelId:model.id}};
    updateIndex(this.row);
    this.emit({type:"model_select",model:{provider:model.provider,id:model.id}});
  }
  async setThinkingLevel(level: string) {
    if (this.isStreaming) throw new Error("请在本轮结束后切换思考强度");
    await this.activate();
    const runtime = await getRuntime();
    await runtime.connection.setSessionConfigOption({sessionId:this.id,configId:"reasoning_effort",value:level});
    this.thinkingLevel = level; this.row = {...this.row,thinkingLevel:level}; updateIndex(this.row);
    this.emit({type:"thinking_level_changed",level});
  }
  async dispose() {
    this.disposed = true; this.queue = [];
    await this.abort();
    const runtime = await getRuntime();
    if (runtime.generation === this.generation) await runtime.connection.closeSession({sessionId:this.id});
  }
}
type Store = {sessions:Map<string,DshSession>};
const globalSessions = globalThis as typeof globalThis & {__auditDshSessions?:Store};
if (!globalSessions.__auditDshSessions) {
  globalSessions.__auditDshSessions = {sessions:new Map()};
  onRuntimeUpdate(({sessionId,update})=>globalSessions.__auditDshSessions?.sessions.get(sessionId)?.update(update));
  const timer = setInterval(()=>{
    for (const [id,s] of globalSessions.__auditDshSessions!.sessions) if(!s.isStreaming && Date.now()-s.lastActivity>30*60*1000) removeSession(id);
  },60_000); timer.unref();
}
const sessions = globalSessions.__auditDshSessions.sessions;
export async function getOrCreateSession(sessionId?: string, options?: {cwd?:string;thinkingLevel?:string;tools?:string[];sessionFile?:string}) {
  if(options?.sessionFile) throw new Error("Pi 历史会话只读");
  if (sessionId) {
    assertSessionId(sessionId);
    const active = sessions.get(sessionId); if(active) {active.lastActivity=Date.now(); await active.activate(); return active;}
    const row = readIndex().find(s=>s.id===sessionId);
    if (!row) throw new Error("会话不存在或为只读历史会话");
    const session = new DshSession(row,-1); sessions.set(sessionId,session);
    try {await session.activate(); return session;} catch(error) {sessions.delete(sessionId); throw error;}
  }
  const runtime = await getRuntime();
  const cwd = resolve(options?.cwd || homedir());
  const result = await runtime.connection.newSession({cwd,mcpServers:[auditMcpServer(cwd)]});
  assertSessionId(result.sessionId);
  const settings = readConfigFile("settings.json");
  const now = new Date().toISOString();
  const row: IndexedSession = {id:result.sessionId,path:transcriptPath(result.sessionId),cwd,legacy:false,name:undefined,created:now,modified:now,messageCount:0,firstMessage:"",parentSessionId:undefined,model:{provider:settings.defaultProvider!,modelId:settings.defaultModel!},thinkingLevel:"off"};
  const session = new DshSession(row,runtime.generation);
  sessions.set(session.id,session); updateIndex(row);
  const level = options?.thinkingLevel || settings.defaultThinkingLevel;
  if(level) await session.setThinkingLevel(level);
  return session;
}
export function getSession(id:string) {const s=sessions.get(id); if(s)s.lastActivity=Date.now(); return s || null;}
export async function stopSession(id:string) {const s=getSession(id); if(!s)return false; await s.abort(); return true;}
export async function removeSession(id:string) {const s=sessions.get(id); if(s){await s.dispose().catch(()=>{});sessions.delete(id);}}
export function isSessionAlive(id:string) {return sessions.has(id);}
export function getActiveSessionIds() {return [...sessions.keys()];}
export function subscribeToSession(id:string,listener:(e:LegacyEvent)=>void) {
  const s=getSession(id); if(!s)return null;
  const pending=s.buffer; s.buffer=[]; s.listeners.add(listener);
  for(const e of pending)listener(e);
  return ()=>{s.listeners.delete(listener);};
}
