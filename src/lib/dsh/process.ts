import type { SessionNotification } from "@agentclientprotocol/sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { dshHome } from "../app-config";
import { runtimeConfig } from "./config";
import { connectAcp } from "./acp-client";

type Runtime = {child: ChildProcessWithoutNullStreams; connection: ReturnType<typeof connectAcp>; generation: number; ready: Promise<void>};
type RuntimeState = {runtime?: Runtime; starting?: Promise<Runtime>; generation: number; closing: boolean; listeners: Set<(n:SessionNotification)=>void>; exits: Set<()=>void>; restartTimer?: ReturnType<typeof setTimeout>};
const globalRuntime = globalThis as typeof globalThis & {__auditDshRuntime?: RuntimeState};
const state = globalRuntime.__auditDshRuntime ||= {generation:0, closing:false, listeners:new Set(), exits:new Set()};
if (!globalRuntime.__auditDshRuntime.runtime && state.generation === 0) {
  // Register once across Next dev HMR. Graceful termination lets dsh flush sessions.
  const shutdown = () => {
    state.closing = true;
    if (state.restartTimer) clearTimeout(state.restartTimer);
    state.runtime?.child.kill("SIGTERM");
  };
  process.once("exit", shutdown);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { shutdown(); setTimeout(() => process.exit(0), 1500).unref(); });
  state.generation = 1;
}
export function onRuntimeUpdate(listener: (n:SessionNotification)=>void) { state.listeners.add(listener); return () => {state.listeners.delete(listener);}; }
export function onRuntimeExit(listener: ()=>void) { state.exits.add(listener); return () => {state.exits.delete(listener);}; }
export async function getRuntime(): Promise<Runtime> {
  if (state.closing) throw new Error("Runtime is shutting down");
  if (state.starting) return state.starting;
  if (state.runtime && state.runtime.child.exitCode === null && !state.runtime.child.killed) { await state.runtime.ready; return state.runtime; }
  state.starting = (async () => {
    const {patchPath,env} = runtimeConfig();
    const child = spawn(join(process.cwd(), "node_modules/.bin/dsh"), ["--profile", "acp", "--patch", patchPath], {
      env: {...process.env, ...env, DSH_HOME:dshHome(), DSH_TELEMETRY_DISABLED:"1"}, stdio:"pipe",
    });
    // dsh diagnostics can include provider errors. Drain stderr without forwarding
    // raw output to logs or clients, so upstream credentials cannot leak.
    child.stderr.resume();
    const connection = connectAcp(child, n => { for (const listener of state.listeners) listener(n); });
    const runtime: Runtime = {child,connection,generation:++state.generation,ready:Promise.resolve()};
    state.runtime = runtime;
    const exited = () => {
      if (state.runtime !== runtime) return;
      state.runtime = undefined;
      for (const listener of state.exits) listener();
      if (!state.closing) {
        state.restartTimer = setTimeout(() => { void getRuntime().catch(() => {/* next request can retry */}); }, 1000);
        state.restartTimer.unref();
      }
    };
    child.once("error", exited);
    child.once("exit", exited);
    runtime.ready = connection.initialize({protocolVersion:1, clientCapabilities:{}, clientInfo:{name:"audit-studio",version:"0.1.0"}}).then(()=>{});
    try { await runtime.ready; return runtime; }
    catch { child.kill("SIGTERM"); throw new Error("dsh 启动失败，请检查模型配置"); }
  })();
  try { return await state.starting; } finally { state.starting = undefined; }
}
export async function restartRuntime() {
  // Configuration saves remain valid before the first runtime has been started.
  if (!state.runtime && !state.starting) return;
  if (state.starting) await state.starting.catch(()=>{});
  const old = state.runtime;
  if (!old) return;
  await new Promise<void>(resolve => {
    old.child.once("exit",()=>resolve());
    old.child.kill("SIGTERM");
    const timer = setTimeout(()=>old.child.kill("SIGKILL"),3000); timer.unref();
  });
  if (state.restartTimer) clearTimeout(state.restartTimer);
  await getRuntime();
}
