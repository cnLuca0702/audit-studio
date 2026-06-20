"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface AgentMessage {
  role: string;
  content: any;
  timestamp?: number;
  [key: string]: any;
}

export interface AgentState {
  isStreaming: boolean;
  model: string | null;
  modelProvider: string | null;
  modelId: string | null;
  thinkingLevel: string;
  messages: AgentMessage[];
}

/** Find the index of the last assistant message in the array */
function findLastAssistant(msgs: AgentMessage[]): number {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") return i;
  }
  return -1;
}

export function useAgentSession(sessionId: string | null) {
  const [state, setState] = useState<AgentState>({
    isStreaming: false,
    model: null,
    modelProvider: null,
    modelId: null,
    thinkingLevel: "medium",
    messages: [],
  });
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE events
  useEffect(() => {
    if (!sessionId) {
      setConnected(false);
      return;
    }

    const es = new EventSource(`/api/agent/${sessionId}/events`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        handleEvent(event);
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [sessionId]);

  const handleEvent = useCallback((event: any) => {
    switch (event.type) {
      case "agent_start":
        setState((s) => ({ ...s, isStreaming: true }));
        break;
      case "agent_end":
        setState((s) => ({ ...s, isStreaming: false }));
        break;

      case "message_start":
        if (event.message) {
          // Skip user messages — already added optimistically via addUserMessage
          // Skip toolResult — shown inside assistant's tool call blocks
          const startRole = event.message.role;
          if (startRole === "user" || startRole === "toolResult") break;
          setState((s) => ({
            ...s,
            messages: [...s.messages, event.message],
          }));
        }
        break;

      case "message_update":
        if (event.message) {
          setState((s) => {
            const msgs = [...s.messages];
            let idx = findLastAssistant(msgs);
            if (idx >= 0) {
              // Preserve accumulated toolCall parts (from tool_execution events)
              // since streaming message.content only has text/thinking
              const existingTools = (msgs[idx].content || []).filter(
                (p: any) => p.type === "toolCall"
              );
              msgs[idx] = {
                ...msgs[idx],
                ...event.message,
                content: [...(event.message.content || []), ...existingTools],
              };
            }
            return { ...s, messages: msgs };
          });
        }
        break;

      case "message_end":
        if (event.message) {
          // Skip user messages — already added optimistically via addUserMessage
          // Skip toolResult — shown inside assistant's tool call blocks
          const endRole = event.message.role;
          if (endRole === "user" || endRole === "toolResult") break;
          setState((s) => {
            const msgs = [...s.messages];
            let idx = findLastAssistant(msgs);
            if (idx >= 0) {
              // Preserve toolCall parts accumulated from tool_execution events
              const existingTools = (msgs[idx].content || []).filter(
                (p: any) => p.type === "toolCall"
              );
              const newContent = event.message.content || [];
              // Only keep tools that aren't already in the final message
              const finalToolIds = new Set(
                newContent
                  .filter((p: any) => p.type === "toolCall")
                  .map((p: any) => p.toolCallId)
              );
              const extraTools = existingTools.filter(
                (t: any) => !finalToolIds.has(t.toolCallId)
              );
              msgs[idx] = {
                ...event.message,
                content: [...newContent, ...extraTools],
              };
            } else {
              msgs.push(event.message);
            }
            return { ...s, messages: msgs };
          });
        }
        break;

      case "tool_execution_start":
        setState((s) => {
          const msgs = [...s.messages];
          const idx = findLastAssistant(msgs);
          if (idx >= 0) {
            const content = [...(msgs[idx].content || [])];
            content.push({
              type: "toolCall",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.args,
              _status: "running",
            });
            msgs[idx] = { ...msgs[idx], content };
          }
          return { ...s, messages: msgs };
        });
        break;

      case "tool_execution_end":
        setState((s) => {
          const msgs = [...s.messages];
          const idx = findLastAssistant(msgs);
          if (idx >= 0) {
            const content = (msgs[idx].content || []).map((p: any) => {
              if (p.type === "toolCall" && p.toolCallId === event.toolCallId) {
                return { ...p, result: event.result, isError: event.isError, _status: "done" };
              }
              return p;
            });
            msgs[idx] = { ...msgs[idx], content };
          }
          return { ...s, messages: msgs };
        });
        break;

      case "thinking_level_changed":
        setState((s) => ({ ...s, thinkingLevel: event.level }));
        break;

      case "model_select":
        if (event.model) {
          setState((s) => ({
            ...s,
            model: `${event.model.provider}/${event.model.id}`,
            modelProvider: event.model.provider,
            modelId: event.model.id,
          }));
        } else if (event.provider && event.modelId) {
          setState((s) => ({
            ...s,
            model: `${event.provider}/${event.modelId}`,
            modelProvider: event.provider,
            modelId: event.modelId,
          }));
        }
        break;
    }
  }, []);

  // Create new agent session
  const createSession = useCallback(
    async (options?: { cwd?: string; model?: string; tools?: string[]; thinkingLevel?: string }) => {
      const res = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options ?? {}),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.sessionId as string;
    },
    []
  );

  // Send message to agent — NO optimistic UI here, handled by caller
  const sendMessage = useCallback(
    async (message: string, type: "prompt" | "steer" | "followUp" = "prompt", targetSessionId?: string) => {
      const sid = targetSessionId ?? sessionId;
      if (!sid) throw new Error("No session");

      const res = await fetch(`/api/agent/${sid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, type }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    },
    [sessionId]
  );

  // Add user message to display (called by AppShell for optimistic UI)
  const addUserMessage = useCallback((text: string) => {
    setState((s) => ({
      ...s,
      messages: [
        ...s.messages,
        {
          role: "user",
          content: [{ type: "text", text }],
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  // Load session context
  const loadContext = useCallback(async (sid?: string) => {
    const id = sid ?? sessionId;
    if (!id) return;
    const res = await fetch(`/api/sessions/${id}/context`);
    const data = await res.json();
    if (data.messages) {
      setState((s) => ({ ...s, messages: data.messages }));
    }
    if (data.thinkingLevel) {
      setState((s) => ({ ...s, thinkingLevel: data.thinkingLevel }));
    }
    if (data.model) {
      setState((s) => ({
        ...s,
        model: `${data.model.provider}/${data.model.modelId}`,
        modelProvider: data.model.provider,
        modelId: data.model.modelId,
      }));
    }
  }, [sessionId]);

  // Reset state (for new session)
  const resetState = useCallback(() => {
    setState({
      isStreaming: false,
      model: null,
      modelProvider: null,
      modelId: null,
      thinkingLevel: "medium",
      messages: [],
    });
  }, []);

  return {
    state,
    connected,
    createSession,
    sendMessage,
    addUserMessage,
    loadContext,
    resetState,
  };
}
