import type { SessionUpdate, ToolCallUpdate } from "@agentclientprotocol/sdk";
/** ACP semantic updates -> the established browser SSE contract. No I/O. */
export interface MessagePart {
  type: string; text?: string; thinking?: string; toolCallId?: string;
  toolName?: string; input?: unknown; _status?: string; result?: unknown; isError?: boolean;
}
export interface AssistantMessage {role:string; content:MessagePart[]; timestamp?:number; stopReason?:string; errorMessage?:string;}
export interface LegacyEvent {type:string; message?:AssistantMessage; [key:string]:unknown;}
type TrackedTool = ToolCallUpdate & {ended?:boolean};
export interface EventState { message: AssistantMessage | null; tools: Record<string, TrackedTool>; }
export const initialEventState = (): EventState => ({message: null, tools: {}});
const copy = <T>(value: T): T => structuredClone(value);
export function translateUpdate(previous: EventState, update: SessionUpdate, now = Date.now()): {state: EventState; events: LegacyEvent[]} {
  const state = copy(previous) as EventState;
  const events: LegacyEvent[] = [];
  function ensureMessage() {
    if (!state.message) {
      state.message = {role: "assistant", content: [], timestamp: now};
      events.push({type: "message_start", message: copy(state.message!)});
    }
  }
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
    case "agent_thought_chunk": {
      if (update.content?.type !== "text") break;
      ensureMessage();
      const type = update.sessionUpdate === "agent_thought_chunk" ? "thinking" : "text";
      const field = type === "thinking" ? "thinking" : "text";
      const parts = state.message!.content;
      const last = parts.at(-1);
      if (last?.type === type) last[field] = (last[field] || "") + update.content.text;
      else parts.push({type, [field]: update.content.text});
      events.push({type: "message_update", message: copy(state.message!)});
      break;
    }
    case "tool_call":
    case "tool_call_update": {
      ensureMessage();
      const id = update.toolCallId;
      const old = state.tools[id];
      const tool = {...old, ...update};
      if (!old) {
        const name = String(update.title || ("kind" in update && update.kind) || "tool");
        state.message!.content.push({type: "toolCall", toolCallId: id, toolName: name, input: update.rawInput || {}, _status: "running"});
        events.push({type: "tool_execution_start", toolCallId: id, toolName: name, args: update.rawInput || {}});
      }
      if (["completed", "failed"].includes(tool.status || "") && !old?.ended) {
        tool.ended = true;
        const result = {content: (tool.content || []).flatMap((c) => c.type === "content" ? [c.content] : []), details: tool.rawOutput};
        const part = state.message!.content.find((p) => p.toolCallId === id);
        Object.assign(part!, {result, isError: tool.status === "failed", _status: "done", input: tool.rawInput || part!.input});
        events.push({type: "tool_execution_end", toolCallId: id, toolName: part!.toolName, result, isError: tool.status === "failed"});
      }
      state.tools[id] = tool;
      break;
    }
    case "config_option_update":
      for (const option of update.configOptions || []) {
        if (option.id === "model") {
          try { const [provider, id] = JSON.parse(String(option.currentValue)); events.push({type: "model_select", model: {provider, id}}); } catch {}
        }
        if (option.id === "reasoning_effort") events.push({type: "thinking_level_changed", level: option.currentValue || "off"});
      }
      break;
  }
  return {state, events};
}
export function finishTurn(previous: EventState, stopReason: string, errorMessage?: string) {
  const state = copy(previous) as EventState;
  const events: LegacyEvent[] = [];
  if (!state.message && errorMessage) {
    state.message = {role: "assistant", content: []};
    events.push({type: "message_start", message: copy(state.message!)});
  }
  if (state.message) {
    state.message.stopReason = errorMessage ? "error" : stopReason === "cancelled" ? "aborted" : "stop";
    if (errorMessage) state.message.errorMessage = errorMessage;
    events.push({type: "message_end", message: copy(state.message!)});
  }
  events.push({type: "agent_end"});
  return {state, events};
}
