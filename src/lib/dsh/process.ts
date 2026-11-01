import type { SessionNotification } from "@agentclientprotocol/sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { dshHome } from "../app-config";
import { runtimeConfig } from "./config";
import { connectAcp } from "./acp-client";

type Runtime = {
  child: ChildProcessWithoutNullStreams; connection: ReturnType<typeof connectAcp>;
  generation: number; fingerprint: string; ready: Promise<void>; intentionalStop: boolean;
  call<T>(request: () => Promise<T>): Promise<T>;
};
type RuntimeState = {
  runtime?: Runtime; starting?: Promise<Runtime>; reloading?: Promise<void>;
  generation: number; closing: boolean; busy: Set<string>;
  pendingRestart: boolean; reloadError: string | null;
  listeners: Set<(n:SessionNotification)=>void>; exits: Set<(generation:number)=>void>;
  restartTimer?: ReturnType<typeof setTimeout>;
};
const globalRuntime = globalThis as typeof globalThis & {__auditDshRuntime?: RuntimeState};
const state = globalRuntime.__auditDshRuntime ||= {
  generation:0, closing:false, busy:new Set(), pendingRestart:false, reloadError:null,
  listeners:new Set(), exits:new Set(),
};
if (state.generation === 0) {
  // Register once across Next dev HMR. Graceful termination lets dsh flush sessions.
  const shutdown = () => {
    state.closing = true;
    if (state.restartTimer) clearTimeout(state.restartTimer);
    state.runtime?.child.kill("SIGTERM");
  };
  process.once("exit", shutdown);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
    shutdown(); setTimeout(() => process.exit(0), 1500).unref();
  });
  state.generation = 1;
}
export function onRuntimeUpdate(listener: (n:SessionNotification)=>void) {
  state.listeners.add(listener); return () => {state.listeners.delete(listener);};
}
export function onRuntimeExit(listener: (generation:number)=>void) {
  state.exits.add(listener); return () => {state.exits.delete(listener);};
}
export function getRuntimeStatus() {
  return {generation:state.runtime?.generation ?? null, pendingRestart:state.pendingRestart, error:state.reloadError};
}
export function setRuntimeBusy(id:string, busy:boolean) {
  if (busy) state.busy.add(id); else state.busy.delete(id);
  if (!state.busy.size && state.pendingRestart && !state.closing) queueMicrotask(() => {void restartRuntime();});
}
async function startRuntime(): Promise<Runtime> {
  if (state.closing) throw new Error("Runtime is shutting down");
  if (state.starting) return state.starting;
  if (state.runtime && state.runtime.child.exitCode === null && !state.runtime.child.killed) {
    await state.runtime.ready; return state.runtime;
  }
  state.starting = (async () => {
    const {patchPath,env,fingerprint} = runtimeConfig();
    const child = spawn(join(process.cwd(), "node_modules/.bin/dsh"), ["--profile", "acp", "--patch", patchPath], {
      env: {...process.env, ...env, DSH_HOME:dshHome(), DSH_TELEMETRY_DISABLED:"1"}, stdio:"pipe",
    });
    // Provider diagnostics may contain secrets; drain without forwarding raw output.
    child.stderr.resume();
    const connection = connectAcp(child, n => {for (const listener of state.listeners) listener(n);});
    let rejectClosed!: (error:Error)=>void;
    const closed = new Promise<never>((_resolve,reject) => {rejectClosed=reject;});
    void closed.catch(()=>undefined);
    // ACP 1.4.0 drops pending requests on close without rejecting them. Every
    // request must race this process-owned lifetime, including initialize/resume.
    const runtime: Runtime = {
      child,connection,fingerprint,generation:++state.generation,ready:Promise.resolve(),intentionalStop:false,
      call: request => Promise.race([closed, Promise.resolve().then(request)]),
    };
    state.runtime = runtime;
    let ended = false;
    const exited = () => {
      if (ended) return;
      ended = true;
      rejectClosed(new Error("dsh connection closed"));
      if (state.runtime === runtime) state.runtime = undefined;
      for (const listener of state.exits) listener(runtime.generation);
      if (!state.closing && !runtime.intentionalStop) {
        state.restartTimer = setTimeout(() => {void getRuntime().catch(()=>{state.reloadError="dsh 自动重启失败，请检查模型配置。";});},1000);
        state.restartTimer.unref();
      }
    };
    child.once("error", exited); child.once("exit", exited);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    runtime.ready = runtime.call(() => Promise.race([
      connection.initialize({protocolVersion:1,clientCapabilities:{},clientInfo:{name:"audit-studio",version:"0.1.0"}}).then(()=>{}),
      new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error("initialize timeout")),15000);timeout.unref();}),
    ])).finally(()=>{if(timeout)clearTimeout(timeout);});
    try {await runtime.ready; state.reloadError=null; return runtime;}
    catch {
      runtime.intentionalStop=true;
      if (state.restartTimer) clearTimeout(state.restartTimer);
      child.kill("SIGTERM");
      throw new Error("dsh 启动失败，请检查模型配置");
    }
  })();
  try {return await state.starting;} finally {state.starting=undefined;}
}
export async function getRuntime(): Promise<Runtime> {
  if (state.reloading) await state.reloading;
  return startRuntime();
}
/** Config saves are durable independently of a deferred or failed runtime reload. */
export async function restartRuntime(): Promise<void> {
  try {
    if (state.reloading) await state.reloading;
    if (state.starting) await state.starting;
    const next = runtimeConfig(false);
    const old = state.runtime;
    if (!old || next.fingerprint === old.fingerprint) {
      state.pendingRestart=false; state.reloadError=null; return;
    }
    state.pendingRestart=true;
    if (state.busy.size) return;
    state.reloading = (async()=>{
      old.intentionalStop=true;
      if (state.restartTimer) clearTimeout(state.restartTimer);
      await new Promise<void>(resolve=>{
        old.child.once("exit",resolve);
        old.child.kill("SIGTERM");
        const timer=setTimeout(()=>old.child.kill("SIGKILL"),3000);timer.unref();
        old.child.once("exit",()=>clearTimeout(timer));
      });
      await startRuntime();
    })();
    try {await state.reloading;} finally {state.reloading=undefined;}
    state.pendingRestart=runtimeConfig(false).fingerprint !== state.runtime?.fingerprint;
    if (state.pendingRestart && !state.busy.size) queueMicrotask(()=>{void restartRuntime();});
  } catch {
    state.pendingRestart=false;
    state.reloadError="设置已保存，dsh 配置尚未就绪或重新加载失败。";
  }
}
